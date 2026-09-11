/**
 * core/db.js — Zugriff auf Supabase
 * ─────────────────────────────────────────────────────────────────────────────
 * Die Funktionsnamen stammen noch aus der Zeit, als das CRM eine Electron-App
 * mit lokaler SQLite-Datenbank war ("Calling Station"). Beim Umzug in die Cloud
 * wurde die Schnittstelle absichtlich gleich gelassen, damit der Oberflächen-
 * Code unverändert bleiben konnte. Ein "main.js" oder IPC-Handler gibt es seit
 * dem Umzug nicht mehr — falls dieser Kopf das noch behauptet hat: tut er nicht.
 *
 * ⚠️  Zweiter Schreibweg: api/_lib/crm.js schreibt dieselben Tabellen von der
 *     Serverseite aus (MCP-Server). Wer hier an den Schreibregeln etwas ändert,
 *     muss dort nachziehen. Siehe HANDOVER.md.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Anrufe werden NICHT nach "erreicht / nicht erreicht" unterschieden.
 * Ein Anruf ist ein Anruf. Die Spalte crm_calls.status bleibt aus
 * Bestandsgruenden erhalten, wird aber nirgends mehr ausgewertet.
 *
 * call_status am Lead kennt nur noch: 'never' | 'called'
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL     = 'https://duzmanqvyhqurxlpxrrg.supabase.co';
const SUPABASE_KEY     = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR1em1hbnF2eWhxdXJ4bHB4cnJnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzOTk1NTQsImV4cCI6MjA5NDk3NTU1NH0.v7dSCQQn2T_3LHrTj4j2K5Byz3oKvuKE2zO7M9BA4Uo';
const TABLE            = 'crm_leads';
const EVENTS_TABLE     = 'crm_events';
const PROJECTS_TABLE   = 'crm_projects';
const PROJ_TASKS_TABLE = 'crm_project_tasks';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false
  }
});

let currentUser = null; // caches { id, name, role }

// ─── call_history normalisation ──────────────────────────────────────────────
// Accepts either a bare timestamp (legacy) or a {ts, status} object (new).
function normalizeCallEntry(entry) {
  if (typeof entry === 'number') return { ts: entry, type: 'call' };
  if (entry && typeof entry === 'object' && entry.ts) {
    return { ts: entry.ts, type: entry.type || 'call', by_user_name: entry.by_user_name, by_user_id: entry.by_user_id };
  }
  return null;
}

function parseCallHistory(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map(normalizeCallEntry).filter(Boolean);
}

// ─── Wurde der Lead schon einmal angerufen? ──────────────────────────────────
// Returns 'never' | 'called'
function deriveCallStatus(callHistory) {
  return parseCallHistory(callHistory).length === 0 ? 'never' : 'called';
}

// ─── Internal: map Supabase row → renderer-compatible object ─────────────────
function normalizeRow(row) {
  if (!row) return row;
  const callHistory = Array.isArray(row.crm_calls) ? row.crm_calls : (Array.isArray(row.call_history) ? row.call_history : []);
  // Sort by ts ascending just to be safe
  callHistory.sort((a,b) => (a.ts || 0) - (b.ts || 0));
  return {
    ...row,
    locations:    Array.isArray(row.locations)    ? row.locations    : [],
    linked_leads: Array.isArray(row.linked_leads) ? row.linked_leads : [],
    call_history: callHistory,
    lead_activities: Array.isArray(row.lead_activities) ? row.lead_activities : [],
    call_status:  deriveCallStatus(callHistory),
    // Map column name: Supabase uses created_at_ms, old code used created_at
    created_at:   row.created_at_ms ?? 0,
  };
}

// ─── Internal: JS Post-Processing & Sorting ───────────────────────────
function postProcessAndSort(rows, filters = {}) {
  const now = Date.now();
  let results = rows.map(normalizeRow);

  // 0. Locations backward-compat migration
  results.forEach(r => {
    if (r.locations.length === 0 && (r.google_place_id || r.lat || r.maps_city)) {
      r.locations = [{
        place_id: r.google_place_id || '',
        name:     r.name || '',
        address:  r.maps_city || '',
        lat:      r.lat || null,
        lng:      r.lng || null,
        source:   'migration',
      }];
    }
  });

  // 1. Post-process tabs that need JS logic (like parsing task_text)
  if (!(filters.search && filters.search.length > 0)) {
    if (filters.tab === 'tasks') {
      results = results.filter(r => {
        if (!r.task_text) return false;
        try {
          const tasks = JSON.parse(r.task_text);
          return Array.isArray(tasks) && tasks.some(t => !t.done);
        } catch (e) { return r.task_text.trim() !== ''; }
      });
    }
    // Frueher wurden hier Leads ausgeblendet, deren Aufgabentext "mail" enthielt.
    // Das hat Leads unsichtbar gemacht (auch bei "Rechnung mailen"). Leads
    // bleiben jetzt immer sichtbar; offene Aufgaben zeigt das Symbol auf der Karte.
  }

  // 2. Sorting — unified global relevance sort
  results.sort((a, b) => {
    if (filters.tab === 'customers') {
      return b.id - a.id;
    }

    const snoozedA = (a.snooze_until_ms && a.snooze_until_ms > now) ? 1 : 0;
    const snoozedB = (b.snooze_until_ms && b.snooze_until_ms > now) ? 1 : 0;
    if (snoozedA !== snoozedB) return snoozedA - snoozedB;
    if (snoozedA === 1 && snoozedB === 1) return a.snooze_until_ms - b.snooze_until_ms;

    const starA = a.starred ? 1 : 0;
    const starB = b.starred ? 1 : 0;
    if (starA !== starB) return starB - starA;

    const getScore = l => {
      if (l.status === 'Kunde') return 4;
      if (l.stage === 'offer')  return 3;
      if (l.stage === 'data')   return 2;
      if (l.stage === 'pitch')  return 1;
      return 0;
    };
    const scoreA = getScore(a), scoreB = getScore(b);
    if (scoreA !== scoreB) return scoreB - scoreA;

    return b.id - a.id;
  });

  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────────────────────

export const db = {

  // ── getLeads ───────────────────────────────────────────────────────────────
  getLeads: async (filters = {}) => {
    let query = supabase.from(TABLE).select('*, crm_calls(*), lead_activities(*)');
    
    // 1. Excluded Filter
    if (filters.tab === 'excluded') {
      query = query.eq('status', 'Uninteressant');
    } else if (!filters.all && !filters.includeExcluded) {
      query = query.neq('status', 'Uninteressant');
    }

    // 2. Tab & Filter logic (Only if not globally searching)
    if (!(filters.search && filters.search.length > 0)) {
      // Filter Group 1: Pipeline Status
      if (filters.filter1 && filters.filter1 !== 'all') {
        if (filters.filter1 === 'kalt') {
          query = query.eq('status', 'Lead').eq('stage', 'cold');
        } else if (filters.filter1 === 'entscheider' || filters.filter1 === 'pitch') {
          query = query.eq('status', 'Lead').eq('stage', 'pitch');
        } else if (filters.filter1 === 'termin' || filters.filter1 === 'data') {
          query = query.eq('status', 'Lead').eq('stage', 'data');
        } else if (filters.filter1 === 'rechnung' || filters.filter1 === 'offer') {
          query = query.eq('status', 'Lead').eq('stage', 'offer');
        } else if (filters.filter1 === 'kunden') {
          query = query.eq('status', 'Kunde');
        }
      }

      // Tab specific base status
      if (filters.tab === 'queue') {
        if (filters.filter1 !== 'kunden') {
          query = query.eq('status', 'Lead');
        }
      } else if (filters.tab === 'cold') {
        query = query.eq('status', 'Lead');
      } else if (filters.tab === 'customers') {
        query = query.eq('status', 'Kunde');
      }

      // Filter Group 2: Claimed By (Mitarbeiter)
      if (filters.filter2 && filters.filter2 !== 'all') {
        if (filters.filter2 === 'unassigned') {
           query = query.is('claimed_by', null);
        } else {
           query = query.eq('claimed_by', filters.filter2);
        }
      }
    }

    // Search
    if (filters.search && filters.search.length > 0) {
      query = query.ilike('name', `%${filters.search}%`);
    }

    // Minion Access Control
    if (currentUser && currentUser.role !== 'admin' && currentUser.role !== 'developer' && !filters.all) {
      // Agent sieht alle Kalten (unassigned), aber NUR seine EIGENEN in der Pipeline
      query = query.or(`and(status.eq.Lead,stage.eq.cold),claimed_by.eq.${currentUser.id}`);
    }

    // Since we need relational sorting for crm_calls, keep this:
    query = query
      .order('ts', { foreignTable: 'crm_calls', ascending: false }).limit(3, { foreignTable: 'crm_calls' })
      .order('ts', { foreignTable: 'lead_activities', ascending: false }).limit(3, { foreignTable: 'lead_activities' });

    const { data, error } = await query;
    if (error) throw new Error(error.message || error.details || JSON.stringify(error));

    let leads = data || [];
    
    if (leads.length > 1000) {
      console.warn(`⚠️ Warnung: getLeads hat ${leads.length} Datensätze geladen. Limit/Pagination sollte erwogen werden!`);
    }

    return postProcessAndSort(leads, filters);
  },

  // ── saveLead ───────────────────────────────────────────────────────────────
  // ── getLead ────────────────────────────────────────────────────────────────
  // Single-row fetch. Use this instead of getLeads({all:true}) whenever only one
  // lead is needed — it avoids pulling the whole table for a single field edit.
  getLead: async (id) => {
    const { data, error } = await supabase
      .from(TABLE)
      .select('*, crm_calls(*), lead_activities(*)')
      .eq('id', id)
      .maybeSingle();
    if (error) throw new Error(error.message || error.details || JSON.stringify(error));
    return data ? normalizeRow(data) : null;
  },


  getLeadHistory: async (leadId) => {
    // Phase 6: Fetch from unified timeline view
    const { data: timeline, error } = await supabase
      .from('lead_timeline')
      .select('*')
      .eq('lead_id', leadId)
      .order('ts', { ascending: true });
      
    if (error) {
       // Fallback for Phase 6 transition if the view doesn't exist yet
       console.warn('lead_timeline view missing, falling back to split tables', error);
       const { data: calls, error: err1 } = await supabase.from('crm_calls').select('*').eq('lead_id', leadId).order('ts', { ascending: true });
       const { data: acts, error: err2 } = await supabase.from('lead_activities').select('*').eq('lead_id', leadId).order('ts', { ascending: true });
       
       if (err1) console.warn('Failed to fetch crm_calls', err1);
       if (err2) console.warn('Failed to fetch lead_activities', err2);
       
       const mappedCalls = (calls || []).map(c => ({ ...c, activity_type: 'call' }));
       const mappedActs = (acts || []).map(a => ({ ...a, activity_type: a.type }));
       const combined = [...mappedCalls, ...mappedActs].sort((a, b) => a.ts - b.ts);
       
       return { timeline: combined };
    }
    
    return { timeline: timeline || [] };
  },
  
  saveLead: async (lead) => {
    const now = Date.now();
    const isUpdate = !!lead.id;

    // Phase 3.2: Safe JSON parse
    const safeParse = (val, fallback) => {
      if (val === null || val === undefined) return fallback;
      if (typeof val !== 'string') return val;
      try { return JSON.parse(val); }
      catch (e) {
        console.warn(`[saveLead] Parse error for lead ${lead.id || 'new'}`, e);
        return fallback;
      }
    };

    const ALLOWED_COLUMNS = [
      'stage',
      'name', 'phone', 'notes', 'size', 'stage', 'snooze_until_ms',
      'status', 'task_text', 'maps_city', 'lat', 'lng', 'website_url', 'google_maps_url',
      'google_place_id', 'umsatz', 'starred', 'interest_strom', 'interest_gas', 'closed_strom',
      'closed_gas', 'zaehlernummern', 'abschlussdatum', 'provi_umsatz', 'last_edited_ms',
      'locations', 'email', 'impressum_phone', 'legal_company_name', 'director_name',
      'phone_source', 'estimated_kwh', 'opening_hours', 'linked_leads', 'last_contact_ms',
      'claimed_by', 'created_at_ms', 'closed_at_ms'
    ];

    let payload = {};

    if (isUpdate) {
      // Phase 2.2: Partial Updates
      for (const key of Object.keys(lead)) {
        if (ALLOWED_COLUMNS.includes(key)) {
          payload[key] = lead[key];
        }
      }
      payload.last_edited_ms = now;

      if ('locations' in payload) payload.locations = safeParse(payload.locations, []);
      if ('linked_leads' in payload) payload.linked_leads = safeParse(payload.linked_leads, []);
      if ('opening_hours' in payload) payload.opening_hours = safeParse(payload.opening_hours, null);

    } else {
      // Insert path - uses defaults
      const locations = lead.locations ? safeParse(lead.locations, []) : [];
      const linked_leads = lead.linked_leads ? safeParse(lead.linked_leads, []) : [];
      const opening_hours = lead.opening_hours ? safeParse(lead.opening_hours, null) : null;

      payload = {
        name:               lead.name,
        phone:              lead.phone               ?? '',
        notes:              lead.notes               ?? '',
        size:               lead.size                ?? 'Tarifkunde',
        stage:              lead.stage               ?? 'cold',
        snooze_until_ms:    lead.snooze_until_ms     ?? 0,
        status:             lead.status              ?? 'Lead',
        task_text:          lead.task_text           ?? '',
        maps_city:          lead.maps_city           ?? '',
        lat:                lead.lat                 ?? null,
        lng:                lead.lng                 ?? null,
        website_url:        lead.website_url         ?? '',
        google_maps_url:    lead.google_maps_url     ?? '',
        google_place_id:    lead.google_place_id     ?? '',
        umsatz:             lead.umsatz              ?? 0,
        starred:            lead.starred             ?? 0,
        interest_strom:     lead.interest_strom      ?? 0,
        interest_gas:       lead.interest_gas        ?? 0,
        closed_strom:       lead.closed_strom        ?? 0,
        closed_gas:         lead.closed_gas          ?? 0,
        zaehlernummern:     lead.zaehlernummern      ?? '',
        abschlussdatum:     lead.abschlussdatum      ?? '',
        // NICHT ?? 0 — sonst ist "Wert noch nicht eingetragen" von "Abschluss
        // ueber 0 Euro" nicht mehr zu unterscheiden. NULL heisst: fehlt noch.
        provi_umsatz:       lead.provi_umsatz        ?? null,
        last_edited_ms:     now,
        locations,
        email:              lead.email               ?? '',
        impressum_phone:    lead.impressum_phone     ?? '',
        legal_company_name: lead.legal_company_name  ?? '',
        director_name:      lead.director_name       ?? '',
        phone_source:       lead.phone_source        ?? '',
        estimated_kwh:      lead.estimated_kwh       ?? 0,
        opening_hours,
        linked_leads,
        created_at_ms:      now,
        last_contact_ms:    lead.last_contact_ms     ?? 0
      };
      
      if (lead.claimed_by !== undefined) {
         payload.claimed_by = lead.claimed_by === 'unassigned' ? null : lead.claimed_by;
      }
    }

    if (isUpdate) {
      // Phase 3.1: Check error on .single()!
      const { data: existing, error } = await supabase
        .from(TABLE)
        .select('created_at_ms, claimed_by, stage, status, last_edited_ms, closed_at_ms')
        .eq('id', lead.id)
        .single();
        
      if (error || !existing) {
        throw new Error(`Lead konnte nicht gefunden werden (bereits gelöscht oder blockiert). Update abgebrochen.`);
      }

      // Phase 2.3: Optimistic Concurrency Check
      if (lead.last_edited_ms !== undefined && existing.last_edited_ms !== undefined) {
        if (existing.last_edited_ms > lead.last_edited_ms) {
          throw new Error('Konflikt: Dieser Lead wurde in der Zwischenzeit geändert. Bitte lade die Seite neu.');
        }
      }

      // Phase 2.4: claimed_by logic
      const pStage = 'stage' in payload ? payload.stage : existing.stage;
      const isInPipeline = pStage !== 'cold';
      
      let finalClaimedBy = 'claimed_by' in lead ? (lead.claimed_by === 'unassigned' ? null : lead.claimed_by) : existing.claimed_by;
      
      if (currentUser && !finalClaimedBy && isInPipeline) {
        finalClaimedBy = currentUser.id;
      } else if (!isInPipeline && !('claimed_by' in lead)) {
        finalClaimedBy = null;
      }
      
      if (finalClaimedBy !== existing.claimed_by || ('claimed_by' in lead && lead.claimed_by !== existing.claimed_by)) {
        payload.claimed_by = finalClaimedBy;
      }

      if (!existing.created_at_ms && !('created_at_ms' in payload)) {
        payload.created_at_ms = now;
      }

      // Stufenwechsel protokollieren — mit BEIDEN Stufen.
      //
      // Vorher wurde nur die neue Stufe als Fliesstext festgehalten
      // ("Status geaendert auf OFFER"). Damit war data -> offer (Fortschritt)
      // nicht von closed -> offer (Rueckschritt) zu unterscheiden, und
      // gezaehlt wurde per Textsuche. Beides zusammen macht jede
      // Conversion-Rate wertlos.
      try {
        const oldStage = existing.stage || 'cold';
        const newStage = lead.stage || oldStage;
        if (newStage !== oldStage) {
          await db.logStatusChange(lead.id, newStage, oldStage);

          // Abschlusszeitpunkt einfrieren. Ohne ihn haengt "Abschluesse im
          // September" am HEUTIGEN Zustand des Leads — ein Lead, der im
          // Oktober zurueckgesetzt wird, wuerde den September rueckwirkend
          // aendern.
          //
          // Nur beim ERSTEN Abschluss gesetzt und beim Zuruecksetzen nicht
          // geloescht: ein bereits datierter Abschluss behaelt sein Datum.
          // Die Auswertung zaehlt ohnehin nur Leads, die aktuell auf 'closed'
          // stehen — ein zurueckgesetzter Lead faellt dort heraus, ohne dass
          // sein Datum verloren geht.
          if (newStage === 'closed' && !existing.closed_at_ms && !('closed_at_ms' in payload)) {
            payload.closed_at_ms = now;
          }
        }
      } catch(e) {
        console.warn('Could not log status change', e);
      }

      const registerLocalWrite = (id) => {
        if (typeof window !== 'undefined' && window.pendingLocalWrites) {
          window.pendingLocalWrites.add(id);
          setTimeout(() => window.pendingLocalWrites.delete(id), 2000);
        }
      };

      registerLocalWrite(lead.id);

      // OCC query execution
      let updateQuery = supabase.from(TABLE).update(payload).eq('id', lead.id);
      if (lead.last_edited_ms !== undefined) {
        // Only update if no newer edit exists
        updateQuery = updateQuery.eq('last_edited_ms', existing.last_edited_ms);
      }
      
      const { error: updErr, data: updatedData } = await updateQuery.select('id');
      if (updErr) throw new Error(updErr.message || updErr.details || JSON.stringify(updErr));
      
      if (lead.last_edited_ms !== undefined && (!updatedData || updatedData.length === 0)) {
         throw new Error('Konflikt: Lead wurde exakt beim Speichern durch eine Fremdänderung überschrieben.');
      }
      
      return { id: lead.id, updated: 1, last_edited_ms: payload.last_edited_ms || now };
      
    } else {
      // Zusammenfuehren NUR bei identischer Google-Place-ID — das ist eine
      // echte Identitaet aus dem Scout.
      //
      // Frueher wurde auch ueber Name + Stadt zusammengefuehrt. Dadurch hat
      // "neuen Lead anlegen" stillschweigend einen bestehenden Lead bearbeitet
      // (zwei Mal "Neuer Lead" -> der zweite Klick oeffnete den ersten).
      // Gleiche Namen werden jetzt angelegt und nur gemeldet.
      let dupData = null;
      if (payload.google_place_id) {
        const res = await supabase.from(TABLE).select('*')
          .eq('google_place_id', payload.google_place_id);
        dupData = res.data;
      }

      if (dupData && dupData.length > 0) {
         // Merge into first duplicate
         const existingDup = dupData[0];
         const updatePayload = {};
         for (const key in payload) {
            if ((!existingDup[key] || existingDup[key] === 0 || existingDup[key] === '') && payload[key]) {
               updatePayload[key] = payload[key];
            }
         }
         
         if (Object.keys(updatePayload).length > 0) {
            updatePayload.last_edited_ms = now;
            
            const registerLocalWrite = (id) => {
              if (typeof window !== 'undefined' && window.pendingLocalWrites) {
                window.pendingLocalWrites.add(id);
                setTimeout(() => window.pendingLocalWrites.delete(id), 2000);
              }
            };
            registerLocalWrite(existingDup.id);

            const { error: updErr } = await supabase.from(TABLE).update(updatePayload).eq('id', existingDup.id);
            if (updErr) throw new Error(updErr.message || updErr.details || JSON.stringify(updErr));
         }
         
         return { id: existingDup.id, inserted: false, updated: 1, duplicate_prevented: true, last_edited_ms: updatePayload.last_edited_ms || now };
      }

      // Namensgleichheit nur ermitteln, um sie zurueckzumelden — kein Merge.
      let nameClash = null;
      if (payload.name && String(payload.name).trim() !== '') {
        const { data: sameName } = await supabase.from(TABLE)
          .select('id, name, maps_city')
          .eq('name', payload.name)
          .limit(1);
        if (sameName && sameName.length > 0) nameClash = sameName[0];
      }

      const { data, error } = await supabase.from(TABLE).insert(payload).select('id').single();
      if (error) throw new Error(error.message || error.details || JSON.stringify(error));
      
      const registerLocalWrite = (id) => {
        if (typeof window !== 'undefined' && window.pendingLocalWrites) {
          window.pendingLocalWrites.add(id);
          setTimeout(() => window.pendingLocalWrites.delete(id), 2000);
        }
      };
      if (data && data.id) registerLocalWrite(data.id);

      return { id: data.id, inserted: true, last_edited_ms: payload.last_edited_ms || now, name_clash: nameClash };
    }
  },
  // ── logCall ────────────────────────────────────────────────────────────────
  // Die Einordnung des Anrufs wird JETZT festgehalten, nicht spaeter aus dem
  // Lead abgeleitet. Vorher hing die Auswertung an einem Verbund auf den
  // HEUTIGEN Zustand des Leads — ein Kaltanruf von gestern wurde damit morgen
  // zum "warmen", sobald der Lead in die Pipeline wanderte. Die Zahlen der
  // letzten Woche haben sich so jede Nacht geaendert.
  //
  // Gelesen wird aus der Datenbank, nicht aus dem Formular: copyPhone
  // speichert absichtlich keine Lead-Daten, im Formular koennte also eine
  // Stufe stehen, die nie gespeichert wurde.
  logCall: async (id) => {
    const now = Date.now();
    try {
      let stageAtCall = null;
      let sizeAtCall = null;
      let gemessen = false;
      try {
        const { data: momentaufnahme } = await supabase
          .from(TABLE).select('stage, size').eq('id', id).maybeSingle();
        if (momentaufnahme) {
          stageAtCall = momentaufnahme.stage || 'cold';
          sizeAtCall = momentaufnahme.size || null;
          gemessen = true;
        }
      } catch (e) {
        console.warn('Einordnung des Anrufs nicht lesbar', e);
      }

      const entry = {
        lead_id: id, ts: now, type: 'call',
        stage_at_call: stageAtCall,
        size_at_call: sizeAtCall,
        // Nur wahr, wenn die Einordnung wirklich gelesen wurde. Konnte sie
        // nicht ermittelt werden, ist die Zeile als unsicher markiert statt
        // stillschweigend als Messwert durchzugehen.
        is_estimated: !gemessen
      };
      if (currentUser) {
        entry.by_user_id = currentUser.id;
        entry.by_user_name = currentUser.name;
      }
      
      // 1. Insert into relational table
      await supabase.from('crm_calls').insert(entry);
      
      // 2. Update lead timestamp
      const { data, error } = await supabase
        .from(TABLE)
        .update({ last_contact_ms: now })
        .eq('id', id)
        .select('*, crm_calls(*)');

      if (error) throw error;
      return Array.isArray(data) ? data[0] : data;
    } catch (e) {
      console.error('logCall error:', e);
      return null;
    }
  },

  // ── logMessage ─────────────────────────────────────────────────────────────
  // Schriftlicher Kontakt — E-Mail ODER WhatsApp. Fuer die Nachverfolgung ist
  // beides dasselbe: "Ich habe dem Kunden geschrieben". Der genaue Weg steht in
  // details, damit man ihn im Verlauf noch sieht.
  //
  // Der Typ heisst 'message'. Aeltere Eintraege stehen noch als 'email' in der
  // Tabelle; sie werden gleich angezeigt und gleich gezaehlt.
  //
  // Auf lead_activities liegt keine Pruefregel fuer type (geprueft 09.09.2026:
  // nur Primaerschluessel und der Fremdschluessel auf crm_leads). Neue Typen
  // koennen also ohne Migration dazukommen.
  logMessage: async (id, kanal = 'email') => {
    const now = Date.now();
    const label = kanal === 'whatsapp' ? 'WhatsApp geschrieben' : 'E-Mail geschrieben';
    const basis = { lead_id: id, ts: now, details: label };
    if (currentUser) {
      basis.by_user_id = currentUser.id;
      basis.by_user_name = currentUser.name;
    }

    try {
      const { error } = await supabase
        .from('lead_activities')
        .insert({ ...basis, type: 'message' });
      if (error) throw error;

      const { data, error: updErr } = await supabase
        .from(TABLE)
        .update({ last_contact_ms: now })
        .eq('id', id)
        .select('*, crm_calls(*), lead_activities(*)');

      if (updErr) throw updErr;
      return Array.isArray(data) ? data[0] : data;
    } catch (e) {
      console.error('logMessage error:', e);
      return null;
    }
  },

  // Altname, damit nichts bricht, was noch logEmail aufruft.
  logEmail: async (id) => db.logMessage(id, 'email'),

  // ── logTaskDone ────────────────────────────────────────────────────────────
  // Haelt im Verlauf fest, dass eine Aufgabe erledigt wurde — mit dem Text der
  // Aufgabe, damit man spaeter noch weiss, worum es ging. Bei Teilaufgaben
  // steht die Hauptaufgabe dabei.
  //
  // Nur das Erledigen wird festgehalten. Wird eine Aufgabe wieder geoeffnet,
  // entsteht kein Eintrag — sonst haette man Paare aus Haken und Widerruf im
  // Verlauf, die nichts erzaehlen.
  logTaskDone: async (leadId, aufgabenText, hauptaufgabenText = null) => {
    const now = Date.now();
    const kurz = (t) => {
      const s = String(t || '').trim().replace(/\s+/g, ' ');
      return s.length > 80 ? s.slice(0, 79) + '…' : s;
    };
    const details = hauptaufgabenText
      ? `Teilaufgabe erledigt: ${kurz(aufgabenText)} (zu: ${kurz(hauptaufgabenText)})`
      : `Aufgabe erledigt: ${kurz(aufgabenText)}`;

    const entry = { lead_id: leadId, ts: now, type: 'task_done', details };
    if (currentUser) {
      entry.by_user_id = currentUser.id;
      entry.by_user_name = currentUser.name;
    }

    try {
      const { error } = await supabase.from('lead_activities').insert(entry);
      if (error) throw error;
      return true;
    } catch (e) {
      console.error('logTaskDone error:', e);
      return false;
    }
  },

  // ── logStatusChange ────────────────────────────────────────────────────────
  // from_stage und to_stage sind eigene Spalten, KEIN Fliesstext. Ausgewertet
  // wird ausschliesslich ueber sie. Der Text in details bleibt nur fuer die
  // Verlaufsanzeige stehen — wer ihn umformuliert, veraendert damit keine
  // einzige Kennzahl mehr.
  //
  // is_estimated bleibt false: beide Stufen sind hier gemessen, nicht geraten.
  // Die acht Altzeilen tragen true, weil ihnen die alte Stufe fehlt.
  logStatusChange: async (id, newStage, oldStage = null) => {
    const now = Date.now();
    try {
      const entry = {
        lead_id: id, ts: now, type: 'status_change',
        details: `Status geändert auf ${String(newStage).toUpperCase()}`,
        from_stage: oldStage,
        to_stage: newStage,
        is_estimated: false
      };
      if (currentUser) {
        entry.by_user_id = currentUser.id;
        entry.by_user_name = currentUser.name;
      }
      await supabase.from('lead_activities').insert(entry);
    } catch (e) {
      console.error('logStatusChange error:', e);
    }
  },

  deleteActivity: async (id, type) => {
    if (!id || !type) return false;
    try {
      if (type === 'call') {
        await supabase.from('crm_calls').delete().eq('id', id);
      } else {
        await supabase.from('lead_activities').delete().eq('id', id);
      }
      return true;
    } catch (e) {
      console.error('deleteActivity error:', e);
      return false;
    }
  },

  // ── getCallsToday ──────────────────────────────────────────────────────────
  getCallsToday: async () => {
    try {
      if (!currentUser) return 0;
      const now = new Date();
      now.setHours(0,0,0,0);
      const startOfDay = now.getTime();

      const { data, error, count } = await supabase
        .from('crm_calls')
        .select('*', { count: 'exact', head: true })
        .eq('by_user_id', currentUser.id)
        .eq('type', 'call')
        .gte('ts', startOfDay);

      if (error) throw error;
      return count || 0;
    } catch (e) {
      console.error(e);
      return 0;
    }
  },

  // ── deleteLead ─────────────────────────────────────────────────────────────
  deleteLead: async (id) => {
    const { data, error } = await supabase.from(TABLE).delete().eq('id', id).select();
    if (error) throw new Error(error.message || error.details || JSON.stringify(error));
    if (!data || data.length === 0) throw new Error("Fehler: Lead konnte nicht gelöscht werden (Möglicherweise fehlen Datenbank-Rechte).");
    return { deleted: 1 };
  },

  // ── deleteLeads ────────────────────────────────────────────────────────────
  deleteLeads: async (ids) => {
    if (!ids || ids.length === 0) return { deleted: 0 };
    const { data, error } = await supabase.from(TABLE).delete().in('id', ids).select();
    if (error) throw new Error(error.message || JSON.stringify(error));
    if (!data || data.length === 0) throw new Error("Fehler: Leads konnten nicht gelöscht werden.");
    return { deleted: data.length };
  },

  // ── importLeads ────────────────────────────────────────────────────────────
  importLeads: async (leadsArray) => {
    if (!leadsArray || leadsArray.length === 0) return { importedCount: 0 };
    const now = Date.now();

    const rows = leadsArray
      .filter(l => l.name)
      .map(l => ({
        name:            l.name,
        phone:           l.phone || '',
        snooze_until_ms: 0,
        last_contact_ms: 0,
        status:          'Lead',
        task_text:       '',
        created_at_ms:   now,
        last_edited_ms:  now,
        locations:       [],
      }));

    const { data, error } = await supabase.from(TABLE).insert(rows).select('id');
    if (error) throw new Error(error.message || error.details || JSON.stringify(error));
    return { importedCount: (data || []).length };
  },

  // ── subscribeToLeadChanges ─────────────────────────────────────────────────
  subscribeToLeadChanges: (callback) => {
    const channel = supabase
      .channel('crm_leads_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: TABLE },
        payload => {
          const { eventType, new: newRow, old: oldRow } = payload;
          callback({
            eventType,
            newRow: newRow ? normalizeRow(newRow) : null,
            oldRow: oldRow || null
          });
        }
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  },

  // ── Utils ───────────────────────────────────────────────────────────
  getStage: (lead) => {
    if (lead.status === 'Uninteressant') return 'UNINTERESSANT';
    if (lead.stage) return lead.stage.toUpperCase();
    if (lead.status === 'Kunde') return 'CLOSED';
    return 'COLD';
  },

  // ── Auth Methods ───────────────────────────────────────────────────────────
  getSessionToken: async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return session ? session.access_token : null;
  },
  getCurrentUser: async () => {
    if (currentUser) return currentUser;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return null;
    
    // Fetch profile
    const { data: profile } = await supabase.from('user_profiles').select('*').eq('id', session.user.id).maybeSingle();
    if (profile) {
      if (profile.daily_call_goal === -1) {
        await supabase.auth.signOut();
        return null; // Blocked user
      }
      currentUser = { id: session.user.id, email: session.user.email, name: profile.name, role: profile.role, daily_call_goal: profile.daily_call_goal || 100 };
    }
    return currentUser;
  },

  login: async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
    
    // Fetch profile
    const { data: profile } = await supabase.from('user_profiles').select('*').eq('id', data.session.user.id).maybeSingle();
    if (profile && profile.daily_call_goal === -1) {
      await supabase.auth.signOut();
      throw new Error('Dein Account wurde vom Administrator deaktiviert.');
    }
    currentUser = { 
      id: data.session.user.id, 
      email: data.session.user.email, 
      name: profile ? profile.name : 'Unknown', 
      role: profile ? profile.role : 'agent',
      daily_call_goal: profile ? (profile.daily_call_goal || 100) : 100
    };
    return currentUser;
  },

  register: async (email, password) => {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw new Error(error.message);
    
    // Fallback: Upsert profile manually in case the database trigger hasn't fired yet or failed
    if (data.user) {
       await supabase.from('user_profiles').upsert(
         { id: data.user.id, name: email.split('@')[0], role: 'agent', daily_call_goal: 100 }, 
         { onConflict: 'id', ignoreDuplicates: true }
       );
       currentUser = { 
         id: data.user.id, 
         email: data.user.email, 
         name: email.split('@')[0], 
         role: 'agent',
         daily_call_goal: 100
       };
       return currentUser;
    }
    
    throw new Error('Fehler bei der Registrierung.');
  },

  logout: async () => {
    await supabase.auth.signOut();
    currentUser = null;
    return true;
  },

  updateProfile: async (name) => {
    if (!currentUser) throw new Error("Not logged in");
    const { error } = await supabase.from('user_profiles').update({ name: name }).eq('id', currentUser.id);
    if (error) throw new Error(error.message);
    currentUser.name = name;
    return currentUser;
  },

  updateEmail: async (email) => {
    if (!currentUser) throw new Error("Not logged in");
    const { error } = await supabase.auth.updateUser({ email });
    if (error) throw new Error(error.message);
    currentUser.email = email;
    return currentUser;
  },

  updateCallGoal: async (goal) => {
    if (!currentUser) throw new Error("Not logged in");
    const parsedGoal = parseInt(goal, 10);
    if (isNaN(parsedGoal)) throw new Error("Invalid goal");

    const { error } = await supabase.from('user_profiles').update({ daily_call_goal: parsedGoal }).eq('id', currentUser.id);
    if (error) throw new Error(error.message);
    currentUser.daily_call_goal = parsedGoal;
    return currentUser;
  },

  getUsers: async () => {
    const { data, error } = await supabase.from('user_profiles').select('id, name, role, daily_call_goal');
    if (error) throw new Error(error.message);
    return data || [];
  },

  updateUserRole: async (userId, newRole) => {
    if (!currentUser || (currentUser.role !== 'developer' && currentUser.role !== 'admin')) {
      throw new Error("Keine Berechtigung");
    }
    const { data, error } = await supabase.from('user_profiles')
      .update({ role: newRole })
      .eq('id', userId)
      .select();
    
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) {
      throw new Error("Fehler: Update durch Supabase RLS blockiert.");
    }
    return true;
  },

  deactivateUser: async (userId) => {
    if (!currentUser || (currentUser.role !== 'developer' && currentUser.role !== 'admin')) {
      throw new Error("Keine Berechtigung");
    }
    const { data, error } = await supabase.from('user_profiles')
      .update({ daily_call_goal: -1 })
      .eq('id', userId)
      .select();
    
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) {
      throw new Error("Fehler: Update durch Supabase RLS blockiert.");
    }
    return true;
  },

  inviteUser: async (email) => {
    if (!currentUser || (currentUser.role !== 'developer' && currentUser.role !== 'admin')) {
      throw new Error("Keine Berechtigung");
    }
    
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const baseUrl = isLocal ? window.location.origin : 'https://calling-station-wardogs.vercel.app';
    
    try {
      const token = await db.getSessionToken();
      if (!token) throw new Error('Keine gueltige Session — bitte neu einloggen.');

      const res = await fetch(`${baseUrl}/api/invite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ email })
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Einladungsfehler");
      return result;
    } catch (e) {
      throw new Error(e.message);
    }
  },

  makeMeDeveloper: async () => {
    if (!currentUser) throw new Error("Nicht eingeloggt");
    const { error } = await supabase.from('user_profiles')
      .update({ role: 'developer' })
      .eq('id', currentUser.id);
    
    if (error) throw new Error(error.message);
    currentUser.role = 'developer';
    return true;
  },

  // ── Kennzahlen ─────────────────────────────────────────────────────────────
  // Gelesen wird aus den Sichten crm_daily_metrics und crm_stock_metrics, NICHT
  // aus den Rohtabellen. Grund: getAgentStats zieht Leads, Anrufe und
  // Aktivitaeten ungefiltert in den Browser — PostgREST liefert hoechstens 1000
  // Zeilen und meldet nicht, dass gekuerzt wurde. Bei 100 Anrufen am Tag waere
  // das Dashboard nach gut zwei Wochen still falsch.
  //
  // Die Sichten fassen serverseitig zusammen; hier kommen ein paar Dutzend
  // Zeilen an statt des ganzen Bestands.

  // Tageswerte in einem Zeitraum. vonTag/bisTag als 'YYYY-MM-DD'.
  getDailyMetrics: async (vonTag, bisTag) => {
    let q = supabase.from('crm_daily_metrics').select('metric_key, tag, wert');
    if (vonTag) q = q.gte('tag', vonTag);
    if (bisTag) q = q.lte('tag', bisTag);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return data || [];
  },

  // Bestandswerte — Momentaufnahme, bewusst ohne Datum.
  getStockMetrics: async () => {
    const { data, error } = await supabase.from('crm_stock_metrics').select('metric_key, wert');
    if (error) throw new Error(error.message);
    return data || [];
  },

  // Alle Zielzeilen, inklusive Historie. Welche Zeile an einem Tag gilt,
  // entscheidet zielFuerTag() — hier wird nichts vorgefiltert, damit
  // vergangene Tage gegen das damals gueltige Ziel gemessen werden.
  getMetricTargets: async () => {
    const { data, error } = await supabase
      .from('crm_metric_targets')
      .select('id, metric_key, label, base_value, target_value, comparator, sort_order, valid_from')
      .order('sort_order').order('valid_from');
    if (error) throw new Error(error.message);
    return data || [];
  },

  // Legt eine NEUE Zeile an, statt die alte zu ueberschreiben — sonst wuerde
  // eine Zieländerung die Vergangenheit umschreiben. Aendert man ein Ziel
  // zweimal am selben Tag, gewinnt die letzte Aenderung (unique auf
  // metric_key + valid_from).
  saveMetricTarget: async ({ metric_key, label, base_value, target_value, comparator, sort_order, valid_from }) => {
    const zeile = {
      metric_key,
      label: label ?? null,
      base_value: (base_value === '' || base_value === undefined) ? null : base_value,
      target_value: (target_value === '' || target_value === undefined) ? null : target_value,
      comparator: comparator || '>=',
      sort_order: sort_order ?? 100,
      valid_from: valid_from || new Date().toISOString().slice(0, 10),
      updated_at: new Date().toISOString()
    };
    const { error } = await supabase
      .from('crm_metric_targets')
      .upsert(zeile, { onConflict: 'metric_key,valid_from' });
    if (error) throw new Error(error.message);
    return true;
  },

  // Abgeschlossene Leads, bei denen Wert oder Datum fehlt. Das ist die
  // Arbeitsliste im Dashboard — 55 Abschluesse ohne Wert sind keine Statistik,
  // sondern etwas zu tun.
  getClosedNeedingInput: async (grenze = 50) => {
    const { data, error } = await supabase
      .from(TABLE)
      .select('id, name, size, provi_umsatz, closed_at_ms, last_contact_ms')
      .eq('stage', 'closed')
      .or('provi_umsatz.is.null,closed_at_ms.is.null')
      .order('last_contact_ms', { ascending: false, nullsFirst: false })
      .limit(grenze);
    if (error) throw new Error(error.message);
    return data || [];
  },

  getSettings: async () => {
    const { data, error } = await supabase.from('crm_settings').select('key, value, label');
    if (error) throw new Error(error.message);
    const map = {};
    (data || []).forEach(r => { map[r.key] = r.value; });
    return map;
  },

  saveSetting: async (key, value) => {
    const { error } = await supabase
      .from('crm_settings')
      .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
    if (error) throw new Error(error.message);
    return true;
  },

  getAgentStats: async () => {
    if (!currentUser) throw new Error("Keine Berechtigung");
    
    const { data: users, error: userErr } = await supabase.from('user_profiles').select('id, name, role, daily_call_goal');
    if (userErr) throw new Error(userErr.message);
    
    let stats = {};
    users.forEach(u => {
      stats[u.id] = { 
        id: u.id, name: u.name, role: u.role, daily_call_goal: u.daily_call_goal || 100,
        today: { calls: 0, emails: 0, leads: 0, warm: 0, cold_tarif: 0, cold_gross: 0, offers: 0 },
        week: { calls: 0, emails: 0, leads: 0, warm: 0, cold_tarif: 0, cold_gross: 0, offers: 0 },
        total: { calls: 0, emails: 0, leads: 0, warm: 0, cold_tarif: 0, cold_gross: 0, offers: 0 }
      };
    });

    if (!stats[currentUser.id]) {
      stats[currentUser.id] = {
        id: currentUser.id, name: currentUser.name, role: currentUser.role, daily_call_goal: currentUser.daily_call_goal || 100,
        today: { calls: 0, emails: 0, leads: 0, warm: 0, cold_tarif: 0, cold_gross: 0, offers: 0 },
        week: { calls: 0, emails: 0, leads: 0, warm: 0, cold_tarif: 0, cold_gross: 0, offers: 0 },
        total: { calls: 0, emails: 0, leads: 0, warm: 0, cold_tarif: 0, cold_gross: 0, offers: 0 }
      }
    }
    
    const { data: leads, error } = await supabase.from(TABLE).select('claimed_by, created_at_ms');
    if (error) throw new Error(error.message);

    const { data: allCalls } = await supabase.from('crm_calls').select('by_user_id, ts, status, crm_leads!inner(stage, status, size)');
    const { data: allActs } = await supabase.from('lead_activities').select('by_user_id, ts, type, details');

    // ── Deckel sichtbar machen ─────────────────────────────────────────────
    // Alle drei Abfragen holen ungefiltert. PostgREST liefert hoechstens 1000
    // Zeilen und sagt NICHT, dass gekuerzt wurde — die Zahlen waeren dann
    // stillschweigend zu niedrig. Ein zu niedriger Wert, den niemand bemerkt,
    // ist schlimmer als gar keiner, deshalb steht der Hinweis ab hier in der
    // Rueckgabe und wird im Dashboard angezeigt.
    const DECKEL = 1000;
    const gekuerzt = [
      (leads    || []).length >= DECKEL ? 'Leads'        : null,
      (allCalls || []).length >= DECKEL ? 'Anrufe'       : null,
      (allActs  || []).length >= DECKEL ? 'Aktivitäten'  : null
    ].filter(Boolean);
    if (gekuerzt.length) {
      console.warn(`getAgentStats: ${gekuerzt.join(', ')} an der Ladegrenze von ${DECKEL} Zeilen — die Zahlen sind zu niedrig.`);
    }

    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    
    const dayOfWeek = now.getDay();
    const diffToMonday = now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
    const startOfWeek = new Date(now.getFullYear(), now.getMonth(), diffToMonday).getTime();
    
    for (const row of (leads || [])) {
      if (row.claimed_by && stats[row.claimed_by]) {
        stats[row.claimed_by].total.leads++;
        if (row.created_at_ms >= startOfDay) stats[row.claimed_by].today.leads++;
        if (row.created_at_ms >= startOfWeek) stats[row.claimed_by].week.leads++;
      }
    }

    for (const call of (allCalls || [])) {
      if (call.by_user_id && stats[call.by_user_id]) {
        const isToday = call.ts >= startOfDay;
        const isWeek = call.ts >= startOfWeek;
        const l = call.crm_leads;
        const isWarm = l && (l.stage === 'pitch' || l.stage === 'data' || l.stage === 'offer' || l.status === 'Kunde');
        const isGross = l && l.size === 'Großkunde';

        stats[call.by_user_id].total.calls++;
        if (isToday) {
          stats[call.by_user_id].today.calls++;
          if (isWarm) stats[call.by_user_id].today.warm++;
          else if (isGross) stats[call.by_user_id].today.cold_gross++;
          else stats[call.by_user_id].today.cold_tarif++;
        }
        if (isWeek) {
          stats[call.by_user_id].week.calls++;
          if (isWarm) stats[call.by_user_id].week.warm++;
          else if (isGross) stats[call.by_user_id].week.cold_gross++;
          else stats[call.by_user_id].week.cold_tarif++;
        }

      }
    }
    
    for (const act of (allActs || [])) {
      if (act.by_user_id && stats[act.by_user_id]) {
        const isToday = act.ts >= startOfDay;
        const isWeek = act.ts >= startOfWeek;
        
        // Schriftlicher Kontakt: 'message' ist der heutige Typ, 'email' und
        // 'whatsapp' sind Altbestand. Alle drei zaehlen gleich.
        if (act.type === 'message' || act.type === 'email' || act.type === 'whatsapp') {
          stats[act.by_user_id].total.emails++;
          if (isToday) stats[act.by_user_id].today.emails++;
          if (isWeek) stats[act.by_user_id].week.emails++;
        } else if (act.type === 'status_change' && (act.details || '').includes('OFFER')) {
          stats[act.by_user_id].total.offers++;
          if (isToday) stats[act.by_user_id].today.offers++;
          if (isWeek) stats[act.by_user_id].week.offers++;
        }
      }
    }
    const ergebnis = Object.values(stats);
    if (gekuerzt.length) {
      // Am Ergebnis statt als zusaetzlicher Rueckgabewert: die Aufrufer
      // behandeln es als Liste, ein zweiter Wert wuerde stillschweigend
      // verlorengehen.
      ergebnis.unvollstaendig = `${gekuerzt.join(', ')} an der Ladegrenze (${DECKEL} Zeilen) — die Zahlen sind zu niedrig.`;
    }
    return ergebnis;
  },
  getUserRP: async (userId) => {
    const { data, error } = await supabase
      .from(TABLE)
      .select('size')
      .eq('claimed_by', userId)
      .eq('status', 'Kunde');
    if (error) throw new Error(error.message);
    let rp = 0;
    (data || []).forEach(lead => {
      rp += (lead.size === 'Großkunde') ? 5 : 1;
    });
    return rp;
  },

  // ── Notifications ───────────────────────────────────────────────────────────
  getNotifications: async () => {
    if (!currentUser) return [];
    const { data, error } = await supabase
      .from('crm_notifications')
      .select('*')
      .eq('user_id', currentUser.id)
      .order('created_at', { ascending: false });
    if (error) { console.error("Notifications error", error); return []; }
    return data || [];
  },

  markNotificationRead: async (id) => {
    const { error } = await supabase
      .from('crm_notifications')
      .update({ is_read: true })
      .eq('id', id);
    if (error) console.error("Mark read error", error);
  },

  sendNotification: async (userId, type, leadId, message) => {
    if (!currentUser) return false;
    const { error } = await supabase
      .from('crm_notifications')
      .insert({
        user_id: userId,
        type: type,
        lead_id: leadId || null,
        message: message
      });
    if (error) { console.error("Send notification error", error); return false; }
    return true;
  },
  
  subscribeToNotifications: (callback) => {
    if (!currentUser) return () => {};
    const channel = supabase
      .channel('crm_notifications_changes')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'crm_notifications', filter: `user_id=eq.${currentUser.id}` },
        payload => {
          callback(payload.new);
        }
      )
      .subscribe();
    return () => supabase.removeChannel(channel);
  }
};
