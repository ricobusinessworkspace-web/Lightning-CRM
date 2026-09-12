/**
 * tests/mcp.test.mjs — MCP-Server: Zugang und Protokoll
 * ─────────────────────────────────────────────────────────────────────────────
 * Geprüft wird alles, was ohne Datenbank läuft: die Zugangsprüfung, die
 * JSON-RPC-Ebene und die Beschreibung der Werkzeuge. Die schreibenden Wege
 * fassen die produktive Datenbank an und werden hier bewusst NICHT ausgeführt.
 */
const ok = [];
const fail = [];
const check = (name, cond) => (cond ? ok : fail).push(name);

// ── Antwort-Attrappe ──────────────────────────────────────────────────────
const machRes = () => {
  const r = {
    code: 0, koerper: undefined, kopf: {}, beendet: false,
    status(c) { r.code = c; return r; },
    json(v) { r.koerper = v; r.beendet = true; return r; },
    end() { r.beendet = true; return r; },
    setHeader(k, v) { r.kopf[k.toLowerCase()] = v; return r; }
  };
  return r;
};

const TOKEN = 'test-token-mit-ausreichender-laenge-1234567890';

const ruf = async (koerper, { token = TOKEN, method = 'POST' } = {}) => {
  const { default: handler } = await import('../api/mcp.js?t=' + Math.random());
  const res = machRes();
  await handler({
    method,
    headers: token ? { authorization: `Bearer ${token}` } : {},
    body: koerper
  }, res);
  return res;
};

const anfrage = (id, method, params) => ({ jsonrpc: '2.0', id, method, params });

// ── 1. Ohne Zugangswort steht der Server zu ───────────────────────────────
// Wichtigster Fall: der Endpoint hängt an der produktiven Datenbank. Eine
// fehlende Environment Variable darf ihn nicht versehentlich öffnen.
delete process.env.MCP_TOKEN;
let r = await ruf(anfrage(1, 'initialize', {}));
check('Ohne gesetztes Zugangswort: abgewiesen', r.code === 401);

process.env.MCP_TOKEN = 'zu-kurz';
r = await ruf(anfrage(1, 'initialize', {}), { token: 'zu-kurz' });
check('Zu kurzes Zugangswort zählt als nicht gesetzt', r.code === 401);

process.env.MCP_TOKEN = TOKEN;
r = await ruf(anfrage(1, 'initialize', {}), { token: 'falsch-aber-genauso-lang-1234567890abcdefghi' });
check('Falsches Zugangswort: abgewiesen', r.code === 401);
r = await ruf(anfrage(1, 'initialize', {}), { token: null });
check('Gar kein Zugangswort: abgewiesen', r.code === 401);
check('Abweisung nennt das erwartete Verfahren', (r.kopf['www-authenticate'] || '').includes('Bearer'));

// ── 2. Handschlag ─────────────────────────────────────────────────────────
r = await ruf(anfrage(1, 'initialize', { protocolVersion: '2025-06-18' }));
check('Handschlag gelingt', r.code === 200 && !!r.koerper.result);
check('Protokollfassung wird bestätigt', r.koerper.result.protocolVersion === '2025-06-18');
check('Server nennt sich beim Namen', r.koerper.result.serverInfo.name === 'lightning-crm');
check('Server bietet Werkzeuge an', !!r.koerper.result.capabilities.tools);
check('Anleitung warnt vor dem Schreiben',
      /produktive Datenbank/i.test(r.koerper.result.instructions || ''));

r = await ruf(anfrage(1, 'initialize', { protocolVersion: '1999-01-01' }));
check('Unbekannte Fassung fällt auf die eigene zurück',
      r.koerper.result.protocolVersion === '2025-06-18');

// ── 3. Mitteilungen bekommen keine Antwort ────────────────────────────────
r = await ruf({ jsonrpc: '2.0', method: 'notifications/initialized' });
check('Mitteilung wird angenommen, aber nicht beantwortet',
      r.code === 202 && r.koerper === undefined);

