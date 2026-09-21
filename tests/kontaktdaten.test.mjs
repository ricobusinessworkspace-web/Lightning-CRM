/**
 * Prueft das Lesen von Kontaktdaten aus Webseiten — ohne Netz, mit Seiten,
 * die genauso aussehen wie die echten Faelle aus dem Bestand.
 *
 * Jeder Fall hier ist mindestens einmal wirklich passiert: die Adresse der
 * Werbeagentur aus der Fusszeile, der Platzhalter aus einer Formularvorlage,
 * die Faxnummer statt der Telefonnummer, das Impressum hinter Cloudflare.
 */
import fs from 'fs';
import { JSDOM } from 'jsdom';

const quelle = fs.readFileSync('public/modules/kontaktdaten.js', 'utf8');
const mod = { exports: {} };
new Function('module', 'window', quelle)(mod, undefined);
const K = mod.exports;

const ok = [];
const fail = [];
const check = (name, cond) => (cond ? ok : fail).push(name);

const email = (html, opt) => {
  const treffer = K.besteEmail(K.emailKandidaten(html, { mitSkripten: !!(opt && opt.mitSkripten) }), opt || {});
  return treffer ? treffer.adresse : null;
};
const telefon = (html) => {
  const t = K.besteTelefonnummer(K.telefonKandidaten(html));
  return t ? t.nummer : null;
};

// ── 1. Welche Adresse gewinnt ──────────────────────────────────────────────
const impressum = `
  <html><body>
    <h1>Impressum</h1>
    <p>Metzgerei Müller GmbH, Hauptstraße 12, 01067 Dresden</p>
    <p>Telefon: 0351 4135690 · Fax: 0351 4135699</p>
    <p>E-Mail: <a href="mailto:info@metzgerei-mueller.de">info@metzgerei-mueller.de</a></p>
    <p>Geschäftsführer: Karl Müller, <a href="mailto:k.mueller@metzgerei-mueller.de">k.mueller@metzgerei-mueller.de</a></p>
    <p>Datenschutzbeauftragter: datenschutz@metzgerei-mueller.de</p>
    <footer>Umsetzung: <a href="mailto:hallo@webdesign-schmidt.de">webdesign-schmidt.de</a></footer>
  </body></html>`;
const opt = { webseite: 'https://www.metzgerei-mueller.de/impressum', chef: 'Karl Müller' };

check('Adresse der Geschäftsführung schlägt info@', email(impressum, opt) === 'k.mueller@metzgerei-mueller.de');
check('Agentur aus der Fußzeile wird verworfen',
  K.besteEmail(K.emailKandidaten(impressum), opt).domain !== 'webdesign-schmidt.de');

const ohneChef = impressum.replace(/<p>Geschäftsführer[\s\S]*?<\/p>/, '');
check('Ohne persönliche Adresse gewinnt info@', email(ohneChef, opt) === 'info@metzgerei-mueller.de');

const nurVerwaltung = `<html><body>
  <p>webmaster@metzgerei-mueller.de</p>
  <p>datenschutz@metzgerei-mueller.de</p>
  <p>bestellung@metzgerei-mueller.de</p></body></html>`;
check('Fachadresse schlägt Verwaltungsadresse',
  email(nurVerwaltung, opt) === 'bestellung@metzgerei-mueller.de');

// Deutsche Kleinbetriebe nutzen massenhaft Freemail — das ist die richtige
// Adresse, nicht die Ausnahme.
const freemail = `<html><body><p>Kontakt: <a href="mailto:broilerbar@t-online.de">schreiben</a></p></body></html>`;
check('Freemail zählt, wenn es keine eigene Domain gibt',
  email(freemail, { webseite: 'http://www.broilerbar.de/' }) === 'broilerbar@t-online.de');

const beides = `<html><body>
  <p>privat: chef-privat@gmx.de</p>
  <p>Firma: <a href="mailto:info@broilerbar.de">info@broilerbar.de</a></p></body></html>`;
check('Eigene Domain schlägt Freemail',
  email(beides, { webseite: 'http://www.broilerbar.de/' }) === 'info@broilerbar.de');

// ── 2. Was keine Adresse ist ───────────────────────────────────────────────
check('Platzhalter aus Formularvorlagen zählt nicht',
  email('<html><body><input placeholder="beispiel@gmail.com"><p>beispiel@gmail.com</p></body></html>',
        { webseite: 'https://rollercoaster-dresden.de/' }) === null);
