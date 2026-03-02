const cron = require('node-cron');
const Notification = require('../models/Notification');
const AuditLog = require('../models/AuditLog');
const DeadLetter = require('../models/DeadLetter');
const { classifyWithAI } = require('../services/aiService');

const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MINUTES = 30;

async function processLaterQueue() {
  console.log('LATER queue job started...');
  const now = new Date();
  let processed = 0, succeeded = 0, failed = 0;

  try {
    // Find all deferred notifications that are due
    const dueEvents = await Notification.find({
      status: 'deferred',
      later_process_after: { $lte: now },
      later_attempts: { $lt: MAX_ATTEMPTS },
      isDeleted: false
    }).limit(50).lean();

    console.log(`Found ${dueEvents.length} events due for processing`);

    for (const event of dueEvents) {
      processed++;
      try {
        // Reclassify using AI
        const aiResult = await classifyWithAI(event);

        await Notification.findByIdAndUpdate(event._id, {
          classification: aiResult.classification,
          classification_reason: `LATER queue: ${aiResult.reasoning}`,
          ai_processed: true,
          ai_result: {
            model: aiResult.model,
            confidence: aiResult.confidence,
            reasoning: aiResult.reasoning,
            is_fallback: aiResult.is_fallback
          },
          status: 'classified',
          later_attempts: event.later_attempts + 1,
          later_last_attempt: new Date()
        });

        await AuditLog.create({
          notification_id: event._id,
          user_id: event.user_id,
          event_type: event.event_type,
          classification: aiResult.classification,
          reason: `LATER queue processed: ${aiResult.reasoning}`,
          ai_used: true,
          ai_model: aiResult.model,
          ai_confidence: aiResult.confidence,
          ai_is_fallback: aiResult.is_fallback,
          source: event.source
        });

        succeeded++;
        console.log(`Processed event ${event._id} → ${aiResult.classification}`);

      } catch (error) {
        failed++;
        console.log(`Failed to process event ${event._id}: ${error.message}`);

        const newAttempts = event.later_attempts + 1;

        if (newAttempts >= MAX_ATTEMPTS) {
          // Move to dead letter queue after 3 failed attempts
          await Notification.findByIdAndUpdate(event._id, {
            status: 'failed',
            later_attempts: newAttempts,
            later_failed_reason: error.message
          });

          await DeadLetter.create({
            original_notification_id: event._id,
            payload: event,
            failure_reason: `Exhausted after ${MAX_ATTEMPTS} attempts: ${error.message}`,
            failure_stage: 'later_queue',
            attempt_count: newAttempts
          });

          console.log(`Event ${event._id} moved to dead letter queue`);
        } else {
          // Retry with exponential backoff
          // Attempt 1 fails → retry in 30 min
          // Attempt 2 fails → retry in 60 min
          // Attempt 3 fails → dead letter
          const nextRetry = RETRY_DELAY_MINUTES * Math.pow(2, newAttempts - 1);

          await Notification.findByIdAndUpdate(event._id, {
            later_attempts: newAttempts,
            later_last_attempt: new Date(),
            later_failed_reason: error.message,
            later_process_after: new Date(Date.now() + nextRetry * 60 * 1000)
          });

          console.log(`Event ${event._id} retry ${newAttempts}/${MAX_ATTEMPTS} in ${nextRetry} minutes`);
        }
      }
    }
  } catch (error) {
    // Scheduler itself failed - log but dont crash
    console.log('LATER queue scheduler error:', error.message);
  }

  console.log(`LATER queue done — processed:${processed} succeeded:${succeeded} failed:${failed}`);
}

function startLaterQueueJob() {
  // Run every 5 minutes
  cron.schedule('*/5 * * * *', processLaterQueue);
  console.log('LATER queue job scheduled — runs every 5 minutes');

  // Also run immediately on startup
  processLaterQueue();
}

module.exports = { startLaterQueueJob, processLaterQueue };