// ── 4. Werkzeugliste ──────────────────────────────────────────────────────
r = await ruf(anfrage(2, 'tools/list'));
const werkzeuge = r.koerper.result.tools;
check('Werkzeuge werden aufgezählt', Array.isArray(werkzeuge) && werkzeuge.length >= 8);
check('Jedes Werkzeug hat Name, Zweck und erwartete Angaben',
      werkzeuge.every(w => w.name && w.description && w.inputSchema &&
                           w.inputSchema.type === 'object'));
check('Beschreibungen sind Sätze, keine Stichworte',
      werkzeuge.every(w => w.description.length > 40));
check('Keine Ausführung wird mitgeliefert', werkzeuge.every(w => w.run === undefined));

const namen = werkzeuge.map(w => w.name);
for (const erwartet of ['leads_suchen', 'lead_anzeigen', 'notiz_anhaengen',
                        'aufgabe_anlegen', 'aufgabe_abhaken', 'stufe_setzen',
                        'anruf_festhalten', 'nachricht_festhalten', 'kennzahlen']) {
  check(`Werkzeug vorhanden: ${erwartet}`, namen.includes(erwartet));
}
check('Namen sind eindeutig', new Set(namen).size === namen.length);

// Pflichtangaben müssen auch in den Eigenschaften stehen, sonst kann das
// Sprachmodell den Aufruf nicht bilden.
check('Pflichtangaben sind beschrieben', werkzeuge.every(w =>
  (w.inputSchema.required || []).every(p => p in (w.inputSchema.properties || {}))));

// ── 5. Fehlerfälle des Protokolls ─────────────────────────────────────────
r = await ruf(anfrage(3, 'gibts/nicht'));
check('Unbekannte Methode wird benannt', r.koerper.error.code === -32601);

r = await ruf(anfrage(4, 'tools/call', { name: 'gibts_nicht', arguments: {} }));
check('Unbekanntes Werkzeug wird benannt', r.koerper.error.code === -32602);

r = await ruf('{kaputt', {});
check('Kaputtes JSON wird gemeldet', r.code === 400 && r.koerper.error.code === -32700);

r = await ruf({ jsonrpc: '1.0', id: 5, method: 'ping' });
check('Falsche JSON-RPC-Fassung wird gemeldet', r.koerper.error.code === -32600);

r = await ruf(anfrage(6, 'ping'));
check('Ping antwortet', r.code === 200 && !!r.koerper.result);

r = await ruf(anfrage(7, 'ping'), { method: 'GET' });
check('GET wird abgelehnt', r.code === 405);
check('Und sagt, was ginge', (r.kopf['allow'] || '').includes('POST'));

// ── 6. Aufgaben-Hilfen ────────────────────────────────────────────────────
const { aufgabenLesen, aufgabenSchreiben, neueAufgabenId } = await import('../api/_lib/crm.js');

check('Leerer Text ergibt keine Aufgaben', aufgabenLesen('').length === 0);
check('Kaputter Text wirft nicht', aufgabenLesen('{kein json').length === 0);
check('Kein Array wirft nicht', aufgabenLesen('{"a":1}').length === 0);
check('Aufgaben werden gelesen',
      aufgabenLesen('[{"id":1,"text":"X","done":false}]')[0].text === 'X');

check('Leere Liste wird als leerer Text gespeichert', aufgabenSchreiben([]) === '');
check('Gefüllte Liste wird zu JSON', aufgabenSchreiben([{ id: 1 }]) === '[{"id":1}]');

const ids = [];
for (let i = 0; i < 5000; i++) ids.push(neueAufgabenId());
check('Aufgaben-Nummern sind eindeutig', new Set(ids).size === ids.length);
check('Und aufsteigend', ids.every((v, i) => i === 0 || v > ids[i - 1]));


// ── 7. Der zweite Schreibweg haelt dieselben Regeln wie leadStore ─────────
// Geprueft gegen eine nachgebaute Datenbank: die Werkzeuge schreiben, aber
// nichts davon geht an die echte.
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
process.env.VITE_SUPABASE_URL = 'https://test.supabase.co';

