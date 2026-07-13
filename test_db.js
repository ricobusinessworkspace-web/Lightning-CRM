const { app } = require('electron');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

app.whenReady().then(() => {
  const dbPath = path.join(app.getPath('userData'), 'leads.sqlite');
  console.log("DB Path:", dbPath);
  const db = new sqlite3.Database(dbPath);
  db.all("SELECT id, name, entscheider FROM leads LIMIT 1", [], (err, rows) => {
    if (err) console.error("DB Error:", err);
    else console.log("DB Rows:", rows);
    app.quit();
  });
});
