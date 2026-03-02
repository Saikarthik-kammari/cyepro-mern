const mongoose = require('mongoose');

const deadLetterSchema = new mongoose.Schema({
  original_notification_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Notification' },
  payload: { type: mongoose.Schema.Types.Mixed, required: true },
  failure_reason: { type: String, required: true },
  failure_stage: { type: String },
  attempt_count: { type: Number, default: 1 },
  last_attempt_at: { type: Date, default: Date.now },
  resolved: { type: Boolean, default: false },
  resolved_at: { type: Date }
}, { timestamps: true });

deadLetterSchema.index({ resolved: 1, createdAt: -1 });

module.exports = mongoose.model('DeadLetter', deadLetterSchema);