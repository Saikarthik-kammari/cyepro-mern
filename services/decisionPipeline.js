const Notification = require('../models/Notification');
const AuditLog = require('../models/AuditLog');
const DeadLetter = require('../models/DeadLetter');
const { checkDuplicate, generateContentHash } = require('./deduplicationService');
const { checkAlertFatigue } = require('./fatigueService');
const { evaluateRules } = require('./ruleEngine');
const { classifyWithAI } = require('./aiService');

// Socket.io instance - set after server starts
let io = null;
function setSocketIo(socketIo) { 
  io = socketIo; 
}

// Emit real time updates to dashboard
function emitUpdate(userId, data) {
  if (io) {
    io.emit('notification_update', { 
      userId, 
      ...data, 
      timestamp: new Date() 
    });
    io.emit('dashboard_update', { 
      timestamp: new Date() 
    });
  }
}

async function processNotification(notificationId) {
  const startTime = Date.now();
  const steps = [];
  let notification;

  try {
    // Get the notification from DB
    notification = await Notification.findById(notificationId);
    if (!notification) throw new Error(`Notification ${notificationId} not found`);

    // ── STEP 1: DEDUPLICATION ──────────────────────────────
    console.log('Step 1: Checking for duplicates...');
    const stepStart1 = Date.now();
    const dupResult = await checkDuplicate(notification);
    steps.push({ 
      step: 'deduplication', 
      result: dupResult.isDuplicate ? `duplicate:${dupResult.type}` : 'unique', 
      duration_ms: Date.now() - stepStart1 
    });

    if (dupResult.isDuplicate) {
      // Update notification
      await Notification.findByIdAndUpdate(notificationId, {
        classification: 'NEVER',
        classification_reason: dupResult.reason,
        status: 'classified'
      });

      // Write audit log
      await AuditLog.create({
        notification_id: notificationId,
        user_id: notification.user_id,
        event_type: notification.event_type,
        classification: 'NEVER',
        reason: dupResult.reason,
        pipeline_steps: steps,
        dedup_detected: true,
        processing_time_ms: Date.now() - startTime,
        source: notification.source
      });

      emitUpdate(notification.user_id, { 
        type: 'CLASSIFIED', 
        classification: 'NEVER', 
        reason: dupResult.reason 
      });

      console.log('Decision: NEVER (duplicate)');
      return { classification: 'NEVER', reason: dupResult.reason };
    }

    // Save content hash for future dedup checks
    await Notification.findByIdAndUpdate(notificationId, {
      content_hash: generateContentHash(notification)
    });

    // ── STEP 2: ALERT FATIGUE ──────────────────────────────
    console.log('Step 2: Checking alert fatigue...');
    const stepStart2 = Date.now();
    const fatigueResult = await checkAlertFatigue(notification);
    steps.push({ 
      step: 'fatigue_check', 
      result: fatigueResult.isFatigued ? 'fatigued' : 'ok', 
      duration_ms: Date.now() - stepStart2 
    });

    if (fatigueResult.isFatigued) {
      await Notification.findByIdAndUpdate(notificationId, {
        classification: 'LATER',
        classification_reason: fatigueResult.reason,
        status: 'deferred',
        later_process_after: new Date(Date.now() + 60 * 60 * 1000)
      });

      await AuditLog.create({
        notification_id: notificationId,
        user_id: notification.user_id,
        event_type: notification.event_type,
        classification: 'LATER',
        reason: fatigueResult.reason,
        pipeline_steps: steps,
        fatigue_detected: true,
        processing_time_ms: Date.now() - startTime,
        source: notification.source
      });

      emitUpdate(notification.user_id, { 
        type: 'CLASSIFIED', 
        classification: 'LATER', 
        reason: fatigueResult.reason 
      });

      console.log('Decision: LATER (fatigue)');
      return { classification: 'LATER', reason: fatigueResult.reason };
    }

    // ── STEP 3: RULE ENGINE ────────────────────────────────
    console.log('Step 3: Checking rules...');
    const stepStart3 = Date.now();
    const ruleResult = await evaluateRules(notification);
    steps.push({ 
      step: 'rule_engine', 
      result: ruleResult.matched ? `rule:${ruleResult.rule?.name}` : 'no_match', 
      duration_ms: Date.now() - stepStart3 
    });

    if (ruleResult.matched) {
      const deferTime = ruleResult.action === 'LATER'
        ? new Date(Date.now() + ruleResult.defer_minutes * 60 * 1000)
        : null;

      await Notification.findByIdAndUpdate(notificationId, {
        classification: ruleResult.action,
        classification_reason: ruleResult.reason,
        rule_triggered: ruleResult.rule.name,
        status: ruleResult.action === 'LATER' ? 'deferred' : 'classified',
        later_process_after: deferTime
      });

      await AuditLog.create({
        notification_id: notificationId,
        user_id: notification.user_id,
        event_type: notification.event_type,
        classification: ruleResult.action,
        reason: ruleResult.reason,
        rule_triggered: ruleResult.rule.name,
        pipeline_steps: steps,
        processing_time_ms: Date.now() - startTime,
        source: notification.source
      });

      emitUpdate(notification.user_id, { 
        type: 'CLASSIFIED', 
        classification: ruleResult.action, 
        reason: ruleResult.reason 
      });

      console.log(`Decision: ${ruleResult.action} (rule matched)`);
      return { classification: ruleResult.action, reason: ruleResult.reason };
    }

    // ── STEP 4: AI CLASSIFICATION ──────────────────────────
    console.log('Step 4: Sending to AI...');

    // Set preliminary classification immediately
    // So user gets instant response
    await Notification.findByIdAndUpdate(notificationId, {
      classification: 'LATER',
      classification_reason: 'Pending AI classification',
      status: 'processing'
    });

    // Tell dashboard we are processing
    emitUpdate(notification.user_id, { 
      type: 'AI_PROCESSING', 
      message: 'AI classification in progress...' 
    });

    // Process AI in background - dont await
    // This is why the user gets instant response
    processAIAsync(notificationId, notification, steps, startTime);

    return { 
      classification: 'PENDING', 
      reason: 'AI classification in progress' 
    };

  } catch (error) {
    console.log(`Pipeline error: ${error.message}`);

    // Save to dead letter queue - never lose data
    await DeadLetter.create({
      original_notification_id: notificationId,
      payload: notification || { id: notificationId },
      failure_reason: error.message,
      failure_stage: 'pipeline'
    });

    if (notification) {
      await Notification.findByIdAndUpdate(notificationId, { 
        status: 'failed' 
      });
    }

    throw error;
  }
}

