import { JSDOM } from 'jsdom';
import fs from 'fs';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { runScripts: 'outside-only' });
const w = dom.window;
w.escapeHtml = (u) => String(u ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
w.showToast = () => {};
w.api = { saveLead: async () => ({}), getStage: (l) => (l.stage || 'cold').toUpperCase() };
w.store = { state: { leads: [], tabCache: {}, currentSelectedLeadId: null } };
w.loadUi = () => {};
w.requestAnimationFrame = (fn) => fn();
w.setTimeout = (fn) => 0;   // Animationen im Test nicht ausfuehren

// core/leadstore.js zuerst — dort liegen queueSave und der Schreibweg
dom.window.eval(fs.readFileSync('public/core/leadstore.js', 'utf8'));

const code = fs.readFileSync('public/ui/main_ui.js', 'utf8');
dom.window.eval(code);

// _autoSaveNow / _triggerAutoSave liegen in pipeline_ui.js — nur diesen Teil laden
const pipeSrc = fs.readFileSync('public/ui/pipeline_ui.js', 'utf8');
const autoSaveBlock = pipeSrc.slice(pipeSrc.indexOf('window.patchLeadCard = (leadId) => {'));
dom.window.eval(autoSaveBlock.slice(0, autoSaveBlock.indexOf('window._debouncedSave();') + 30));

// Abschnitt 4 ersetzt persistTasks durch einen Zaehler — Original merken
const echtPersistTasks = w.persistTasks;

const ok = [];
const fail = [];
const check = (name, cond) => (cond ? ok : fail).push(name);

// ── 1. Eindeutige Aufgaben-IDs, auch bei Massenanlage ──────────────────────
const ids = []; for (let i = 0; i < 20000; i++) ids.push(w.newTaskId());
check('IDs eindeutig (20.000 Stueck)', new Set(ids).size === ids.length);
check('IDs aufsteigend', ids.every((v, i) => i === 0 || v > ids[i-1]));

// ── 2. Pipeline-Stufen sind deterministisch ────────────────────────────────
const mk = (id, val) => { const e = w.document.createElement('input'); e.id = id; e.value = val; w.document.body.appendChild(e); return e; };
mk('sys-stage', 'cold'); mk('sys-k', '0');
const stageOf = () => w.document.getElementById('sys-stage').value;
const kundeOf = () => w.document.getElementById('sys-k').value;

const seq = ['pitch','pitch','data','data','offer','offer','closed','closed','pitch','cold','cold'];
const erwartet = ['pitch','pitch','data','data','offer','offer','closed','closed','pitch','cold','cold'];
const got = [];
for (const st of seq) { await w.setPipeline(st); got.push(stageOf()); }
check('Stufe folgt immer dem Klick', JSON.stringify(got) === JSON.stringify(erwartet));

await w.setPipeline('closed');
check('CLOSED setzt Kunde=1', kundeOf() === '1' || kundeOf() === 1);
await w.setPipeline('offer');
check('Zurueck von CLOSED setzt Kunde=0', String(kundeOf()) === '0');

// ── 3. Aufgabenliste: erledigte bleiben, keine Mail-Sonderrolle ────────────
const list = w.document.createElement('div'); list.id = 'tasks-list'; w.document.body.appendChild(list);
w.currentTasksLeadId = null;
w.currentTasks = [
  { id: 1, text: 'Rechnung mailen',  done: false, deadline: '', subtasks: [] },
  { id: 2, text: 'Angebot schicken', done: true,  deadline: '', subtasks: [] },
  { id: 3, text: 'Rueckruf Mailand', done: false, deadline: '', subtasks: [] }
];
w.renderTasksList();
const txt = list.textContent;
check('Erledigte werden angezeigt', txt.includes('Erledigt (1)'));
check('Keine Mail-Sonderkategorie', !txt.includes('E-Mail & Kommunikation'));
check('Alle drei Aufgaben sichtbar', ['Rechnung mailen','Angebot schicken','Rueckruf Mailand'].every(t => txt.includes(t)));
check('Offene stehen vor Erledigten', txt.indexOf('Rechnung mailen') < txt.indexOf('Erledigt (1)'));

// ── 4. Loeschen wirkt und speichert ────────────────────────────────────────
let persisted = 0;
w.persistTasks = async () => { persisted++; return true; };
w.deleteTask(1);
check('Loeschen entfernt die Aufgabe', w.currentTasks.length === 2 && !w.currentTasks.find(t => t.id === 1));
check('Loeschen loest Speichern aus', persisted === 1);

w.toggleTask(3, true);
check('Abhaken bleibt in der Liste', w.currentTasks.find(t => t.id === 3)?.done === true);
check('Abhaken loest Speichern aus', persisted === 2);

// ── 5. Entfernte Altlasten ────────────────────────────────────────────────
check('markNotAnswered ist weg', typeof w.markNotAnswered === 'undefined');
check('quickAdd ist weg', typeof w.quickAdd === 'undefined');
check('sessionDoneTasks wird nicht mehr benutzt', !code.includes('sessionDoneTasks'));


// ── 6. Snooze wird sofort gespeichert ──────────────────────────────────────
const saved = [];
w.api.saveLead = async (payload) => { saved.push(payload); return { id: payload.id }; };
w.store.state.currentSelectedLeadId = 42;
w.store.state.leads = [{ id: 42, snooze_until_ms: 0, last_edited_ms: 111 }];
w.store.state.currentSnoozeOffset = 0;
w.store.state.currentSnoozeTargetMs = 0;
w.store.state.clearSnooze = false;

const vorher = Date.now();
await w.selectSnooze(24);
const snoozeCall = saved.find(p => 'snooze_until_ms' in p);
check('Snooze schreibt in die Datenbank', !!snoozeCall);
check('Snooze schreibt den richtigen Lead', snoozeCall && snoozeCall.id === 42);
check('Snooze liegt ~24h in der Zukunft',
  !!snoozeCall && Math.abs(snoozeCall.snooze_until_ms - (vorher + 24*3600*1000)) < 5000);
check('Snooze landet im Store', w.store.state.leads[0].snooze_until_ms === snoozeCall.snooze_until_ms);
check('Keine Restwerte im Store', w.store.state.currentSnoozeOffset === 0 && w.store.state.currentSnoozeTargetMs === 0);

saved.length = 0;
await w.cancelSnooze();
const cancelCall = saved.find(p => 'snooze_until_ms' in p);
check('Snooze aufheben schreibt 0', !!cancelCall && cancelCall.snooze_until_ms === 0);
check('Aufheben landet im Store', w.store.state.leads[0].snooze_until_ms === 0);

// Abwaehlen: zweiter Klick auf dieselbe Auswahl hebt die Wiedervorlage auf
w.store.state.leads[0].snooze_until_ms = 0;
w._activeSnoozeChoice = null;

saved.length = 0;
await w.selectSnooze(24);
const gesetzt = saved.find(p => 'snooze_until_ms' in p).snooze_until_ms;
check('Erster Klick setzt die Wiedervorlage', gesetzt > Date.now());
check('Auswahl ist markiert', w._activeSnoozeChoice === 24);

saved.length = 0;
await w.selectSnooze(24);
const abgewaehlt = saved.find(p => 'snooze_until_ms' in p);
check('Zweiter Klick hebt die Wiedervorlage auf', !!abgewaehlt && abgewaehlt.snooze_until_ms === 0);
check('Markierung ist wieder weg', w._activeSnoozeChoice === null);
check('Store ist wieder auf 0', w.store.state.leads[0].snooze_until_ms === 0);

// Andere Auswahl waehrend aktiver Wiedervorlage -> umsetzen, nicht aufheben
saved.length = 0;
await w.selectSnooze(24);
saved.length = 0;
await w.selectSnooze(168);
const umgesetzt = saved.find(p => 'snooze_until_ms' in p);
check('Andere Auswahl setzt um statt aufzuheben', !!umgesetzt && umgesetzt.snooze_until_ms > Date.now());
check('Neue Auswahl ist markiert', w._activeSnoozeChoice === 168);

// saveLeadMain darf die Wiedervorlage nicht erneut verschieben
check('Kein Rest in currentSnoozeOffset', w.store.state.currentSnoozeOffset === 0);
check('Kein Rest in currentSnoozeTargetMs', w.store.state.currentSnoozeTargetMs === 0);
check('Kein Rest in clearSnooze', w.store.state.clearSnooze === false);

// ── 7. Sofort-Speichern beim Verlassen eines Feldes ────────────────────────
check('_autoSaveNow existiert', typeof w._autoSaveNow === 'function');
check('debounce laesst sich abbrechen', typeof w.debounce(() => {}, 10).cancel === 'function');


// ── 8. Speichern zeichnet nur die betroffene Karte neu ─────────────────────
w.store.state.leads = [
  { id: 7, name: 'Alpha', snooze_until_ms: 0, last_edited_ms: 1 },
  { id: 8, name: 'Beta',  snooze_until_ms: 0, last_edited_ms: 1 }
];
let renderAufrufe = 0;
w._renderLeadCard = (l) => { renderAufrufe++; return `<div class="lead-card" id="lead-card-${l.id}">${l.name}</div>`; };

const liste = w.document.createElement('div');
liste.innerHTML = '<div class="lead-card" id="lead-card-7">Alpha</div><div class="lead-card" id="lead-card-8">Beta</div>';
w.document.body.appendChild(liste);
const knotenVorher = w.document.getElementById('lead-card-8');

w.store.state.leads[0].name = 'Alpha NEU';
const getauscht = w.patchLeadCard(7);
check('Karte wird getauscht', getauscht === true);
check('Nur eine Karte neu gezeichnet', renderAufrufe === 1);
check('Inhalt ist aktuell', w.document.getElementById('lead-card-7').textContent === 'Alpha NEU');
check('Nachbarkarte bleibt derselbe Knoten', w.document.getElementById('lead-card-8') === knotenVorher);

check('Unbekannte Karte meldet false', w.patchLeadCard(999) === false);

let vollNeu = 0;
w.loadUi = () => { vollNeu++; };
w.refreshLeadCard(7);
check('Vorhandene Karte loest kein Neuzeichnen aus', vollNeu === 0);
w.refreshLeadCard(999);
check('Fehlende Karte faellt auf Neuzeichnen zurueck', vollNeu === 1);


// ── 9. Gleichzeitige Speichervorgänge überlappen nicht ─────────────────────
// Ohne Warteschlange wuerde der kuerzere Vorgang den laengeren ueberholen —
// genau daraus entstand der falsche "Konflikt"-Hinweis beim Snooze-Klick.
const tick = (n) => { let p = Promise.resolve(); for (let i = 0; i < n; i++) p = p.then(() => {}); return p; };
const ablauf = [];
const job = (name, ticks) => () => tick(ticks).then(() => { ablauf.push(name); return name; });

const p1 = w.queueSave(job('A', 8));   // startet zuerst, dauert laenger
const p2 = w.queueSave(job('B', 1));   // startet danach, waere schneller fertig
await Promise.all([p1, p2]);
check('Speichervorgaenge laufen nacheinander', ablauf.join(',') === 'A,B');

// Ein Fehler darf die Kette nicht abreissen lassen
let danachGelaufen = false;
const kaputt = w.queueSave(async () => { throw new Error('absichtlich'); });
await kaputt.then(() => {}, () => {});
await w.queueSave(async () => { danachGelaufen = true; });
check('Fehler bricht die Warteschlange nicht ab', danachGelaufen === true);

// Der Aufrufer bekommt den Fehler trotzdem zu sehen
let fehlerGesehen = false;
await w.queueSave(async () => { throw new Error('sichtbar'); }).catch(() => { fehlerGesehen = true; });
check('Fehler erreicht den Aufrufer', fehlerGesehen === true);


// ── 10. Aufgaben gehoeren zu GENAU einem Lead ─────────────────────────────
// Der Fehler: zwischen "anderer Lead ausgewaehlt" und "seine Aufgaben geladen"
// liegt ein Netzwerkaufruf. Ein Auto-Save in diesem Moment hat die Aufgaben des
// vorherigen Leads auf den neuen geschrieben — dessen eigene waren weg.
w.document.body.innerHTML = '';
const feld = (id, val, tag = 'input') => {
  const e = w.document.createElement(tag);
  e.id = id;
  if (tag === 'input') { e.type = 'hidden'; e.value = val; } else { e.textContent = val; }
  w.document.body.appendChild(e);
  return e;
};

const formular = w.document.createElement('div');
formular.className = 'focused-lead';
formular.setAttribute('data-lead-id', '100');
w.document.body.appendChild(formular);

feld('sys-name', 'Lead Hundert', 'div');
feld('sys-phone', '0301');
feld('sys-web', '');
feld('sys-email', '');
feld('sys-stage', 'cold');
feld('sys-k', '0');
feld('sys-city', '');
feld('sys-placeid', '');
const tasksDiv = w.document.createElement('div'); tasksDiv.id = 'tasks-list';
w.document.body.appendChild(tasksDiv);

const geschrieben = [];
w.api.saveLead = async (payload) => { geschrieben.push(payload); return { id: payload.id, last_edited_ms: Date.now() }; };
w.store.state.leads = [
  { id: 100, name: 'Lead Hundert', phone: '0301', task_text: '[{"id":1,"text":"Alt-Aufgabe","done":false,"subtasks":[]}]', last_edited_ms: 500 },
  { id: 200, name: 'Lead Zweihundert', phone: '0302', task_text: '[{"id":2,"text":"Eigene Aufgabe","done":false,"subtasks":[]}]', last_edited_ms: 500 }
];
w.store.state.tabCache = {};
w.currentTasksLeadId = null;
w.currentTasks = [];
w.persistTasks = echtPersistTasks;   // Zaehler aus Abschnitt 4 wieder ablegen

// Lead 100 oeffnen: Aufgaben binden
w.bindTasksToLead(w.store.state.leads[0]);
check('Aufgaben werden beim Oeffnen gebunden', w.currentTasksLeadId === 100 && w.currentTasks.length === 1);

// Jetzt der kritische Moment: Auswahl steht schon auf 200, Formular zeigt 100.
w.store.state.currentSelectedLeadId = 200;
geschrieben.length = 0;
const ergebnis = await w.saveLeadMain(200, true, true);
check('Speichern fuer den falschen Lead wird abgelehnt', ergebnis === false);
check('Dabei wird nichts geschrieben', geschrieben.length === 0);

// Sauberer Wechsel: Formular und Bindung ziehen mit
formular.setAttribute('data-lead-id', '200');
w.document.getElementById('sys-name').textContent = 'Lead Zweihundert';
w.document.getElementById('sys-phone').value = '0302';
w.bindTasksToLead(w.store.state.leads[1]);
check('Aufgaben wechseln mit dem Lead', w.currentTasksLeadId === 200 && w.currentTasks[0].text === 'Eigene Aufgabe');

geschrieben.length = 0;
w.currentTasks.push({ id: 3, text: 'Neue Aufgabe', done: false, deadline: '', subtasks: [] });
await w.persistTasks();
const tCall = geschrieben.find(x => 'task_text' in x);
check('Aufgabe wird gespeichert', !!tCall && tCall.id === 200);
check('Beide Aufgaben gehen mit', !!tCall && tCall.task_text.includes('Eigene Aufgabe') && tCall.task_text.includes('Neue Aufgabe'));
check('Aufgaben landen im Store', w.store.state.leads[1].task_text.includes('Neue Aufgabe'));
check('Lead 100 bleibt unberuehrt', w.store.state.leads[0].task_text.includes('Alt-Aufgabe') && !w.store.state.leads[0].task_text.includes('Neue Aufgabe'));

// Ohne Bindung darf gar nichts geschrieben werden
w.bindTasksToLead(null);
geschrieben.length = 0;
await w.persistTasks();
check('Ohne Bindung wird nicht gespeichert', geschrieben.length === 0);

// ── 11. Zeitstempel wird nachgezogen — kein falscher Konflikt ─────────────
// Der Fehler: nach dem ersten Speichern blieb der Zeitstempel im Speicher alt.
// Beim zweiten Mal meldete die Datenbank einen Konflikt, obwohl niemand sonst
// etwas geaendert hatte. Erst ein Neuladen der Seite half.
w.store.state.leads = [{ id: 300, name: 'Konflikt', task_text: '', last_edited_ms: 1000 }];
w.store.state.tabCache = { queue_all_all_: [{ id: 300, name: 'Konflikt', task_text: '', last_edited_ms: 1000 }] };
let dbStand = 1000;
const versuche = [];
w.api.saveLead = async (payload) => {
  versuche.push(payload.last_edited_ms);
  if (payload.last_edited_ms !== undefined && payload.last_edited_ms < dbStand) {
    throw new Error('Konflikt: Dieser Lead wurde in der Zwischenzeit geändert.');
  }
  dbStand += 1000;
  return { id: payload.id, last_edited_ms: dbStand };
};

w.bindTasksToLead(w.store.state.leads[0]);
w.currentTasks = [{ id: 9, text: 'Erste', done: false, deadline: '', subtasks: [] }];
const s1 = await w.persistTasks();
check('Erstes Speichern klappt', s1 === true);
check('Zeitstempel im Store nachgezogen', w.store.state.leads[0].last_edited_ms === 2000);
check('Zeitstempel auch im Reiter-Zwischenspeicher', w.store.state.tabCache.queue_all_all_[0].last_edited_ms === 2000);

w.currentTasks.push({ id: 10, text: 'Zweite', done: false, deadline: '', subtasks: [] });
const s2 = await w.persistTasks();
check('Zweites Speichern klappt ohne Neuladen', s2 === true);
check('Beide Aufgaben in der Datenbank', w.store.state.leads[0].task_text.includes('Zweite'));

// Wird der Zeitstempel doch einmal veraltet (z. B. Fremdaenderung an
// last_contact_ms), holt der Schreibweg den echten Stand und wiederholt.
dbStand = 99999;
w.api.getLead = async (id) => ({ id, last_edited_ms: dbStand });
versuche.length = 0;
w.currentTasks.push({ id: 11, text: 'Dritte', done: false, deadline: '', subtasks: [] });
const s3 = await w.persistTasks();
check('Veralteter Zeitstempel wird selbst geheilt', s3 === true);
check('Genau ein Wiederholungsversuch', versuche.length === 2);
check('Dritte Aufgabe ist gespeichert', w.store.state.leads[0].task_text.includes('Dritte'));

// ── 12. saveLeadMain schreibt nur geaenderte Spalten ──────────────────────
w.document.body.innerHTML = '';
const f2 = w.document.createElement('div');
f2.className = 'focused-lead';
f2.setAttribute('data-lead-id', '400');
w.document.body.appendChild(f2);
feld('sys-name', 'Firma Vier', 'div');
feld('sys-phone', '040111');
feld('sys-web', 'https://vier.de');
feld('sys-email', 'a@vier.de');
feld('sys-stage', 'cold');
feld('sys-k', '0');
feld('sys-city', 'Hamburg');
feld('sys-placeid', 'PID4');
const note = w.document.createElement('textarea'); note.id = 'note-input'; note.value = 'Notiz';
w.document.body.appendChild(note);
const tl2 = w.document.createElement('div'); tl2.id = 'tasks-list'; w.document.body.appendChild(tl2);

w.store.state.leads = [{
  id: 400, name: 'Firma Vier', phone: '040111', website_url: 'https://vier.de',
  email: 'a@vier.de', notes: 'Notiz', stage: 'cold', maps_city: 'Hamburg',
  google_place_id: 'PID4', task_text: '', status: 'Lead', umsatz: 4711,
  zaehlernummern: 'Z-1', last_edited_ms: 1
}];
w.store.state.tabCache = {};
w.store.state.currentSelectedLeadId = 400;
w.store.state.currentSnoozeOffset = 0;
w.store.state.currentSnoozeTargetMs = 0;
w.store.state.clearSnooze = false;
w.bindTasksToLead(w.store.state.leads[0]);

geschrieben.length = 0;
w.api.saveLead = async (payload) => { geschrieben.push(payload); return { id: payload.id, last_edited_ms: 2 }; };

const unveraendert = await w.saveLeadMain(400, true, true);
check('Ohne Aenderung wird gar nicht geschrieben', unveraendert === true && geschrieben.length === 0);

w.document.getElementById('note-input').value = 'Neue Notiz';
geschrieben.length = 0;
await w.saveLeadMain(400, true, true);
check('Aenderung wird geschrieben', geschrieben.length === 1);
const spalten = Object.keys(geschrieben[0]).filter(k => k !== 'id' && k !== 'last_edited_ms');
check('Nur die geaenderte Spalte geht mit', JSON.stringify(spalten) === '["notes"]');
check('Umsatz wird nicht angefasst', !('umsatz' in geschrieben[0]));
check('Zaehlernummern werden nicht angefasst', !('zaehlernummern' in geschrieben[0]));
check('Notiz landet im Store', w.store.state.leads[0].notes === 'Neue Notiz');

// Angefangene Aufgabe im Eingabefeld wird beim Speichern uebernommen
const eingabe = w.document.createElement('input');
eingabe.id = 'new-task-input-rem';
eingabe.value = 'Vergessene Aufgabe';
w.document.body.appendChild(eingabe);
geschrieben.length = 0;
await w.saveLeadMain(400, true, true);
const taskWrite = geschrieben.find(x => 'task_text' in x);
check('Angefangene Aufgabe geht nicht verloren', !!taskWrite && taskWrite.task_text.includes('Vergessene Aufgabe'));
check('Eingabefeld ist danach leer', eingabe.value === '');

console.log('\n✅ BESTANDEN (' + ok.length + ')');
ok.forEach(t => console.log('   ' + t));
if (fail.length) {
  console.log('\n❌ FEHLGESCHLAGEN (' + fail.length + ')');
  fail.forEach(t => console.log('   ' + t));
  process.exit(1);
}
console.log('\nAlle Prüfungen bestanden.');
