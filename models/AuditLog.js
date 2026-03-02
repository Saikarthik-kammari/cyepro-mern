const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  notification_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Notification', required: true },
  user_id: { type: String, required: true },
  event_type: { type: String, required: true },
  classification: { type: String, enum: ['NOW', 'LATER', 'NEVER'], required: true },
  reason: { type: String, required: true },
  rule_triggered: { type: String },
  ai_used: { type: Boolean, default: false },
  ai_model: { type: String },
  ai_confidence: { type: Number },
  ai_is_fallback: { type: Boolean, default: false },
  dedup_detected: { type: Boolean, default: false },
  fatigue_detected: { type: Boolean, default: false },
  processing_time_ms: { type: Number },
  source: { type: String }
}, { timestamps: true });

auditLogSchema.index({ user_id: 1, createdAt: -1 });
auditLogSchema.index({ classification: 1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);