// Runs in background after user gets their response
async function processAIAsync(notificationId, notification, steps, startTime) {
  try {
    const aiResult = await classifyWithAI(notification);

    const deferTime = aiResult.classification === 'LATER'
      ? new Date(Date.now() + 60 * 60 * 1000)
      : null;

    // Update notification with AI result
    await Notification.findByIdAndUpdate(notificationId, {
      classification: aiResult.classification,
      classification_reason: aiResult.reasoning,
      ai_processed: true,
      ai_result: {
        model: aiResult.model,
        confidence: aiResult.confidence,
        reasoning: aiResult.reasoning,
        is_fallback: aiResult.is_fallback
      },
      status: aiResult.classification === 'LATER' ? 'deferred' : 'classified',
      later_process_after: deferTime
    });

    // Write audit log
    await AuditLog.create({
      notification_id: notificationId,
      user_id: notification.user_id,
      event_type: notification.event_type,
      classification: aiResult.classification,
      reason: aiResult.reasoning,
      pipeline_steps: steps,
      ai_used: true,
      ai_model: aiResult.model,
      ai_confidence: aiResult.confidence,
      ai_is_fallback: aiResult.is_fallback,
      processing_time_ms: Date.now() - startTime,
      source: notification.source
    });

    // Push final result to dashboard
    emitUpdate(notification.user_id, {
      type: 'AI_CLASSIFIED',
      notificationId,
      classification: aiResult.classification,
      confidence: aiResult.confidence,
      is_fallback: aiResult.is_fallback,
      reason: aiResult.reasoning
    });

    console.log(`AI done: ${aiResult.classification} (fallback: ${aiResult.is_fallback})`);

  } catch (error) {
    console.log(`Async AI processing failed: ${error.message}`);

    // Save to dead letter - never lose data
    await DeadLetter.create({
      original_notification_id: notificationId,
      payload: notification,
      failure_reason: error.message,
      failure_stage: 'ai_processing'
    });
  }
}

module.exports = { processNotification, setSocketIo };
