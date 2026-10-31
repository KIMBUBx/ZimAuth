// D:\KIM\KIMAUTH\src\auth.js
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const JWT_SECRET = process.env.JWT_SECRET || 'zimauth_super_secret_jwt_key_2026';

function hashPassword(password) {
  return bcrypt.hashSync(password, 10);
}

function verifyPassword(password, hash) {
  return bcrypt.compareSync(password, hash);
}

function generateToken(payload, expiresIn = '7d') {
  return jwt.sign(payload, JWT_SECRET, { expiresIn });
}

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return null;
  }
}

function generateRandomKey(length = 32) {
  return crypto.randomBytes(Math.ceil(length / 2)).toString('hex').slice(0, length);
}

function generateLicenseKey(mask = 'XXXXXX-XXXXXX-XXXXXX') {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let res = '';
  for (let i = 0; i < mask.length; i++) {
    if (mask[i] === 'X') {
      res += chars.charAt(Math.floor(Math.random() * chars.length));
    } else {
      res += mask[i];
    }
  }
  return res;
}

function authMiddleware(req, res, next) {
  let token = req.cookies?.token;
  if (!token && req.headers.authorization) {
    const parts = req.headers.authorization.split(' ');
    if (parts.length === 2 && parts[0] === 'Bearer') {
      token = parts[1];
    }
  }

  if (!token) {
    if (req.accepts('html') && !req.path.startsWith('/api/')) {
      return res.redirect('/login.html');
    }
    return res.status(401).json({ success: false, message: 'Unauthorized. Please login.' });
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    if (req.accepts('html') && !req.path.startsWith('/api/')) {
      return res.redirect('/login.html');
    }
    return res.status(401).json({ success: false, message: 'Invalid or expired session.' });
  }

  req.user = decoded;
  next();
}

module.exports = {
  hashPassword,
  verifyPassword,
  generateToken,
  verifyToken,
  generateRandomKey,
  generateLicenseKey,
  authMiddleware
};