const bestand = {
  id: 42, name: 'Bäckerei Klein GmbH', phone: '030123', maps_city: 'Berlin',
  stage: 'pitch', status: 'Lead', size: 'Tarifkunde', starred: 1,
  notes: 'Erstkontakt gut gelaufen.', last_edited_ms: 1000, snooze_until_ms: 0,
  last_contact_ms: 900, umsatz: 0, closed_at_ms: null,
  task_text: '[{"id":7,"text":"Angebot schicken","done":false,"subtasks":[]}]',
  crm_calls: [], lead_activities: []
};
const geschrieben = [];

const jsonAntwort = (v) => new Response(JSON.stringify(v), {
  status: 200, headers: { 'content-type': 'application/json' }
});

global.fetch = async (url, opt = {}) => {
  const u = new URL(url);
  const methode = opt.method || 'GET';
  const tabelle = u.pathname.split('/').pop();
  const kopf = opt.headers || {};
  const einzeln = String(kopf.Accept || kopf.accept || '').includes('vnd.pgrst.object');

  if (methode === 'GET' && tabelle === 'crm_leads') {
    const idFilter = u.searchParams.get('id');
    const treffer = (!idFilter || idFilter === 'eq.42') ? [bestand] : [];
    return jsonAntwort(einzeln ? (treffer[0] ?? null) : treffer);
  }
  if (methode === 'PATCH' || methode === 'POST') {
    const daten = JSON.parse(opt.body);
    geschrieben.push({ tabelle, methode, daten });
    if (tabelle === 'crm_leads' && methode === 'PATCH') Object.assign(bestand, daten);
    return jsonAntwort(einzeln ? daten : [daten].flat());
  }
  return jsonAntwort([]);
};

const { NACH_NAME } = await import('../api/_lib/mcp_werkzeuge.js');
const werkzeug = (n, a) => NACH_NAME[n].run(a);
const letzterPatch = () => [...geschrieben].reverse()
  .find(g => g.tabelle === 'crm_leads' && g.methode === 'PATCH');

// Nur genannte Spalten — nie das ganze Lead-Objekt zurueckschieben.
await werkzeug('aufgabe_anlegen', { lead_id: 42, text: 'Termin bestätigen' });
check('Schreibt nur die geaenderte Spalte',
      Object.keys(letzterPatch().daten).sort().join(',') === 'last_edited_ms,task_text');
check('Zeitstempel wird mitgezogen', letzterPatch().daten.last_edited_ms > 1000);

// Notizen werden angehaengt, nicht ersetzt.
await werkzeug('notiz_anhaengen', { lead_id: 42, text: 'Rückruf vereinbart.' });
check('Notiz kommt dazu, statt zu ersetzen',
      bestand.notes.includes('Erstkontakt gut gelaufen.') &&
      bestand.notes.includes('Rückruf vereinbart.'));

// Stufenwechsel wird mit BEIDEN Stufen festgehalten — sonst ist Fortschritt
// nicht von Rueckschritt zu unterscheiden.
geschrieben.length = 0;
await werkzeug('stufe_setzen', { lead_id: 42, stufe: 'offer' });
const wechsel = geschrieben.find(g => g.tabelle === 'lead_activities');
check('Stufenwechsel wird festgehalten', !!wechsel && wechsel.daten.type === 'status_change');
check('Mit alter und neuer Stufe',
      wechsel.daten.from_stage === 'pitch' && wechsel.daten.to_stage === 'offer');

// Abschluss bekommt EINMAL ein Datum und behaelt es.
await werkzeug('stufe_setzen', { lead_id: 42, stufe: 'closed' });
const erstesAbschlussdatum = bestand.closed_at_ms;
check('Abschluss wird datiert', typeof erstesAbschlussdatum === 'number' && erstesAbschlussdatum > 0);
await werkzeug('stufe_setzen', { lead_id: 42, stufe: 'offer' });
await werkzeug('stufe_setzen', { lead_id: 42, stufe: 'closed' });
check('Und behaelt sein Datum', bestand.closed_at_ms === erstesAbschlussdatum);

