const mongoose = require('mongoose');

const fatigueSettingsSchema = new mongoose.Schema({
  key: { type: String, default: 'global', unique: true },
  max_notifications_per_hour: { type: Number, default: 10 },
  max_notifications_per_day: { type: Number, default: 50 },
  max_same_type_per_hour: { type: Number, default: 3 },
  cooldown_minutes: { type: Number, default: 5 },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

module.exports = mongoose.model('FatigueSettings', fatigueSettingsSchema);