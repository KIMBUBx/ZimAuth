// D:\KIM\KIMAUTH\src\database.js
const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const os = require('os');

function findCandidateFile(fileName) {
  const candidates = [
    path.join(__dirname, fileName),
    path.join(__dirname, '..', fileName),
    path.join(process.cwd(), fileName),
    path.join(process.cwd(), 'src', fileName),
    path.join('/var/task', fileName),
    path.join('/var/task/src', fileName)
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

const DEFAULT_DB_FILE = path.resolve(findCandidateFile('zimauth.sqlite') || path.join(__dirname, '..', 'zimauth.sqlite'));
const DB_FILE = process.env.VERCEL
  ? path.join(os.tmpdir(), 'zimauth.sqlite')
  : DEFAULT_DB_FILE;

// Helper: Download latest SQLite from Vercel Blob
async function downloadBlobDb() {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return null;

  try {
    const { list } = require('@vercel/blob');
    const { blobs } = await list({ token });
    if (!blobs || blobs.length === 0) return null;

    const targets = blobs.filter((b) => b.pathname === 'zimauth.sqlite' || b.pathname.endsWith('zimauth.sqlite'));
    if (targets.length === 0) return null;

    // Pick latest uploaded database
    targets.sort((a, b) => new Date(b.uploadedAt || 0) - new Date(a.uploadedAt || 0));
    const target = targets[0];
    const fetchUrl = target.downloadUrl || target.url;

    if (fetchUrl) {
      const resp = await fetch(fetchUrl, { cache: 'no-store' });
      if (resp.ok) {
        const ab = await resp.arrayBuffer();
        console.log('[Blob] Downloaded newest zimauth.sqlite (' + ab.byteLength + ' bytes) uploaded at ' + target.uploadedAt);
        return Buffer.from(ab);
      }
    }
  } catch (err) {
    console.warn('[Blob] Download error:', err.message);
  }
  return null;
}

// Helper: Upload SQLite buffer to Vercel Blob
let isUploadingBlob = false;
let pendingBlobBuffer = null;

async function uploadBlobDb(buffer) {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token || !buffer) return;

  if (isUploadingBlob) {
    pendingBlobBuffer = buffer;
    return;
  }

  isUploadingBlob = true;
  try {
    const { put } = require('@vercel/blob');
    const blob = await put('zimauth.sqlite', buffer, {
      access: 'public',
      addRandomSuffix: false,
      token
    });
    console.log('[Blob] Successfully saved zimauth.sqlite to Vercel Blob (' + buffer.length + ' bytes, url: ' + (blob.url || '') + ')');
  } catch (err) {
    console.error('[Blob] Failed to save zimauth.sqlite to Vercel Blob:', err.message);
  } finally {
    isUploadingBlob = false;
    if (pendingBlobBuffer) {
      const nextBuf = pendingBlobBuffer;
      pendingBlobBuffer = null;
      uploadBlobDb(nextBuf);
    }
  }
}

class DatabaseWrapper {
  constructor() {
    this.db = null;
    this.saveTimeout = null;
  }

  async init() {
    if (this.db) {
      return this;
    }

    // 1. Locate and load WebAssembly binary directly
    let wasmBinary = null;
    const wasmPath = findCandidateFile('sql-wasm.wasm') || 
      path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');
    
    if (fs.existsSync(wasmPath)) {
      try {
        wasmBinary = fs.readFileSync(wasmPath);
      } catch (err) {
        console.warn('[DB] Failed reading wasm binary:', err.message);
      }
    }

    const SQL = await initSqlJs(wasmBinary ? { wasmBinary } : {});

    // 2. Load latest database: Try Vercel Blob first
    let cloudBuffer = null;
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      try {
        cloudBuffer = await downloadBlobDb();
        if (cloudBuffer) {
          console.log('[DB] Loaded latest database from Vercel Blob (' + cloudBuffer.length + ' bytes)');
        }
      } catch (e) {
        console.warn('[DB] Could not load from Vercel Blob:', e.message);
      }
    }

    if (cloudBuffer) {
      this.db = new SQL.Database(cloudBuffer);
      try {
        fs.writeFileSync(DB_FILE, cloudBuffer);
      } catch (e) {}
    } else if (process.env.VERCEL && !fs.existsSync(DB_FILE) && fs.existsSync(DEFAULT_DB_FILE)) {
      try {
        fs.copyFileSync(DEFAULT_DB_FILE, DB_FILE);
      } catch (e) {
        console.warn('[DB] Could not copy initial DB to /tmp:', e.message);
      }
      if (fs.existsSync(DB_FILE)) {
        const fileBuffer = fs.readFileSync(DB_FILE);
        this.db = new SQL.Database(fileBuffer);
      } else {
        this.db = new SQL.Database();
      }
    } else if (fs.existsSync(DB_FILE)) {
      const fileBuffer = fs.readFileSync(DB_FILE);
      this.db = new SQL.Database(fileBuffer);
    } else if (fs.existsSync(DEFAULT_DB_FILE)) {
      const fileBuffer = fs.readFileSync(DEFAULT_DB_FILE);
      this.db = new SQL.Database(fileBuffer);
    } else {
      this.db = new SQL.Database();
    }

    this.initTables();
    this.saveImmediate();
    return this;
  }

  save() {
    this.saveImmediate();
  }

  saveImmediate() {
    if (!this.db) return;
    try {
      const data = this.db.export();
      const buffer = Buffer.from(data);
      try {
        fs.writeFileSync(DB_FILE, buffer);
      } catch (e) {
        console.warn('[DB] Could not write to DB_FILE:', e.message);
      }
      if (DEFAULT_DB_FILE && DEFAULT_DB_FILE !== DB_FILE && !process.env.VERCEL) {
        try {
          fs.writeFileSync(DEFAULT_DB_FILE, buffer);
        } catch (e) {}
      }
      
      // Upload to Vercel Blob if token available
      if (process.env.BLOB_READ_WRITE_TOKEN) {
        uploadBlobDb(buffer).catch((err) => {
          console.error('[Blob] Background upload error:', err);
        });
      }
    } catch (err) {
      console.error('[DB] Save error:', err);
    }
  }

  async persist() {
    if (!this.db) return;
    try {
      const data = this.db.export();
      const buffer = Buffer.from(data);
      try {
        fs.writeFileSync(DB_FILE, buffer);
      } catch (e) {
        console.warn('[DB] Could not write to DB_FILE:', e.message);
      }
      if (DEFAULT_DB_FILE && DEFAULT_DB_FILE !== DB_FILE && !process.env.VERCEL) {
        try {
          fs.writeFileSync(DEFAULT_DB_FILE, buffer);
        } catch (e) {}
      }
      if (process.env.BLOB_READ_WRITE_TOKEN) {
        await uploadBlobDb(buffer);
      }
    } catch (err) {
      console.error('[DB] Persist error:', err);
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

  run(sql, params = [], autoSave = true) {
    try {
      this.db.run(sql, params);
      const res = this.db.exec('SELECT last_insert_rowid() AS lastId, changes() AS changes');
      let lastInsertRowid = 0;
      let changes = 0;
      if (res.length > 0 && res[0].values.length > 0) {
        lastInsertRowid = res[0].values[0][0];
        changes = res[0].values[0][1];
      }
      if (autoSave) {
        this.saveImmediate();
      }
      return { lastInsertRowid, changes };
    } catch (err) {
      console.error('[DB run error]', sql, params, err);
      throw err;
    }
  }

  exportBuffer() {
    if (!this.db) return Buffer.alloc(0);
    return Buffer.from(this.db.export());
  }

  async importBuffer(buffer) {
    if (!buffer || buffer.length === 0) throw new Error('Empty database buffer');
    const SQL = await initSqlJs();
    this.db = new SQL.Database(buffer);
    await this.persist();
    return true;
  }
}

const dbWrapper = new DatabaseWrapper();
module.exports = dbWrapper;
