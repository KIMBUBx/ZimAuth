const initSqlJs = require('./node_modules/sql.js');
const fs = require('fs');
const path = require('path');
const dbPath = path.join(__dirname, 'zimauth.sqlite');

initSqlJs().then(SQL => {
  const buf = fs.readFileSync(dbPath);
  const db = new SQL.Database(buf);

  // App SSS is id=2, owner_key=48a18b175e469cae
  // Check if key KIM exists
  const existing = db.exec("SELECT * FROM app_keys WHERE key_str='KIM' AND app_id=2");
  if (existing.length > 0 && existing[0].values.length > 0) {
    console.log('Key KIM already exists:', JSON.stringify(existing));
  } else {
    db.run(
      "INSERT INTO app_keys (app_id, key_str, hwid, note, duration_days, status, expiry_at, created_at) VALUES (2, 'KIM', '', 'master key', 99999, 1, '2099-01-01 00:00:00', datetime('now'))"
    );
    console.log('Key KIM inserted!');
  }

  // Save back
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(dbPath, buffer);
  console.log('DB saved.');

  // Verify
  const verify = db.exec("SELECT * FROM app_keys WHERE app_id=2");
  console.log('app_keys after:', JSON.stringify(verify));
  db.close();
});
