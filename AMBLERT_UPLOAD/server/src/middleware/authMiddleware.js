/**
 * AMBULERT - Security & Role Authentication Middleware
 */

const jwt = require('jsonwebtoken');
const db = require('../services/InMemoryDB');

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_session_key_for_ambulert_jwt_tokens';

function authenticateJWT(req, res, next) {
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];

    jwt.verify(token, JWT_SECRET, (err, decoded) => {
      if (err) {
        return res.status(403).json({ error: 'Session expired or authentication token invalid' });
      }

      const user = db.users.get(decoded.id);
      if (!user) {
        return res.status(404).json({ error: 'User account not found' });
      }

      req.user = user;
      next();
    });
  } else {
    res.status(401).json({ error: 'Authorization header missing or formatted incorrectly' });
  }
}

function requireRole(role) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    // For drivers, check if user role or verification status matches
    if (role === 'DRIVER') {
      const isDriverUser = req.user.role === 'DRIVER';
      if (!isDriverUser) {
        return res.status(430).json({ error: 'Access restricted to ambulance driver role' });
      }

      // Find driver profile
      let driverProfile = null;
      for (const d of db.drivers.values()) {
        if (d.userId === req.user.id) {
          driverProfile = d;
          break;
        }
      }

      if (!driverProfile) {
        return res.status(403).json({ error: 'Driver profile missing' });
      }

      req.driver = driverProfile;
    } else if (role === 'ADMIN') {
      if (req.user.role !== 'ADMIN') {
        return res.status(403).json({ error: 'Access restricted to administrator role' });
      }
    }

    next();
  };
}

module.exports = {
  authenticateJWT,
  requireRole,
  JWT_SECRET
};