check('Bilddatei ist keine Adresse',
  email('<html><body><img src="logo@2x.png"><p>logo@2x.png</p></body></html>', opt) === null);
check('Adresse im Skriptblock bleibt zunächst liegen',
  email('<html><body><script>var m="info@metzgerei-mueller.de";</script></body></html>', opt) === null);
check('… wird aber gefunden, wenn sonst nichts da ist',
  email('<html><body><script>var m="info@metzgerei-mueller.de";</script></body></html>',
        { ...opt, mitSkripten: true }) === 'info@metzgerei-mueller.de');

// ── 3. Verschleierte Adressen ──────────────────────────────────────────────
check('info(at)domain.de wird gelesen',
  email('<html><body><p>info(at)metzgerei-mueller.de</p></body></html>', opt) === 'info@metzgerei-mueller.de');
check('&#64; wird gelesen',
  email('<html><body><p>info&#64;metzgerei-mueller.de</p></body></html>', opt) === 'info@metzgerei-mueller.de');
// Cloudflare: erstes Byte ist der Schlüssel, der Rest ist XOR-verschlüsselt.
const cf = (adresse) => {
  const s = 0x2a;
  let hex = s.toString(16).padStart(2, '0');
  for (const z of adresse) hex += (z.charCodeAt(0) ^ s).toString(16).padStart(2, '0');
  return hex;
};
check('Von Cloudflare verschleierte Adresse wird entschlüsselt',
  email(`<html><body><a href="/cdn-cgi/l/email-protection" data-cfemail="${cf('info@metzgerei-mueller.de')}">E-Mail</a></body></html>`, opt)
  === 'info@metzgerei-mueller.de');

// ── 4. Telefon ─────────────────────────────────────────────────────────────
check('Telefon aus dem Impressum, nicht die Faxnummer', telefon(impressum) === '03514135690');
check('tel:-Verweis schlägt Fließtext',
  telefon('<html><body><p>Fax 0351 111111</p><a href="tel:+493514135690">anrufen</a></body></html>') === '03514135690');
check('00 49 (0)3 51 / 21 52 00 40 wird zur deutschen Form',
  K.nummerNormalisieren('00 49 (0)3 51 / 21 52 00 40') === '035121520040');
check('+49 (0)351 4135690 wird zur deutschen Form',
  K.nummerNormalisieren('+49 (0)351 4135690') === '03514135690');
check('0351/21 52 00-60 bleibt erhalten',
  K.nummerNormalisieren('0351/21 52 00-60') === '035121520060');
check('Ausländische Nummer wird nicht übernommen',
  K.nummerNormalisieren('+43 1 5811234') === null);
check('Zu kurze Zahlenfolge ist keine Nummer', K.nummerNormalisieren('0351 123') === null);
check('Jahreszahl ist keine Nummer', K.nummerNormalisieren('2026') === null);

// ── 5. Unterseiten ─────────────────────────────────────────────────────────
const startseite = `<html><body>
  <a href="/ueber-uns">Über uns</a>
  <a href="/kontakt">Kontakt</a>
  <a href="/impressum">Impressum</a>
  <a href="https://facebook.com/impressum">Facebook</a>
</body></html>`;
const unter = K.impressumLinks(startseite, 'https://www.metzgerei-mueller.de/', 3);
check('Impressum wird zuerst gelesen', unter[0] === 'https://www.metzgerei-mueller.de/impressum');
check('Kontakt kommt vor "Über uns"', unter[1] === 'https://www.metzgerei-mueller.de/kontakt');
check('Verweise auf fremde Seiten werden nicht verfolgt',
  unter.every(u => u.indexOf('facebook') === -1));

// ── 6. Plattformen ─────────────────────────────────────────────────────────
check('Linktree ist eine Plattform', K.istPlattform('https://linktr.ee/mamahaus_restaurant') === true);
check('Facebook-Unterseite ist eine Plattform', K.istPlattform('https://de-de.facebook.com/ARBIL-431417460352781/') === true);
check('speisekarte.de ist eine Plattform', K.istPlattform('https://www.speisekarte.de/dresden/restaurant/azizi') === true);
check('Eigene Webseite ist keine Plattform', K.istPlattform('https://www.metzgerei-mueller.de/') === false);

