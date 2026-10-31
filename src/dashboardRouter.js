// D:\KIM\KIMAUTH\src\dashboardRouter.js
const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const db = require('./database');
const {
  hashPassword,
  verifyPassword,
  generateToken,
  authMiddleware,
  generateRandomKey,
  generateLicenseKey
} = require('./auth');

// Multer storage for hosted application files
const uploadDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1e9) + ext;
    cb(null, uniqueName);
  }
});
const upload = multer({ storage });

// ================= AUTHENTICATION =================

// Register admin/developer account
router.post('/auth/register', (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password) {
    return res.status(400).json({ success: false, message: 'All fields are required.' });
  }

  const existing = db.queryOne('SELECT id FROM accounts WHERE username = ? OR email = ?', [username, email]);
  if (existing) {
    return res.status(400).json({ success: false, message: 'Username or email already in use.' });
  }

  const hash = hashPassword(password);
  const result = db.run(
    'INSERT INTO accounts (username, email, password_hash, plan) VALUES (?, ?, ?, ?)',
    [username, email, hash, 'Enterprise Lifetime (Free)']
  );

  const token = generateToken({ id: result.lastInsertRowid, username, email });
  res.cookie('token', token, { httpOnly: true, maxAge: 7 * 86400 * 1000 });
  return res.json({ success: true, message: 'Registered successfully!', token });
});

// Login
router.post('/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Username and password required.' });
  }

  const account = db.queryOne('SELECT * FROM accounts WHERE username = ? OR email = ?', [username, username]);
  if (!account || !verifyPassword(password, account.password_hash)) {
    return res.status(401).json({ success: false, message: 'Invalid username or password.' });
  }

  const token = generateToken({ id: account.id, username: account.username, email: account.email });
  res.cookie('token', token, { httpOnly: true, maxAge: 7 * 86400 * 1000 });
  return res.json({ success: true, message: 'Logged in successfully!', token });
});

// Logout
router.post('/auth/logout', (req, res) => {
  res.clearCookie('token');
  return res.json({ success: true, message: 'Logged out successfully.' });
});

// Current user info
router.get('/auth/me', authMiddleware, (req, res) => {
  const account = db.queryOne('SELECT id, username, email, role, plan, created_at FROM accounts WHERE id = ?', [req.user.id]);
  if (!account) return res.status(404).json({ success: false, message: 'User not found.' });
  return res.json({ success: true, user: account });
});

// ================= APPLICATIONS =================

// List all applications for current account
router.get('/apps', authMiddleware, (req, res) => {
  const apps = db.queryAll('SELECT * FROM applications WHERE owner_id = ? ORDER BY id DESC', [req.user.id]);
  const enriched = apps.map((app) => {
    const totalUsers = db.queryOne('SELECT COUNT(*) as c FROM app_users WHERE app_id = ?', [app.id])?.c || 0;
    const totalKeys = db.queryOne('SELECT COUNT(*) as c FROM app_keys WHERE app_id = ?', [app.id])?.c || 0;
    const activeKeys = db.queryOne('SELECT COUNT(*) as c FROM app_keys WHERE app_id = ? AND status = 1', [app.id])?.c || 0;
    const totalLogs = db.queryOne('SELECT COUNT(*) as c FROM app_logs WHERE app_id = ?', [app.id])?.c || 0;
    return { ...app, totalUsers, totalKeys, activeKeys, totalLogs };
  });
  return res.json({ success: true, apps: enriched });
});

// Create new application
router.post('/apps', authMiddleware, (req, res) => {
  const { name, version } = req.body;
  if (!name) return res.status(400).json({ success: false, message: 'Application name is required.' });

  const existing = db.queryOne('SELECT id FROM applications WHERE owner_id = ? AND name = ?', [req.user.id, name]);
  if (existing) {
    return res.status(400).json({ success: false, message: 'An application with this name already exists.' });
  }

  const secret = generateRandomKey(32);
  const owner_key = generateRandomKey(16);

  const result = db.run(
    `INSERT INTO applications (owner_id, name, secret, owner_key, version)
     VALUES (?, ?, ?, ?, ?)`,
    [req.user.id, name, secret, owner_key, version || '1.0']
  );

  return res.json({
    success: true,
    message: 'Application created successfully!',
    appId: result.lastInsertRowid
  });
});

