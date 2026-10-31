// D:\KIM\KIMAUTH\server.js
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');
const db = require('./src/database');
const apiRouter = require('./src/apiRouter');
const dashboardRouter = require('./src/dashboardRouter');
const { hashPassword } = require('./src/auth');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Static file serving
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// KeyAuth Client API (SDK compatibility for C++, C#, Python, etc.)
app.use('/api', apiRouter);

// ZimAuth Web Dashboard & Management API
app.use('/api/dashboard', dashboardRouter);

// Fallback for SPA routing if needed
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Server Initialization
async function startServer() {
  await db.init();

  // Create default admin account if table is empty
  const accountCount = db.queryOne('SELECT COUNT(*) as c FROM accounts')?.c || 0;
  if (accountCount === 0) {
    const adminPass = hashPassword('admin123');
    db.run(
      `INSERT INTO accounts (username, email, password_hash, role, plan)
       VALUES (?, ?, ?, 'admin', 'Enterprise Lifetime (Free)')`,
      ['admin', 'admin@zimauth.cc', adminPass]
    );
    console.log('[ZimAuth] Default admin account created: admin / admin123 (Enterprise Plan Unlocked)');
  }

  app.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`  ZimAuth Licensing & Auth Server is Running!`);
    console.log(`  Website & Dashboard : http://localhost:${PORT}`);
    console.log(`  KeyAuth Client API  : http://localhost:${PORT}/api/1.2/`);
    console.log(`  All Plans Unlocked  : 100% Free Lifetime Access`);
    console.log(`====================================================`);
  });
}

startServer().catch((err) => {
  console.error('[ZimAuth] Failed to start server:', err);
});
