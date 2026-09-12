// Gemeinsame Logik fuer Pruefung 28 und das Aktualisieren der Marker.
//
// Betroffen sind NUR Dateien, die unveraendert aus public/ bzw. der Wurzel
// ausgeliefert werden. Die Modulkette (type="module") buendelt Vite mit
// Inhalts-Hash — dort waere ein Marker Arbeit ohne Wirkung.
import fs from 'fs';
import crypto from 'crypto';

export const hashVon = (pfad) =>
  crypto.createHash('sha256').update(fs.readFileSync(pfad)).digest('hex').slice(0, 16);

// URL-Pfad -> echte Datei. Vite serviert public/ unter /.
export const datei = (urlPfad) => {
  for (const kandidat of [`public/${urlPfad}`, urlPfad]) {
    if (fs.existsSync(kandidat) && fs.statSync(kandidat).isFile()) return kandidat;
  }
  return null;
};

export function marker() {
  const html = fs.readFileSync('index.html', 'utf8');
  const treffer = {};
  const muster = /<(script|link)\b([^>]*?)(?:src|href)="([^"?]+)\?v=([0-9.]+)"([^>]*)>/g;
  let m;
  while ((m = muster.exec(html)) !== null) {
    const [, , vor, urlPfad, version, nach] = m;
    // Module buendelt Vite selbst — kein Marker noetig.
    if (`${vor}${nach}`.includes('type="module"')) continue;
    const quelle = datei(urlPfad);
    if (!quelle) continue;                       // Bilder u. a. ohne Quelldatei
    if (!/\.(js|css)$/.test(quelle)) continue;   // nur Code und Stile
    treffer[urlPfad] = { marker: version, quelle };
  }
  return treffer;
}
