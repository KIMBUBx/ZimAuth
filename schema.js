const initSqlJs = require('./node_modules/sql.js');
const fs = require('fs');
const dbPath = __dirname + '/zimauth.sqlite';

initSqlJs().then(SQL => {
  const buf = fs.readFileSync(dbPath);
  const db = new SQL.Database(buf);
  const schema = db.exec("SELECT sql FROM sqlite_master WHERE type='table'");
  schema[0].values.forEach(r => console.log(r[0]));
  db.close();
});
