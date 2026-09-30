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

const requireManager = (req,res,next) => {
 if(!require('../services/accessPolicy').management(req.user?.access_level))return res.status(403).json({error:'Manager access required.'});
 next();
};
module.exports = { verifyToken, requireAdmin, requireManager, requireManagement:requireManager };