// Get application by ID
router.get('/apps/:id', authMiddleware, (req, res) => {
  const app = db.queryOne('SELECT * FROM applications WHERE id = ? AND owner_id = ?', [req.params.id, req.user.id]);
  if (!app) return res.status(404).json({ success: false, message: 'Application not found.' });

  const totalUsers = db.queryOne('SELECT COUNT(*) as c FROM app_users WHERE app_id = ?', [app.id])?.c || 0;
  const totalKeys = db.queryOne('SELECT COUNT(*) as c FROM app_keys WHERE app_id = ?', [app.id])?.c || 0;
  const activeKeys = db.queryOne('SELECT COUNT(*) as c FROM app_keys WHERE app_id = ? AND status = 1', [app.id])?.c || 0;
  const totalLogs = db.queryOne('SELECT COUNT(*) as c FROM app_logs WHERE app_id = ?', [app.id])?.c || 0;

  return res.json({ success: true, app: { ...app, totalUsers, totalKeys, activeKeys, totalLogs } });
});

// Update application
router.put('/apps/:id', authMiddleware, (req, res) => {
  const app = db.queryOne('SELECT id FROM applications WHERE id = ? AND owner_id = ?', [req.params.id, req.user.id]);
  if (!app) return res.status(404).json({ success: false, message: 'Application not found.' });

  const { version, download_url, hash, status, custom_message, hwid_check } = req.body;
  db.run(
    `UPDATE applications SET
       version = COALESCE(?, version),
       download_url = COALESCE(?, download_url),
       hash = COALESCE(?, hash),
       status = COALESCE(?, status),
       custom_message = COALESCE(?, custom_message),
       hwid_check = COALESCE(?, hwid_check)
     WHERE id = ?`,
    [
      version !== undefined ? version : null,
      download_url !== undefined ? download_url : null,
      hash !== undefined ? hash : null,
      status !== undefined ? Number(status) : null,
      custom_message !== undefined ? custom_message : null,
      hwid_check !== undefined ? Number(hwid_check) : null,
      req.params.id
    ]
  );

  return res.json({ success: true, message: 'Application updated successfully!' });
});

// Delete application
router.delete('/apps/:id', authMiddleware, (req, res) => {
  const app = db.queryOne('SELECT id FROM applications WHERE id = ? AND owner_id = ?', [req.params.id, req.user.id]);
  if (!app) return res.status(404).json({ success: false, message: 'Application not found.' });

  db.run('DELETE FROM applications WHERE id = ?', [req.params.id]);
  return res.json({ success: true, message: 'Application deleted.' });
});

// ================= KEYS / LICENSES =================

// List keys
router.get('/apps/:id/keys', authMiddleware, (req, res) => {
  const app = db.queryOne('SELECT id FROM applications WHERE id = ? AND owner_id = ?', [req.params.id, req.user.id]);
  if (!app) return res.status(404).json({ success: false, message: 'Application not found.' });

  const keys = db.queryAll('SELECT * FROM app_keys WHERE app_id = ? ORDER BY id DESC', [req.params.id]);
  return res.json({ success: true, keys });
});

// Generate single or bulk keys
router.post('/apps/:id/keys', authMiddleware, (req, res) => {
  const app = db.queryOne('SELECT id FROM applications WHERE id = ? AND owner_id = ?', [req.params.id, req.user.id]);
  if (!app) return res.status(404).json({ success: false, message: 'Application not found.' });

  const { amount = 1, mask = 'XXXXXX-XXXXXX-XXXXXX', duration_days = 30, level = 1, note = '' } = req.body;
  const count = Math.min(Math.max(parseInt(amount) || 1, 1), 500);

  const generated = [];
  for (let i = 0; i < count; i++) {
    const keyStr = generateLicenseKey(mask);
    db.run(
      `INSERT INTO app_keys (app_id, key_str, duration_days, level, note, status)
       VALUES (?, ?, ?, ?, ?, 1)`,
      [app.id, keyStr, parseInt(duration_days) || 30, parseInt(level) || 1, note]
    );
    generated.push(keyStr);
  }

  return res.json({
    success: true,
    message: `Generated ${generated.length} key(s) successfully!`,
    keys: generated
  });
});

