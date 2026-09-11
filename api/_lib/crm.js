/**
 * api/_lib/crm.js — Zugriff auf die CRM-Tabellen von der Serverseite aus
 * ─────────────────────────────────────────────────────────────────────────────
 * Warum es diese Datei gibt
 * ─────────────────────────
 * `core/db.js` läuft im Browser: es hängt an einer angemeldeten Sitzung und an
 * `window`. Auf der Serverseite gibt es beides nicht. Die Regeln, die dort beim
 * Schreiben gelten, gelten hier trotzdem — sie stehen deshalb hier noch einmal,
 * bewusst knapp und an einer Stelle:
 *
 *   1. Nur genannte Spalten schreiben. Nie das ganze Lead-Objekt zurückschieben.
 *   2. `last_edited_ms` bei jedem Schreibvorgang auf jetzt setzen.
 *   3. Vorher prüfen, ob jemand anderes in der Zwischenzeit geschrieben hat.
 *   4. Einen Stufenwechsel im Verlauf festhalten — mit alter UND neuer Stufe.
 *   5. `closed_at_ms` beim ersten Abschluss einfrieren, nie wieder ändern.
 *
 * ⚠️  Das ist ein ZWEITER Schreibweg neben `window.leadStore.save()` im Browser.
 *     Wer an den Schreibregeln etwas ändert, muss beide Stellen anfassen.
 *     Siehe HANDOVER.md, Abschnitt „Was funktioniert".
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://duzmanqvyhqurxlpxrrg.supabase.co';

export const STUFEN = ['cold', 'pitch', 'data', 'offer', 'closed'];
export const ZUSTAENDE = ['Lead', 'Kunde', 'Uninteressant'];

/** Spalten, die über diesen Weg geschrieben werden dürfen. Bewusst kürzer als
 *  die Liste in core/db.js — was von aussen niemand setzen können soll (etwa
 *  `claimed_by` oder `created_at_ms`), steht hier nicht drin. */
const SCHREIBBAR = new Set([
  'name', 'phone', 'email', 'website_url', 'notes', 'task_text',
  'stage', 'status', 'size', 'snooze_until_ms', 'starred', 'maps_city'
]);

let client = null;
export function supabase() {
  if (client) return client;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    const e = new Error('SUPABASE_SERVICE_ROLE_KEY fehlt in den Environment Variables.');
    e.status = 500;
    throw e;
  }
  client = createClient(SUPABASE_URL, key, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  return client;
}

export function fehler(nachricht, status = 400) {
  const e = new Error(nachricht);
  e.status = status;
  return e;
}

// ── Aufgaben ───────────────────────────────────────────────────────────────
// Aufgaben liegen als JSON-Text in crm_leads.task_text. Leere Liste wird als
// leerer Text gespeichert, sonst zeigt die Karte in der App ein Aufgaben-
// Zeichen ohne Aufgabe dahinter.
export function aufgabenLesen(task_text) {
  if (!task_text) return [];
  try {
    const liste = JSON.parse(task_text);
    return Array.isArray(liste) ? liste : [];
  } catch (e) {
    return [];
  }
}

export function aufgabenSchreiben(liste) {
  return Array.isArray(liste) && liste.length > 0 ? JSON.stringify(liste) : '';
}

// Gleiche Regel wie window.newTaskId: Zeitstempel, aber nie zweimal derselbe.
let letzteAufgabenId = 0;
export function neueAufgabenId() {
  const jetzt = Date.now();
  letzteAufgabenId = letzteAufgabenId >= jetzt ? letzteAufgabenId + 1 : jetzt;
  return letzteAufgabenId;
}

// ── Lesen ──────────────────────────────────────────────────────────────────
export async function leadHolen(id, mitVerlauf = false) {
  const spalten = mitVerlauf
    ? '*, crm_calls(*), lead_activities(*)'
    : '*';
  const { data, error } = await supabase()
    .from('crm_leads').select(spalten).eq('id', id).maybeSingle();
  if (error) throw fehler(error.message, 500);
  if (!data) throw fehler(`Kein Lead mit der Nummer ${id}.`, 404);
  return data;
}

