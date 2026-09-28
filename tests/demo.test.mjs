/**
 * Demo-Modus — prüft das Versprechen aus core/demo.js:
 *   keine Anfrage an die echte Datenbank, nichts gespeichert, keine echten
 *   Firmen, Nummern oder Adressen auf dem Bildschirm.
 *
 * Die echte Datenschicht wird dabei nicht geladen. Statt ihrer steht ein
 * window.api, dessen Funktionen laut werden, sobald jemand sie aufruft —
 * jeder Aufruf dort wäre im Ernstfall ein Zugriff auf Kundendaten.
 */
import fs from 'fs';
import { JSDOM } from 'jsdom';
import { demoGewuenscht, installiereDemo } from '../core/demo.js';
import { erzeugeDemoDaten, scoutTreffer, impressumSeite, tagKey } from '../core/demo-daten.js';

const ok = [];
const fail = [];
const check = (name, cond) => (cond ? ok : fail).push(name);

// Die echte Aufbereitung der Zeilen aus core/db.js — ohne Supabase.
const dbQuelle = fs.readFileSync('core/db.js', 'utf8');
const von = dbQuelle.indexOf('function normalizeCallEntry(');
const bis = dbQuelle.indexOf('// PUBLIC API');
if (von === -1 || bis === -1) throw new Error('Testaufbau: Marken in core/db.js nicht gefunden');
const { postProcessAndSort, normalizeRow } = new Function(
  dbQuelle.slice(von, bis).replace(/export function/g, 'function')
  + '; return { postProcessAndSort, normalizeRow };')();

// ── 1. Einschalten nur mit ?demo ─────────────────────────────────────────────
check('?demo schaltet ein', demoGewuenscht({ search: '?demo' }));
check('?demo=1 schaltet ein', demoGewuenscht({ search: '?demo=1' }));
check('Ohne Zusatz bleibt alles echt', !demoGewuenscht({ search: '' }));
check('Andere Zusätze bleiben echt', !demoGewuenscht({ search: '?x=demo' }));

