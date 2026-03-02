const express = require('express');
const router = express.Router();
const auditCtrl = require('../controllers/auditController');
const fatigueCtrl = require('../controllers/fatigueController');
const { protect, adminOnly } = require('../middleware/auth');

// Audit logs - anyone logged in can view
router.get('/audit', protect, auditCtrl.getAuditLogs);
router.get('/audit/:id', protect, auditCtrl.getAuditLogById);

// Fatigue settings - only admin can change
router.get('/fatigue-settings', protect, fatigueCtrl.getSettings);
router.put('/fatigue-settings', protect, adminOnly, fatigueCtrl.updateSettings);

module.exports = router;
