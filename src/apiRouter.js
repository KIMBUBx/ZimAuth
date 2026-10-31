// D:\KIM\KIMAUTH\src\apiRouter.js
const express = require('express');
const router = express.Router();
const db = require('./database');
const { hashPassword, verifyPassword, generateRandomKey } = require('./auth');

// Helper to extract client IP
function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.socket.remoteAddress || '';
}

// KeyAuth protocol handler (handles both POST /api/1.2/ and /api/1.0/ etc.)
router.all(['/', '/1.0/', '/1.1/', '/1.2/'], async (req, res) => {
  const data = { ...req.query, ...req.body };
  const type = data.type;
  const ip = getClientIp(req);

  if (!type) {
    return res.json({ success: false, message: 'Bad request. No type specified.' });
  }

  try {
    // 1. INIT TYPE
    if (type === 'init') {
      const { name, ownerid, secret, version, hash } = data;
      if (!name || !ownerid || !secret) {
        return res.json({ success: false, message: 'Application not found. Missing credentials.' });
      }

      const app = db.queryOne(
        'SELECT * FROM applications WHERE name = ? AND owner_key = ? AND secret = ?',
        [name, ownerid, secret]
      );

      if (!app) {
        return res.json({ success: false, message: 'Application not found. Please check app credentials.' });
      }

      if (app.status === 0) {
        return res.json({
          success: false,
          message: app.custom_message || 'Application is temporarily disabled by developer.'
        });
      }

      if (version && app.version && app.version !== version) {
        return res.json({
          success: false,
          message: 'Update available. Please update your client.',
          download: app.download_url || ''
        });
      }

      if (app.hash && hash && app.hash !== hash) {
        return res.json({
          success: false,
          message: 'Client integrity check failed. Hash mismatch.'
        });
      }

      const sessionId = generateRandomKey(24);
      db.run(
        'INSERT INTO client_sessions (session_id, app_id, ip, validated) VALUES (?, ?, ?, 0)',
        [sessionId, app.id, ip]
      );

      const numUsers = db.queryOne('SELECT COUNT(*) as c FROM app_users WHERE app_id = ?', [app.id])?.c || 0;
      const numKeys = db.queryOne('SELECT COUNT(*) as c FROM app_keys WHERE app_id = ?', [app.id])?.c || 0;

      return res.json({
        success: true,
        message: 'Initialized',
        sessionid: sessionId,
        appinfo: {
          numUsers: String(numUsers),
          numOnlineUsers: '1',
          numKeys: String(numKeys),
          version: app.version,
          customerPanel: 'https://zimauth.cc'
        }
      });
    }

    // Session validation for all subsequent requests
    const sessionid = data.sessionid;
    if (!sessionid) {
      return res.json({ success: false, message: 'Missing session ID.' });
    }

    const session = db.queryOne('SELECT * FROM client_sessions WHERE session_id = ?', [sessionid]);
    if (!session) {
      return res.json({ success: false, message: 'Session is invalid or expired. Re-initialize.' });
    }

    const app = db.queryOne('SELECT * FROM applications WHERE id = ?', [session.app_id]);
    if (!app || app.status === 0) {
      return res.json({ success: false, message: 'Application disabled.' });
    }

    // 2. REGISTER
    if (type === 'register') {
      const { username, pass, key, hwid } = data;
      if (!username || !pass || !key) {
        return res.json({ success: false, message: 'Username, password and license key required.' });
      }

      const existingUser = db.queryOne('SELECT id FROM app_users WHERE app_id = ? AND username = ?', [app.id, username]);
      if (existingUser) {
        return res.json({ success: false, message: 'Username is already taken.' });
      }

      const licenseKey = db.queryOne('SELECT * FROM app_keys WHERE app_id = ? AND key_str = ?', [app.id, key]);
      if (!licenseKey) {
        return res.json({ success: false, message: 'License key does not exist.' });
      }

      if (licenseKey.status === 2) {
        return res.json({ success: false, message: 'License key is banned.' });
      }
      if (licenseKey.status === 0) {
        return res.json({ success: false, message: 'License key is already used.' });
      }

      // Calculate expiry date
      let expiryDate = null;
      if (licenseKey.duration_days > 0 && licenseKey.duration_days < 99999) {
        const d = new Date();
        d.setDate(d.getDate() + licenseKey.duration_days);
        expiryDate = d.toISOString();
      } else {
        // Lifetime key
        expiryDate = new Date(Date.now() + 100 * 365 * 86400 * 1000).toISOString();
      }

      const passHash = hashPassword(pass);
      const userRes = db.run(
        `INSERT INTO app_users (app_id, username, password_hash, hwid, ip, key_id, level, expiry_at, last_login)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [app.id, username, passHash, hwid || '', ip, licenseKey.id, licenseKey.level, expiryDate]
      );

      // Update key
      db.run(
        `UPDATE app_keys SET status = 0, used_by = ?, used_at = CURRENT_TIMESTAMP, hwid = ?, ip = ? WHERE id = ?`,
        [username, hwid || '', ip, licenseKey.id]
      );

      // Mark session
      db.run('UPDATE client_sessions SET validated = 1, hwid = ?, user_id = ? WHERE session_id = ?', [
        hwid || '',
        userRes.lastInsertRowid,
        sessionid
      ]);

      // Log event
      db.run('INSERT INTO app_logs (app_id, user_str, event_type, message, ip) VALUES (?, ?, ?, ?, ?)', [
        app.id,
        username,
        'register',
        `User ${username} registered with key ${key}`,
        ip
      ]);

      const expiryEpoch = Math.floor(new Date(expiryDate).getTime() / 1000);
      return res.json({
        success: true,
        message: 'Logged in!',
        info: {
          username,
          subscriptions: [
            {
              subscription: 'default',
              key: key,
              expiry: String(expiryEpoch),
              timeleft: Math.max(0, expiryEpoch - Math.floor(Date.now() / 1000))
            }
          ],
          ip,
          hwid: hwid || '',
          createdate: String(Math.floor(Date.now() / 1000)),
          lastlogin: String(Math.floor(Date.now() / 1000))
        }
      });
    }

    // 3. LOGIN
    if (type === 'login') {
      const { username, pass, hwid } = data;
      if (!username || !pass) {
        return res.json({ success: false, message: 'Username and password required.' });
      }

      const user = db.queryOne('SELECT * FROM app_users WHERE app_id = ? AND username = ?', [app.id, username]);
      if (!user) {
        return res.json({ success: false, message: 'User does not exist.' });
      }

      if (user.status === 2) {
        return res.json({ success: false, message: 'Your account is banned.' });
      }

      if (!verifyPassword(pass, user.password_hash)) {
        return res.json({ success: false, message: 'Invalid password.' });
      }

      // HWID check
      if (app.hwid_check === 1 && hwid) {
        if (!user.hwid) {
          db.run('UPDATE app_users SET hwid = ? WHERE id = ?', [hwid, user.id]);
          user.hwid = hwid;
        } else if (user.hwid !== hwid) {
          return res.json({ success: false, message: "HWID doesn't match. Request HWID reset from developer." });
        }
      }

      // Expiry check
      if (user.expiry_at) {
        const expTime = new Date(user.expiry_at).getTime();
        if (expTime < Date.now()) {
          return res.json({ success: false, message: 'Subscription has expired.' });
        }
      }

      // Update last login
      db.run('UPDATE app_users SET last_login = CURRENT_TIMESTAMP, ip = ? WHERE id = ?', [ip, user.id]);
      db.run('UPDATE client_sessions SET validated = 1, hwid = ?, user_id = ? WHERE session_id = ?', [
        hwid || user.hwid,
        user.id,
        sessionid
      ]);

      db.run('INSERT INTO app_logs (app_id, user_str, event_type, message, ip) VALUES (?, ?, ?, ?, ?)', [
        app.id,
        username,
        'login',
        `User ${username} logged in successfully`,
        ip
      ]);

      const expiryEpoch = user.expiry_at
        ? Math.floor(new Date(user.expiry_at).getTime() / 1000)
        : Math.floor(Date.now() / 1000) + 86400 * 30;

      return res.json({
        success: true,
        message: 'Logged in!',
        info: {
          username: user.username,
          subscriptions: [
            {
              subscription: 'default',
              expiry: String(expiryEpoch),
              timeleft: Math.max(0, expiryEpoch - Math.floor(Date.now() / 1000))
            }
          ],
          ip,
          hwid: user.hwid,
          lastlogin: String(Math.floor(Date.now() / 1000))
        }
      });
    }

    // 4. LICENSE (Key-only login)
    if (type === 'license') {
      const { key, hwid } = data;
      if (!key) {
        return res.json({ success: false, message: 'License key is required.' });
      }

      let licenseKey = db.queryOne('SELECT * FROM app_keys WHERE app_id = ? AND key_str = ?', [app.id, key]);
      if (!licenseKey) {
        return res.json({ success: false, message: 'License key does not exist.' });
      }

      if (licenseKey.status === 2) {
        return res.json({ success: false, message: 'License key is banned.' });
      }
      if (licenseKey.status === 3) {
        return res.json({ success: false, message: 'License key is paused.' });
      }

      // If unused, activate it
      if (licenseKey.status === 1) {
        let expiryDate = null;
        if (licenseKey.duration_days > 0 && licenseKey.duration_days < 99999) {
          const d = new Date();
          d.setDate(d.getDate() + licenseKey.duration_days);
          expiryDate = d.toISOString();
        } else {
          expiryDate = new Date(Date.now() + 100 * 365 * 86400 * 1000).toISOString();
        }

        db.run(
          `UPDATE app_keys SET status = 0, used_at = CURRENT_TIMESTAMP, expiry_at = ?, hwid = ?, ip = ? WHERE id = ?`,
          [expiryDate, hwid || '', ip, licenseKey.id]
        );
        licenseKey.status = 0;
        licenseKey.expiry_at = expiryDate;
        licenseKey.hwid = hwid || '';
      } else {
        // HWID verification for used key
        if (app.hwid_check === 1 && hwid) {
          if (!licenseKey.hwid) {
            db.run('UPDATE app_keys SET hwid = ? WHERE id = ?', [hwid, licenseKey.id]);
            licenseKey.hwid = hwid;
          } else if (licenseKey.hwid !== hwid) {
            return res.json({ success: false, message: "HWID doesn't match license. Request HWID reset." });
          }
        }

        // Expiry check
        if (licenseKey.expiry_at && new Date(licenseKey.expiry_at).getTime() < Date.now()) {
          return res.json({ success: false, message: 'License key has expired.' });
        }
      }

      db.run('UPDATE client_sessions SET validated = 1, hwid = ? WHERE session_id = ?', [hwid || '', sessionid]);

      db.run('INSERT INTO app_logs (app_id, user_str, event_type, message, ip) VALUES (?, ?, ?, ?, ?)', [
        app.id,
        key,
        'license',
        `License key ${key} logged in`,
        ip
      ]);

      const expiryEpoch = licenseKey.expiry_at
        ? Math.floor(new Date(licenseKey.expiry_at).getTime() / 1000)
        : Math.floor(Date.now() / 1000) + 86400 * 30;

      return res.json({
        success: true,
        message: 'Logged in!',
        info: {
          username: key,
          subscriptions: [
            {
              subscription: 'default',
              key: key,
              expiry: String(expiryEpoch),
              timeleft: Math.max(0, expiryEpoch - Math.floor(Date.now() / 1000))
            }
          ],
          ip,
          hwid: licenseKey.hwid,
          lastlogin: String(Math.floor(Date.now() / 1000))
        }
      });
    }

    // 5. UPGRADE
    if (type === 'upgrade') {
      const { username, key } = data;
      const user = db.queryOne('SELECT * FROM app_users WHERE app_id = ? AND username = ?', [app.id, username]);
      if (!user) return res.json({ success: false, message: 'User does not exist.' });

      const licenseKey = db.queryOne('SELECT * FROM app_keys WHERE app_id = ? AND key_str = ? AND status = 1', [app.id, key]);
      if (!licenseKey) return res.json({ success: false, message: 'License key not found or already used.' });

      let currentExp = user.expiry_at ? new Date(user.expiry_at).getTime() : Date.now();
      if (currentExp < Date.now()) currentExp = Date.now();

      const newExp = new Date(currentExp + licenseKey.duration_days * 86400 * 1000).toISOString();
      db.run('UPDATE app_users SET expiry_at = ?, level = ? WHERE id = ?', [newExp, licenseKey.level, user.id]);
      db.run('UPDATE app_keys SET status = 0, used_by = ?, used_at = CURRENT_TIMESTAMP WHERE id = ?', [username, licenseKey.id]);

      return res.json({ success: true, message: 'Upgraded subscription successfully!' });
    }

    // 6. APPLICATION VARIABLE
    if (type === 'var') {
      const { varid } = data;
      if (!varid) return res.json({ success: false, message: 'Missing variable name.' });

      const variable = db.queryOne('SELECT * FROM app_vars WHERE app_id = ? AND var_name = ?', [app.id, varid]);
      if (!variable) return res.json({ success: false, message: 'Variable not found.' });

      return res.json({
        success: true,
        message: variable.var_data
      });
    }

    // 7. GET USER VARIABLE
    if (type === 'getvar') {
      const { var: varName } = data;
      if (!session.user_id) return res.json({ success: false, message: 'Not logged in as user.' });

      const uvar = db.queryOne('SELECT * FROM user_vars WHERE app_id = ? AND user_id = ? AND var_name = ?', [
        app.id,
        session.user_id,
        varName
      ]);
      return res.json({
        success: true,
        message: uvar ? uvar.var_data : ''
      });
    }

    // 8. SET USER VARIABLE
    if (type === 'setvar') {
      const { var: varName, data: varValue } = data;
      if (!session.user_id) return res.json({ success: false, message: 'Not logged in as user.' });

      db.run(
        `INSERT INTO user_vars (app_id, user_id, var_name, var_data, updated_at)
         VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(app_id, user_id, var_name) DO UPDATE SET var_data = excluded.var_data, updated_at = CURRENT_TIMESTAMP`,
        [app.id, session.user_id, varName, varValue || '']
      );

      return res.json({ success: true, message: 'Successfully set variable.' });
    }

    // 9. CHECK SESSION
    if (type === 'check') {
      return res.json({ success: true, message: 'Session is valid.' });
    }

    // 10. CLIENT LOG
    if (type === 'log') {
      const { message } = data;
      db.run('INSERT INTO app_logs (app_id, user_str, event_type, message, ip) VALUES (?, ?, ?, ?, ?)', [
        app.id,
        session.user_id ? `User#${session.user_id}` : 'Client',
        'client_log',
        message || 'Empty log message',
        ip
      ]);
      return res.json({ success: true, message: 'Successfully logged.' });
    }

    // 11. FETCH FILE
    if (type === 'file') {
      const { fileid } = data;
      const fileRecord = db.queryOne('SELECT * FROM app_files WHERE app_id = ? AND file_id = ?', [app.id, fileid]);
      if (!fileRecord) {
        return res.json({ success: false, message: 'File not found.' });
      }
      return res.json({
        success: true,
        message: 'File found',
        url: `/uploads/${fileRecord.file_name}`,
        size: fileRecord.file_size
      });
    }

    return res.json({ success: false, message: `Unknown request type '${type}'.` });
  } catch (err) {
    console.error('[KeyAuth API Error]', err);
    return res.status(500).json({ success: false, message: 'Internal server error: ' + err.message });
  }
});

module.exports = router;
