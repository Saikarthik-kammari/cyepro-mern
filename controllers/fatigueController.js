const FatigueSettings = require('../models/FatigueSettings');

// Get current fatigue settings
exports.getSettings = async (req, res) => {
  try {
    let settings = await FatigueSettings.findOne({ key: 'global' }).lean();

    // If no settings exist yet create defaults
    if (!settings) {
      settings = await FatigueSettings.create({
        key: 'global',
        max_notifications_per_hour: 10,
        max_notifications_per_day: 50,
        max_same_type_per_hour: 3,
        cooldown_minutes: 5
      });
    }

    res.json(settings);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Update fatigue settings
exports.updateSettings = async (req, res) => {
  try {
    const { 
      max_notifications_per_hour, 
      max_notifications_per_day, 
      max_same_type_per_hour, 
      cooldown_minutes 
    } = req.body;

    // upsert means update if exists create if not
    const settings = await FatigueSettings.findOneAndUpdate(
      { key: 'global' },
      { 
        max_notifications_per_hour, 
        max_notifications_per_day, 
        max_same_type_per_hour, 
        cooldown_minutes,
        updatedBy: req.user._id 
      },
      { upsert: true, new: true }
    );

    res.json(settings);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};