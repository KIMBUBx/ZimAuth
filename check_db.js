const initSqlJs = require('./node_modules/sql.js');
const fs = require('fs');
initSqlJs().then(SQL => {
  const buf = fs.readFileSync('zimauth.sqlite');
  const db = new SQL.Database(buf);
  const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table'");
  console.log('TABLES:', JSON.stringify(tables));
  if (tables.length > 0) {
    tables[0].values.forEach(row => {
      const tname = row[0];
      try {
        const r = db.exec("SELECT * FROM " + tname);
        console.log(tname + ':', JSON.stringify(r));
      } catch(e) { console.log(tname + ' error:', e.message); }
    });
  }
});
