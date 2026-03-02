const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/rulesController');
const { protect, adminOnly } = require('../middleware/auth');

// Anyone logged in can view rules
router.get('/', protect, ctrl.getRules);

// Only admins can create edit delete
router.post('/', protect, adminOnly, ctrl.createRule);
router.put('/:id', protect, adminOnly, ctrl.updateRule);
router.delete('/:id', protect, adminOnly, ctrl.deleteRule);
router.patch('/:id/toggle', protect, adminOnly, ctrl.toggleRule);

module.exports = router;