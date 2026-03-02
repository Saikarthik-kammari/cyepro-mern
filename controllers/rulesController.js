const Rule = require('../models/Rule');

// Get all rules
exports.getRules = async (req, res) => {
  try {
    const rules = await Rule.find({ isDeleted: false })
      .sort({ priority: -1 })
      .lean();
    res.json(rules);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Create new rule
exports.createRule = async (req, res) => {
  try {
    const { name, description, priority, conditions, action, defer_minutes } = req.body;
    
    if (!name || !conditions?.length || !action) {
      return res.status(400).json({ 
        message: 'name, conditions and action are required' 
      });
    }

    const rule = await Rule.create({
      name, description, 
      priority: priority || 0,
      conditions, action, 
      defer_minutes,
      createdBy: req.user._id
    });

    res.status(201).json(rule);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Update existing rule
exports.updateRule = async (req, res) => {
  try {
    const rule = await Rule.findOneAndUpdate(
      { _id: req.params.id, isDeleted: false },
      { ...req.body, updatedBy: req.user._id },
      { new: true, runValidators: true }
    );
    if (!rule) return res.status(404).json({ message: 'Rule not found' });
    res.json(rule);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Soft delete rule
exports.deleteRule = async (req, res) => {
  try {
    const rule = await Rule.findOneAndUpdate(
      { _id: req.params.id, isDeleted: false },
      { isDeleted: true, deletedAt: new Date() },
      { new: true }
    );
    if (!rule) return res.status(404).json({ message: 'Rule not found' });
    res.json({ message: 'Rule deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Toggle rule on/off
exports.toggleRule = async (req, res) => {
  try {
    const rule = await Rule.findOne({ _id: req.params.id, isDeleted: false });
    if (!rule) return res.status(404).json({ message: 'Rule not found' });
    rule.isActive = !rule.isActive;
    await rule.save();
    res.json(rule);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};