// ── 7. Der ganze Vorgang ───────────────────────────────────────────────────
const seiten = {
  'https://www.metzgerei-mueller.de/': { ok: true, text: startseite + '<p>Willkommen bei der Metzgerei Müller</p>'.repeat(20) },
  'https://www.metzgerei-mueller.de/impressum': { ok: true, text: impressum + ' '.repeat(300) },
  'https://www.metzgerei-mueller.de/kontakt': { ok: true, text: '<html><body>' + 'Kontaktformular '.repeat(40) + '</body></html>' }
};
const hole = async (url) => seiten[url] || { ok: false, status: 404, text: '' };

const lauf = await K.holeKontaktdaten('https://www.metzgerei-mueller.de/', hole, { chef: 'Karl Müller' });
check('Ganzer Vorgang: Adresse der Geschäftsführung gefunden', lauf.email === 'k.mueller@metzgerei-mueller.de');
check('Ganzer Vorgang: Adresse stammt aus dem Impressum', /impressum/.test(lauf.emailSeite || ''));
check('Ganzer Vorgang: Telefonnummer gefunden', lauf.telefon === '03514135690');
check('Ganzer Vorgang: höchstens drei Seiten geholt', lauf.seiten.length <= 3);

const plattform = await K.holeKontaktdaten('https://linktr.ee/mamahaus', hole, {});
check('Plattform wird gar nicht erst gelesen', plattform.grund === 'plattform' && plattform.seiten.length === 0);

const abweisend = async () => ({ ok: false, status: 403, text: '' });
const blockiert = await K.holeKontaktdaten('https://punjab-palace-hoyerswerda.de/', abweisend, {});
check('Abweisende Seite wird als solche gemeldet', blockiert.grund === 'nicht-erreichbar');

let versuche = [];
const nurWww = async (url) => {
  versuche.push(url);
  return url.indexOf('://www.') !== -1
    ? { ok: true, text: '<html><body>' + 'Text '.repeat(80) + '<a href="mailto:info@herzogs-lohsa.de">Mail</a></body></html>' }
    : { ok: false, status: 503, text: '' };
};
const zweiterVersuch = await K.holeKontaktdaten('https://herzogs-lohsa.de/', nurWww, {});
check('Zweiter Versuch mit www., wenn der erste scheitert',
  zweiterVersuch.email === 'info@herzogs-lohsa.de' && versuche.some(u => u.indexOf('://www.') !== -1));

// ── 7b. Firmenname und Geschäftsführung aus dem Impressum ──────────────────
// Ein Impressum ist zeilenweise aufgebaut. Wer im Fließtext sucht, zieht den
// halben Satz davor mit — genau das ist beim ersten Versuch passiert
// ("Impressum FMK … GmbH", Geschäftsführer "Dipl").
const fa = (html) => K.firmenAngaben(html);

check('Firmenname und Geschäftsführung aus einem echten Impressum',
  JSON.stringify(fa('<h1>Impressum</h1><p>FMK Feinblech- und Metall-Sonderkonstruktion GmbH<br>Sachsenwerkstraße 83</p><p>Geschäftsführer: B.Eng. Knut Lange</p>'))
  === JSON.stringify({ legal_company_name: 'FMK Feinblech- und Metall-Sonderkonstruktion GmbH', director_name: 'Knut Lange' }));
check('Inhaber mit Doppelnamen', fa('<p>Bäckerei Schmidt e.K.</p><p>Inhaber: Maria Schmidt-Berger</p>').director_name === 'Maria Schmidt-Berger');
check('UG (haftungsbeschränkt) ist ein Firmenname, kein Haftungssatz',
  fa('<div>Muster Handels UG (haftungsbeschränkt)</div>').legal_company_name === 'Muster Handels UG (haftungsbeschränkt)');
check('Vorstand zählt wie Geschäftsführung',
  fa('<p>SC Borea Dresden e. V.</p><p>Vorstand: Thomas Neumann</p>').director_name === 'Thomas Neumann');
check('Ein Satz mit GmbH ist kein Firmenname',
  fa('<p>Die Muster GmbH haftet nicht für Inhalte externer Seiten.</p>').legal_company_name === null);