// Update key (reset HWID, ban, pause, unban)
router.put('/apps/:id/keys/:keyId', authMiddleware, (req, res) => {
  const { action } = req.body; // 'reset_hwid', 'ban', 'unban', 'pause', 'unpause'
  const key = db.queryOne(
    'SELECT k.* FROM app_keys k JOIN applications a ON k.app_id = a.id WHERE k.id = ? AND a.owner_id = ?',
    [req.params.keyId, req.user.id]
  );
  if (!key) return res.status(404).json({ success: false, message: 'Key not found.' });

  if (action === 'reset_hwid') {
    db.run('UPDATE app_keys SET hwid = "" WHERE id = ?', [key.id]);
    return res.json({ success: true, message: 'HWID reset successfully.' });
  } else if (action === 'ban') {
    db.run('UPDATE app_keys SET status = 2 WHERE id = ?', [key.id]);
    return res.json({ success: true, message: 'Key banned.' });
  } else if (action === 'unban') {
    db.run('UPDATE app_keys SET status = 1 WHERE id = ?', [key.id]);
    return res.json({ success: true, message: 'Key unbanned.' });
  } else if (action === 'pause') {
    db.run('UPDATE app_keys SET status = 3 WHERE id = ?', [key.id]);
    return res.json({ success: true, message: 'Key paused.' });
  } else if (action === 'unpause') {
    db.run('UPDATE app_keys SET status = 0 WHERE id = ?', [key.id]);
    return res.json({ success: true, message: 'Key unpaused.' });
  }

  return res.status(400).json({ success: false, message: 'Unknown action.' });
});

// Delete key
router.delete('/apps/:id/keys/:keyId', authMiddleware, (req, res) => {
  const key = db.queryOne(
    'SELECT k.id FROM app_keys k JOIN applications a ON k.app_id = a.id WHERE k.id = ? AND a.owner_id = ?',
    [req.params.keyId, req.user.id]
  );
  if (!key) return res.status(404).json({ success: false, message: 'Key not found.' });

  db.run('DELETE FROM app_keys WHERE id = ?', [key.id]);
  return res.json({ success: true, message: 'Key deleted.' });
});

// ================= APP USERS =================

// List app users
router.get('/apps/:id/users', authMiddleware, (req, res) => {
  const app = db.queryOne('SELECT id FROM applications WHERE id = ? AND owner_id = ?', [req.params.id, req.user.id]);
  if (!app) return res.status(404).json({ success: false, message: 'Application not found.' });

  const users = db.queryAll('SELECT id, username, hwid, ip, level, status, expiry_at, last_login, created_at FROM app_users WHERE app_id = ? ORDER BY id DESC', [app.id]);
  return res.json({ success: true, users });
});

// Manage user (reset HWID, ban, unban, add days)
router.put('/apps/:id/users/:userId', authMiddleware, (req, res) => {
  const { action, days } = req.body;
  const user = db.queryOne(
    'SELECT u.* FROM app_users u JOIN applications a ON u.app_id = a.id WHERE u.id = ? AND a.owner_id = ?',
    [req.params.userId, req.user.id]
  );
  if (!user) return res.status(404).json({ success: false, message: 'User not found.' });

  if (action === 'reset_hwid') {
    db.run('UPDATE app_users SET hwid = "" WHERE id = ?', [user.id]);
    return res.json({ success: true, message: 'User HWID reset successfully.' });
  } else if (action === 'ban') {
    db.run('UPDATE app_users SET status = 2 WHERE id = ?', [user.id]);
    return res.json({ success: true, message: 'User banned.' });
  } else if (action === 'unban') {
    db.run('UPDATE app_users SET status = 1 WHERE id = ?', [user.id]);
    return res.json({ success: true, message: 'User unbanned.' });
  } else if (action === 'extend' && days) {
    const current = user.expiry_at ? new Date(user.expiry_at).getTime() : Date.now();
    const newExp = new Date(current + parseInt(days) * 86400 * 1000).toISOString();
    db.run('UPDATE app_users SET expiry_at = ? WHERE id = ?', [newExp, user.id]);
    return res.json({ success: true, message: `Added ${days} days to user subscription.` });
  }

  return res.status(400).json({ success: false, message: 'Invalid action.' });
});

