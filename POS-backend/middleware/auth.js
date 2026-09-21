const jwt = require('jsonwebtoken');
const db = require('../config/database');

const verifyToken = (req, res, next) => {
  const token = req.cookies.token;
  if (!token) {
    return res.status(401).json({ success: false, message: "Unauthorized: No token provided" });
  }
  try {
    const verified = jwt.verify(token, process.env.JWT_TOKEN);
    req.user = verified;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: "Unauthorized: Invalid token" });
  }
};

const requireAdmin = (req, res, next) => {
  if (req.user?.access_level !== 'admin') {
    return res.status(403).json({ success: false, message: 'Administrator access required' });
  }
  next();
};

const requireManager = async (req, res, next) => {
  try {
    const [rows] = await db.execute('SELECT user_position, access_level FROM users WHERE user_id = ?', [req.user?.user_id]);
    const user = rows[0];
    if (!user || (user.access_level !== 'admin' && !/manager|owner|supervisor/i.test(user.user_position))) {
      return res.status(403).json({ success: false, message: 'Manager access required' });
    }
    next();
  } catch (error) {
    next(error);
  }
};

module.exports = { verifyToken, requireAdmin, requireManager };
