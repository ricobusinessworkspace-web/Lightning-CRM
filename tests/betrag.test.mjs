/**
 * Betrag und Abschlussdatum lesen — die Faelle, an denen Werte verloren gingen.
 */
import fs from 'fs';
const quelle = fs.readFileSync('public/modules/betrag.js', 'utf8');
const mod = { exports: {} };
new Function('module', 'window', quelle)(mod, undefined);
const B = mod.exports;

const ok = [];
const fail = [];
const check = (name, cond) => (cond ? ok : fail).push(name);

// Leer heisst NULL, nicht 0
check('leer -> null', B.leseBetrag('') === null);
check('nur Leerzeichen -> null', B.leseBetrag('   ') === null);
check('0 bleibt 0', B.leseBetrag('0') === 0);

// Deutsche Schreibweisen
check('1500', B.leseBetrag('1500') === 1500);
check('1500,50', B.leseBetrag('1500,50') === 1500.5);
check('1.500 ist Tausenderpunkt', B.leseBetrag('1.500') === 1500);
check('12.000', B.leseBetrag('12.000') === 12000);
check('1.500,50 (frueher NaN -> geleert)', B.leseBetrag('1.500,50') === 1500.5);
check('1.234.567,89', B.leseBetrag('1.234.567,89') === 1234567.89);
check('mit Euro-Zeichen', B.leseBetrag('1.500 €') === 1500);

// Englische Schreibweise und Rundreise aus der Anzeige
check('1,500.50', B.leseBetrag('1,500.50') === 1500.5);
check('1500.5 (so zeigt das Feld den gespeicherten Wert)', B.leseBetrag('1500.5') === 1500.5);
check('847.25', B.leseBetrag('847.25') === 847.25);

// Unlesbares wird NICHT gespeichert
check('Text -> undefined', B.leseBetrag('abc') === undefined);
check('1,2,3 -> undefined', B.leseBetrag('1,2,3') === undefined);
check('1..5 -> undefined', B.leseBetrag('1..5') === undefined);

// Datum: Rundreise ueber den Tag, mittags gespeichert
const ms = B.ausTag('2026-09-23');
check('ausTag mittags', new Date(ms).getHours() === 12);
check('alsTag(ausTag(x)) === x', B.alsTag(ms) === '2026-09-23');
check('leerer Tag -> null', B.ausTag('') === null);
check('alsTag(null) -> leer', B.alsTag(null) === '');
check('Uhrzeit egal, Tag gleich', B.alsTag(new Date('2026-09-23T17:45:00').getTime()) === '2026-09-23');

console.log(`${ok.length} bestanden, ${fail.length} fehlgeschlagen`);
if (fail.length) { fail.forEach(f => console.log('  FEHLER:', f)); process.exit(1); }
