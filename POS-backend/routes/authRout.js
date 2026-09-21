const express = require('express');
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const db = require('../config/database')

const router = express.Router();

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
router.verifyToken = verifyToken;
router.post('/login', async (req, res) => {
  const username = req.body?.username ?? req.body?.user_name ?? req.body?.email;
  const password = req.body?.password;

  if (typeof username !== 'string' || !username.trim() || !password) {
    return res.status(400).json({ success: false, message: "Username and password are required" });
  }

  try {
    const [rows] = await db.execute('SELECT * FROM users WHERE LOWER(user_name) = LOWER(?) LIMIT 1', [username.trim()]);

    if (rows.length === 0) {
      return res.status(400).json({ success: false, message: "Invalid username or password" });
    }

    const user = rows[0];

    const isMatch = await bcrypt.compare(password, user.user_password_hash);
    if (!isMatch) {
      return res.status(400).json({ success: false, message: "Invalid username or password" });
    }

    const token = jwt.sign(
      { user_id: user.user_id, email: user.user_email, access_level: user.access_level || 'employee' },
      process.env.JWT_TOKEN,
      { expiresIn: '20h' }
    );

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000
    });

    return res.json({
      success: true,
      user: { id: user.user_id, name: user.user_name, email: user.user_email, position: user.user_position, accessLevel: user.access_level || 'employee' }
    });

  } catch (error) {
    console.error("Login Server Error: ", error);
    return res.status(500).json({ success: false, message: "Database lookup error" });
  }
});

router.get('/me', verifyToken, async (req, res) => {
  try {
    const [rows] = await db.execute('SELECT user_id, user_name, user_email, user_position, access_level FROM users WHERE user_id = ? LIMIT 1', [req.user.user_id]);

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: "User account no longer exists" });
    }
    const user = rows[0];
    return res.json({
      success: true,
      user: { 
        id: user.user_id,     
        name: user.user_name,    
        email: user.user_email,
        position: user.user_position,
        accessLevel: user.access_level || 'employee'
      }
    });

  } catch (error) {
    console.error("Session Check Error: ", error);
    return res.status(500).json({ success: false, message: "Database verification error" });
  }
});

router.post('/logout', (req, res) => {
  res.clearCookie('token', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax'
  });
  return res.json({ success: true, message: "Logged out successfully" });
});

module.exports = router
