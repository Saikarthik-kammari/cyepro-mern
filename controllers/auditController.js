const AuditLog = require('../models/AuditLog');

// Get all audit logs with search and filter
exports.getAuditLogs = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      classification, 
      user_id, 
      ai_used, 
      search 
    } = req.query;

    const filter = {};
    if (classification) filter.classification = classification;
    if (user_id) filter.user_id = user_id;
    if (ai_used !== undefined) filter.ai_used = ai_used === 'true';
    if (search) filter.reason = { $regex: search, $options: 'i' };

    const [logs, total] = await Promise.all([
      AuditLog.find(filter)
        .sort({ createdAt: -1 })
        .limit(limit * 1)
        .skip((page - 1) * limit)
        .populate('notification_id', 'message title event_type source priority_hint')
        .lean(),
      AuditLog.countDocuments(filter)
    ]);

    res.json({ 
      logs, 
      total, 
      page: Number(page), 
      pages: Math.ceil(total / limit) 
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Get single audit log by id
exports.getAuditLogById = async (req, res) => {
  try {
    const log = await AuditLog.findById(req.params.id)
      .populate('notification_id')
      .lean();
    if (!log) return res.status(404).json({ message: 'Not found' });
    res.json(log);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};