// Delete app user
router.delete('/apps/:id/users/:userId', authMiddleware, (req, res) => {
  const user = db.queryOne(
    'SELECT u.id FROM app_users u JOIN applications a ON u.app_id = a.id WHERE u.id = ? AND a.owner_id = ?',
    [req.params.userId, req.user.id]
  );
  if (!user) return res.status(404).json({ success: false, message: 'User not found.' });

  db.run('DELETE FROM app_users WHERE id = ?', [user.id]);
  return res.json({ success: true, message: 'User deleted.' });
});

// ================= APP VARIABLES =================

// List variables
router.get('/apps/:id/vars', authMiddleware, (req, res) => {
  const app = db.queryOne('SELECT id FROM applications WHERE id = ? AND owner_id = ?', [req.params.id, req.user.id]);
  if (!app) return res.status(404).json({ success: false, message: 'Application not found.' });

  const vars = db.queryAll('SELECT * FROM app_vars WHERE app_id = ? ORDER BY id DESC', [app.id]);
  return res.json({ success: true, vars });
});

// Create variable
router.post('/apps/:id/vars', authMiddleware, (req, res) => {
  const { var_name, var_data, is_secret } = req.body;
  if (!var_name) return res.status(400).json({ success: false, message: 'Variable name required.' });

  const app = db.queryOne('SELECT id FROM applications WHERE id = ? AND owner_id = ?', [req.params.id, req.user.id]);
  if (!app) return res.status(404).json({ success: false, message: 'Application not found.' });

  db.run(
    `INSERT INTO app_vars (app_id, var_name, var_data, is_secret)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(app_id, var_name) DO UPDATE SET var_data = excluded.var_data, is_secret = excluded.is_secret`,
    [app.id, var_name, var_data || '', is_secret ? 1 : 0]
  );

  return res.json({ success: true, message: 'Variable saved successfully.' });
});

// Delete variable
router.delete('/apps/:id/vars/:varId', authMiddleware, (req, res) => {
  const variable = db.queryOne(
    'SELECT v.id FROM app_vars v JOIN applications a ON v.app_id = a.id WHERE v.id = ? AND a.owner_id = ?',
    [req.params.varId, req.user.id]
  );
  if (!variable) return res.status(404).json({ success: false, message: 'Variable not found.' });

  db.run('DELETE FROM app_vars WHERE id = ?', [variable.id]);
  return res.json({ success: true, message: 'Variable deleted.' });
});

// ================= FILES =================

// List files
router.get('/apps/:id/files', authMiddleware, (req, res) => {
  const app = db.queryOne('SELECT id FROM applications WHERE id = ? AND owner_id = ?', [req.params.id, req.user.id]);
  if (!app) return res.status(404).json({ success: false, message: 'Application not found.' });

  const files = db.queryAll('SELECT * FROM app_files WHERE app_id = ? ORDER BY id DESC', [app.id]);
  return res.json({ success: true, files });
});

