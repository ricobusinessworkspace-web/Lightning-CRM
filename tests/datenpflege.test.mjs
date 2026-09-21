/**
 * Datenpflege — die Regeln, die verhindern, dass Felder "halb gefüllt" sind.
 *
 * Vor dem 21.09.2026 stand in crm_leads bei 243 von 243 Leads ein Leerstring
 * statt NULL in email, impressum_phone, legal_company_name, director_name und
 * phone_source. Ursache war der Insert-Pfad in core/db.js (`?? ''`). Jede
 * Abfrage mit "is not null" lieferte deshalb alle Zeilen zurück.
 */
import fs from 'fs';

const dbQuelle = fs.readFileSync('core/db.js', 'utf8');
const stueck = (von, bis) => {
  const a = dbQuelle.indexOf(von);
  if (a === -1) throw new Error(`Testaufbau: "${von}" steht nicht mehr in core/db.js`);
  const b = dbQuelle.indexOf(bis, a);
  if (b === -1) throw new Error(`Testaufbau: "${bis}" steht nicht mehr in core/db.js`);
  return dbQuelle.slice(a, b);
};

// Die drei reinen Funktionen aus der Datenschicht holen — ohne Supabase.
const code = stueck('function leerZuNull(', '// ─── Internal: JS Post-Processing')
           + stueck('export function vergleicheLeads(', '\n}\n').replace('export ', '') + '\n}\n';
const { leerZuNull, domainAus, vergleicheLeads } =
  new Function(code + '; return { leerZuNull, domainAus, vergleicheLeads };')();

const ok = [];
const fail = [];
const check = (name, cond) => (cond ? ok : fail).push(name);

// ── Leerer Text ist kein Wert ──────────────────────────────────────────────
check('Leerstring wird NULL', leerZuNull('') === null);
check('Nur Leerzeichen wird NULL', leerZuNull('   ') === null);
check('null bleibt NULL', leerZuNull(null) === null);
check('undefined wird NULL', leerZuNull(undefined) === null);
check('Text bleibt Text', leerZuNull('info@firma.de') === 'info@firma.de');
check('Text wird beschnitten', leerZuNull('  info@firma.de  ') === 'info@firma.de');

// ── Domain aus der Webadresse ──────────────────────────────────────────────
check('Beispiel aus der Aufgabe',
  domainAus('https://www.Muster-GmbH.de/kontakt') === 'muster-gmbh.de');
check('Ohne Protokoll', domainAus('www.bar.de/x?y=1') === 'bar.de');
check('Mit Port', domainAus('http://shop.beispiel.de:8080/a') === 'shop.beispiel.de');
check('Unterdomain bleibt erhalten', domainAus('https://speisekarte.metzger.de') === 'speisekarte.metzger.de');
check('Grossschreibung faellt weg', domainAus('HTTPS://WWW.LAUT.DE') === 'laut.de');
check('Leere Adresse ergibt NULL', domainAus('') === null);
check('Fehlende Adresse ergibt NULL', domainAus(null) === null);
check('Plattform wird normal normalisiert', domainAus('https://linktr.ee/abc') === 'linktr.ee');

// ── Der Insert-Pfad schreibt keine Leerstrings mehr ────────────────────────
const einfuegen = stueck('      payload = {', '      if (lead.claimed_by !== undefined)');
['email', 'impressum_phone', 'legal_company_name', 'director_name', 'phone_source', 'website_url']
  .forEach(feld => {
    const zeile = einfuegen.split('\n').find(z => z.trim().startsWith(feld + ':'));
    check(`${feld} wird beim Anlegen nicht auf '' gesetzt`, !!zeile && !zeile.includes("?? ''"));
  });
check('company_domain wird beim Anlegen mitgeschrieben', einfuegen.includes('company_domain:'));

// Und beim Ändern zieht die Domain mit.
const aendern = stueck('    if (isUpdate) {', '    } else {');
check('Beim Ändern wird leerer Text zu NULL', aendern.includes('leerZuNull(payload[feld])'));
check('Beim Ändern folgt die Domain der Webadresse',
  aendern.includes("if ('website_url' in payload) payload.company_domain = domainAus(payload.website_url);"));

// ── Reihenfolge: Mehrfach-Standorte ────────────────────────────────────────
const sortiere = (liste) => liste.slice().sort(vergleicheLeads({}, 1000));
const lead = (id, extra = {}) => ({ id, stage: 'cold', status: 'Lead', ...extra });

const kette = lead(1, { is_multi_site: true });
const einzeln = lead(2);
check('Kette steht vor Einzelstandort',
  sortiere([einzeln, kette]).map(l => l.id).join() === '1,2');

const stern = lead(3, { starred: 1 });
check('Der Stern schlägt die Kette',
  sortiere([kette, stern]).map(l => l.id).join() === '3,1');

const gesnoozt = lead(4, { is_multi_site: true, snooze_until_ms: 999999 });
check('Wiedervorlage steht trotz Kette ganz unten',
  sortiere([gesnoozt, einzeln]).map(l => l.id).join() === '2,4');

const angebot = lead(5, { stage: 'offer' });
check('Kette schlägt die höhere Pipeline-Stufe',
  sortiere([angebot, kette]).map(l => l.id).join() === '1,5');

console.log('\n✅ BESTANDEN (' + ok.length + ')');
ok.forEach(t => console.log('   ' + t));
if (fail.length) {
  console.log('\n❌ FEHLGESCHLAGEN (' + fail.length + ')');
  fail.forEach(t => console.log('   ' + t));
  process.exit(1);
}
console.log('\nAlle Prüfungen bestanden.');
