const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  user_id: { type: String, required: true },
  event_type: { type: String, required: true },
  message: { type: String, required: true },
  title: { type: String },
  source: { type: String, required: true },
  priority_hint: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium'
  },
  channel: {
    type: String,
    enum: ['email', 'sms', 'push', 'in-app'],
    default: 'in-app'
  },
  classification: {
    type: String,
    enum: ['NOW', 'LATER', 'NEVER', 'PENDING'],
    default: 'PENDING'
  },
  classification_reason: { type: String },
  rule_triggered: { type: String },
  dedupe_key: { type: String },
  expires_at: { type: Date },
  status: {
    type: String,
    enum: ['processing', 'classified', 'deferred', 'failed'],
    default: 'processing'
  },
  ai_processed: { type: Boolean, default: false },
  ai_result: {
    model: String,
    confidence: Number,
    reasoning: String,
    is_fallback: { type: Boolean, default: false }
  },
  content_hash: { type: String },
  later_process_after: { type: Date },
  later_attempts: { type: Number, default: 0 },
  isDeleted: { type: Boolean, default: false }
}, { timestamps: true });

notificationSchema.index({ user_id: 1, createdAt: -1 });
notificationSchema.index({ status: 1, later_process_after: 1 });
notificationSchema.index({ dedupe_key: 1, user_id: 1 });

module.exports = mongoose.model('Notification', notificationSchema);