// Upload file
router.post('/apps/:id/files', authMiddleware, upload.single('file'), (req, res) => {
  const app = db.queryOne('SELECT id FROM applications WHERE id = ? AND owner_id = ?', [req.params.id, req.user.id]);
  if (!app) return res.status(404).json({ success: false, message: 'Application not found.' });
  if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded.' });

  const fileId = req.body.file_id || generateRandomKey(8);
  db.run(
    `INSERT INTO app_files (app_id, file_id, file_name, file_path, file_size)
     VALUES (?, ?, ?, ?, ?)`,
    [app.id, fileId, req.file.filename, req.file.path, req.file.size]
  );

  return res.json({ success: true, message: 'File uploaded successfully!', fileId });
});

// Delete file
router.delete('/apps/:id/files/:fileId', authMiddleware, (req, res) => {
  const file = db.queryOne(
    'SELECT f.* FROM app_files f JOIN applications a ON f.app_id = a.id WHERE f.id = ? AND a.owner_id = ?',
    [req.params.fileId, req.user.id]
  );
  if (!file) return res.status(404).json({ success: false, message: 'File not found.' });

  try {
    if (fs.existsSync(file.file_path)) fs.unlinkSync(file.file_path);
  } catch (err) {
    console.error('File unlink error:', err);
  }

  db.run('DELETE FROM app_files WHERE id = ?', [file.id]);
  return res.json({ success: true, message: 'File deleted.' });
});

// ================= LOGS =================

// List logs
router.get('/apps/:id/logs', authMiddleware, (req, res) => {
  const app = db.queryOne('SELECT id FROM applications WHERE id = ? AND owner_id = ?', [req.params.id, req.user.id]);
  if (!app) return res.status(404).json({ success: false, message: 'Application not found.' });

  const logs = db.queryAll('SELECT * FROM app_logs WHERE app_id = ? ORDER BY id DESC LIMIT 100', [app.id]);
  return res.json({ success: true, logs });
});

// Clear logs
router.delete('/apps/:id/logs', authMiddleware, (req, res) => {
  const app = db.queryOne('SELECT id FROM applications WHERE id = ? AND owner_id = ?', [req.params.id, req.user.id]);
  if (!app) return res.status(404).json({ success: false, message: 'Application not found.' });

  db.run('DELETE FROM app_logs WHERE app_id = ?', [app.id]);
  return res.json({ success: true, message: 'Logs cleared.' });
});

// ================= WEBHOOKS =================

// List webhooks
router.get('/apps/:id/webhooks', authMiddleware, (req, res) => {
  const app = db.queryOne('SELECT id FROM applications WHERE id = ? AND owner_id = ?', [req.params.id, req.user.id]);
  if (!app) return res.status(404).json({ success: false, message: 'Application not found.' });

  const webhooks = db.queryAll('SELECT * FROM app_webhooks WHERE app_id = ? ORDER BY id DESC', [app.id]);
  return res.json({ success: true, webhooks });
});

// Add webhook
router.post('/apps/:id/webhooks', authMiddleware, (req, res) => {
  const { webhook_url, event_trigger } = req.body;
  if (!webhook_url) return res.status(400).json({ success: false, message: 'Webhook URL required.' });

  const app = db.queryOne('SELECT id FROM applications WHERE id = ? AND owner_id = ?', [req.params.id, req.user.id]);
  if (!app) return res.status(404).json({ success: false, message: 'Application not found.' });

  db.run(
    'INSERT INTO app_webhooks (app_id, webhook_url, event_trigger) VALUES (?, ?, ?)',
    [app.id, webhook_url, event_trigger || 'all']
  );

  return res.json({ success: true, message: 'Webhook created successfully!' });
});

// Delete webhook
router.delete('/apps/:id/webhooks/:whId', authMiddleware, (req, res) => {
  const wh = db.queryOne(
    'SELECT w.id FROM app_webhooks w JOIN applications a ON w.app_id = a.id WHERE w.id = ? AND a.owner_id = ?',
    [req.params.whId, req.user.id]
  );
  if (!wh) return res.status(404).json({ success: false, message: 'Webhook not found.' });

  db.run('DELETE FROM app_webhooks WHERE id = ?', [wh.id]);
  return res.json({ success: true, message: 'Webhook deleted.' });
});

module.exports = router;
