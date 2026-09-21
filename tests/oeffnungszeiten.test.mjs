/**
 * Öffnungszeiten — mit den Zeilen, die wirklich in der Datenbank stehen.
 * Alle Beispiele sind echte Werte aus crm_leads.locations.
 */
import fs from 'fs';
const quelle = fs.readFileSync('public/modules/oeffnungszeiten.js', 'utf8');
const mod = { exports: {} };
new Function('module', 'window', quelle)(mod, undefined);
const O = mod.exports;

const ok = [];
const fail = [];
const check = (name, cond) => (cond ? ok : fail).push(name);

// Lead 8 (FMK Feinblech): englische Zeiten am Standort, nicht am Lead.
const fmk = { locations: [{ address: 'Sachsenwerkstraße 83', opening_hours: [
  'Monday: 6:30 AM – 4:00 PM', 'Tuesday: 6:30 AM – 4:00 PM', 'Wednesday: 6:30 AM – 4:00 PM',
  'Thursday: 6:30 AM – 4:00 PM', 'Friday: 6:30 AM – 2:30 PM', 'Saturday: Closed', 'Sunday: Closed'
] }] };
// Lead 7 (VfB Hellerau): "4:00 – 9:00 PM" — vorne fehlt die Tageshaelfte.
const vfb = { locations: [{ opening_hours: [
  'Monday: Closed', 'Tuesday: 4:00 – 9:00 PM', 'Wednesday: Closed', 'Thursday: 4:00 – 9:00 PM',
  'Friday: 4:00 – 9:00 PM', 'Saturday: 11:00 AM – 9:00 PM', 'Sunday: 11:00 AM – 4:00 PM'
] }] };
// Gastronomie: ueber Mitternacht offen.
const spaet = { opening_hours: JSON.stringify({ weekdayDescriptions: [
  'Monday: 11:00 AM – 2:00 AM', 'Tuesday: 11:00 AM – 2:00 AM', 'Wednesday: 11:00 AM – 2:00 AM',
  'Thursday: 11:00 AM – 2:00 AM', 'Friday: 11:00 AM – 3:00 AM', 'Saturday: 11:00 AM – 3:00 AM',
  'Sunday: 11:00 AM – 2:00 AM'
] }) };
// Mittagspause: zwei Zeitraeume an einem Tag.
const pause = { locations: [{ opening_hours: [
  'Monday: 9:00 AM – 12:00 PM, 2:00 – 6:00 PM', 'Tuesday: Closed', 'Wednesday: Closed',
  'Thursday: Closed', 'Friday: Closed', 'Saturday: Closed', 'Sunday: Closed'
] }] };
const deutsch = { locations: [{ opening_hours: [
  'Montag: 08:00–18:00', 'Dienstag: Geschlossen', 'Mittwoch: 08:00–18:00',
  'Donnerstag: 08:00–18:00', 'Freitag: 08:00–18:00', 'Samstag: Geschlossen', 'Sonntag: Geschlossen'
] }] };
const rundUmDieUhr = { locations: [{ opening_hours: Array(7).fill('Monday: Open 24 hours') }] };
const ohne = { locations: [{ address: 'Irgendwo' }] };

// Ein Montag, 09:00 Uhr.
const montag9 = new Date('2026-09-21T09:00:00');
const montag17 = new Date('2026-09-21T17:00:00');
const dienstag17 = new Date('2026-09-22T17:00:00');
const dienstag12 = new Date('2026-09-22T12:00:00');
const dienstag1 = new Date('2026-09-22T01:00:00');   // nachts nach Montag

check('Testaufbau: der 21.09.2026 ist ein Montag', montag9.getDay() === 1);

