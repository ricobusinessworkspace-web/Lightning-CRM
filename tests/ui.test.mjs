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

console.log('\n✅ BESTANDEN (' + ok.length + ')');
ok.forEach(t => console.log('   ' + t));
if (fail.length) {
  console.log('\n❌ FEHLGESCHLAGEN (' + fail.length + ')');
  fail.forEach(t => console.log('   ' + t));
  process.exit(1);
}
console.log('\nAlle Prüfungen bestanden.');
