const Notification = require('../models/Notification');
const FatigueSettings = require('../models/FatigueSettings');

// Get current settings from DB - always fresh, no cache
async function getSettings() {
  let settings = await FatigueSettings.findOne({ key: 'global' }).lean();
  
  // If no settings exist yet, use defaults
  if (!settings) {
    settings = {
      max_notifications_per_hour: 10,
      max_notifications_per_day: 50,
      max_same_type_per_hour: 3,
      cooldown_minutes: 5
    };
  }
  
  return settings;
}

async function checkAlertFatigue(notification) {
  const settings = await getSettings();
  
  const now = Date.now();
  const oneHourAgo = new Date(now - 60 * 60 * 1000);
  const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000);
  const cooldownAgo = new Date(now - settings.cooldown_minutes * 60 * 1000);

  // Check 1 — Too many notifications this hour?
  const hourlyCount = await Notification.countDocuments({
    user_id: notification.user_id,
    createdAt: { $gte: oneHourAgo },
    classification: { $in: ['NOW', 'LATER'] },
    isDeleted: false
  });

  if (hourlyCount >= settings.max_notifications_per_hour) {
    console.log(`Fatigue: user ${notification.user_id} hit hourly limit (${hourlyCount})`);
    return {
      isFatigued: true,
      reason: `Alert fatigue — user received ${hourlyCount} notifications in the past hour (limit: ${settings.max_notifications_per_hour})`
    };
  }

  // Check 2 — Too many notifications today?
  const dailyCount = await Notification.countDocuments({
    user_id: notification.user_id,
    createdAt: { $gte: oneDayAgo },
    classification: { $in: ['NOW', 'LATER'] },
    isDeleted: false
  });

  if (dailyCount >= settings.max_notifications_per_day) {
    console.log(`Fatigue: user ${notification.user_id} hit daily limit (${dailyCount})`);
    return {
      isFatigued: true,
      reason: `Alert fatigue — user received ${dailyCount} notifications today (limit: ${settings.max_notifications_per_day})`
    };
  }

  // Check 3 — Same type too many times this hour?
  const sameTypeCount = await Notification.countDocuments({
    user_id: notification.user_id,
    event_type: notification.event_type,
    createdAt: { $gte: oneHourAgo },
    classification: { $in: ['NOW', 'LATER'] },
    isDeleted: false
  });

  if (sameTypeCount >= settings.max_same_type_per_hour) {
    console.log(`Fatigue: too many ${notification.event_type} notifications`);
    return {
      isFatigued: true,
      reason: `Alert fatigue — ${sameTypeCount} "${notification.event_type}" notifications in the past hour (limit: ${settings.max_same_type_per_hour})`
    };
  }

  // Check 4 — Same type sent very recently? (cooldown)
  const recentSame = await Notification.findOne({
    user_id: notification.user_id,
    event_type: notification.event_type,
    source: notification.source,
    createdAt: { $gte: cooldownAgo },
    classification: 'NOW',
    isDeleted: false
  }).lean();

  if (recentSame) {
    return {
      isFatigued: true,
      reason: `Cooldown active — same event type sent within ${settings.cooldown_minutes} minutes`
    };
  }

  // User is not fatigued
  return { isFatigued: false };
}

module.exports = { checkAlertFatigue, getSettings };