// ── Der Fehler, der gemeldet wurde ────────────────────────────────────────
check('6:30 AM – 4:00 PM ist um 9 Uhr offen', O.zustand(fmk, montag9).offen === true);
check('… und sagt, bis wann', O.zustand(fmk, montag9).text === 'Offen bis 16:00');
check('6:30 AM – 4:00 PM ist um 17 Uhr zu', O.zustand(fmk, montag17).offen === false);
check('Samstag Closed wird als geschlossen erkannt',
  O.zustand(fmk, new Date('2026-09-26T12:00:00')).text === 'Heute geschlossen');

// ── "4:00 – 9:00 PM": die halbe Angabe ────────────────────────────────────
check('4:00 – 9:00 PM meint 16 bis 21 Uhr', O.zustand(vfb, dienstag17).offen === true);
check('… und ist um 12 Uhr noch zu', O.zustand(vfb, dienstag12).offen === false);
check('… und nennt die Öffnungszeit', O.zustand(vfb, dienstag12).text === 'Öffnet 16:00');
check('11:00 AM – 2:00 PM meint 11 bis 14 Uhr',
  JSON.stringify(O.zeitraeume('11:00 AM – 2:00 PM')) === JSON.stringify([{ von: 660, bis: 840 }]));

// ── Über Mitternacht ──────────────────────────────────────────────────────
check('Bis 2 Uhr nachts gilt noch der Vortag', O.zustand(spaet, dienstag1).offen === true);
check('… und zeigt das Ende an', O.zustand(spaet, dienstag1).text === 'Offen bis 02:00');
check('Um 9 Uhr morgens ist dann zu', O.zustand(spaet, montag9).offen === false);

// ── Mittagspause ──────────────────────────────────────────────────────────
check('Zwei Zeiträume an einem Tag werden beide gelesen', O.zeitraeume('9:00 AM – 12:00 PM, 2:00 – 6:00 PM').length === 2);
check('In der Mittagspause ist zu', O.zustand(pause, new Date('2026-09-21T13:00:00')).offen === false);
check('… und die Öffnung danach steht dran', O.zustand(pause, new Date('2026-09-21T13:00:00')).text === 'Öffnet 14:00');
check('Nachmittags ist wieder offen', O.zustand(pause, new Date('2026-09-21T15:00:00')).offen === true);

// ── Deutsche Schreibweise und Sonderfälle ─────────────────────────────────
check('Deutsche 24-Stunden-Zeiten werden gelesen', O.zustand(deutsch, montag9).offen === true);
check('"Geschlossen" wird erkannt', O.zustand(deutsch, dienstag17).text === 'Heute geschlossen');
check('Rund um die Uhr ist immer offen', O.zustand(rundUmDieUhr, dienstag1).offen === true);
check('Ohne hinterlegte Zeiten wird nichts behauptet', O.zustand(ohne, montag9).offen === null);
check('Ohne Zeiten gibt es auch keinen Text', O.zustand(ohne, montag9).text === null);

// ── Zeilen finden ─────────────────────────────────────────────────────────
check('Zeiten am Standort werden gefunden', (O.zeilen(fmk) || []).length === 7);
check('Zeiten als JSON-Text am Lead werden gefunden', (O.zeilen(spaet) || []).length === 7);
check('Tagesname wird abgeschnitten', O.zeileFuerTag(fmk, 0) === '6:30 AM – 4:00 PM');
check('Heute-Zeile ist lesbar', O.heuteText(fmk, montag9) === 'Montag: 06:30 – 16:00');
check('Die Woche kommt in sieben Zeilen', (O.wocheText(fmk) || []).length === 7);
check('Freitag endet früher', O.wocheText(fmk)[4].zeit === '06:30 – 14:30');

console.log('\n✅ BESTANDEN (' + ok.length + ')');
ok.forEach(t => console.log('   ' + t));
if (fail.length) {
  console.log('\n❌ FEHLGESCHLAGEN (' + fail.length + ')');
  fail.forEach(t => console.log('   ' + t));
  process.exit(1);
}
console.log('\nAlle Prüfungen bestanden.');
