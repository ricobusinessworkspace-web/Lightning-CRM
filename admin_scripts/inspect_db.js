const Database = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.join(__dirname, 'calling_station.sqlite');
const db = new Database.Database(dbPath);

db.all('SELECT id, name, phone, notes, last_contact_ms, call_history, google_place_id FROM leads', (err, rows) => {
  if (err) return console.error(err);
  
  let needsPhone = 0;
  let has21MayContact = 0;
  let hasScrapedNotes = 0;
  
  const todayStart = new Date('2026-05-21T00:00:00.000+02:00').getTime();
  const todayEnd = new Date('2026-05-21T23:59:59.999+02:00').getTime();
  
  rows.forEach(r => {
    // 1. Needs phone
    if (!r.phone && r.google_place_id) {
      needsPhone++;
    }
    
    // 2. Has 21.05 timestamp
    if (r.last_contact_ms >= todayStart && r.last_contact_ms <= todayEnd) {
      has21MayContact++;
    }
    
    // 3. Has scraped notes
    if (r.notes && (r.notes.includes('Website aus Scout:') || r.notes.includes('Google Rating:'))) {
      hasScrapedNotes++;
    }
  });
  
  console.log(`Leads needing phone fetch: ${needsPhone}`);
  console.log(`Leads with 21.05 contact timestamp: ${has21MayContact}`);
  console.log(`Leads with scraped notes: ${hasScrapedNotes}`);
});
