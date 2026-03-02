const stringSimilarity = require('string-similarity');
const crypto = require('crypto');
const Notification = require('../models/Notification');

const SIMILARITY_THRESHOLD = 0.99;
const DEDUP_WINDOW_MINUTES = 1;

function generateContentHash(notification) {
  const content = `${notification.user_id}|${notification.event_type}|${notification.source}|${notification.message}`;
  return crypto.createHash('sha256').update(content.toLowerCase().trim()).digest('hex');
}

function generateFingerprint(notification) {
  return `${notification.event_type}:${notification.source}:${notification.message}`
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

async function checkDuplicate(notification) {
  const windowStart = new Date(Date.now() - DEDUP_WINDOW_MINUTES * 60 * 1000);

  // Check 1 — Exact dedupe_key match
  if (notification.dedupe_key) {
    const exactMatch = await Notification.findOne({
      _id: { $ne: notification._id },
      user_id: notification.user_id,
      dedupe_key: notification.dedupe_key,
      createdAt: { $gte: windowStart },
      isDeleted: false
    }).lean();

    if (exactMatch) {
      console.log(`Exact duplicate found via dedupe_key: ${notification.dedupe_key}`);
      return {
        isDuplicate: true,
        type: 'exact-key',
        reason: `Exact duplicate — same dedupe_key seen within ${DEDUP_WINDOW_MINUTES} minutes`
      };
    }
  }

  // Check 2 — Content hash match
  const contentHash = generateContentHash(notification);
  const hashMatch = await Notification.findOne({
    _id: { $ne: notification._id },
    user_id: notification.user_id,
    content_hash: contentHash,
    createdAt: { $gte: windowStart },
    isDeleted: false
  }).lean();

  if (hashMatch) {
    console.log('Exact content hash duplicate found');
    return {
      isDuplicate: true,
      type: 'exact-hash',
      reason: `Identical notification already received within ${DEDUP_WINDOW_MINUTES} minutes`
    };
  }

  // Check 3 — Near duplicate using string similarity
  const recentNotifications = await Notification.find({
    _id: { $ne: notification._id },
    user_id: notification.user_id,
    event_type: notification.event_type,
    createdAt: { $gte: windowStart },
    isDeleted: false
  }).select('message event_type source').lean();

  const newFingerprint = generateFingerprint(notification);

  for (const recent of recentNotifications) {
    const recentFingerprint = generateFingerprint(recent);
    const similarity = stringSimilarity.compareTwoStrings(newFingerprint, recentFingerprint);

    if (similarity >= SIMILARITY_THRESHOLD) {
      console.log(`Near duplicate found: ${(similarity * 100).toFixed(1)}% similar`);
      return {
        isDuplicate: true,
        type: 'near-duplicate',
        similarity: similarity,
        reason: `Near-duplicate detected — ${(similarity * 100).toFixed(1)}% similar to recent notification`
      };
    }
  }

  return { 
    isDuplicate: false, 
    contentHash 
  };
}

module.exports = { checkDuplicate, generateContentHash };