// ── Schreiben ──────────────────────────────────────────────────────────────
/**
 * Schreibt genau die übergebenen Spalten. Alles andere bleibt unberührt.
 *
 * @param {number} id
 * @param {object} felder   nur die Spalten, die sich ändern sollen
 * @param {object} opts     { erwarteterStand } — der `last_edited_ms`, den der
 *                          Aufrufer gesehen hat. Ist der Lead inzwischen neuer,
 *                          wird abgebrochen statt zu überschreiben.
 */
export async function leadSchreiben(id, felder, opts = {}) {
  const jetzt = Date.now();

  const nutzlast = {};
  for (const [k, v] of Object.entries(felder)) {
    if (SCHREIBBAR.has(k)) nutzlast[k] = v;
  }
  if (Object.keys(nutzlast).length === 0) throw fehler('Nichts zu schreiben.');

  const bestand = await leadHolen(id);

  if (opts.erwarteterStand !== undefined && bestand.last_edited_ms > opts.erwarteterStand) {
    throw fehler(
      'Konflikt: Der Lead wurde in der Zwischenzeit geändert. Bitte noch einmal anzeigen lassen und neu entscheiden.',
      409
    );
  }

  nutzlast.last_edited_ms = jetzt;

  // Abschluss datieren — nur beim ersten Mal. Ein zurückgesetzter und später
  // erneut abgeschlossener Lead behält sein ursprüngliches Datum, sonst würde
  // sich eine vergangene Monatsauswertung rückwirkend ändern.
  const alteStufe = bestand.stage || 'cold';
  const neueStufe = 'stage' in nutzlast ? nutzlast.stage : alteStufe;
  if (neueStufe === 'closed' && !bestand.closed_at_ms) nutzlast.closed_at_ms = jetzt;

  const { data, error } = await supabase()
    .from('crm_leads').update(nutzlast).eq('id', id).select().maybeSingle();
  if (error) throw fehler(error.message, 500);

  if (neueStufe !== alteStufe) await stufenwechselFesthalten(id, alteStufe, neueStufe);

  return data;
}

// ── Verlauf ────────────────────────────────────────────────────────────────
// by_user_id bleibt leer: die Spalte in lead_activities ist vom Typ uuid, und
// dieser Weg hat keinen angemeldeten Nutzer. Der Name sagt trotzdem, woher der
// Eintrag kommt — im Verlauf des Leads steht dann „… – MCP".
const HERKUNFT = 'MCP';

export async function aktivitaetFesthalten(lead_id, type, details) {
  const { error } = await supabase().from('lead_activities').insert({
    lead_id, ts: Date.now(), type, details,
    by_user_name: HERKUNFT,
    is_estimated: false
  });
  if (error) throw fehler(error.message, 500);
}

export async function stufenwechselFesthalten(lead_id, von, nach) {
  const { error } = await supabase().from('lead_activities').insert({
    lead_id, ts: Date.now(), type: 'status_change',
    details: `Status geändert auf ${String(nach).toUpperCase()}`,
    from_stage: von, to_stage: nach,
    by_user_name: HERKUNFT,
    is_estimated: false
  });
  if (error) throw fehler(error.message, 500);
}

export async function anrufFesthalten(lead_id) {
  const jetzt = Date.now();
  const bestand = await leadHolen(lead_id);

  const { error } = await supabase().from('crm_calls').insert({
    lead_id, ts: jetzt, type: 'call',
    stage_at_call: bestand.stage || 'cold',
    size_at_call: bestand.size || null,
    by_user_name: HERKUNFT,
    is_estimated: false
  });
  if (error) throw fehler(error.message, 500);

  await supabase().from('crm_leads').update({ last_contact_ms: jetzt }).eq('id', lead_id);
  return jetzt;
}
