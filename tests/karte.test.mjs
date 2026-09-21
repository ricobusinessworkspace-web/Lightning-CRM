/**
 * Landkarte — Rechenwege und die Regeln, die beim Filmen gelten.
 *
 * Die Karte ist die einzige Ansicht, die nach draussen geht (Videos).
 * Deshalb wird hier nicht nur gerechnet, sondern auch festgehalten, was dort
 * NICHT stehen darf: kein Kundenname, keine Adresse, keine Nummer — und kein
 * Aufruf an einen fremden Routendienst.
 */
import fs from 'fs';

const quelle = fs.readFileSync('public/modules/karte.js', 'utf8');
const mod = { exports: {} };
const fensterAttrappe = { store: { state: {} } };
new Function('module', 'window', quelle)(mod, fensterAttrappe);
const K = mod.exports;

const ok = [];
const fail = [];
const check = (name, cond) => (cond ? ok : fail).push(name);

// ── Entfernung und Fahrzeit ────────────────────────────────────────────────
const dresden = { lat: 51.0504, lng: 13.7372 };
const hoyerswerda = { lat: 51.4380, lng: 14.2377 };
const nebenan = { lat: 51.0554, lng: 13.7472 };

const km = K.luftlinieKm(dresden, hoyerswerda);
check('Dresden–Hoyerswerda sind rund 55 km Luftlinie', km > 50 && km < 60);
check('Derselbe Punkt ist null Kilometer weit', K.luftlinieKm(dresden, dresden) < 0.001);
check('Die Richtung spielt keine Rolle',
  Math.abs(K.luftlinieKm(dresden, hoyerswerda) - K.luftlinieKm(hoyerswerda, dresden)) < 0.001);

check('Kurze Strecke: wenige Minuten', K.fahrzeitMinuten(K.luftlinieKm(dresden, nebenan)) <= 5);
check('Lange Strecke: unter einer Stunde, aber deutlich mehr', K.fahrzeitMinuten(km) > 30 && K.fahrzeitMinuten(km) < 90);
check('Weiter heisst nie schneller', K.fahrzeitMinuten(30) >= K.fahrzeitMinuten(5));
check('Auch null Kilometer ergeben mindestens eine Minute', K.fahrzeitMinuten(0) >= 1);

// ── Die gezeichnete Strecke ────────────────────────────────────────────────
const weg = K.wegPunkte(dresden, hoyerswerda, 592);
check('Der Weg hat fünf Stützpunkte', weg.length === 5);
check('Er beginnt beim Spieler', weg[0][0] === dresden.lat && weg[0][1] === dresden.lng);
check('Er endet beim Lead', weg[4][0] === hoyerswerda.lat && weg[4][1] === hoyerswerda.lng);

// Rechte Winkel: jedes Stück haelt entweder den Breiten- oder den Längengrad.
let rechtwinklig = true;
for (let i = 1; i < weg.length; i++) {
  const gleicheLat = Math.abs(weg[i][0] - weg[i - 1][0]) < 1e-9;
  const gleicheLng = Math.abs(weg[i][1] - weg[i - 1][1]) < 1e-9;
  if (!gleicheLat && !gleicheLng) rechtwinklig = false;
}
check('Jedes Teilstück läuft gerade — das sieht aus wie Straßen', rechtwinklig);
check('Derselbe Lead bekommt immer denselben Weg',
  JSON.stringify(K.wegPunkte(dresden, hoyerswerda, 592)) === JSON.stringify(weg));
check('Ein anderer Lead bekommt einen anderen Knick',
  JSON.stringify(K.wegPunkte(dresden, hoyerswerda, 7)) !== JSON.stringify(weg));

// ── Stufen und Farben ──────────────────────────────────────────────────────
check('Alle fünf Pipeline-Stufen haben eine Farbe',
  ['COLD', 'PITCH', 'DATA', 'OFFER', 'CLOSED'].every(s => /^#[0-9a-f]{6}$/i.test(K.STUFEN[s].farbe)));

// ── Datenschutz: was auf der Karte nicht stehen darf ───────────────────────
const blipTeil = quelle.slice(quelle.indexOf('function blipSetzen'), quelle.indexOf('function blipsMarkieren'));
check('Der Blip trägt keinen Namen', !/lead\.name|l\.name/.test(blipTeil));
check('Der Blip trägt keine Adresse', !/maps_city|address/.test(blipTeil));
check('Der Blip trägt keine Telefonnummer', !/phone/.test(blipTeil));
check('Kein title-Attribut am Marker — der Browser würde es als Tooltip zeigen',
  !/title:/.test(blipTeil));

const blipIconTeil = quelle.slice(quelle.indexOf('function blipIcon'), quelle.indexOf('function blipSetzen'));
check('Das Blip-Symbol enthält nur Farbe und Form', !/name|phone|address/.test(blipIconTeil));

const hoverTeil = quelle.slice(quelle.indexOf('function hudBlipZeigen'), quelle.indexOf('// ── Öffentliche Wege'));
check('Der Name erscheint nur mit ausdrücklichem Schalter',
  /namenZeigen\(\)\s*&&\s*lead\.name/.test(hoverTeil));
check('Namen zeigen ist standardmäßig aus',
  /localStorage\.getItem\(SCHALTER\) === '1'/.test(quelle));

// Kein fremder Routendienst — sonst wandern Standort und Lead-Koordinaten raus.
const DIENSTE = ['osrm', 'mapbox', 'graphhopper', 'openrouteservice', 'google.com/maps/dir', 'here.com', 'tomtom'];
check('Kein Aufruf an einen fremden Routendienst',
  DIENSTE.every(d => quelle.toLowerCase().indexOf(d) === -1));
check('Die Fahrzeit ist als Schätzung ausgewiesen',
  quelle.includes("'ca. '") && quelle.includes('geschätzt'));
check('Der eigene Standort wird nur lokal geholt',
  quelle.includes('navigator.geolocation.getCurrentPosition') && !/fetch\(/.test(quelle));

console.log('\n✅ BESTANDEN (' + ok.length + ')');
ok.forEach(t => console.log('   ' + t));
if (fail.length) {
  console.log('\n❌ FEHLGESCHLAGEN (' + fail.length + ')');
  fail.forEach(t => console.log('   ' + t));
  process.exit(1);
}
console.log('\nAlle Prüfungen bestanden.');
