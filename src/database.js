// D:\KIM\KIMAUTH\src\database.js
const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, '..', 'zimauth.sqlite');

class DatabaseWrapper {
  constructor() {
    this.db = null;
    this.saveTimeout = null;
  }

  async init() {
    const SQL = await initSqlJs();
    if (fs.existsSync(DB_FILE)) {
      const fileBuffer = fs.readFileSync(DB_FILE);
      this.db = new SQL.Database(fileBuffer);
    } else {
      this.db = new SQL.Database();
    }

    this.initTables();
    this.saveImmediate();
    return this;
  }

  save() {
    if (this.saveTimeout) return;
    this.saveTimeout = setTimeout(() => {
      this.saveImmediate();
      this.saveTimeout = null;
    }, 200);
  }

  saveImmediate() {
    if (!this.db) return;
    try {
      const data = this.db.export();
      const buffer = Buffer.from(data);
      fs.writeFileSync(DB_FILE, buffer);
    } catch (err) {
      console.error('[DB] Save error:', err);
    }
  }

  initTables() {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS accounts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT DEFAULT 'admin',
        plan TEXT DEFAULT 'Enterprise Lifetime (Free)',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS applications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        owner_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        secret TEXT NOT NULL,
        owner_key TEXT NOT NULL,
        version TEXT DEFAULT '1.0',
        download_url TEXT DEFAULT '',
        hash TEXT DEFAULT '',
        status INTEGER DEFAULT 1,
        custom_message TEXT DEFAULT 'Welcome to application',
        hwid_check INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(owner_id) REFERENCES accounts(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS app_keys (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        app_id INTEGER NOT NULL,
        key_str TEXT UNIQUE NOT NULL,
        duration_days INTEGER DEFAULT 30,
        level INTEGER DEFAULT 1,
        note TEXT DEFAULT '',
        status INTEGER DEFAULT 1,
        used_by TEXT DEFAULT '',
        used_at DATETIME,
        expiry_at DATETIME,
        hwid TEXT DEFAULT '',
        ip TEXT DEFAULT '',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(app_id) REFERENCES applications(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS app_users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        app_id INTEGER NOT NULL,
        username TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        hwid TEXT DEFAULT '',
        ip TEXT DEFAULT '',
        key_id INTEGER,
        level INTEGER DEFAULT 1,
        status INTEGER DEFAULT 1,
        expiry_at DATETIME,
        last_login DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(app_id) REFERENCES applications(id) ON DELETE CASCADE,
        UNIQUE(app_id, username)
      );

      CREATE TABLE IF NOT EXISTS app_vars (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        app_id INTEGER NOT NULL,
        var_name TEXT NOT NULL,
        var_data TEXT NOT NULL,
        is_secret INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(app_id) REFERENCES applications(id) ON DELETE CASCADE,
        UNIQUE(app_id, var_name)
      );

      CREATE TABLE IF NOT EXISTS user_vars (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        app_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        var_name TEXT NOT NULL,
        var_data TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(app_id) REFERENCES applications(id) ON DELETE CASCADE,
        UNIQUE(app_id, user_id, var_name)
      );

      CREATE TABLE IF NOT EXISTS app_files (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        app_id INTEGER NOT NULL,
        file_id TEXT UNIQUE NOT NULL,
        file_name TEXT NOT NULL,
        file_path TEXT NOT NULL,
        file_size INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(app_id) REFERENCES applications(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS app_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        app_id INTEGER NOT NULL,
        user_str TEXT DEFAULT 'Client',
        event_type TEXT DEFAULT 'info',
        message TEXT NOT NULL,
        ip TEXT DEFAULT '',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(app_id) REFERENCES applications(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS app_webhooks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        app_id INTEGER NOT NULL,
        webhook_url TEXT NOT NULL,
        event_trigger TEXT DEFAULT 'all',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(app_id) REFERENCES applications(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS client_sessions (
        session_id TEXT PRIMARY KEY,
        app_id INTEGER NOT NULL,
        hwid TEXT DEFAULT '',
        ip TEXT DEFAULT '',
        validated INTEGER DEFAULT 0,
        user_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(app_id) REFERENCES applications(id) ON DELETE CASCADE
      );
    `);
  }

  queryAll(sql, params = []) {
    try {
      const stmt = this.db.prepare(sql);
      stmt.bind(params);
      const rows = [];
      while (stmt.step()) {
        rows.push(stmt.getAsObject());
      }
      stmt.free();
      return rows;
    } catch (err) {
      console.error('[DB queryAll error]', sql, params, err);
      return [];
    }
  }

  queryOne(sql, params = []) {
    try {
      const stmt = this.db.prepare(sql);
      stmt.bind(params);
      let row = null;
      if (stmt.step()) {
        row = stmt.getAsObject();
      }
      stmt.free();
      return row;
    } catch (err) {
      console.error('[DB queryOne error]', sql, params, err);
      return null;
    }
  }

  run(sql, params = []) {
    try {
      this.db.run(sql, params);
      const res = this.db.exec('SELECT last_insert_rowid() AS lastId, changes() AS changes');
      let lastInsertRowid = 0;
      let changes = 0;
      if (res.length > 0 && res[0].values.length > 0) {
        lastInsertRowid = res[0].values[0][0];
        changes = res[0].values[0][1];
      }
      this.save();
      return { lastInsertRowid, changes };
    } catch (err) {
      console.error('[DB run error]', sql, params, err);
      throw err;
    }
  }
}

const dbWrapper = new DatabaseWrapper();
module.exports = dbWrapper;
