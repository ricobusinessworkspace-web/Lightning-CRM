// Schreibt tests/cache-marker.json auf den aktuellen Stand.
//
// Aufrufen, NACHDEM die Marker in index.html hochgezaehlt wurden — sonst
// zementiert man den Fehler, den Pruefung 28 finden soll.
//
//   node tests/marker-aktualisieren.mjs
import { marker, datei, hashVon } from './marker-lib.mjs';
import fs from 'fs';

const stand = {};
for (const [pfad, { marker: m, quelle }] of Object.entries(marker())) {
  stand[pfad] = { marker: m, hash: hashVon(quelle) };
}
fs.writeFileSync('tests/cache-marker.json', JSON.stringify(stand, null, 2) + '\n');
console.log(`${Object.keys(stand).length} Marker festgehalten.`);