// Beim Abschluss wird nach dem Wert gefragt — nicht erzwungen, aber gesagt.
// Stand 12.09.2026 hatten 55 von 55 Abschluessen keinen Wert, weil niemand fragt.
await werkzeug('stufe_setzen', { lead_id: 42, stufe: 'offer' });
bestand.provi_umsatz = null;
const ohneWert = await werkzeug('stufe_setzen', { lead_id: 42, stufe: 'closed' });
check('Abschluss ohne Wert wird trotzdem gesetzt', ohneWert.jetzt === 'closed');
check('Aber die Antwort weist darauf hin', /ohne Wert/i.test(ohneWert.hinweis || ''));

await werkzeug('stufe_setzen', { lead_id: 42, stufe: 'offer' });
const mitWert = await werkzeug('stufe_setzen',
  { lead_id: 42, stufe: 'closed', wert: 847.5, datum: '2026-09-11' });
check('Mitgegebener Wert wird geschrieben', bestand.provi_umsatz === 847.5);
check('Mitgegebenes Datum wird uebernommen',
      new Date(bestand.closed_at_ms).toLocaleDateString('sv-SE') === '2026-09-11');
check('Mit Wert kein Hinweis mehr', !mitWert.hinweis);

// 0 Euro ist eine Aussage, kein fehlender Wert.
await werkzeug('stufe_setzen', { lead_id: 42, stufe: 'offer' });
bestand.provi_umsatz = null;
const nullEuro = await werkzeug('stufe_setzen', { lead_id: 42, stufe: 'closed', wert: 0 });
check('0 Euro gilt als eingetragener Wert', bestand.provi_umsatz === 0 && !nullEuro.hinweis);

// Wert und Datum nur beim Abschluss — bei anderen Stufen ergeben sie keinen Sinn.
geschrieben.length = 0;
await werkzeug('stufe_setzen', { lead_id: 42, stufe: 'pitch', wert: 99 });
check('Wert wird ausserhalb des Abschlusses ignoriert',
      !geschrieben.some(g => g.tabelle === 'crm_leads' && 'provi_umsatz' in (g.daten || {})));

// Zustand fuer die naechste Pruefung wiederherstellen: sie erwartet 'closed'.
await werkzeug('stufe_setzen', { lead_id: 42, stufe: 'closed' });

// Gleiche Stufe noch einmal setzen schreibt nichts.
geschrieben.length = 0;
const nochmal = await werkzeug('stufe_setzen', { lead_id: 42, stufe: 'closed' });
check('Gleiche Stufe schreibt nicht', geschrieben.length === 0 && !!nochmal.hinweis);

// Fremdaenderung wird erkannt, statt sie zu ueberschreiben.
const { leadSchreiben } = await import('../api/_lib/crm.js');
let konflikt = null;
try { await leadSchreiben(42, { notes: 'X' }, { erwarteterStand: 1 }); }
catch (e) { konflikt = e; }
check('Veralteter Stand wird abgelehnt', konflikt && konflikt.status === 409);
check('Und sagt auch, warum', /Zwischenzeit/i.test(konflikt?.message || ''));

// Spalten, die von aussen niemand setzen koennen soll.
let gesperrt = null;
try { await leadSchreiben(42, { claimed_by: 'irgendwer', created_at_ms: 1 }); }
catch (e) { gesperrt = e; }
check('Nicht freigegebene Spalten werden abgewiesen', !!gesperrt);

// Fehlerfaelle sprechen Klartext.
const fehlerText = async (n, a) => { try { await werkzeug(n, a); return null; } catch (e) { return e; } };
check('Unbekannter Lead: 404',        (await fehlerText('lead_anzeigen', { lead_id: 999 }))?.status === 404);
check('Unbekannte Aufgabe: 404',      (await fehlerText('aufgabe_abhaken', { lead_id: 42, aufgabe_id: 1 }))?.status === 404);
check('Falsches Datumsformat: Hinweis',
      /JJJJ-MM-TT/.test((await fehlerText('aufgabe_anlegen', { lead_id: 42, text: 'X', faellig: '20.09.2026' }))?.message || ''));


console.log('\n✅ BESTANDEN (' + ok.length + ')');
ok.forEach(t => console.log('   ' + t));
if (fail.length) {
  console.log('\n❌ FEHLGESCHLAGEN (' + fail.length + ')');
  fail.forEach(t => console.log('   ' + t));
  process.exit(1);
}
console.log('\nAlle Prüfungen bestanden.');
