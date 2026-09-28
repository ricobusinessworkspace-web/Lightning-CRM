/**
 * Sicherung (admin_scripts/sicherung.mjs) — ohne Netz geprüft.
 * Wichtig sind drei Dinge: sie liest nur, sie holt wirklich ALLE Zeilen (auch
 * jenseits der 1000er-Grenze von Supabase), und sie liest .env.local richtig.
 */
import fs from 'fs';
import { leseUmgebung, holeAlles, TABELLEN } from '../admin_scripts/sicherung.mjs';

const ok = [];
const fail = [];
const check = (name, cond) => (cond ? ok : fail).push(name);

// ── .env.local lesen ─────────────────────────────────────────────────────────
const env = leseUmgebung(`# Kommentar
VITE_SUPABASE_URL=https://abc.supabase.co
SUPABASE_SERVICE_ROLE_KEY = "geheim=mit=gleich"

LEER=
`);
check('URL gelesen', env.VITE_SUPABASE_URL === 'https://abc.supabase.co');
check('Anführungszeichen und Gleichheitszeichen im Wert', env.SUPABASE_SERVICE_ROLE_KEY === 'geheim=mit=gleich');
check('Kommentar zählt nicht', !Object.keys(env).some(k => k.startsWith('#')));
check('Leerer Wert bleibt leer', env.LEER === '');

// ── Blättern über die 1000er-Grenze ──────────────────────────────────────────
const bestand = Array.from({ length: 2345 }, (_, i) => ({ id: i + 1 }));
const abfragen = [];
const client = {
  from: (tabelle) => ({
    select: () => ({
      order: (spalte) => ({
        range: async (von, bis) => {
          abfragen.push({ tabelle, spalte, von, bis });
          return { data: bestand.slice(von, bis + 1), error: null };
        }
      })
    })
  })
};
const alle = await holeAlles(client, 'crm_leads', 'id');
check('Alle 2345 Zeilen geholt', alle.length === 2345);
check('Drei Seiten abgefragt', abfragen.length === 3);
check('Seiten schließen lückenlos an', abfragen[1].von === 1000 && abfragen[2].von === 2000);
check('Geblättert wird nach der eindeutigen Spalte', abfragen.every(a => a.spalte === 'id'));

// ── Nur lesen ────────────────────────────────────────────────────────────────
const quelle = fs.readFileSync('admin_scripts/sicherung.mjs', 'utf8')
  .replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
const zugriffe = quelle.match(/\.from\([^)]*\)\.(\w+)\(/g) || [];
check('Jeder Datenbankzugriff ist ein Lesen (select)', zugriffe.length >= 2 && zugriffe.every(z => z.endsWith('.select(')));
check('Keine Datenbankfunktion aufgerufen (rpc)', !/\.rpc\(/.test(quelle));
check('Kernbestand ist in der Liste',
  ['crm_leads', 'crm_calls', 'lead_activities', 'crm_settings', 'crm_metric_targets'].every(t => t in TABELLEN));
check('Ziel liegt außerhalb des Projektordners', /os\.homedir\(\), 'Backups', 'lightning-crm'/.test(quelle));

console.log(`Sicherung: ${ok.length} ok, ${fail.length} fehlgeschlagen`);
if (fail.length) {
  fail.forEach(f => console.log('  ✗', f));
  process.exit(1);
}
