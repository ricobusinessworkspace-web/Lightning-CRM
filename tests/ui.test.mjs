import { JSDOM } from 'jsdom';
import fs from 'fs';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { runScripts: 'outside-only' });
const w = dom.window;
w.escapeHtml = (u) => String(u ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
w.showToast = () => {};
w.verlauf = [];
w.api = {
  saveLead: async () => ({}),
  getStage: (l) => (l.stage || 'cold').toUpperCase(),
  logTaskDone: async (id, text, haupt) => { w.verlauf.push({ id, text, haupt }); return true; }
};
w.store = { state: { leads: [], tabCache: {}, currentSelectedLeadId: null } };
w.loadUi = () => {};
w.requestAnimationFrame = (fn) => fn();
w.setTimeout = (fn) => 0;   // Animationen im Test nicht ausfuehren

// core/leadstore.js zuerst — dort liegen queueSave und der Schreibweg
dom.window.eval(fs.readFileSync('public/core/leadstore.js', 'utf8'));

dom.window.eval(fs.readFileSync('public/modules/betrag.js', 'utf8'));

const code = fs.readFileSync('public/ui/main_ui.js', 'utf8');
const mainQuelleFrueh = code;
dom.window.eval(code);

// Teile von pipeline_ui.js werden ueber Textmarken herausgeschnitten. Wird eine
// Marke umbenannt, muss der Test LAUT scheitern — frueher lieferte indexOf
// stillschweigend -1 und der Test hat danach schlicht nichts mehr geprueft.
const pipeSrc = fs.readFileSync('public/ui/pipeline_ui.js', 'utf8');
const ausschnitt = (von, bis) => {
  const a = pipeSrc.indexOf(von);
  if (a === -1) throw new Error(`Testaufbau: Marke "${von}" steht nicht mehr in pipeline_ui.js`);
  if (!bis) return pipeSrc.slice(a);
  const b = pipeSrc.indexOf(bis, a);
  if (b === -1) throw new Error(`Testaufbau: Marke "${bis}" steht nicht mehr in pipeline_ui.js`);
  return pipeSrc.slice(a, b + bis.length);
};

// _autoSaveNow / _triggerAutoSave liegen in pipeline_ui.js — nur diesen Teil laden
dom.window.eval(ausschnitt('window.patchLeadCard = (leadId) => {', 'window._debouncedSave();\n};'));

// Mehrfachauswahl: toggleBulkMode / handleLeadClick / updateBulkUI
dom.window.eval(ausschnitt('window.toggleBulkMode = () => {', 'window.executeBulkDelete'));

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


// ── 13. Erledigte Aufgaben bleiben als Historie stehen ────────────────────
w.document.body.innerHTML = '';
const liste13 = w.document.createElement('div'); liste13.id = 'tasks-list';
w.document.body.appendChild(liste13);

w.store.state.leads = [{ id: 500, name: 'Historie', task_text: '', last_edited_ms: 1 }];
w.store.state.tabCache = {};
w.api.saveLead = async (p) => ({ id: p.id, last_edited_ms: Date.now() });
w.bindTasksToLead(w.store.state.leads[0]);
w.currentTasks = [
  { id: 1, text: 'Angebot schicken', done: false, deadline: '', subtasks: [{ id: 11, text: 'Preise prüfen', done: false }] },
  { id: 2, text: 'Rückruf', done: false, deadline: '', subtasks: [] }
];
w.verlauf.length = 0;

const vorErledigen = Date.now();
w.toggleTask(1, true);
const t1 = w.currentTasks.find(t => t.id === 1);
check('Erledigte Aufgabe bleibt in der Liste', !!t1 && t1.done === true);
check('Erledigungszeitpunkt wird festgehalten', typeof t1.done_ms === 'number' && t1.done_ms >= vorErledigen);
check('Teilaufgabe wird mit abgehakt', t1.subtasks[0].done === true);
check('Erledigte steht sichtbar in der Detailansicht', liste13.textContent.includes('Erledigt (1)') && liste13.textContent.includes('Angebot schicken'));
check('Offene steht darueber', liste13.textContent.indexOf('Rückruf') < liste13.textContent.indexOf('Erledigt (1)'));
check('Zurueck-Schalter ist da', liste13.innerHTML.includes('toggleTask(1, false)'));
check('Loeschen bleibt moeglich', liste13.innerHTML.includes('deleteTask(1)'));
check('Alle-loeschen-Schalter erscheint', liste13.innerHTML.includes('clearDoneTasks()'));

check('Genau ein Verlaufseintrag trotz Teilaufgabe', w.verlauf.length === 1);
check('Verlaufseintrag nennt die Aufgabe', w.verlauf[0].text === 'Angebot schicken' && w.verlauf[0].id === 500);
check('Verlaufseintrag ohne Hauptaufgabe', !w.verlauf[0].haupt);

// Wieder oeffnen: kein neuer Verlaufseintrag, Zeitpunkt weg
w.verlauf.length = 0;
w.toggleTask(1, false);
check('Wieder oeffnen klappt', w.currentTasks.find(t => t.id === 1).done === false);
check('Zeitpunkt wird zurueckgesetzt', w.currentTasks.find(t => t.id === 1).done_ms === undefined);
check('Wieder oeffnen schreibt nichts in den Verlauf', w.verlauf.length === 0);

// Nur eine Teilaufgabe abhaken -> eigener Eintrag mit Bezug
w.verlauf.length = 0;
w.toggleTask(1, true, 11);
check('Teilaufgabe einzeln abhakbar', w.currentTasks[0].subtasks[0].done === true);
check('Hauptaufgabe bleibt offen', w.currentTasks[0].done === false);
check('Teilaufgabe im Verlauf mit Bezug', w.verlauf.length === 1 && w.verlauf[0].text === 'Preise prüfen' && w.verlauf[0].haupt === 'Angebot schicken');

// Hauptaufgabe abhaken, dann Teilaufgabe wieder oeffnen -> Hauptaufgabe oeffnet mit
w.toggleTask(1, true);
check('Hauptaufgabe erledigt', w.currentTasks[0].done === true);
w.toggleTask(1, false, 11);
check('Offene Teilaufgabe oeffnet die Hauptaufgabe', w.currentTasks[0].done === false);

// Doppelklick auf denselben Zustand erzeugt keinen zweiten Eintrag
w.toggleTask(2, true);
w.verlauf.length = 0;
w.toggleTask(2, true);
check('Kein zweiter Eintrag bei gleichem Zustand', w.verlauf.length === 0);

// ── 14. Erledigungszeitpunkt uebersteht das Neuoeffnen des Leads ──────────
const gespeichert = w.serializeTasks(w.currentTasks);
w.bindTasksToLead({ id: 500, task_text: gespeichert });
const wieder = w.currentTasks.find(t => t.id === 2);
check('Aufgaben kommen zurueck', !!wieder && wieder.done === true);
check('Erledigungszeitpunkt bleibt erhalten', typeof wieder.done_ms === 'number');
check('Teilaufgaben bleiben erhalten', w.currentTasks.find(t => t.id === 1).subtasks.length === 1);

// Altbestand ohne done_ms faellt nicht durch
w.bindTasksToLead({ id: 500, task_text: '[{"id":7,"text":"Alt","done":true,"subtasks":[{"id":8,"text":"Alt-Teil","done":true}]}]' });
check('Altbestand ohne Zeitpunkt bleibt lesbar', w.currentTasks[0].done === true && w.currentTasks[0].done_ms === undefined);
w.renderTasksList();
check('Altbestand wird ohne Datum gezeichnet', liste13.textContent.includes('Alt') && liste13.textContent.includes('Erledigt (1)'));

// ── 15. Alle erledigten auf einmal loeschen ──────────────────────────────
w.bindTasksToLead({ id: 500, task_text: '[{"id":1,"text":"Offen","done":false,"subtasks":[]},{"id":2,"text":"Fertig A","done":true,"done_ms":111,"subtasks":[]},{"id":3,"text":"Fertig B","done":true,"done_ms":222,"subtasks":[]}]' });
w.renderTasksList();
check('Zwei erledigte werden gezeigt', liste13.textContent.includes('Erledigt (2)'));
check('Neueste zuerst', liste13.textContent.indexOf('Fertig B') < liste13.textContent.indexOf('Fertig A'));

let bestaetigt = null;
w.confirmAction = ({ title }) => { bestaetigt = title; return Promise.resolve(true); };
w.clearDoneTasks();
await Promise.resolve();   // confirmAction antwortet ueber ein Promise
check('Nachfrage vor dem Loeschen', (bestaetigt || '').includes('2 erledigte'));
check('Nur die erledigten sind weg', w.currentTasks.length === 1 && w.currentTasks[0].text === 'Offen');

// Abgelehnt heisst: nichts passiert.
w.bindTasksToLead({ id: 500, task_text: '[{"id":1,"text":"Offen","done":false,"subtasks":[]},{"id":2,"text":"Fertig A","done":true,"done_ms":111,"subtasks":[]}]' });
w.confirmAction = () => Promise.resolve(false);
w.clearDoneTasks();
await Promise.resolve();
check('Abbrechen laesst die Aufgaben stehen', w.currentTasks.length === 2);


// ── 16. Autospeichern haelt an jedem Wechsel ─────────────────────────────
// Die Fehler, die das ausloest: Eingabe gemacht -> Lead abgewaehlt oder
// Reiter gewechselt -> Aenderung verworfen. Ursache war, dass switchTab und
// closeLeadSidebar die Auswahl sofort auf null setzen und saveLeadMain sich
// daran orientiert hat. Massgeblich ist jetzt data-lead-id am Formular.
w.document.body.innerHTML = '';
const formularBauen = (leadId, werte = {}) => {
  w.document.body.innerHTML = `
    <div class="focused-lead" data-lead-id="${leadId}">
      <div class="sidebar-header"><div id="sys-name" contenteditable="true">${werte.name || 'Firma'}</div>
        <div id="save-status" class="save-status"></div></div>
      <div class="sidebar-body">
        <input id="sys-phone" value="${werte.phone || '030'}">
        <input id="sys-web" type="hidden" value="">
        <input id="sys-email" value="">
        <input id="sys-stage" type="hidden" value="cold">
        <input id="sys-k" type="hidden" value="0">
        <input id="sys-city" type="hidden" value="">
        <input id="sys-placeid" type="hidden" value="">
        <textarea id="note-input">${werte.notes || ''}</textarea>
        <div id="tasks-list"></div>
        <input id="new-task-input-rem" value="">
      </div>
    </div>`;
};

// Erst abwarten, bis nichts mehr aus den vorigen Abschnitten laeuft — sonst
// landen deren Schreibvorgaenge im Zaehler dieses Abschnitts.
await w.leadStore.ruhe();

const geschrieben16 = [];
w.api.saveLead = async (p) => { geschrieben16.push(p); return { id: p.id, last_edited_ms: Date.now() }; };
w.store.state.leads = [{ id: 600, name: 'Firma', phone: '030', notes: 'alt', task_text: '', stage: 'cold', status: 'Lead', last_edited_ms: 1 }];
w.store.state.tabCache = {};
w.store.state.currentSnoozeOffset = 0; w.store.state.currentSnoozeTargetMs = 0; w.store.state.clearSnooze = false;
formularBauen(600, { notes: 'alt' });
w.bindTasksToLead(w.store.state.leads[0]);

check('Formular kennt seinen Lead', w.getFormLeadId() === 600);

// Der entscheidende Fall: Auswahl ist bereits geleert (wie nach switchTab)
w.store.state.currentSelectedLeadId = null;
w.document.getElementById('note-input').value = 'Neue Notiz vor dem Wechsel';
geschrieben16.length = 0;
const geflusht = await w.flushLeadForm();
check('Speichern klappt auch ohne Auswahl', geflusht === true);
check('Notiz ist wirklich geschrieben', geschrieben16.length === 1 && geschrieben16[0].notes === 'Neue Notiz vor dem Wechsel');
check('Und der richtige Lead', geschrieben16[0].id === 600);

// Ohne Formular passiert nichts, aber es kracht auch nicht
w.document.body.innerHTML = '';
geschrieben16.length = 0;
const leer = await w.flushLeadForm();
check('Ohne Formular kein Fehler', leer === true && geschrieben16.length === 0);

// Formular eines anderen Leads darf nicht auf diesen geschrieben werden
formularBauen(601, { notes: 'gehoert zu 601' });
geschrieben16.length = 0;
const falsch = await w.saveLeadMain(600, true, true);
check('Fremdes Formular wird abgelehnt', falsch === false && geschrieben16.length === 0);

// ── 17. Verzoegertes Speichern wird beim Wechsel abgebrochen ─────────────
formularBauen(600, { notes: 'alt' });
w.bindTasksToLead(w.store.state.leads[0]);
let debounceLief = 0;
w._debouncedSave = Object.assign(() => { debounceLief++; }, { cancel: () => { w._debounceAbgebrochen = true; } });
w._debounceAbgebrochen = false;
await w.flushLeadForm();
check('flushLeadForm bricht die Wartezeit ab', w._debounceAbgebrochen === true);
w._debouncedSave = null;

// ── 18. Statusanzeige meldet jeden Zustand ───────────────────────────────
formularBauen(600, { notes: 'alt' });
const statusEl = () => w.document.getElementById('save-status');

w.setSaveStatus('speichert');
check('Status zeigt "Speichert"', statusEl().textContent.includes('Speichert'));
w.setSaveStatus('gespeichert');
check('Status zeigt "Gespeichert" mit Uhrzeit', /Gespeichert \d{1,2}:\d{2}/.test(statusEl().textContent));
check('Status ist gruen markiert', statusEl().innerHTML.includes('save-status-ok'));
w.setSaveStatus('fehler', { leadId: 600, felder: { notes: 'x' }, meldung: 'Netz weg' });
check('Status zeigt den Fehlschlag', statusEl().textContent.includes('Speichern fehlgeschlagen'));
check('Status bietet Wiederholen an', statusEl().innerHTML.includes('retrySave'));
check('Fehler wird gemerkt', w._letzterSaveFehler && w._letzterSaveFehler.leadId === 600);
w.setSaveStatus('offen');
check('Status zeigt offene Aenderung', statusEl().textContent.includes('Änderung noch nicht gespeichert'));
check('Offen und Fehler sind unterscheidbar', !statusEl().textContent.includes('fehlgeschlagen'));
w.setSaveStatus('gespeichert');
check('Gemerkter Fehler ist danach weg', w._letzterSaveFehler === null);

// Wiederholen schreibt die gemerkten Felder erneut
w.setSaveStatus('fehler', { leadId: 600, felder: { notes: 'Nochmal' }, meldung: 'Netz weg', label: 'Lead' });
geschrieben16.length = 0;
await w.retrySave();
check('Wiederholen schreibt die gemerkten Felder', geschrieben16.length === 1 && geschrieben16[0].notes === 'Nochmal');

// Der Schreibweg meldet von sich aus
formularBauen(600, { notes: 'alt' });
w.store.state.leads = [{ id: 600, name: 'Firma', notes: 'alt', last_edited_ms: 1 }];
w.api.saveLead = async (p) => { throw new Error('Netzwerkfehler'); };
const misslungen = await w.leadStore.save(600, { notes: 'geht nicht' }, { label: 'Lead', silent: true });
check('Fehlschlag wird gemeldet', misslungen === false);
check('Statuszeile steht auf Fehler', statusEl().textContent.includes('Speichern fehlgeschlagen'));

// Der Fehler muss ein Neuzeichnen der Seitenleiste ueberleben
formularBauen(600, { notes: 'alt' });
check('Frisch gezeichnete Zeile ist erst leer', statusEl().textContent.trim() === '');
w.restoreSaveStatus();
check('Offener Fehler wird wieder angezeigt', statusEl().textContent.includes('Speichern fehlgeschlagen'));

w.api.saveLead = async (p) => { geschrieben16.push(p); return { id: p.id, last_edited_ms: Date.now() }; };
await w.leadStore.save(600, { notes: 'geht wieder' }, { label: 'Lead' });
check('Nach Erfolg steht wieder "Gespeichert"', /Gespeichert/.test(statusEl().textContent));

formularBauen(600, { notes: 'alt' });
w.restoreSaveStatus();
check('Ohne offenen Fehler bleibt die Zeile leer', statusEl().textContent.trim() === '');

// ── 19. Aufgabenreiter zeigt auch Kaltakquise-Leads ──────────────────────
// Vorher fielen alle Leads mit claimed_by = null aus dem Aufgabenreiter, weil
// dort ohne Ruecksicht auf den Einzelplatz-Betrieb nach Zuweisung gefiltert
// wurde. Genau das trifft jeden frisch angelegten Kaltakquise-Lead.
const reiterFilter = (leads, multiUser, user) => leads.filter(l => {
  if (multiUser && user && user.role !== 'admin' && user.role !== 'developer'
      && l.claimed_by && l.claimed_by !== user.id) return false;
  if (!l.task_text) return false;
  try { const a = JSON.parse(l.task_text); return Array.isArray(a) && a.some(t => !t.done); }
  catch (e) { return false; }
});
const offeneAufgabe = '[{"id":1,"text":"Anrufen","done":false,"subtasks":[]}]';
const testLeads = [
  { id: 1, name: 'Kalt, niemandem zugewiesen', claimed_by: null, task_text: offeneAufgabe },
  { id: 2, name: 'Mir zugewiesen',              claimed_by: 'ich', task_text: offeneAufgabe },
  { id: 3, name: 'Kollege',                     claimed_by: 'du',  task_text: offeneAufgabe },
  { id: 4, name: 'Alles erledigt',              claimed_by: null,  task_text: '[{"id":9,"text":"fertig","done":true,"subtasks":[]}]' }
];
const einzelplatz = reiterFilter(testLeads, false, { id: 'ich', role: 'agent' });
check('Einzelplatz: Kaltakquise-Lead ist dabei', einzelplatz.some(l => l.id === 1));
check('Einzelplatz: alle mit offenen Aufgaben', einzelplatz.map(l => l.id).join(',') === '1,2,3');
check('Erledigte Aufgaben bringen keinen Lead in den Reiter', !einzelplatz.some(l => l.id === 4));

const mitTeam = reiterFilter(testLeads, true, { id: 'ich', role: 'agent' });
check('Team: unzugewiesene bleiben sichtbar', mitTeam.some(l => l.id === 1));
check('Team: eigene bleiben sichtbar', mitTeam.some(l => l.id === 2));
check('Team: fremde sind ausgeblendet', !mitTeam.some(l => l.id === 3));

// ── 20. Loeschen wird geschrieben ────────────────────────────────────────
w.store.state.leads = [{ id: 700, name: 'L', task_text: '', last_edited_ms: 1 }];
w.store.state.tabCache = {};
w.document.body.innerHTML = '<div id="tasks-list"></div>';
w.bindTasksToLead({ id: 700, task_text: '[{"id":1,"text":"A","done":false,"subtasks":[{"id":11,"text":"A1","done":false}]},{"id":2,"text":"B","done":true,"done_ms":5,"subtasks":[]}]' });
geschrieben16.length = 0;
w.deleteTask(2);
await w.leadStore.ruhe();
check('Erledigte aus der Historie loeschen schreibt', geschrieben16.length === 1);
check('Und zwar ohne die uebrigen', !geschrieben16[0].task_text.includes('"B"') && geschrieben16[0].task_text.includes('"A"'));

geschrieben16.length = 0;
w.deleteSubtask(1, 11);
await w.leadStore.ruhe();
check('Teilaufgabe loeschen schreibt', geschrieben16.length === 1 && !geschrieben16[0].task_text.includes('A1'));

geschrieben16.length = 0;
w.deleteTask(999);
await w.leadStore.ruhe();
check('Loeschen einer unbekannten Aufgabe schreibt nichts', geschrieben16.length === 0);


// ── 21. Angefangene Texte gehen nie verloren ─────────────────────────────
// Aufgabentexte sind contenteditable. Ihre Eingabe landet ueber onblur in
// window.currentTasks — und blur feuert NICHT, wenn das Fenster selbst den
// Fokus verliert (Handy sperren, Browser-Tab wechseln). Deshalb liest
// captureTaskEdits die Felder direkt aus dem DOM.
await w.leadStore.ruhe();
w.document.body.innerHTML = '';
const formular21 = w.document.createElement('div');
formular21.className = 'focused-lead';
formular21.setAttribute('data-lead-id', '800');
formular21.innerHTML = `
  <div class="sidebar-header"><div id="sys-name" contenteditable="true">X</div></div>
  <div class="sidebar-body">
    <input id="sys-phone" value=""><input id="sys-web" type="hidden" value=""><input id="sys-email" value="">
    <input id="sys-stage" type="hidden" value="cold"><input id="sys-k" type="hidden" value="0">
    <input id="sys-city" type="hidden" value=""><input id="sys-placeid" type="hidden" value="">
    <div id="tasks-list"></div><input id="new-task-input-rem" value="">
  </div>`;
w.document.body.appendChild(formular21);

w.store.state.leads = [{ id: 800, name: 'X', task_text: '', last_edited_ms: 1 }];
w.store.state.tabCache = {};
const geschrieben21 = [];
w.api.saveLead = async (p) => { geschrieben21.push(p); return { id: p.id, last_edited_ms: Date.now() }; };

w.bindTasksToLead({ id: 800, task_text: '[{"id":1,"text":"Alt","done":false,"subtasks":[{"id":11,"text":"Alt-Teil","done":false}]}]' });
w.renderTasksList();

const hauptFeld = w.document.querySelector('#tasks-list [data-task-id="1"]:not([data-subtask-id])');
const teilFeld  = w.document.querySelector('#tasks-list [data-subtask-id="11"]');
check('Aufgabentext ist im DOM auffindbar', !!hauptFeld && !!teilFeld);

// Text aendern, ohne dass blur feuert
hauptFeld.textContent = 'Frisch getippt';
teilFeld.textContent  = 'Teil frisch getippt';
w.document.getElementById('new-task-input-rem').value = 'Nie mit Enter bestätigt';

const etwasGeaendert = w.capturePendingTasks();
check('Aenderungen werden erkannt', etwasGeaendert === true);
check('Hauptaufgabe uebernommen', w.currentTasks[0].text === 'Frisch getippt');
check('Teilaufgabe uebernommen', w.currentTasks[0].subtasks[0].text === 'Teil frisch getippt');
check('Angefangene neue Aufgabe uebernommen', w.currentTasks.some(t => t.text === 'Nie mit Enter bestätigt'));

// Ein leer geraeumtes Feld darf den Text NICHT loeschen
w.renderTasksList();
const hauptFeld2 = w.document.querySelector('#tasks-list [data-task-id="1"]:not([data-subtask-id])');
hauptFeld2.textContent = '   ';
w.captureTaskEdits();
check('Leeres Feld loescht den Text nicht', w.currentTasks[0].text === 'Frisch getippt');

// Ohne Bindung wird nichts angefasst
const vorherText = w.currentTasks[0].text;
const gemerkt = w.currentTasksLeadId;
w.currentTasksLeadId = null;
w.renderTasksList();
check('Ohne Bindung wird nichts eingesammelt', w.captureTaskEdits() === false && w.currentTasks[0].text === vorherText);
w.currentTasksLeadId = gemerkt;

// Und der ganze Weg: flushLeadForm schreibt alles zusammen
w.renderTasksList();
const hf = w.document.querySelector('#tasks-list [data-task-id="1"]:not([data-subtask-id])');
hf.textContent = 'Ganz zum Schluss';
geschrieben21.length = 0;
await w.flushLeadForm();
await w.leadStore.ruhe();
const raus = geschrieben21.find(p => 'task_text' in p);
check('flushLeadForm nimmt den Aufgabentext mit', !!raus && raus.task_text.includes('Ganz zum Schluss'));
check('flushLeadForm schreibt auf den richtigen Lead', !!raus && raus.id === 800);

// Auch bei unvollstaendigem Formular (Seitenleiste wird gerade neu gezeichnet)
// duerfen die Aufgaben nicht verloren gehen.
w.document.body.innerHTML = '';
const halbesFormular = w.document.createElement('div');
halbesFormular.className = 'focused-lead';
halbesFormular.setAttribute('data-lead-id', '800');
halbesFormular.innerHTML = '<div id="tasks-list"></div><input id="new-task-input-rem" value="Gerettete Aufgabe">';
w.document.body.appendChild(halbesFormular);
geschrieben21.length = 0;
await w.flushLeadForm();
await w.leadStore.ruhe();
const gerettet = geschrieben21.find(p => 'task_text' in p);
check('Aufgaben ueberleben ein unvollstaendiges Formular', !!gerettet && gerettet.task_text.includes('Gerettete Aufgabe'));

// ── 22. Mehrfachauswahl zeichnet die Liste nicht neu ─────────────────────
// Der Fehler, den das verhindert: jeder Haken hat frueher loadUi() gerufen —
// die Liste wurde verworfen, aus dem Zwischenspeicher gezeichnet, erneut vom
// Server geholt und noch einmal gezeichnet. Auswaehlen aendert keine Daten,
// also darf es auch nichts nachladen.
w.document.body.innerHTML = '';
const karte = w.document.createElement('div');
karte.className = 'lead-card';
karte.id = 'lead-card-7';
karte.innerHTML = '<input type="checkbox" class="lead-card-checkbox">';
w.document.body.appendChild(karte);

w.store.state.isBulkMode = true;
w.store.state.selectedBulkIds = new Set();
let neuGezeichnet = 0;
w.loadUi = () => { neuGezeichnet++; };

w.handleLeadClick(7);
check('Auswaehlen merkt sich den Lead', w.store.state.selectedBulkIds.has(7));
check('Auswaehlen markiert die Karte', karte.classList.contains('is-selected'));
check('Auswaehlen setzt das Kaestchen', karte.querySelector('.lead-card-checkbox').checked === true);
check('Auswaehlen zeichnet die Liste NICHT neu', neuGezeichnet === 0);

w.handleLeadClick(7);
check('Nochmal antippen waehlt ab', !w.store.state.selectedBulkIds.has(7));
check('Abwaehlen nimmt die Markierung weg', !karte.classList.contains('is-selected'));
check('Abwaehlen zeichnet die Liste NICHT neu', neuGezeichnet === 0);

// Ein Lead, der gerade nicht im Sichtfeld haengt, darf nichts umwerfen.
w.handleLeadClick(999);
check('Unbekannte Karte stoert nicht', w.store.state.selectedBulkIds.has(999) && neuGezeichnet === 0);

// Umschalten der Mehrfachauswahl baut die Karten neu — aber aus dem
// Zwischenspeicher, ohne Netzverkehr.
let ausCache = null;
w.loadUi = (optimistic) => { neuGezeichnet++; ausCache = optimistic; };
w.toggleBulkMode();
check('Auswahlmodus verlassen zeichnet einmal neu', neuGezeichnet === 1);
check('Und zwar aus dem Zwischenspeicher', ausCache === true);
check('Auswahl ist danach leer', w.store.state.selectedBulkIds.size === 0);


// ── 23. Die Liste wird nur neu gezeichnet, wenn sich wirklich etwas aendert ──
// loadUi zeichnet zweimal: sofort aus dem Zwischenspeicher, dann mit den
// frischen Daten. Sind beide gleich, ist der zweite Durchgang nur Flackern —
// die Einblend-Bewegung laeuft von vorn und Karten springen unter dem Zeiger
// weg. Die Kennung entscheidet darueber, darf aber nichts uebersehen.
dom.window.eval(ausschnitt('window.listenKennung = (cacheKey, leads) => [', '].join(\'|\');'));

const bestand = [{ id: 1, last_edited_ms: 100 }, { id: 2, last_edited_ms: 200 }];
w.store.state.isBulkMode = false;
w.store.state.currentSelectedLeadId = null;
const grund = w.listenKennung('queue_all_all_', bestand);

check('Gleicher Bestand, gleiche Kennung', w.listenKennung('queue_all_all_', bestand) === grund);
check('Anderer Reiter faellt auf', w.listenKennung('cold_all_all_', bestand) !== grund);
check('Geaenderter Lead faellt auf',
      w.listenKennung('queue_all_all_', [{ id: 1, last_edited_ms: 101 }, { id: 2, last_edited_ms: 200 }]) !== grund);
check('Fehlender Lead faellt auf', w.listenKennung('queue_all_all_', [bestand[0]]) !== grund);

// Die beiden hier haben schon einmal gefehlt: sie aendern das Aussehen jeder
// Karte, ohne dass sich ein einziger Wert am Lead aendert.
w.store.state.isBulkMode = true;
check('Auswahlmodus faellt auf', w.listenKennung('queue_all_all_', bestand) !== grund);
w.store.state.isBulkMode = false;
w.store.state.currentSelectedLeadId = 2;
check('Offene Karte faellt auf', w.listenKennung('queue_all_all_', bestand) !== grund);
w.store.state.currentSelectedLeadId = null;

// Eine einzeln getauschte Karte macht die Kennung ungueltig.
w.store.state.leads = [{ id: 7, name: 'X' }];
w._listenKennung = 'irgendwas';
w._renderLeadCard = () => '<div id="lead-card-7"></div>';
w.document.body.innerHTML = '<div id="lead-card-7"></div>';
w.patchLeadCard(7);
check('Getauschte Karte macht die Kennung ungueltig', w._listenKennung === null);


// ── 24. Meldungen stapeln sich, ohne aus dem Bild zu wandern ─────────────
// Der Fehler, den das verhindert: die Stapelung rechnete mit dem Wert, der
// gerade im Stil stand. Kommen zwei Meldungen kurz hintereinander, steht dort
// bei der ersten noch der Startwert -100px — aus -100 + 60 wurde -40, und die
// Meldung verschwand nach unten aus dem Bild, statt nach oben zu ruecken.
w.document.body.innerHTML = '';
// w.showToast ist hier bereits das Original aus main_ui.js — die Attrappe vom
// Testanfang wurde beim Laden der Datei ersetzt.
w.showToast('Erste');
w.showToast('Zweite', true);
w.showToast('Dritte');

const meldungen = [...w.document.querySelectorAll('.app-toast')];
const plaetze = meldungen.map(t => parseInt(t.style.bottom, 10));
check('Drei Meldungen liegen uebereinander', meldungen.length === 3);
check('Keine Meldung rutscht aus dem Bild', plaetze.every(p => p >= 0));
check('Jede hat einen eigenen Platz', new Set(plaetze).size === 3);
check('Die neueste liegt unten', plaetze[2] < plaetze[1] && plaetze[1] < plaetze[0]);
check('Fehler ist als solcher erkennbar', meldungen[1].className.includes('toast-error'));
check('Meldungen zeigen reinen Text', meldungen[0].textContent === 'Erste' && !meldungen[0].innerHTML.includes('<'));

// Mehr als drei liest niemand — die aelteste faellt weg.
w.showToast('Vierte');
const nachher = [...w.document.querySelectorAll('.app-toast')];
check('Hoechstens drei auf einmal', nachher.length === 3);
check('Die aelteste ist weg', !nachher.some(t => t.textContent === 'Erste'));
w.document.body.innerHTML = '';


// ── 25. Rueckfragen laufen alle ueber denselben Weg ──────────────────────
// Der Systemdialog des Browsers (confirm()) haelt die Seite an, sieht auf
// jedem Geraet anders aus und laesst sich nicht gestalten. Dieselbe Handlung
// fuehlte sich je nach Stelle anders an.
const uiQuellen = {
  'pipeline_ui.js': pipeSrc,
  'main_ui.js': code,
  'init.js': fs.readFileSync('ui/init.js', 'utf8')
};
// Kommentare zaehlen nicht mit — dort steht confirm() als Erklaerung.
const ohneKommentare = (q) => q.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
for (const [datei, quelle] of Object.entries(uiQuellen)) {
  const nativ = ohneKommentare(quelle).match(/(^|[^.\w])(confirm|alert)\s*\(/g) || [];
  check(`${datei} nutzt keinen Systemdialog`, nativ.length === 0);
}
check('confirmAction ist der gemeinsame Weg', code.includes('window.confirmAction = ('));
check('showConfirmDialog leitet nur noch weiter', code.includes('window.confirmAction({ title, message, confirmLabel })'));


// ── 26. Command Center: Blockrechnung, Zielhistorie, Tagesgrenzen ──────────
// Diese drei rechnen still falsch, wenn sie niemand nachprueft.
dom.window.eval(ausschnitt('const ccP = (n) => String(n).padStart(2', 'window.ccIntern = { ccTagKey, ccGrenzen, ccZiel, ccArbeitstage, ccSumme, ccKachel };'));
const cc = w.ccIntern;
check('Command Center: Rechenkerne geladen', !!cc && typeof cc.ccGrenzen === 'function');

// Blockrechnung — muss mit Jarvis OS uebereinstimmen (12 Wochen ab 01.09.2026)
const blockEinst = { 'block.start_date': '2026-09-01', 'block.weeks': 12 };
const b1 = cc.ccGrenzen('block', blockEinst, new Date('2026-09-10T10:00:00'));
check('Block 1 am 10.09.2026', b1.titel === 'Block 1' && cc.ccTagKey(b1.von) === '2026-09-01');

// 84 Tage spaeter beginnt Block 2 — nicht frueher, nicht spaeter
const b2 = cc.ccGrenzen('block', blockEinst, new Date('2026-11-24T10:00:00'));
check('Block 2 ab dem 24.11.2026', b2.titel === 'Block 2' && cc.ccTagKey(b2.von) === '2026-11-24');
const b1ende = cc.ccGrenzen('block', blockEinst, new Date('2026-11-23T10:00:00'));
check('Block 1 reicht bis 23.11.2026', b1ende.titel === 'Block 1');

// Blocklaenge ist Einstellung, nicht fest verdrahtet
const b8 = cc.ccGrenzen('block', { 'block.start_date': '2026-09-01', 'block.weeks': 8 },
                        new Date('2026-11-24T10:00:00'));
check('Blocklaenge kommt aus den Einstellungen', cc.ccTagKey(b8.von) === '2026-10-27');

// Woche beginnt Montag, auch am Sonntag
const woSo = cc.ccGrenzen('woche', {}, new Date('2026-09-13T10:00:00')); // Sonntag
check('Woche beginnt Montag, auch sonntags', cc.ccTagKey(woSo.von) === '2026-09-07');

// Zielhistorie: das zum Tag gueltige Ziel gewinnt, spaetere zaehlen nicht
const ziele = [
  { id: 1, metric_key: 'sales.calls_count', base_value: 30, target_value: 100, valid_from: '2026-09-01' },
  { id: 2, metric_key: 'sales.calls_count', base_value: 30, target_value: 120, valid_from: '2026-12-01' },
  { id: 3, metric_key: 'sales.calls_cold_tarif', base_value: 10, target_value: 40, valid_from: '2026-09-01' }
];
check('Zieländerung schreibt Vergangenheit nicht um',
  cc.ccZiel(ziele, 'sales.calls_count', '2026-09-10').target_value === 100);
check('Ab Gueltigkeitsdatum gilt das neue Ziel',
  cc.ccZiel(ziele, 'sales.calls_count', '2026-12-05').target_value === 120);
check('Vor dem ersten Ziel gibt es keins',
  cc.ccZiel(ziele, 'sales.calls_count', '2026-08-31') === null);
check('Ziele verschiedener Kennzahlen vermischen sich nicht',
  cc.ccZiel(ziele, 'sales.calls_cold_tarif', '2026-12-05').target_value === 40);

// Arbeitstage: Sonntag zaehlt nicht mit (wie active_weekdays in Jarvis)
const woche = cc.ccArbeitstage(new Date('2026-09-07T00:00:00'), new Date('2026-09-13T00:00:00'), [1,2,3,4,5,6]);
check('Sonntag ist kein Arbeitstag', woche.length === 6 && !woche.includes('2026-09-13'));

// Tagesgrenzen laufen nach Ortszeit — ein Anruf um 23:30 gehoert zu SEINEM Tag
check('Tagesschluessel nutzt Ortszeit, nicht UTC',
  cc.ccTagKey(new Date('2026-09-10T23:30:00')) === '2026-09-10');

// Summieren ignoriert fremde Kennzahlen
const zeilen = [
  { metric_key: 'sales.calls_count', tag: '2026-09-09', wert: 12 },
  { metric_key: 'sales.calls_count', tag: '2026-09-10', wert: 8 },
  { metric_key: 'sales.calls_cold_tarif', tag: '2026-09-10', wert: 5 }
];
check('Summieren trennt die Kennzahlen', cc.ccSumme(zeilen, 'sales.calls_count') === 20);

// Ein Tagesziel muss im Zeitraum hochgerechnet werden. Ohne Faktor stuende die
// Wochensumme neben dem Tagesziel — das sieht immer nach Zielerreichung aus.
const zielKachel = { metric_key: 'x', base_value: 10, target_value: 40, valid_from: '2026-09-01' };
check('Tagesziel bleibt bei "Heute" unveraendert',
  cc.ccKachel('Cold Tarif', 21, zielKachel, 1).includes('Soll 40'));
check('Tagesziel wird auf den Zeitraum hochgerechnet',
  cc.ccKachel('Cold Tarif', 108, zielKachel, 4).includes('Soll 160'));
check('Wochensumme unter hochgerechnetem Ziel ist nicht gruen',
  !cc.ccKachel('Cold Tarif', 108, zielKachel, 4).includes('cc-bar-fill cc-gut'));
check('Ohne Soll sagt die Kachel das, statt 0 zu zeigen',
  cc.ccKachel('Ohne Ziel', 5, { metric_key: 'y', base_value: null, target_value: null }, 1).includes('kein Soll'));

// Das Dashboard darf nicht auf die gedeckelte Sammelabfrage zurueckfallen
const dashTeil = pipeSrc.slice(pipeSrc.indexOf('window.renderDashboard = async'));
// getAgentStats ist die gedeckelte Sammelabfrage. Im Einzelplatz-Pfad darf sie
// nicht mehr vorkommen — nur noch hinter dem Team-Schalter.
// Wert am Lead: leeres Feld heisst NULL, nicht 0. Sonst waere "Abschluss ohne
// Wert" nicht von "Abschluss ueber 0 Euro" zu unterscheiden — genau die
// Unterscheidung, wegen der provi_umsatz ueberhaupt umgestellt wurde.
const wertFeld = (id, wert) => {
  let e = w.document.getElementById(id);
  if (!e) { e = w.document.createElement('input'); e.id = id; w.document.body.appendChild(e); }
  e.value = wert; return e;
};
wertFeld('sys-name', 'Testfirma');
// Gespeicherter Stand: Abschluss am 10.09. um 15:37, noch ohne Wert
const wertStand = { id: 7, provi_umsatz: null, closed_at_ms: new Date('2026-09-10T15:37:00').getTime() };
const lies = () => w.leseWertFelder(wertStand);
wertFeld('sys-closed-at', '2026-09-10');

wertFeld('sys-provi', '');
check('Leeres Wertfeld bei leerem Stand schreibt nichts', !('provi_umsatz' in lies()));
wertFeld('sys-provi', '0');
check('Eingetragene 0 bleibt 0', lies().provi_umsatz === 0);
wertFeld('sys-provi', '847,50');
check('Komma wird als Dezimaltrenner verstanden', lies().provi_umsatz === 847.5);
wertFeld('sys-provi', '1.500,50');
check('1.500,50 wird 1500.5 (frueher NaN -> geleert)', lies().provi_umsatz === 1500.5);
wertFeld('sys-provi', 'abc');
check('Unlesbare Eingabe wird NICHT gespeichert', !('provi_umsatz' in lies()));
check('Unlesbare Eingabe wird markiert',
  w.document.getElementById('sys-provi').getAttribute('aria-invalid') === 'true');
wertFeld('sys-provi', '1500.5');
check('Unveraenderter Wert wird nicht erneut geschrieben',
  !('provi_umsatz' in w.leseWertFelder({ ...wertStand, provi_umsatz: 1500.5 })));
wertFeld('sys-provi', '');
check('Bewusst geleertes Feld wird NULL, nicht 0',
  w.leseWertFelder({ ...wertStand, provi_umsatz: 900 }).provi_umsatz === null);

// Datum: gleicher Tag heisst unveraendert — die echte Uhrzeit bleibt stehen
check('Gleicher Tag ueberschreibt die Abschluss-Uhrzeit nicht', !('closed_at_ms' in lies()));
wertFeld('sys-closed-at', '2026-09-12');
check('Anderer Tag wird geschrieben, auf demselben Tag',
  new Date(lies().closed_at_ms).toLocaleDateString('sv-SE') === '2026-09-12');
wertFeld('sys-closed-at', '');
check('Geleertes Abschlussdatum wird NULL', lies().closed_at_ms === null);

// Fehlt das Feld im Formular, darf nichts ueberschrieben werden
w.document.getElementById('sys-provi').remove();
w.document.getElementById('sys-closed-at').remove();
const ohne = lies();
check('Fehlendes Feld fasst den Wert nicht an',
  !('provi_umsatz' in ohne) && !('closed_at_ms' in ohne));

// Der eigentliche Fehler: saveLeadMain hat beide Felder nie mitgeschickt.
const saveTeil = ohneKommentare(mainQuelleFrueh.slice(
  mainQuelleFrueh.indexOf('window.saveLeadMain = async'),
  mainQuelleFrueh.indexOf('window.triggerSalesBell')));
check('saveLeadMain schreibt Wert und Abschlussdatum mit',
  saveTeil.includes('leseWertFelder(lData)'));

// Kommentare zaehlen nicht mit — dort steht getAgentStats als Erklaerung,
// warum der Team-Bereich sie noch benutzt.
const dashCode = ohneKommentare(dashTeil);
const vorTeam = dashCode.slice(0, dashCode.indexOf('window.isMultiUser()'));
check('Einzelplatz-Pfad nutzt getAgentStats nicht mehr', !vorTeam.includes('getAgentStats'));
check('getAgentStats kommt nur noch im Team-Bereich vor',
  (dashCode.match(/getAgentStats/g) || []).length === 1);
check('Dashboard liest aus den Sichten', dashTeil.includes('getDailyMetrics') && dashTeil.includes('getStockMetrics'));
check('Ziele kommen nicht mehr aus localStorage',
  !pipeSrc.includes('dashboard_kpi_goals') && !pipeSrc.includes('dashboard_manual_kpis'));
check('Pipeline-Stand wird beim Aufruf festgehalten',
  dashTeil.includes('savePipelineSnapshot'));
check('Ein fehlgeschlagener Schnappschuss haelt das Dashboard nicht auf',
  /savePipelineSnapshot\(bestand\)[\s\S]{0,120}\.catch\(/.test(dashTeil));
check('Team-Bereich ist ausgeblendet, nicht geloescht',
  dashTeil.includes('window.isMultiUser()') && dashTeil.includes('<h2>Team</h2>'));
check('Team-Bereich haengt am Schalter, nicht am Zufall',
  dashTeil.indexOf('window.isMultiUser()') < dashTeil.indexOf('<h2>Team</h2>'));
check('Kein Chart.js mehr eingebunden', !fs.readFileSync('index.html', 'utf8').includes('chart.js'));

// ── 27. Der Verlauf darf nichts behaupten, was nicht gespeichert wurde ──────
// Am 12.09.2026 stand bei Lead 592 "OFFER" und "CLOSED" im Verlauf, waehrend
// die Stufe bis heute auf 'cold' steht: protokolliert wurde VOR dem
// Schreibvorgang und vor der Konfliktpruefung.
const dbQuelle = fs.readFileSync('core/db.js', 'utf8');
const posSchreiben = dbQuelle.indexOf("await updateQuery.select('id')");
const posKonflikt  = dbQuelle.indexOf('Konflikt: Lead wurde exakt beim Speichern');
const posProtokoll = dbQuelle.indexOf('await db.logStatusChange(');
check('Testaufbau: alle drei Stellen gefunden',
  posSchreiben > 0 && posKonflikt > 0 && posProtokoll > 0);
check('Protokolliert wird NACH dem Schreibvorgang', posProtokoll > posSchreiben);
check('Protokolliert wird NACH der Konfliktpruefung', posProtokoll > posKonflikt);
check('closed_at_ms wird VOR dem Schreibvorgang gesetzt',
  dbQuelle.indexOf('payload.closed_at_ms = now') < posSchreiben);
check('Ein fehlgeschlagenes Protokoll dreht das Speichern nicht zurueck',
  /if \(stufeGewechselt\)[\s\S]{0,200}try \{[\s\S]{0,120}logStatusChange[\s\S]{0,200}catch/.test(dbQuelle));

// ── 27b. Versionshinweis fuer laufende Tabs ────────────────────────────────
// Ein Tab, der vor dem Deploy geoeffnet wurde, laeuft auf altem Code weiter.
// Genau so landeten am 12.09.2026 zwei Stufenwechsel ohne Struktur in der
// Datenbank, obwohl richtig deployt war.
const indexQuelle = fs.readFileSync('index.html', 'utf8');
check('Seite horcht auf den Wechsel des Service Workers',
  indexQuelle.includes("addEventListener('controllerchange'"));
check('Erstanmeldung loest keinen Hinweis aus',
  indexQuelle.includes('hatteVorher'));
check('Ein lange offener Tab fragt selbst nach',
  /setInterval\([\s\S]{0,200}\.update\(\)/.test(indexQuelle));

w.document.body.innerHTML = '';
w.zeigeVersionshinweis();
const hinweis = w.document.getElementById('versionshinweis');
check('Versionshinweis erscheint', !!hinweis);
check('Versionshinweis nennt den Grund',
  (hinweis?.textContent || '').includes('alten Stand'));
w.zeigeVersionshinweis();
check('Versionshinweis erscheint nicht doppelt',
  w.document.querySelectorAll('#versionshinweis').length === 1);
w.document.querySelector('.versionshinweis-zu').click();
check('Versionshinweis laesst sich schliessen',
  !w.document.getElementById('versionshinweis'));

const mainQuelle = fs.readFileSync('public/ui/main_ui.js', 'utf8');
const hinweisTeil = mainQuelle.slice(mainQuelle.indexOf('window.zeigeVersionshinweis'),
                                    mainQuelle.indexOf('window.showToast = ('));
check('Kein automatisches Neuladen ohne Zutun',
  !/setTimeout[\s\S]{0,120}location\.reload/.test(hinweisTeil));
check('Vor dem Neuladen wird gesichert',
  hinweisTeil.indexOf('flushLeadForm') < hinweisTeil.indexOf('location.reload'));

// ── 27b2. Standort verknuepfen fuellt nur Luecken ──────────────────────────
// Vorfall 23.09.2026: Standort verknuepft -> der eigene Name war durch den
// Google-Namen ersetzt, der Standort selbst aber nie gespeichert.
{
  const alterStore = w.leadStore;
  const geschrieben = [];
  const lead = { id: 42, name: 'Bäckerei Müller (Filiale Nord)', phone: '0351 123', website_url: null,
                 size: 'Großkunde', provi_umsatz: 1500, closed_at_ms: 1757000000000,
                 locations: [], maps_city: null, lat: null, lng: null, google_place_id: null };
  let neuGezeichnet = false;
  w.leadStore = { ...alterStore, get: () => lead, ruhe: async () => true,
    save: async (id, felder) => { geschrieben.push({ id, felder }); Object.assign(lead, felder); return true; } };
  const alterFlush = w.flushLeadForm, alterOpen = w.openLeadDirectly;
  w.flushLeadForm = async () => true;
  w.openLeadDirectly = async (id, a, b, draft) => { neuGezeichnet = !draft; };
  w.eval(ausschnitt('window.linkLeadLocation = async (leadId, encodedData) => {', '\n  };\n'));
  const ort = { name: 'Müller GmbH', address: 'Hauptstr. 1, 01067 Dresden', lat: 51.05, lng: 13.73,
                website: 'https://mueller.de', mapsUrl: 'https://maps.google.com/x', phone: '0351 999',
                placeId: 'ChIJabc', opening_hours: JSON.stringify({ weekdayDescriptions: ['Monday: Closed'] }) };
  await w.linkLeadLocation(42, encodeURIComponent(JSON.stringify(ort)));
  const f = geschrieben[0]?.felder || {};
  check('Standort: wird tatsaechlich gespeichert', geschrieben.length === 1 && Array.isArray(f.locations) && f.locations.length === 1);
  check('Standort: Adresse und Koordinaten werden gespeichert', f.maps_city === ort.address && f.lat === 51.05 && f.lng === 13.73);
  check('Standort: eigener Name bleibt', !('name' in f) && lead.name === 'Bäckerei Müller (Filiale Nord)');
  check('Standort: vorhandene Nummer bleibt', !('phone' in f));
  check('Standort: leere Webseite wird gefuellt', f.website_url === 'https://mueller.de');
  check('Standort: Wert, Datum, Groesse unberuehrt',
    !('provi_umsatz' in f) && !('closed_at_ms' in f) && !('size' in f));
  check('Standort: neu gezeichnet ohne alten Entwurf', neuGezeichnet);

  geschrieben.length = 0;
  await w.linkLeadLocation(42, encodeURIComponent(JSON.stringify(ort)));
  check('Standort: derselbe Ort wird nicht doppelt angehaengt', geschrieben.length === 0);

  w.leadStore = alterStore; w.flushLeadForm = alterFlush; w.openLeadDirectly = alterOpen;
}

// ── 27b3. Anruf im Verlauf einordnen: ✓ / ✕ und Notiz ─────────────────────
{
  if (!w.CSS) w.CSS = { escape: (x) => String(x).replace(/["\\]/g, '\\$&') };
  w.eval(ausschnitt('window.renderActivity = function(act) {', '// Eintrag aus dem Verlauf loeschen.'));
  const geschrieben = [];
  let antwort = true;
  w.api.setCallDetails = async (id, felder) => { geschrieben.push({ id, felder }); return antwort; };
  const anruf = { id: '501', lead_id: 9, ts: Date.now(), activity_type: 'call', by_user_name: 'Rico',
                  call_outcome: null, call_notes: null };
  const nachricht = { id: '77', lead_id: 9, ts: Date.now(), activity_type: 'message', details: 'E-Mail geschrieben' };
  const altLeads = w.store.state.leads;
  w.store.state.leads = [{ id: 9, timeline: [anruf, nachricht], crm_calls: [{ id: 501, outcome: null, notes: null }] }];
  w.document.body.innerHTML = `<div class="sidebar-body"><div id="verlauf">${w.renderActivity(anruf)}${w.renderActivity(nachricht)}</div></div>`;
  const zeile = () => w.document.querySelector('.akt-anruf[data-call-id="501"]');

  check('Anruf: Haken und Kreuz stehen da', !!zeile().querySelector('.anruf-ja') && !!zeile().querySelector('.anruf-nein'));
  check('Anruf: ohne Ergebnis noch kein Notizfeld', !zeile().querySelector('.anruf-notiz'));
  check('Nachricht: keine Anruf-Knoepfe', !w.document.body.innerHTML.includes('data-call-id="77"')
    && w.document.querySelectorAll('.anruf-ergebnis').length === 1);
  check('Loeschen ist ein Papierkorb, kein ✕', w.document.querySelectorAll('.akt-loeschen').length === 2
    && !w.document.querySelector('.akt-loeschen').textContent.includes('✕'));

  await w.setzeAnrufErgebnis('501', 9, 'reached');
  check('Anruf: Haken wird gespeichert', geschrieben.at(-1).id === '501' && geschrieben.at(-1).felder.outcome === 'reached');
  check('Anruf: Haken ist sichtbar gesetzt', zeile().querySelector('.anruf-ja').classList.contains('aktiv'));
  check('Anruf: nach Haken erscheint Notizfeld', !!zeile().querySelector('.anruf-notiz'));
  check('Anruf: Anrufliste im Speicher nachgezogen', w.store.state.leads[0].crm_calls[0].outcome === 'reached');

  await w.setzeAnrufErgebnis('501', 9, 'reached');
  check('Anruf: zweiter Klick nimmt zurueck', geschrieben.at(-1).felder.outcome === null
    && !zeile().querySelector('.anruf-ja.aktiv'));

  await w.setzeAnrufErgebnis('501', 9, 'not_reached');
  check('Anruf: Kreuz wird gespeichert', geschrieben.at(-1).felder.outcome === 'not_reached');
  check('Anruf: auch nach Kreuz gibt es ein Notizfeld', !!zeile().querySelector('.anruf-notiz'));

  // Notiz: Tippen darf das Lead-Autospeichern NICHT ausloesen
  let formularGespeichert = 0;
  const altFlush = w.flushLeadForm, altStatus = w.setSaveStatus;
  w.flushLeadForm = async () => { formularGespeichert++; return true; };
  w.setSaveStatus = (z) => { if (z === 'offen') formularGespeichert++; };
  w.document.querySelector('.sidebar-body').addEventListener('input', w._triggerAutoSave);
  w.document.querySelector('.sidebar-body').addEventListener('focusout', w._autoSaveNow);
  const feld = zeile().querySelector('.anruf-notiz');
  feld.value = 'Sekretariat, Chef ab 14 Uhr';
  feld.dispatchEvent(new w.Event('input', { bubbles: true }));
  feld.dispatchEvent(new w.FocusEvent('focusout', { bubbles: true }));
  await new Promise(r => setImmediate(r));
  check('Notiz: wird beim Verlassen gespeichert', geschrieben.at(-1).felder.notes === 'Sekretariat, Chef ab 14 Uhr');
  check('Notiz: loest kein Lead-Autospeichern aus', formularGespeichert === 0);
  w.flushLeadForm = altFlush; w.setSaveStatus = altStatus;
  const anzahl = geschrieben.length;
  await w.anrufNotizSichern(feld);
  check('Notiz: unveraendert wird nicht erneut geschrieben', geschrieben.length === anzahl);

  // Fehlschlag: Anzeige wird zurueckgenommen
  antwort = false;
  await w.setzeAnrufErgebnis('501', 9, 'reached');
  check('Anruf: bei Fehler bleibt das alte Ergebnis', zeile().querySelector('.anruf-nein').classList.contains('aktiv')
    && anruf.call_outcome === 'not_reached');

  // Neu gezeichnet: Notiz steht wieder im Feld
  w.document.getElementById('verlauf').innerHTML = w.renderActivity(anruf);
  check('Notiz: steht nach Neuzeichnen wieder da', zeile().querySelector('.anruf-notiz').value === 'Sekretariat, Chef ab 14 Uhr');

  w.store.state.leads = altLeads;
}

// ── 27b4. Wiedervorlage mit Drehrad ───────────────────────────────────────
{
  w._wvTick = 1;   // Countdown im Test nicht starten — er hielte den Prozess am Leben
  w.eval(fs.readFileSync('public/modules/wiedervorlage.js', 'utf8'));
  const W = w.Wiedervorlage;
  const gesetzt = [];
  const altSetze = w.setzeWiedervorlage;
  w.setzeWiedervorlage = async (id, ms) => { gesetzt.push({ id, ms }); return true; };
  w.requestAnimationFrame = (fn) => fn();

  w.document.body.innerHTML = `<div class="sidebar-body">${W.html({ id: 5, snooze_until_ms: 0 })}</div>`;
  const root = w.document.querySelector('.wv');
  W.binde(root);
  const setzenK = root.querySelector('.wv-setzen');
  const anz = root.querySelector('.wv-anzeige');
  check('Drehrad: drei Spalten, alle auf 0',
    [...root.querySelectorAll('.wv-spalte')].map(x => x.getAttribute('aria-valuenow')).join() === '0,0,0');
  check('Drehrad: Minuten in 5er-Schritten bis 55',
    root.querySelector('[data-feld="minuten"]').getAttribute('aria-valuemax') === '55'
    && root.querySelectorAll('[data-feld="minuten"] .wv-wert').length === 12);
  check('Drehrad: bei 0 ist Setzen gesperrt', setzenK.disabled);
  check('Drehrad: ohne laufende Wiedervorlage kein Aufheben', !root.querySelector('.wv-aufheben'));
  check('Drehrad: eigenes Speichern, kein Lead-Autospeichern', root.hasAttribute('data-eigenes-speichern'));

  // 20 Minuten drehen: Index 4 in der Minutenspalte
  const minSp = root.querySelector('[data-feld="minuten"]');
  minSp.scrollTop = 4 * 30;
  minSp.dispatchEvent(new w.Event('scroll'));
  check('Drehrad: Drehen zeigt den Zeitpunkt live', anz.textContent.includes('in 20 Min') && !setzenK.disabled);
  check('Drehrad: gewaehlter Wert ist markiert', minSp.getAttribute('aria-valuenow') === '20');
  const vorher = Date.now();
  setzenK.click();
  await new Promise(r => setImmediate(r));
  const g = gesetzt.at(-1);
  check('Drehrad: Setzen schreibt ~20 Min in die Zukunft, volle Minute',
    g && g.id === 5 && g.ms % 60000 === 0 && g.ms - vorher > 19 * 60000 && g.ms - vorher <= 21 * 60000);

  // Datum waehlen -> 8:00 an diesem Tag, Rad tritt zurueck
  const morgen = new Date(Date.now() + 2 * 86400000).toLocaleDateString('sv-SE');
  const dEl = root.querySelector('.wv-datum');
  dEl.value = morgen;
  dEl.dispatchEvent(new w.Event('change'));
  check('Datum: Anzeige nennt 08:00', anz.textContent.includes('08:00'));
  check('Datum: Rad tritt zurueck', root.classList.contains('wv-datum-modus'));
  setzenK.disabled = false;
  setzenK.click();
  await new Promise(r => setImmediate(r));
  const gd = new Date(gesetzt.at(-1).ms);
  check('Datum: faellig um 8:00 an diesem Tag',
    gd.toLocaleDateString('sv-SE') === morgen && gd.getHours() === 8 && gd.getMinutes() === 0);

  // Drehen nach Datum -> Datum faellt weg
  minSp.scrollTop = 2 * 30;
  minSp.dispatchEvent(new w.Event('scroll'));
  check('Datum: Drehen hebt das Datum auf', !root.classList.contains('wv-datum-modus') && dEl.value === '');

  // Laufende Wiedervorlage: oben angezeigt, Aufheben schreibt 0
  const ziel = Date.now() + 45 * 60000;
  w.document.body.innerHTML = `<div class="sidebar-body">${W.html({ id: 5, snooze_until_ms: ziel })}</div>`;
  const root2 = w.document.querySelector('.wv');
  W.binde(root2);
  check('Laufend: Restzeit steht da', root2.querySelector('.wv-aktiv-rest').textContent.startsWith('noch 4'));
  check('Laufend: Knopf heisst "Neu setzen"', root2.querySelector('.wv-setzen').textContent === 'Neu setzen');
  root2.querySelector('.wv-aufheben').click();
  await new Promise(r => setImmediate(r));
  check('Laufend: Aufheben schreibt 0', gesetzt.at(-1).ms === 0);

  // Datums-Eingabe darf das Lead-Autospeichern nicht anstossen
  let formular = 0;
  const altStatus = w.setSaveStatus, altFlush = w.flushLeadForm;
  w.setSaveStatus = (z) => { if (z === 'offen') formular++; };
  w.flushLeadForm = async () => { formular++; return true; };
  const body = w.document.querySelector('.sidebar-body');
  body.addEventListener('input', w._triggerAutoSave);
  body.addEventListener('change', w._autoSaveNow);
  const d2 = root2.querySelector('.wv-datum');
  d2.value = morgen;
  d2.dispatchEvent(new w.Event('input', { bubbles: true }));
  d2.dispatchEvent(new w.Event('change', { bubbles: true }));
  check('Datum: loest kein Lead-Autospeichern aus', formular === 0);
  w.setSaveStatus = altStatus; w.flushLeadForm = altFlush;
  w.setzeWiedervorlage = altSetze;
}

// ── 27b5. Faellige Rueckrufe: Glocke und Stapel ───────────────────────────
{
  const jetzt = Date.now();
  let antwort = [
    { id: 21, name: 'Später fällig GmbH', phone: '0351 2', snooze_until_ms: jetzt - 60000 },
    { id: 20, name: 'Früh fällig KG', phone: '0351 1', snooze_until_ms: jetzt - 600000 }
  ];
  const geschrieben = [];
  const altSave = w.leadStore.save, altCopy = w.copyPhone, altOpen = w.openLeadDirectly, altSort = w.sortiereListenNeu;
  w.api.getFaelligeRueckrufe = async () => [...antwort].sort((a, b) => a.snooze_until_ms - b.snooze_until_ms);
  w.leadStore.save = async (id, felder) => { geschrieben.push({ id, felder }); return true; };
  const kopiert = [], geoeffnet = [];
  w.copyPhone = async (e, id, nr) => { kopiert.push({ id, nr }); };
  w.openLeadDirectly = async (id) => { geoeffnet.push(id); };
  w.sortiereListenNeu = () => {};
  w.globalUser = { id: 'rico', name: 'Rico' };
  const altInterval = w.setInterval;
  w.setInterval = () => 0;
  w.document.body.innerHTML = '<button id="rr-glocke"><span class="rr-zahl" hidden>0</span></button>';
  w.eval(fs.readFileSync('public/modules/rueckruf.js', 'utf8'));
  await w.Rueckruf.pruefen();

  const karten = [...w.document.querySelectorAll('.rr-karte')];
  check('Rückruf: beide Karten stehen da', karten.length === 2);
  check('Rückruf: aelteste zuerst', karten[0].getAttribute('data-id') === '20');
  check('Rückruf: Glocke zaehlt', w.document.querySelector('.rr-zahl').textContent === '2'
    && !w.document.querySelector('.rr-zahl').hidden);
  check('Rückruf: neue Karten sind markiert (Animation)', karten.every(k => k.classList.contains('neu')));
  check('Rückruf: Stapel ist sichtbar', !w.document.getElementById('rr-stapel').hidden);

  // Zweiter Durchlauf ohne Aenderung: nichts neu zeichnen
  const vorher = w.document.querySelector('.rr-karte');
  await w.Rueckruf.pruefen();
  check('Rückruf: unveraendert wird nicht neu gezeichnet', w.document.querySelector('.rr-karte') === vorher);

  // Erledigt (×)
  w.document.querySelector('.rr-karte[data-id="21"] [data-aktion="erledigt"]').click();
  await new Promise(r => setImmediate(r));
  const erl = geschrieben.find(g => g.id === 21);
  check('Erledigt: schreibt snooze_erledigt_ms', erl && erl.felder.snooze_erledigt_ms >= jetzt);
  check('Erledigt: Karte ist weg', !w.document.querySelector('.rr-karte[data-id="21"]'));
  check('Erledigt: fasst die Wiedervorlage selbst nicht an', !('snooze_until_ms' in erl.felder));

  // Spaeter
  antwort = antwort.filter(l => l.id !== 21);
  w.document.querySelector('.rr-karte[data-id="20"] [data-aktion="spaeter"]').click();
  await new Promise(r => setImmediate(r));
  const sp = geschrieben.find(g => g.id === 20 && 'snooze_until_ms' in g.felder);
  check('Später: schiebt um 10 Minuten', sp && Math.abs(sp.felder.snooze_until_ms - (Date.now() + 600000)) < 5000);
  check('Später: Karte ist weg, Glocke leer', !w.document.querySelector('.rr-karte')
    && w.document.querySelector('.rr-zahl').hidden);
  check('Leer: Stapel blendet sich aus', w.document.getElementById('rr-stapel').hidden);

  // Glocke oeffnet den leeren Stapel trotzdem (fuer die Einstellungen)
  w.Rueckruf.umschalten();
  check('Glocke: oeffnet auch leer', !w.document.getElementById('rr-stapel').hidden
    && w.document.querySelector('.rr-leer'));
  w.Rueckruf.umschalten();
  check('Glocke: blendet wieder aus', w.document.getElementById('rr-stapel').hidden);

  // Copy: kopiert ueber den normalen Weg, oeffnet den Lead
  antwort = [{ id: 30, name: 'Copy AG', phone: '0351 3', snooze_until_ms: Date.now() - 1000 }];
  await w.Rueckruf.pruefen();
  w.document.querySelector('.rr-karte[data-id="30"] [data-aktion="copy"]').click();
  await new Promise(r => setImmediate(r));
  await new Promise(r => setImmediate(r));
  check('Copy: nimmt den normalen Kopier- und Zaehlweg', kopiert.length === 1 && kopiert[0].id === 30 && kopiert[0].nr === '0351 3');
  check('Copy: oeffnet den Lead', geoeffnet.includes(30));
  check('Copy: Karte ist weg', !w.document.querySelector('.rr-karte[data-id="30"]'));

  // Ohne lokalen Speicher (hier gesperrt, wie im privaten Fenster) laeuft alles weiter
  let speicherGesperrt = false;
  try { w.localStorage.getItem('x'); } catch (e) { speicherGesperrt = true; }
  check('Gesperrter Speicher bricht nichts', speicherGesperrt ? true : (w.localStorage.getItem('rr-gesehen') || '').includes('30:'));

  w.leadStore.save = altSave; w.copyPhone = altCopy; w.openLeadDirectly = altOpen; w.sortiereListenNeu = altSort;
  w.setInterval = altInterval;
}

// ── 27b6. Ruhige Liste: kein Neuladen-Flackern ────────────────────────────
{
  const stile = fs.readFileSync('styles.css', 'utf8');
  check('Ruhig: beim Aktualisieren kein Einblenden',
    /\.liste-ruhig \.lead-card, \.lead-card\.ruhig \{ animation: none; \}/.test(stile));
  check('Ruhig: renderQueue unterscheidet erstes Zeichnen und Aktualisieren',
    pipeSrc.includes("qList.classList.toggle('liste-ruhig', !erstesMal)"));
  check('Ruhig: ausgetauschte Karte blendet nicht neu ein',
    pipeSrc.includes("fresh.classList.add('ruhig')"));
  const dbSrc = fs.readFileSync('core/db.js', 'utf8');
  const logCallTeil = dbSrc.slice(dbSrc.indexOf('logCall: async'), dbSrc.indexOf('setCallDetails: async'));
  check('Ruhig: Anruf-Zeitstempel ist eigene Aenderung (kein Echo-Neuladen)',
    logCallTeil.indexOf('eigeneAenderung(id)') > -1
    && logCallTeil.indexOf('eigeneAenderung(id)') < logCallTeil.indexOf(".update({ last_contact_ms: now })"));
  const initSrc = fs.readFileSync('ui/init.js', 'utf8');
  check('Ruhig: Live-Aenderung ohne Reiterwechsel patcht nur',
    initSrc.includes("REITER_FELDER = ['stage', 'status', 'claimed_by', 'size']")
    && initSrc.includes('window.leadStore.patch(neu.id, felder)'));
  check('Ruhig: Live-Zeile ueberschreibt Anrufliste und Status nicht',
    initSrc.includes("['crm_calls', 'lead_activities', 'timeline', 'call_history', 'call_status'].forEach(k => delete felder[k])"));
  check('Priorisieren laedt nicht mehr die ganze Liste',
    !pipeSrc.slice(pipeSrc.indexOf('window.toggleLeadStar'), pipeSrc.indexOf('window.toggleLeadStar') + 600).includes('getLeads({ all: true })'));
}

// ── 27c. Beim Abschluss wird nach dem Wert gefragt ─────────────────────────
// 55 von 55 Abschluessen ohne Wert: das Feld war da, nur hat niemand gefragt.
w.document.body.innerHTML = '';
const abschlussSpeicher = [];
w.leadStore = { ...(w.leadStore || {}),
  get: () => ({ id: 7, provi_umsatz: null, closed_at_ms: null }),
  save: async (id, felder) => { abschlussSpeicher.push({ id, felder }); return true; },
  ruhe: async () => true };

const dialog = w.frageAbschlusswert(7);
check('Abschlussdialog erscheint', !!w.document.querySelector('.abschluss-overlay'));
check('Datum ist auf heute vorbelegt',
  w.document.getElementById('abschluss-datum').value === new Date().toLocaleDateString('sv-SE'));
check('Wertfeld startet leer, nicht mit 0',
  w.document.getElementById('abschluss-wert').value === '');

w.document.getElementById('abschluss-wert').value = '847,50';
w.document.querySelector('.abschluss-overlay .confirm-btn-primary').click();
await dialog;
await new Promise(r => setImmediate(r));
check('Eingetragener Wert wird gespeichert',
  abschlussSpeicher.length === 1 && abschlussSpeicher[0].felder.provi_umsatz === 847.5);
check('Abschlussdatum wird mitabschlussSpeicher',
  typeof abschlussSpeicher[0].felder.closed_at_ms === 'number');

// "Spaeter" darf nichts schreiben — der Abschluss bleibt, der Wert fehlt.
abschlussSpeicher.length = 0;
const dialog2 = w.frageAbschlusswert(7);
w.document.querySelector('.abschluss-overlay .confirm-btn-cancel').click();
check('"Später" schreibt nichts', await dialog2 === false && abschlussSpeicher.length === 0);

// Leeres Feld heisst NULL, nicht 0 — sonst waere der Abschluss "0 Euro wert".
abschlussSpeicher.length = 0;
const dialog3 = w.frageAbschlusswert(7);
w.document.getElementById('abschluss-wert').value = '';
w.document.querySelector('.abschluss-overlay .confirm-btn-primary').click();
await dialog3;
await new Promise(r => setImmediate(r));
check('Leeres Wertfeld wird NULL, nicht 0', abschlussSpeicher[0].felder.provi_umsatz === null);

const setPipeQuelle = fs.readFileSync('public/ui/main_ui.js', 'utf8');
const setPipeTeil = setPipeQuelle.slice(setPipeQuelle.indexOf('window.setPipeline = async'),
                                        setPipeQuelle.indexOf('window.selectCustomSnooze'));
check('Gefragt wird nur beim Wechsel AUF closed',
  setPipeTeil.includes("stage === 'closed' && vorherigeStufe !== 'closed'"));
check('Gefragt wird erst nach dem Speichern',
  setPipeTeil.indexOf('_triggerAutoSave') < setPipeTeil.indexOf('frageAbschlusswert'));

// ── 27d. Webseite steht auf der Karteikarte ────────────────────────────────
// Der Link war nur ueber die Landkarte zu erreichen: Lead anklicken, zur Karte
// wechseln, Stecknadel treffen. Im Formular stand das Feld versteckt — mitten
// im Gespraech ein Umweg ueber zwei Ansichten.
dom.window.eval(ausschnitt('const namensfeld = () => {',
                           "encodeURIComponent(name || 'Unbekannt'));\n  }\n};"));

w.document.body.innerHTML = '';
const geoeffnet = [];
w.api.openExternal = (url) => geoeffnet.push(url);

const webFeld = feld('sys-web', '');
feld('sys-name', "Müller's Metzgerei", 'div');

webFeld.value = 'https://www.metzgerei-mueller.de';
w.oeffneLeadWebseite();
check('Webseite oeffnet die eingetragene Adresse',
  geoeffnet.at(-1) === 'https://www.metzgerei-mueller.de');

webFeld.value = 'www.metzgerei-mueller.de';
w.oeffneLeadWebseite();
check('Adresse ohne Vorsatz bekommt https',
  geoeffnet.at(-1) === 'https://www.metzgerei-mueller.de');

// Gelesen wird aus dem Formular: wer gerade getippt und noch nicht gespeichert
// hat, landet trotzdem richtig.
webFeld.value = '  https://frisch-getippt.de  ';
w.oeffneLeadWebseite();
check('Noch nicht gespeicherte Eingabe zaehlt',
  geoeffnet.at(-1) === 'https://frisch-getippt.de');

webFeld.value = '';
w.oeffneLeadWebseite();
check('Ohne Webseite wird nach dem Firmennamen gesucht',
  geoeffnet.at(-1) === 'https://www.google.com/search?q=' + encodeURIComponent("Müller's Metzgerei"));

// Karte: dieselbe Reihenfolge wie in der Sprechblase am Kartenrand.
w.store.state.leads = [{ id: 9, name: 'Metzgerei', google_maps_url: 'https://maps.google.com/?cid=1' }];
w.oeffneLeadKarte(9);
check('Karte nimmt die hinterlegte Maps-Adresse', geoeffnet.at(-1) === 'https://maps.google.com/?cid=1');

w.store.state.leads = [{ id: 9, name: 'Metzgerei', google_place_id: 'ChIJ123' }];
w.oeffneLeadKarte(9);
check('Ohne Maps-Adresse zaehlt die Place-ID', geoeffnet.at(-1).endsWith('place_id:ChIJ123'));

w.store.state.leads = [{ id: 9, name: 'Metzgerei' }];
w.oeffneLeadKarte(9);
check('Ohne beides wird der Name gesucht', geoeffnet.at(-1).includes('/maps/search/'));

// ── Reihenfolge der Abschnitte: erst handeln, dann einordnen, dann verwalten ─
const karteQuelle = pipeSrc.slice(pipeSrc.indexOf('<!-- SCROLLABLE BODY -->'),
                            pipeSrc.indexOf('<!-- Hidden System Fields -->'));
const stelle = (t) => karteQuelle.indexOf(t);
const h4 = (t) => stelle('<h4 class="apple-section-title">' + t + '</h4>');
const folge = [
  ['Kontakt',            h4('Kontakt')],
  ['Standort',           h4('Standort')],
  ['Notizen',            h4('Notizen')],
  ['Aufgaben',           h4('Aufgaben')],
  ['Aktivitäten',        h4('Aktivitäten Historie')],
  ['Wiedervorlage',      stelle('${snoozeHtml}')],
  ['Wert',               h4('Wert')],
  ['Eigenschaften',      h4('Eigenschaften')],
  ['Verknüpfte Leads',   h4('Verknüpfte Leads')]
];
check('Testaufbau: alle Abschnitte der Karteikarte gefunden', folge.every(([, i]) => i > 0));
check('Reihenfolge der Karteikarte steht fest',
  folge.every(([, i], k) => k === 0 || i > folge[k - 1][1]));

const kontaktBlock = karteQuelle.slice(h4('Kontakt'), h4('Standort'));
check('Im Kontakt stehen Telefon und E-Mail',
  ['sys-phone', 'sys-email'].every(id => kontaktBlock.includes('id="' + id + '"')));
// Die Webadresse hat keine eigene Zeile mehr — sie steckt im Formular und
// haengt an den beiden Links unter dem Standort.
check('Keine Webseiten-Zeile im Kontakt', !kontaktBlock.includes('id="sys-web"'));
check('Das Webfeld bleibt im Formular — sonst schreibt das Speichern es leer',
  pipeSrc.includes('type="hidden" id="sys-web"'));

const standortBlock = karteQuelle.slice(h4('Standort'), h4('Notizen'));
// Die Adresse ist selbst der Link — sie wird in locListHtml gebaut.
check('Standort zeigt die Adressliste', standortBlock.includes('${locListHtml}'));
check('Die Adresse führt zur Karte in der Anwendung, nicht nach draußen',
  pipeSrc.includes('class="standort-adresse" onclick="window.flyToMap('));
// Unter der Adresse stehen zwei Wege nach draussen — mehr nicht.
check('Webseite und Google Maps stehen als zwei Links unter dem Standort',
  standortBlock.includes('oeffneLeadWebseite()') && standortBlock.includes('oeffneLeadKarte(')
  && (standortBlock.match(/class="standort-link"/g) || []).length === 2);

// Der Kasten hat sich selbst verdoppelt: die Ueberschrift stand zweimal da.
// Seit 24.09.2026 baut modules/wiedervorlage.js den Kasten.
const wvSrc = fs.readFileSync('public/modules/wiedervorlage.js', 'utf8');
check('Wiedervorlage steht genau einmal in ihrem Kasten',
  (pipeSrc.match(/apple-section-title">Wiedervorlage</g) || []).length === 0
  && (wvSrc.match(/apple-section-title">Wiedervorlage</g) || []).length === 1);

// ── 28. Handverteilte Cache-Marker muessen mitwachsen ──────────────────────
// Dateien aus public/ werden unveraendert ausgeliefert; ihr ?v=-Anhaengsel ist
// das Einzige, was den Browser zum Nachladen bewegt. Wer eine davon aendert und
// den Marker vergisst, liefert stillschweigend die alte Datei aus.
//
// Real passiert: 9c8e036 aenderte public/ui/pipeline_ui.js, der Marker blieb
// auf 4.7 stehen.
//
// NICHT betroffen ist die Modulkette (type="module"): die buendelt Vite mit
// Inhalts-Hash im Dateinamen.
//
// Nach einer Aenderung: Marker in index.html hochzaehlen, dann
//   node tests/marker-aktualisieren.mjs
const { marker: markerStand, hashVon: markerHash } = await import('./marker-lib.mjs');
const markerSoll = JSON.parse(fs.readFileSync('tests/cache-marker.json', 'utf8'));
const markerIst = markerStand();

check('Testaufbau: Marker in index.html gefunden', Object.keys(markerIst).length >= 10);

for (const [pfad, { marker: m, quelle }] of Object.entries(markerIst)) {
  const hinterlegt = markerSoll[pfad];
  if (!hinterlegt) {
    check(`Marker fuer ${pfad} ist hinterlegt`, false);
    continue;
  }
  const jetzt = markerHash(quelle);
  const geaendert = jetzt !== hinterlegt.hash;
  const markerNeu = m !== hinterlegt.marker;
  // Geaendert ohne neuen Marker -> der Browser bekommt die alte Datei.
  check(`${pfad}: Marker passt zum Inhalt`, !geaendert || markerNeu);
}

const verwaist = Object.keys(markerSoll).filter(p => !markerIst[p]);
check('Keine verwaisten Eintraege in cache-marker.json', verwaist.length === 0);

console.log('\n✅ BESTANDEN (' + ok.length + ')');
ok.forEach(t => console.log('   ' + t));
if (fail.length) {
  console.log('\n❌ FEHLGESCHLAGEN (' + fail.length + ')');
  fail.forEach(t => console.log('   ' + t));
  process.exit(1);
}
console.log('\nAlle Prüfungen bestanden.');
