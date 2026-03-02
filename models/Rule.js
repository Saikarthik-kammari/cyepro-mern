const mongoose = require('mongoose');

const ruleSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String },
  priority: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
  conditions: [{
    field: { type: String, required: true },
    operator: { type: String, enum: ['equals', 'not_equals', 'contains', 'starts_with', 'in', 'not_in'], required: true },
    value: { type: mongoose.Schema.Types.Mixed, required: true }
  }],
  action: { type: String, enum: ['NOW', 'LATER', 'NEVER'], required: true },
  defer_minutes: { type: Number, default: 60 },
  isDeleted: { type: Boolean, default: false },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

ruleSchema.index({ isActive: 1, priority: -1 });

module.exports = mongoose.model('Rule', ruleSchema);