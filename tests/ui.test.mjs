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

const code = fs.readFileSync('public/ui/main_ui.js', 'utf8');
dom.window.eval(code);

// _autoSaveNow / _triggerAutoSave liegen in pipeline_ui.js — nur diesen Teil laden
const pipeSrc = fs.readFileSync('public/ui/pipeline_ui.js', 'utf8');
const autoSaveBlock = pipeSrc.slice(pipeSrc.indexOf('window.patchLeadCard = (leadId) => {'));
dom.window.eval(autoSaveBlock.slice(0, autoSaveBlock.indexOf('window._debouncedSave();') + 30));

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

console.log('\n✅ BESTANDEN (' + ok.length + ')');
ok.forEach(t => console.log('   ' + t));
if (fail.length) {
  console.log('\n❌ FEHLGESCHLAGEN (' + fail.length + ')');
  fail.forEach(t => console.log('   ' + t));
  process.exit(1);
}
console.log('\nAlle Prüfungen bestanden.');
