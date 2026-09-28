/**
 * Sicherung der CRM-Daten — außerhalb von Supabase, auf dem eigenen Rechner.
 * ─────────────────────────────────────────────────────────────────────────────
 * Aufruf:   npm run sicherung
 * Ergebnis: ~/Backups/lightning-crm/<Datum_Uhrzeit>/
 *             <tabelle>.json     je Tabelle alle Zeilen
 *             crm_leads.csv      zum Öffnen in Excel/Numbers
 *             crm_calls.csv
 *             manifest.json      Zeilenzahlen und Prüfsummen
 *
 * Warum: Im kostenlosen Supabase-Tarif gibt es keine Sicherung, die man
 * zurückspielen kann. Vor jeder Änderung an der Datenbank muss eine frische
 * Kopie existieren (Regel in docs/produkt/05-umbau-ablauf.md).
 *
 * Voraussetzung: eine Datei .env.local im Projektordner mit
 *     SUPABASE_SERVICE_ROLE_KEY=...   (Supabase → Project Settings → API Keys)
 * optional  VITE_SUPABASE_URL=...     (sonst die bisherige Live-Datenbank)
 * .env.local wird nie eingecheckt (.gitignore).
 *
 * Das Skript LIEST nur. Es schreibt nichts in die Datenbank und löscht nichts.
 * Jede Tabelle wird seitenweise geholt (Supabase liefert höchstens 1000 Zeilen
 * je Abfrage) und am Ende gegen die Zählung der Datenbank geprüft. Stimmt eine
 * Zahl nicht, meldet das Skript Fehler und endet mit Code 1.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath, pathToFileURL } from 'url';

const LIVE_URL = 'https://duzmanqvyhqurxlpxrrg.supabase.co';

// Tabelle → Spalte, nach der geblättert wird (muss eindeutig sein)
export const TABELLEN = {
  crm_leads: 'id',
  crm_calls: 'id',
  lead_activities: 'id',
  crm_metric_targets: 'id',
  crm_settings: 'key',
  crm_pipeline_snapshots: 'tag',
  crm_notifications: 'id',
  crm_push_subscriptions: 'id',
  crm_task_overrides: 'id',
  crm_events: 'id',
  crm_projects: 'id',
  crm_project_tasks: 'id',
  user_profiles: 'id'
};

/** Liest KEY=WERT-Zeilen. Kommentare (#) und Leerzeilen zählen nicht. */
export function leseUmgebung(text) {
  const werte = {};
  for (const zeile of String(text || '').split(/\r?\n/)) {
    const m = zeile.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    werte[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return werte;
}

/** Holt alle Zeilen einer Tabelle, 1000 je Seite. */
export async function holeAlles(client, tabelle, spalte, seite = 1000) {
  const alle = [];
  for (let von = 0; ; von += seite) {
    const { data, error } = await client.from(tabelle).select('*')
      .order(spalte, { ascending: true }).range(von, von + seite - 1);
    if (error) throw new Error(`${tabelle}: ${error.message}`);
    alle.push(...(data || []));
    if (!data || data.length < seite) return alle;
  }
}

export async function zaehle(client, tabelle) {
  const { count, error } = await client.from(tabelle).select('*', { count: 'exact', head: true });
  if (error) throw new Error(`${tabelle}: ${error.message}`);
  return count;
}

function alsCsv(zeilen) {
  if (!zeilen.length) return '';
  const spalten = [...new Set(zeilen.flatMap(z => Object.keys(z)))];
  const feld = (w) => {
    if (w === null || w === undefined) return '';
    const t = typeof w === 'object' ? JSON.stringify(w) : String(w);
    return /[",\n;]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  return [spalten.join(','), ...zeilen.map(z => spalten.map(s => feld(z[s])).join(','))].join('\n');
}

async function main() {
  const wurzel = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const envDatei = path.join(wurzel, '.env.local');
  const env = { ...leseUmgebung(fs.existsSync(envDatei) ? fs.readFileSync(envDatei, 'utf8') : ''), ...process.env };
  const url = env.VITE_SUPABASE_URL || LIVE_URL;
  const schluessel = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!schluessel) {
    console.error('✗ SUPABASE_SERVICE_ROLE_KEY fehlt.\n'
      + '  Lege im Projektordner die Datei .env.local an (Vorlage: .env.example)\n'
      + '  und trage den Schlüssel aus Supabase → Project Settings → API Keys ein.');
    process.exit(1);
  }

  const { createClient } = await import('@supabase/supabase-js');
  const client = createClient(url, schluessel, { auth: { persistSession: false, autoRefreshToken: false } });

  const stempel = new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', '');
  const ziel = path.join(os.homedir(), 'Backups', 'lightning-crm', stempel);
  fs.mkdirSync(ziel, { recursive: true, mode: 0o700 });

  console.log(`Sicherung von ${url}\nnach ${ziel}\n`);
  const manifest = { erstellt: new Date().toISOString(), datenbank: url, tabellen: {} };
  let fehler = 0;

  for (const [tabelle, spalte] of Object.entries(TABELLEN)) {
    try {
      const zeilen = await holeAlles(client, tabelle, spalte);
      const erwartet = await zaehle(client, tabelle);
      const json = JSON.stringify(zeilen, null, 2);
      fs.writeFileSync(path.join(ziel, `${tabelle}.json`), json, { mode: 0o600 });
      if (tabelle === 'crm_leads' || tabelle === 'crm_calls') {
        fs.writeFileSync(path.join(ziel, `${tabelle}.csv`), alsCsv(zeilen), { mode: 0o600 });
      }
      const stimmt = erwartet === zeilen.length;
      if (!stimmt) fehler++;
      manifest.tabellen[tabelle] = {
        zeilen: zeilen.length, laut_datenbank: erwartet, stimmt,
        sha256: crypto.createHash('sha256').update(json).digest('hex')
      };
      console.log(`${stimmt ? '✓' : '✗'} ${tabelle.padEnd(24)} ${String(zeilen.length).padStart(6)} Zeilen`
        + (stimmt ? '' : `  (Datenbank sagt ${erwartet})`));
    } catch (e) {
      fehler++;
      manifest.tabellen[tabelle] = { fehler: e.message };
      console.log(`✗ ${tabelle.padEnd(24)} ${e.message}`);
    }
  }

  fs.writeFileSync(path.join(ziel, 'manifest.json'), JSON.stringify(manifest, null, 2), { mode: 0o600 });
  console.log(fehler
    ? `\n✗ ${fehler} Tabelle(n) nicht vollständig gesichert. Nicht weiterarbeiten, bis das geklärt ist.`
    : `\n✓ Alles gesichert. Prüfsummen stehen in manifest.json.`);
  process.exit(fehler ? 1 : 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error('✗', e.message); process.exit(1); });
}
