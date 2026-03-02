const Notification = require('../models/Notification');
const { processNotification } = require('../services/decisionPipeline');

exports.submitEvent = async (req, res) => {
  try {
    const {
      user_id, event_type, message, title, source,
      priority_hint, channel, metadata, dedupe_key, expires_at
    } = req.body;

    if (!user_id || !event_type || !message || !source) {
      return res.status(400).json({ 
        message: 'user_id, event_type, message, source are required' 
      });
    }

    const notification = await Notification.create({
      user_id, event_type, message, title, source,
      priority_hint: priority_hint || 'medium',
      channel: channel || 'in-app',
      metadata: metadata || {},
      dedupe_key,
      expires_at,
      timestamp: new Date(),
      status: 'processing'
    });

    res.status(202).json({
      message: 'Event accepted and being processed',
      notificationId: notification._id,
      status: 'processing'
    });

    processNotification(notification._id).catch(err => {
      console.log(`Pipeline error: ${err.message}`);
    });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getNotifications = async (req, res) => {
  try {
    const { page = 1, limit = 20, classification, status, user_id } = req.query;
    const filter = { isDeleted: false };
    if (classification) filter.classification = classification;
    if (status) filter.status = status;
    if (user_id) filter.user_id = user_id;

    const [notifications, total] = await Promise.all([
      Notification.find(filter)
        .sort({ createdAt: -1 })
        .limit(limit * 1)
        .skip((page - 1) * limit)
        .lean(),
      Notification.countDocuments(filter)
    ]);

    res.json({ notifications, total, page: Number(page), pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getNotificationById = async (req, res) => {
  try {
    const notification = await Notification.findOne({ 
      _id: req.params.id, 
      isDeleted: false 
    }).lean();
    if (!notification) return res.status(404).json({ message: 'Not found' });
    res.json(notification);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getLaterQueue = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const filter = { status: 'deferred', isDeleted: false };

    const [items, total] = await Promise.all([
      Notification.find(filter)
        .sort({ later_process_after: 1 })
        .limit(limit * 1)
        .skip((page - 1) * limit)
        .lean(),
      Notification.countDocuments(filter)
    ]);

    res.json({ items, total, page: Number(page), pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getDashboardStats = async (req, res) => {
  try {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    const [total, last24h, lastHour, byClassification, byStatus, recentEvents] = await Promise.all([
      Notification.countDocuments({ isDeleted: false }),
      Notification.countDocuments({ isDeleted: false, createdAt: { $gte: oneDayAgo } }),
      Notification.countDocuments({ isDeleted: false, createdAt: { $gte: oneHourAgo } }),
      Notification.aggregate([
        { $match: { isDeleted: false } },
        { $group: { _id: '$classification', count: { $sum: 1 } } }
      ]),
      Notification.aggregate([
        { $match: { isDeleted: false } },
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]),
      Notification.find({ isDeleted: false }).sort({ createdAt: -1 }).limit(10).lean()
    ]);

    res.json({ total, last24h, lastHour, byClassification, byStatus, recentEvents });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getMetrics = async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 7;
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [dailyTrend, aiUsage, sourceBreakdown] = await Promise.all([
      Notification.aggregate([
        { $match: { isDeleted: false, createdAt: { $gte: startDate } } },
        { $group: {
          _id: { date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, classification: '$classification' },
          count: { $sum: 1 }
        }},
        { $sort: { '_id.date': 1 } }
      ]),
      Notification.aggregate([
        { $match: { isDeleted: false, ai_processed: true, createdAt: { $gte: startDate } } },
        { $group: {
          _id: '$ai_result.is_fallback',
          count: { $sum: 1 },
          avgConfidence: { $avg: '$ai_result.confidence' }
        }}
      ]),
      Notification.aggregate([
        { $match: { isDeleted: false, createdAt: { $gte: startDate } } },
        { $group: { _id: '$source', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 }
      ])
    ]);

    res.json({ dailyTrend, aiUsage, sourceBreakdown, days });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};