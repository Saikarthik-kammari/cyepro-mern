const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Protect routes - check JWT token
const protect = async (req, res, next) => {
  try {
    // Get token from header
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ message: 'No token provided' });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Get user from DB
    const user = await User.findById(decoded.id).select('-password');
    if (!user || user.isDeleted) {
      return res.status(401).json({ message: 'Invalid token' });
    }

    // Attach user to request
    req.user = user;
    next();

  } catch (error) {
    res.status(401).json({ message: 'Token invalid or expired' });
  }
};

// Admin only routes
const adminOnly = (req, res, next) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ message: 'Admin access required' });
  }
  next();
};

module.exports = { protect, adminOnly };