const apiQuelle = fs.readFileSync('core/api.js', 'utf8');
check('api.js baut die Demo nur unter demoGewuenscht() ein',
  /if \(typeof window !== 'undefined' && demoGewuenscht\(window\.location\)\) \{\s*installiereDemo\(/.test(apiQuelle));
const demoQuelle = fs.readFileSync('core/demo.js', 'utf8');
check('demo.js lädt die Datenbank-Schicht nicht selbst',
  !/from '\.\/db\.js'|from '\.\/api\.js'|supabase/i.test(demoQuelle.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')));

// ── 2. Aufbau: ein window.api, das bei jedem echten Aufruf Alarm schlägt ─────
const dom = new JSDOM('<!doctype html><title>Lightning CRM</title><body></body>', { url: 'https://crm.test/?demo' });
const win = dom.window;
const echteAufrufe = [];
const namen = apiQuelle.match(/^  [a-zA-Z]+:/gm).map(z => z.trim().slice(0, -1));
const api = {};
for (const n of namen) api[n] = (...args) => { echteAufrufe.push(n); return Promise.resolve(null); };
api.getStage = (l) => (l.stage || 'cold').toUpperCase();        // rein, bleibt erhalten
api.sortLeads = (liste) => liste;
api.copyText = async () => true;
api.updateTray = () => {};
const fetchNachDraussen = [];
win.fetch = async (u) => { fetchNachDraussen.push(String(u)); return new Response('{}'); };

const JETZT = new Date(2026, 8, 28, 10, 30).getTime();           // Montag, 10:30
const { daten } = installiereDemo(win, api, { postProcessAndSort, normalizeRow }, JETZT);
check('Jede Funktion ist ersetzt', namen.every(n =>
  ['getStage', 'sortLeads', 'copyText', 'updateTray'].includes(n) || !String(api[n]).includes('echteAufrufe')));
check('Seitentitel sagt Demo', win.document.title.startsWith('Demo · '));
check('Demo-Kennzeichen am Fenster', win.demoModus === true);
const standort = await new Promise(r => win.navigator.geolocation
  ? win.navigator.geolocation.getCurrentPosition(p => r(p), () => r(null)) : r('ohne'));
check('Standort-Pfeil zeigt nie den echten Aufenthaltsort',
  standort === 'ohne' || (standort && Math.abs(standort.coords.latitude - 51.0504) < 0.001));

// ── 3. Der Bestand ───────────────────────────────────────────────────────────
const warteschlange = await api.getLeads({ tab: 'queue' });
check('Warteschlange hat Leads', warteschlange.length >= 10);
check('Warteschlange nur Leads, keine Kunden', warteschlange.every(l => l.status === 'Lead'));
const kunden = await api.getLeads({ tab: 'customers' });
check('Kunden-Reiter nur Kunden', kunden.length >= 2 && kunden.every(l => l.status === 'Kunde'));
const ausgeschlossen = await api.getLeads({ tab: 'excluded' });
check('Ausgeschlossene getrennt', ausgeschlossen.length === 1 && ausgeschlossen[0].status === 'Uninteressant');
check('Suche findet', (await api.getLeads({ search: 'bäckerei' })).length === 1);
check('Leads kommen aufbereitet (call_status, call_history)',
  warteschlange.every(l => ['never', 'called'].includes(l.call_status) && Array.isArray(l.call_history)));
check('Liste trägt höchstens drei Anrufe je Lead', warteschlange.every(l => l.call_history.length <= 3));

// ── 4. Keine echten Daten auf dem Bildschirm ────────────────────────────────
const alle = daten.leads;
const hostVon = (u) => { try { return new URL(u).hostname; } catch (e) { return ''; } };
check('Alle Webseiten enden auf .example', alle.every(l => !l.website_url || hostVon(l.website_url).endsWith('.example')));
check('Alle E-Mails enden auf .example', alle.every(l => !l.email || /@[a-z0-9.-]+\.example$/.test(l.email)));
check('Keine Nummer kann es geben (nach der Vorwahl eine 0)',
  alle.every(l => /^0\d{2,4} 0\d{2} \d{4}$/.test(l.phone)));
check('Kein Google-Link', alle.every(l => !l.google_maps_url));
const scout = scoutTreffer('Bäckerei in Leipzig', 20);
check('Scout: 20 Treffer', scout.length === 20);
check('Scout: Name aus dem Suchbegriff', scout.every(p => p.displayName.text.startsWith('Bäckerei ')));
check('Scout: nur .example und erfundene Nummern', scout.every(p =>
  hostVon(p.websiteUri).endsWith('.example') && /^0\d{2,4} 0\d{2} \d{4}$/.test(p.nationalPhoneNumber)));
check('Scout: gleiche Suche, gleiche Treffer', JSON.stringify(scout) === JSON.stringify(scoutTreffer('Bäckerei in Leipzig', 20)));
check('Gleicher Startwert, gleicher Bestand',
  JSON.stringify(erzeugeDemoDaten(JETZT).leads) === JSON.stringify(erzeugeDemoDaten(JETZT).leads));

// ── 5. Arbeiten in der Demo verändert nur den Speicher ──────────────────────
const baecker = alle.find(l => l.name.includes('Sonnenkorn'));
await api.saveLead({ id: baecker.id, stage: 'data', notes: 'Neu' });
const nachher = await api.getLead(baecker.id);
check('Speichern ändert den Lead', nachher.stage === 'data' && nachher.notes === 'Neu');
const verlauf = (await api.getLeadHistory(baecker.id)).timeline;
check('Stufenwechsel steht im Verlauf', verlauf.some(a => a.activity_type === 'status_change' && a.to_stage === 'data'));

const heute = tagKey(Date.now());
const anrufeVorher = await api.getCallsToday();
const ergebnis = await api.logCall(baecker.id);
check('Anruf bekommt eine Nummer', ergebnis && ergebnis.callId > 0);
check('Anruf zählt im Command Center mit', (await api.getCallsToday()) === anrufeVorher + 1);
check('Tageswert heute steigt', (await api.getDailyMetrics(heute, heute))
  .some(z => z.metric_key === 'sales.calls_count' && z.wert === anrufeVorher + 1));
check('Anruf einordnen geht', await api.setCallDetails(ergebnis.callId, { outcome: 'reached', notes: 'Termin Do' }));
check('Unsinnige Einordnung wird abgelehnt', !(await api.setCallDetails(ergebnis.callId, { outcome: 'vielleicht' })));

const neu = await api.saveLead({ name: 'Testfirma Demo' });
check('Neuer Lead bekommt eine Nummer', neu.inserted && (await api.getLead(neu.id)).name === 'Testfirma Demo');
check('Löschen entfernt nur im Speicher', (await api.deleteLead(neu.id)).deleted === 1 && !(await api.getLead(neu.id)));

// ── 6. Kennzahlen ohne Lücken ───────────────────────────────────────────────
const bestand = await api.getStockMetrics();
const erwartet = ['sales.pipeline_count', 'sales.pipeline_value_eur', 'sales.cold_stock', 'sales.cold_never_called',
  'sales.overdue_followups', 'sales.closed_without_value_total', 'sales.closed_without_date_total'];
check('Alle Bestandszahlen da und endlich (kein NaN)', erwartet.every(k =>
  bestand.some(z => z.metric_key === k && Number.isFinite(Number(z.wert)))));
check('Ein Rückruf ist fällig (Glocke hat etwas zu zeigen)', (await api.getFaelligeRueckrufe()).length >= 1);
check('Ziele vorhanden', (await api.getMetricTargets()).some(z => z.metric_key === 'sales.calls_count'));
check('Block hat ein Startdatum', typeof (await api.getSettings())['block.start_date'] === 'string');

// ── 7. Nichts nach draußen ──────────────────────────────────────────────────
const g = await win.fetch('https://places.googleapis.com/v1/places:searchText',
  { method: 'POST', body: JSON.stringify({ textQuery: 'Friseur in Leipzig' }) });
const gJson = await g.json();
check('Google-Suche wird von der Demo beantwortet', gJson.places.length === 20 && gJson.places[0].displayName.text.startsWith('Friseur'));
const n = await (await win.fetch('https://nominatim.openstreetmap.org/search?q=Friseur%2C%20Leipzig&format=json')).json();
check('Nominatim wird von der Demo beantwortet', Array.isArray(n) && n.length > 0);
const eigene = await (await win.fetch('/api/rueckrufe', { method: 'POST' })).json();
check('Eigene Serverfunktionen werden nicht gerufen', eigene.demo === true);
check('Kein Aufruf ging nach draußen', fetchNachDraussen.length === 0);

const seite = await api.fetchApi('https://baeckerei-sonnenkorn.example/');
check('Erfundene Webseite hat ein Impressum', seite.ok && /Impressum/.test(seite.data) && /info@baeckerei-sonnenkorn\.example/.test(seite.data));
check('Echte Webseiten werden nicht abgerufen', (await api.fetchApi('https://www.google.de/')).ok === false);
check('Impressum nur für .example', impressumSeite('https://firma.de/') === null);

// Das Nachtragen versteht die erfundene Seite genauso wie eine echte
const kQuelle = fs.readFileSync('public/modules/kontaktdaten.js', 'utf8');
const mod = { exports: {} };
new Function('module', 'window', kQuelle)(mod, undefined);
const kontakt = await mod.exports.holeKontaktdaten('https://baeckerei-sonnenkorn.example/',
  async (url) => { const r = await api.fetchApi(url); return { ok: r.ok, status: r.status, text: r.data }; }, {});
check('Nachtragen findet E-Mail auf der Demo-Seite', kontakt.email === 'info@baeckerei-sonnenkorn.example');
check('Nachtragen findet Telefon auf der Demo-Seite', !!kontakt.telefon);

// ── 8. Das Wichtigste zuletzt ───────────────────────────────────────────────
// Jede Funktion einmal aufrufen — auch die, die im Alltag selten laufen.
for (const name of namen) {
  if (['logout', 'openExternal'].includes(name)) continue;
  try { await api[name](baecker.id, {}, {}); } catch (e) { /* Einladungen werfen absichtlich */ }
}
check('Keine einzige echte Funktion wurde aufgerufen', echteAufrufe.length === 0);
if (echteAufrufe.length) console.log('  echt aufgerufen:', [...new Set(echteAufrufe)].join(', '));

console.log(`Demo-Modus: ${ok.length} ok, ${fail.length} fehlgeschlagen`);
if (fail.length) {
  fail.forEach(f => console.log('  ✗', f));
  process.exit(1);
}
