const Database = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'calling_station.sqlite');
const db = new Database.Database(dbPath);

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT,
      notes TEXT,
      size TEXT DEFAULT 'Tarifkunde',
      entscheider INTEGER DEFAULT 0,
      termin INTEGER DEFAULT 0,
      rechnung INTEGER DEFAULT 0,
      snooze_until_ms INTEGER DEFAULT 0,
      last_contact_ms INTEGER DEFAULT 0,
      status TEXT DEFAULT 'Lead',
      task_text TEXT DEFAULT '',
      maps_city TEXT,
      lat REAL,
      lng REAL,
      website_url TEXT,
      google_maps_url TEXT,
      google_place_id TEXT,
      umsatz INTEGER DEFAULT 0
    )
  `);
  
  // Gracefully add columns if updating from older version
  db.run(`ALTER TABLE leads ADD COLUMN status TEXT DEFAULT 'Lead'`, (err) => {});
  db.run(`ALTER TABLE leads ADD COLUMN task_text TEXT DEFAULT ''`, (err) => {});
  db.run(`ALTER TABLE leads ADD COLUMN maps_city TEXT`, (err) => {});
  db.run(`ALTER TABLE leads ADD COLUMN lat REAL`, (err) => {});
  db.run(`ALTER TABLE leads ADD COLUMN lng REAL`, (err) => {});
  db.run(`ALTER TABLE leads ADD COLUMN website_url TEXT`, (err) => {});
  db.run(`ALTER TABLE leads ADD COLUMN google_maps_url TEXT`, (err) => {});
  db.run(`ALTER TABLE leads ADD COLUMN google_place_id TEXT`, (err) => {});
  db.run(`ALTER TABLE leads ADD COLUMN umsatz INTEGER DEFAULT 0`, (err) => {});
  db.run(`ALTER TABLE leads ADD COLUMN created_at INTEGER DEFAULT 0`, (err) => {
    // Wenn created_at hinzugefügt wird, setze bestehende Leads auf Date.now()
    if (!err) {
      db.run(`UPDATE leads SET created_at = ? WHERE created_at = 0`, [Date.now()]);
    }
  });

  db.run(`
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      start_ms INTEGER,
      end_ms INTEGER DEFAULT 0
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS call_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER,
      lead_id INTEGER,
      duration_seconds INTEGER DEFAULT 0,
      outcome TEXT,
      timestamp_ms INTEGER
    )
  `);
});

module.exports = {
  getLeads: (filters = {}) => {
    return new Promise((resolve, reject) => {
      let query = 'SELECT * FROM leads WHERE 1=1';
      let params = [];
      
      if (filters.search && filters.search.length > 0) {
        query = 'SELECT * FROM leads WHERE name LIKE ?';
        params = [`%${filters.search}%`];
      }

      db.all(query, params, (err, rows) => {
        if (err) return reject(err);
        
        let results = rows;
        
        // Skip tab/status filtering if doing a global search
        if (!(filters.search && filters.search.length > 0)) {
          // 1. Tab-specific basic filtering (Tasks vs others)
          if (filters.tab === 'tasks') {
            results = results.filter(r => {
              if (!r.task_text) return false;
              try {
                const tasks = JSON.parse(r.task_text);
                return Array.isArray(tasks) && tasks.some(t => !t.done);
              } catch(e) { return r.task_text.trim() !== ''; }
            });
          } else if (filters.tab === 'queue') {
            // QUEUE SPECIFIC: 
            // a) Hide Customers unless explicitly requested
            if (filters.filter1 !== 'kunden') {
              results = results.filter(r => r.status === 'Lead');
            }
            // b) Hide leads that currently have an active task
            results = results.filter(r => {
              if (!r.task_text) return true;
              try {
                const tasks = JSON.parse(r.task_text);
                return !tasks.some(t => !t.done);
              } catch(e) { return r.task_text.trim() === ''; }
            });
          }

          // 2. Filter Group 1 (Status specific) - Applied across all tabs
          if (filters.filter1 && filters.filter1 !== 'all') {
            if (filters.filter1 === 'kalt') {
              results = results.filter(r => r.status === 'Lead' && !r.entscheider && !r.termin && !r.rechnung);
            } else if (filters.filter1 === 'entscheider') {
              results = results.filter(r => r.entscheider === 1 && !r.termin && !r.rechnung && r.status !== 'Kunde');
            } else if (filters.filter1 === 'termin') {
              results = results.filter(r => r.termin === 1 && !r.rechnung && r.status !== 'Kunde');
            } else if (filters.filter1 === 'rechnung') {
              results = results.filter(r => r.rechnung === 1 && r.status !== 'Kunde');
            } else if (filters.filter1 === 'kunden') {
              results = results.filter(r => r.status === 'Kunde');
            }
          }

          // 3. Filter Group 2 (Size)
          if (filters.filter2 && filters.filter2 !== 'all') {
            results = results.filter(r => r.size.toLowerCase() === filters.filter2);
          }

          // 4. Handling snoozed in Queue
          if (filters.tab === 'queue' && filters.filter1 !== 'all' && filters.filter1 !== 'kunden') {
             results = results.filter(r => (r.snooze_until_ms || 0) <= Date.now());
          }
        }

        // 5. Sorting
        if (filters.tab === 'tasks') {
          results.sort((a,b) => {
            const getOldest = (txt) => {
              try {
                const arr = JSON.parse(txt);
                if (!Array.isArray(arr)) return Infinity;
                const ts = arr.filter(t => !t.done).map(t => t.id);
                return ts.length > 0 ? Math.min(...ts) : Infinity;
              } catch(e) { return Infinity; }
            };
            return getOldest(a.task_text) - getOldest(b.task_text);
          });
        } else {
          // Queue & Map: Sort by last contact (most recent / "zuletzt kontaktiert"). 
          // The user specifically wants correct sorting for high speed.
          // Correct implementation: NEVER contacted (0) should be at the top, then OLDEST contact first.
          results.sort((a,b) => {
            let valA = a.last_contact_ms || 0;
            let valB = b.last_contact_ms || 0;
            if (valA === 0 && valB !== 0) return -1;
            if (valB === 0 && valA !== 0) return 1;
            return valA - valB;
          });
        }

        resolve(results);
      });
    });
  },
  
  saveLead: (lead) => {
    return new Promise((resolve, reject) => {
      if (lead.id) {
        db.run(
          `UPDATE leads SET 
            name = COALESCE(?, name),
            phone = COALESCE(?, phone),
            notes = COALESCE(?, notes), 
            size = COALESCE(?, size),
            entscheider = COALESCE(?, entscheider),
            termin = COALESCE(?, termin),
            rechnung = COALESCE(?, rechnung),
            snooze_until_ms = COALESCE(?, snooze_until_ms),
            status = COALESCE(?, status),
            task_text = COALESCE(?, task_text),
            maps_city = COALESCE(?, maps_city),
            lat = COALESCE(?, lat),
            lng = COALESCE(?, lng),
            website_url = COALESCE(?, website_url),
            google_maps_url = COALESCE(?, google_maps_url),
            google_place_id = COALESCE(?, google_place_id),
            umsatz = COALESCE(?, umsatz),
            created_at = CASE WHEN created_at = 0 THEN ? ELSE created_at END
           WHERE id = ?`,
          [lead.name, lead.phone, lead.notes, lead.size, lead.entscheider, lead.termin, lead.rechnung, lead.snooze_until_ms, lead.status, lead.task_text, lead.maps_city, lead.lat, lead.lng, lead.website_url, lead.google_maps_url, lead.google_place_id, lead.umsatz, Date.now(), lead.id],
          function(err) {
            if (err) reject(err);
            else resolve({ id: lead.id, updated: this.changes });
          }
        );
      } else {
        db.run(
          `INSERT INTO leads (name, phone, notes, size, entscheider, termin, rechnung, snooze_until_ms, status, task_text, maps_city, lat, lng, last_contact_ms, website_url, google_maps_url, google_place_id, umsatz, created_at) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [lead.name, lead.phone || '', lead.notes || '', lead.size || 'Tarifkunde', lead.entscheider || 0, lead.termin || 0, lead.rechnung || 0, lead.snooze_until_ms || 0, lead.status || 'Lead', lead.task_text || '', lead.maps_city || '', lead.lat || null, lead.lng || null, lead.last_contact_ms !== undefined ? lead.last_contact_ms : Date.now(), lead.website_url || '', lead.google_maps_url || '', lead.google_place_id || '', lead.umsatz || 0, Date.now()],
          function(err) {
            if (err) reject(err);
            else resolve({ id: this.lastID, inserted: true });
          }
        );
      }
    });
  },

  logCall: (id) => {
    return new Promise((resolve, reject) => {
      db.run('UPDATE leads SET last_contact_ms = ? WHERE id = ?', [Date.now(), id], function(err) {
        if(err) reject(err);
        else resolve({ logged: true });
      });
    });
  },

  deleteLead: (id) => {
    return new Promise((resolve, reject) => {
      db.run('DELETE FROM leads WHERE id = ?', [id], function(err) {
        if (err) reject(err);
        else resolve({ deleted: this.changes });
      });
    });
  },

  deleteLeads: (ids) => {
    return new Promise((resolve, reject) => {
      if (!ids || ids.length === 0) return resolve({ deleted: 0 });
      const placeholders = ids.map(() => '?').join(',');
      db.run(`DELETE FROM leads WHERE id IN (${placeholders})`, ids, function(err) {
        if (err) reject(err);
        else resolve({ deleted: this.changes });
      });
    });
  },

  importLeads: (leadsArray) => {
    return new Promise((resolve, reject) => {
      db.serialize(() => {
        db.run("BEGIN TRANSACTION");
        const stmt = db.prepare("INSERT INTO leads (name, phone, snooze_until_ms, last_contact_ms, status, task_text, created_at) VALUES (?, ?, 0, 0, 'Lead', '', ?)");
        
        let inserted = 0;
        const nowMs = Date.now();
        for (const lead of leadsArray) {
          if (!lead.name) continue;
          stmt.run([lead.name, lead.phone || '', nowMs], (err) => {
            if(!err) inserted++;
          });
        }
        
        stmt.finalize();
        db.run("COMMIT", (err) => {
          if (err) reject(err);
          else resolve({ importedCount: inserted });
        });
      });
    });
  },

  getStats: (range = 'today') => {
    return new Promise((resolve) => {
      let startTime = 0;
      let endTime = Date.now();
      
      const todayStart = new Date();
      todayStart.setHours(0,0,0,0);
      
      if (range === 'today') {
        startTime = todayStart.getTime();
      } else if (range === 'week') {
        const d = new Date(todayStart);
        const day = d.getDay() || 7; 
        if (day !== 1) d.setHours(-24 * (day - 1));
        startTime = d.getTime();
      } else if (range === 'all') {
        startTime = 0;
      }

      const q = `SELECT entscheider, termin, rechnung, umsatz FROM leads WHERE last_contact_ms >= ? AND last_contact_ms <= ?`;
      db.all(q, [startTime, endTime], (err, rows) => {
        const stats = { totalDone: 0, entscheider: 0, termin: 0, rechnung: 0, umsatz: 0, callsToTermin: 0, callsToEntscheider: 0 };
        if (!err && rows) {
          stats.totalDone = rows.length;
          stats.entscheider = rows.filter(r => r.entscheider).length;
          stats.termin = rows.filter(r => r.termin).length;
          stats.rechnung = rows.filter(r => r.rechnung).length;
          stats.umsatz = rows.reduce((acc, curr) => acc + (curr.umsatz || 0), 0);
          
          if (stats.totalDone > 0) {
              stats.callsToEntscheider = ((stats.entscheider / stats.totalDone) * 100).toFixed(1);
              stats.callsToTermin = ((stats.termin / stats.totalDone) * 100).toFixed(1);
          }
        }
        resolve(stats);
      });
    });
  },

  getActiveSession: () => {
    return new Promise((resolve) => {
      db.get('SELECT * FROM sessions WHERE end_ms = 0 ORDER BY start_ms DESC LIMIT 1', [], (err, row) => {
        resolve(row || null);
      });
    });
  },

  createSession: () => {
    return new Promise((resolve, reject) => {
      // End any open sessions first
      db.run('UPDATE sessions SET end_ms = ? WHERE end_ms = 0', [Date.now()], () => {
        db.run('INSERT INTO sessions (start_ms, end_ms) VALUES (?, 0)', [Date.now()], function(err) {
          if (err) reject(err);
          else resolve({ id: this.lastID, start_ms: Date.now() });
        });
      });
    });
  },

  endSession: (sessionId) => {
    return new Promise((resolve, reject) => {
      db.run('UPDATE sessions SET end_ms = ? WHERE id = ?', [Date.now(), sessionId], function(err) {
        if (err) reject(err);
        else resolve({ ended: true });
      });
    });
  },

  logCallExtended: (data) => {
    return new Promise((resolve, reject) => {
      const { lead_id, session_id, duration_seconds, outcome } = data;
      // Also update last_contact_ms in leads table for compatibility
      db.run('UPDATE leads SET last_contact_ms = ? WHERE id = ?', [Date.now(), lead_id], () => {
         db.run(
           'INSERT INTO call_logs (session_id, lead_id, duration_seconds, outcome, timestamp_ms) VALUES (?, ?, ?, ?, ?)',
           [session_id || null, lead_id, duration_seconds || 0, outcome || 'unknown', Date.now()],
           function(err) {
             if (err) reject(err);
             else resolve({ id: this.lastID });
           }
         );
      });
    });
  },

  getSessionStats: (sessionId) => {
    return new Promise((resolve, reject) => {
      let query = 'SELECT * FROM call_logs WHERE session_id = ?';
      let params = [sessionId];
      if (sessionId === 'today') {
        const todayStart = new Date();
        todayStart.setHours(0,0,0,0);
        query = 'SELECT * FROM call_logs WHERE timestamp_ms >= ?';
        params = [todayStart.getTime()];
      }

      db.all(query, params, (err, rows) => {
        if (err) return reject(err);

        const stats = {
          totalCalls: rows.length,
          totalRealConversations: 0,
          totalDuration: 0,
          outcomes: {
            mailbox: 0,
            no_interest: 0,
            callback: 0,
            meeting: 0
          }
        };

        rows.forEach(row => {
           stats.totalDuration += (row.duration_seconds || 0);
           if (row.outcome === 'mailbox') {
              stats.outcomes.mailbox++;
           } else if (row.outcome === 'no_interest') {
              stats.outcomes.no_interest++;
              stats.totalRealConversations++;
           } else if (row.outcome === 'callback') {
              stats.outcomes.callback++;
              stats.totalRealConversations++;
           } else if (row.outcome === 'meeting') {
              stats.outcomes.meeting++;
              stats.totalRealConversations++;
           } else {
              // positive outcomes fallback
              if (row.outcome !== 'unknown') stats.totalRealConversations++;
           }
        });

        // Calculate rates
        stats.connectRate = stats.totalCalls > 0 ? ((stats.totalRealConversations / stats.totalCalls) * 100).toFixed(1) : 0;
        
        const positiveOutcomes = stats.outcomes.callback + stats.outcomes.meeting;
        stats.conversionRate = stats.totalRealConversations > 0 ? ((positiveOutcomes / stats.totalRealConversations) * 100).toFixed(1) : 0;
        stats.averageDurationSeconds = stats.totalCalls > 0 ? Math.round(stats.totalDuration / stats.totalCalls) : 0;
        
        resolve(stats);
      });
    });
  }
};
