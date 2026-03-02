const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/notificationController');
const { protect } = require('../middleware/auth');

// All routes protected - must be logged in
router.post('/submit', protect, ctrl.submitEvent);
router.get('/', protect, ctrl.getNotifications);
router.get('/dashboard', protect, ctrl.getDashboardStats);
router.get('/metrics', protect, ctrl.getMetrics);
router.get('/later-queue', protect, ctrl.getLaterQueue);
router.get('/:id', protect, ctrl.getNotificationById);

module.exports = router;