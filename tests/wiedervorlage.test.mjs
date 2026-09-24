/**
 * Wiedervorlage — die Rechnung hinter dem Drehrad.
 */
import fs from 'fs';
const quelle = fs.readFileSync('public/modules/wiedervorlage.js', 'utf8');
const mod = { exports: {} };
new Function('module', 'window', quelle)(mod, undefined);
const W = mod.exports;

const ok = [];
const fail = [];
const check = (name, cond) => (cond ? ok : fail).push(name);

const jetzt = new Date('2026-09-24T14:32:40').getTime();

// Dauer -> Zeitpunkt
check('0/0/0 setzt nichts', W.zielAusDauer(jetzt, {}) === null);
const z20 = W.zielAusDauer(jetzt, { minuten: 20 });
check('20 Min -> 14:53 (volle Minute)', new Date(z20).getHours() === 14 && new Date(z20).getMinutes() === 53 && z20 % 60000 === 0);
const z1t = W.zielAusDauer(jetzt, { tage: 1 });
check('1 Tag -> morgen gleiche Uhrzeit', new Date(z1t).getDate() === 25 && new Date(z1t).getHours() === 14);
// Zeitumstellung: 25.10.2026 endet die Sommerzeit. 1 Tag bleibt dieselbe Uhrzeit.
const vorUmstellung = new Date('2026-10-24T10:00:00').getTime();
check('1 Tag ueber die Zeitumstellung bleibt 10:00',
  new Date(W.zielAusDauer(vorUmstellung, { tage: 1 })).getHours() === 10);

// Datum -> 8:00
const zd = W.zielAusDatum('2026-09-29', jetzt);
check('Datum -> 8:00 an dem Tag', new Date(zd).getDate() === 29 && new Date(zd).getHours() === 8);
check('Heute nach 8:00 -> null', W.zielAusDatum('2026-09-24', jetzt) === null);
check('Unsinn -> null', W.zielAusDatum('29.09.2026', jetzt) === null);

// Texte
check('wann: heute', W.wann(z20, jetzt) === 'heute 14:53');
check('wann: morgen', W.wann(z1t, jetzt).startsWith('morgen '));
check('wann: Wochentag und Datum', W.wann(zd, jetzt) === 'Di, 29.09. 08:00');
check('in 20 Min — nicht 21', W.inText(z20, jetzt) === 'in 20 Min');
const jetzt2 = new Date('2026-09-24T14:32:10').getTime();
check('in 20 Min auch bei :10 Sekunden', W.inText(W.zielAusDauer(jetzt2, { minuten: 20 }), jetzt2) === 'in 20 Min');
check('Dauer: 2 Std 5 Min', W.dauer(125 * 60000) === '2 Std 5 Min');
check('Dauer: 3 Std glatt', W.dauer(180 * 60000) === '3 Std');
check('Dauer: 1 Tag 4 Std', W.dauer(28 * 3600000) === '1 Tag 4 Std');
check('Dauer: 3 Tage', W.dauer(72 * 3600000) === '3 Tage');
check('Rest: faellig', W.restText(jetzt - 1000, jetzt) === 'jetzt fällig');
check('Rest: noch 45 Min', W.restText(jetzt + 45 * 60000, jetzt) === 'noch 45 Min');

console.log(`${ok.length} bestanden, ${fail.length} fehlgeschlagen`);
if (fail.length) { fail.forEach(f => console.log('  FEHLER:', f)); process.exit(1); }