check('Fußzeile mit © ist kein Firmenname',
  fa('<p>© 2024 IMD Dresden GmbH</p>').legal_company_name === null);
check('Titel allein ist kein Name',
  fa('<p>Geschäftsführer: Dipl.-Ing.</p>').director_name === null);
check('Steuernummer ist kein Firmenname',
  fa('<p>Gesellschaft: Steuer-Nr : 202/106/00000 GbR</p>').legal_company_name === null);
check('Nicht Gefundenes ist null, nicht leerer Text',
  fa('<p>Nur Text</p>').legal_company_name === null && fa('<p>Nur Text</p>').director_name === null);

// Der ganze Vorgang liefert die Angaben mit.
const impressumSeiten = {
  'https://www.fmk.de/': { ok: true, text: '<a href="/impressum">Impressum</a>' + 'Willkommen '.repeat(40) },
  'https://www.fmk.de/impressum': { ok: true, text: '<p>FMK Feinblech GmbH</p><p>Geschäftsführer: Knut Lange</p><p><a href="mailto:info@fmk.de">info@fmk.de</a></p>' + ' '.repeat(300) }
};
const mitAngaben = await K.holeKontaktdaten('https://www.fmk.de/', async (u) => impressumSeiten[u] || { ok: false, status: 404, text: '' }, {});
check('Ganzer Vorgang: Firmenname kommt mit', mitAngaben.legal_company_name === 'FMK Feinblech GmbH');
check('Ganzer Vorgang: Geschäftsführung kommt mit', mitAngaben.director_name === 'Knut Lange');

// ── 8. Nachtragen schreibt nur in leere Felder ─────────────────────────────
// Die wichtigste Zusage des Werkzeugs: was im CRM steht, hat jemand dort
// hingeschrieben — ein Fund aus dem Netz ueberschreibt das nie.
const dom = new JSDOM('<!doctype html><html><body></body></html>', { runScripts: 'outside-only' });
const w = dom.window;
w.api = { getLeads: async () => [] };
w.leadStore = { save: async () => true };
w.showToast = () => {};
w.Kontaktdaten = K;
dom.window.eval(fs.readFileSync('public/modules/backfill.js', 'utf8'));

check('Testaufbau: Nachtragen ist geladen', typeof w.nachtragFelder === 'function');

const leer_ = { id: 1, email: '', phone: '', website_url: 'https://a.de' };
const halb = { id: 2, email: '', phone: '0351 123456', website_url: 'https://b.de' };
const voll = { id: 3, email: 'alt@firma.de', phone: '0351 123456' };
const fund = { email: 'neu@firma.de', telefon: '03511234567' };

check('Leerer Lead bekommt beides',
  JSON.stringify(w.nachtragFelder(leer_, fund)) === JSON.stringify({ email: 'neu@firma.de', phone: '03511234567' }));
check('Vorhandene Telefonnummer bleibt stehen',
  JSON.stringify(w.nachtragFelder(halb, fund)) === JSON.stringify({ email: 'neu@firma.de' }));
check('Vollständiger Lead wird nicht angefasst',
  Object.keys(w.nachtragFelder(voll, fund)).length === 0);
check('Ohne Fund wird nichts geschrieben',
  Object.keys(w.nachtragFelder(leer_, { email: null, telefon: null })).length === 0);
check('Leerzeichen zählen nicht als Eintrag',
  JSON.stringify(w.nachtragFelder({ id: 4, email: '   ', phone: '' }, fund))
  === JSON.stringify({ email: 'neu@firma.de', phone: '03511234567' }));

const bestand = [
  { id: 1, email: '', phone: '' },
  { id: 2, email: 'da@firma.de', phone: '' },
  { id: 3, email: 'da@firma.de', phone: '0351 1' }
];
check('Betroffen ist jeder Lead mit einem leeren Feld',
  w.nachtragKandidaten(bestand).map(l => l.id).join(',') === '1,2');

// ── Ergebnis ───────────────────────────────────────────────────────────────
console.log('\n✅ BESTANDEN (' + ok.length + ')');
ok.forEach(t => console.log('   ' + t));
if (fail.length) {
  console.log('\n❌ FEHLGESCHLAGEN (' + fail.length + ')');
  fail.forEach(t => console.log('   ' + t));
  process.exit(1);
}
console.log('\nAlle Prüfungen bestanden.');
