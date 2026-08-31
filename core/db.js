/**
 * core/db.js — Supabase Cloud Backend
 * ─────────────────────────────────────────────────────────────────────────────
 * Hybrid Migration: SQLite → Supabase
 * The public API (exported functions) is 100% identical to the old SQLite
 * version — main.js and all IPC handlers require ZERO changes (except additions).
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * call_history format (upgraded, backward-compat):
 *   New entries:  { ts: number, status: 'answered' | 'not_answered' }
 *   Old entries:  number (bare ms timestamp) — treated as 'answered'
 *
 * Normalisation helper: normalizeCallEntry(entry) → { ts, status }
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
  if (typeof entry === 'number') return { ts: entry, status: 'answered', type: 'call' };
  if (entry && typeof entry === 'object' && entry.ts) {
    return { ts: entry.ts, status: entry.status || 'answered', type: entry.type || 'call', by_user_name: entry.by_user_name, by_user_id: entry.by_user_id };
  }
  return null;
}

function parseCallHistory(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map(normalizeCallEntry).filter(Boolean);
}

// ─── Derive call status from history ─────────────────────────────────────────
// Returns 'never' | 'answered' | 'not_answered'
function deriveCallStatus(callHistory) {
  const history = parseCallHistory(callHistory);
  if (history.length === 0) return 'never';
  // Use the most recent entry
  const last = history[history.length - 1];
  return last.status;
}

// ─── Email task snooze check ──────────────────────────────────────────────────
// Returns true if lead has at least one undone email/mail task
function hasActiveEmailTask(taskText) {
  if (!taskText || !taskText.trim()) return false;
  try {
    const tasks = JSON.parse(taskText);
    if (!Array.isArray(tasks)) return false;
    return tasks.some(t => !t.done && (
      t.text.toLowerCase().includes('email') ||
      t.text.toLowerCase().includes('mail')
    ));
  } catch (e) {
    // Legacy plain-string task_text
    const lower = taskText.toLowerCase();
    return lower.includes('email') || lower.includes('mail');
  }
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
    } else if (filters.tab === 'queue' || filters.tab === 'cold') {
      // Email snooze: exclude leads with active email tasks
      results = results.filter(r => {
        const snoozedByEmail = hasActiveEmailTask(r.task_text);
        if (snoozedByEmail) {
          r._emailSnoozed = true;
          return false;
        }
        return true;
      });
    }
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
      if (l.rechnung)           return 3;
      if (l.termin)             return 2;
      if (l.entscheider)        return 1;
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
          query = query.eq('status', 'Lead').eq('entscheider', 0).eq('termin', 0).eq('rechnung', 0);
        } else if (filters.filter1 === 'entscheider') {
          query = query.eq('status', 'Lead').eq('entscheider', 1).eq('termin', 0).eq('rechnung', 0);
        } else if (filters.filter1 === 'termin') {
          query = query.eq('status', 'Lead').eq('termin', 1).eq('rechnung', 0);
        } else if (filters.filter1 === 'rechnung') {
          query = query.eq('status', 'Lead').eq('rechnung', 1);
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
      query = query.or(`and(status.eq.Lead,entscheider.eq.0,termin.eq.0,rechnung.eq.0),claimed_by.eq.${currentUser.id}`);
    }

    // Since we need relational sorting for crm_calls, keep this:
    query = query
      .order('ts', { foreignTable: 'crm_calls', ascending: false }).limit(3, { foreignTable: 'crm_calls' })
      .order('ts', { foreignTable: 'lead_activities', ascending: false }).limit(3, { foreignTable: 'lead_activities' });

    const { data, error } = await query;
    if (error) throw new Error(error.message || error.details || JSON.stringify(error));

    let leads = data || [];

    return postProcessAndSort(leads, filters);
  },

  // ── saveLead ───────────────────────────────────────────────────────────────

  getLeadHistory: async (leadId) => {
    const { data: calls, error: err1 } = await supabase.from('crm_calls').select('*').eq('lead_id', leadId).order('ts', { ascending: true });
    const { data: acts, error: err2 } = await supabase.from('lead_activities').select('*').eq('lead_id', leadId).order('ts', { ascending: true });
    
    if (err1 || err2) {
      console.warn('Failed to fetch full history', err1 || err2);
      return { crm_calls: [], lead_activities: [] };
    }
    
    return { crm_calls: calls || [], lead_activities: acts || [] };
  },
  
  saveLead: async (lead) => {
    const now = Date.now();

    const locations = lead.locations
      ? (typeof lead.locations === 'string' ? JSON.parse(lead.locations) : lead.locations)
      : [];

    const linked_leads = lead.linked_leads
      ? (typeof lead.linked_leads === 'string' ? JSON.parse(lead.linked_leads) : lead.linked_leads)
      : [];

    const payload = {
      name:               lead.name,
      phone:              lead.phone               ?? '',
      notes:              lead.notes               ?? '',
      size:               lead.size                ?? 'Tarifkunde',
      entscheider:        lead.entscheider         ?? 0,
      termin:             lead.termin              ?? 0,
      rechnung:           lead.rechnung            ?? 0,
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
      provi_umsatz:       lead.provi_umsatz        ?? 0,
      last_edited_ms:     now,
      locations,
      email:              lead.email               ?? '',
      impressum_phone:    lead.impressum_phone     ?? '',
      legal_company_name: lead.legal_company_name  ?? '',
      director_name:      lead.director_name       ?? '',
      phone_source:       lead.phone_source        ?? '',
      estimated_kwh:      lead.estimated_kwh       ?? 0,
      opening_hours:      lead.opening_hours       ? (typeof lead.opening_hours === 'string' ? JSON.parse(lead.opening_hours) : lead.opening_hours) : null,
      linked_leads,
    };

    if (lead.last_contact_ms !== undefined) {
      payload.last_contact_ms = lead.last_contact_ms;
    }

    let existing = null;
    if (lead.id) {
      const { data } = await supabase.from(TABLE).select('created_at_ms, claimed_by, entscheider, termin, rechnung, status').eq('id', lead.id).single();
      existing = data;
    }

    let finalClaimedBy = null;
    if (lead.claimed_by !== undefined) {
      finalClaimedBy = lead.claimed_by === 'unassigned' ? null : lead.claimed_by;
    } else {
      finalClaimedBy = existing ? existing.claimed_by : null;
    }

    const isInPipeline = payload.entscheider === 1 || payload.termin === 1 || payload.rechnung === 1 || payload.status === 'Kunde';
    
    if (currentUser && !finalClaimedBy && isInPipeline) {
      finalClaimedBy = currentUser.id;
    } else if (!isInPipeline && lead.claimed_by === undefined) {
      finalClaimedBy = null;
    }
    
    payload.claimed_by = finalClaimedBy;

    if (lead.id) {
      if (existing && !existing.created_at_ms) {
        payload.created_at_ms = now;
      }

      // Check for status changes
      if (existing) {
        try {
          if (payload.entscheider === 1 && existing.entscheider !== 1) await window.api.logStatusChange(lead.id, 'PITCH');
          if (payload.termin === 1 && existing.termin !== 1) await window.api.logStatusChange(lead.id, 'FOLLOW-UP');
          if (payload.rechnung === 1 && existing.rechnung !== 1) await window.api.logStatusChange(lead.id, 'OFFER');
          if (payload.status === 'Kunde' && existing.status !== 'Kunde') await window.api.logStatusChange(lead.id, 'CLOSED');
          if (payload.entscheider === 0 && payload.termin === 0 && payload.rechnung === 0 && payload.status === 'Lead' && (existing.entscheider !== 0 || existing.termin !== 0 || existing.rechnung !== 0)) {
            await window.api.logStatusChange(lead.id, 'COLD');
          }
        } catch(e) {
          console.warn('Could not log status change (maybe lead_activities table is missing)', e);
        }
      }

      const { error } = await supabase.from(TABLE).update(payload).eq('id', lead.id);
      if (error) throw new Error(error.message || error.details || JSON.stringify(error));
      return { id: lead.id, updated: 1 };
    } else {
      // DEDUPLICATION CHECK: Never allow a duplicate to be inserted
      let dupQuery = supabase.from(TABLE).select('*');
      if (payload.google_place_id) {
         dupQuery = dupQuery.eq('google_place_id', payload.google_place_id);
      } else {
         dupQuery = dupQuery.eq('name', payload.name).eq('maps_city', payload.maps_city);
      }
      
      const { data: dupData } = await dupQuery;
      
      if (dupData && dupData.length > 0) {
         // Duplicate found! We DO NOT insert. We merge non-destructive data into the first duplicate.
         const existingDup = dupData[0];
         const updatePayload = {};
         for (const key in payload) {
            // Only update if the existing field is empty or falsy, and the new payload has a value
            // (Don't overwrite existing user data!)
            if ((!existingDup[key] || existingDup[key] === 0 || existingDup[key] === '') && payload[key]) {
               updatePayload[key] = payload[key];
            }
         }
         
         if (Object.keys(updatePayload).length > 0) {
            updatePayload.last_edited_ms = now;
            const { error: updErr } = await supabase.from(TABLE).update(updatePayload).eq('id', existingDup.id);
            if (updErr) throw new Error(updErr.message || updErr.details || JSON.stringify(updErr));
         }
         
         return { id: existingDup.id, inserted: false, updated: 1, duplicate_prevented: true };
      }

      // No duplicate found, safe to insert!
      payload.created_at_ms   = now;
      payload.last_contact_ms = lead.last_contact_ms ?? 0;

      const { data, error } = await supabase.from(TABLE).insert(payload).select('id').single();
      if (error) throw new Error(error.message || error.details || JSON.stringify(error));
      return { id: data.id, inserted: true };
    }
  },

  // ── logCall ────────────────────────────────────────────────────────────────
  logCall: async (id, status = 'answered') => {
    const now = Date.now();
    try {
      const entry = { lead_id: id, ts: now, status, type: 'call' };
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

  // ── logEmail ───────────────────────────────────────────────────────────────
  logEmail: async (id) => {
    const now = Date.now();
    try {
      const entry = { lead_id: id, ts: now, type: 'email', details: 'E-Mail gesendet' };
      if (currentUser) {
        entry.by_user_id = currentUser.id;
        entry.by_user_name = currentUser.name;
      }
      await supabase.from('lead_activities').insert(entry);

      const { data, error } = await supabase
        .from(TABLE)
        .update({ last_contact_ms: now })
        .eq('id', id)
        .select('*, crm_calls(*), lead_activities(*)');

      if (error) throw error;
      return Array.isArray(data) ? data[0] : data;
    } catch (e) {
      console.error('logEmail error:', e);
      return null;
    }
  },

  // ── logStatusChange ────────────────────────────────────────────────────────
  logStatusChange: async (id, newStatus) => {
    const now = Date.now();
    try {
      const entry = { lead_id: id, ts: now, type: 'status_change', details: `Status geändert auf ${newStatus}` };
      if (currentUser) {
        entry.by_user_id = currentUser.id;
        entry.by_user_name = currentUser.name;
      }
      await supabase.from('lead_activities').insert(entry);
    } catch (e) {
      console.error('logStatusChange error:', e);
    }
  },

  // ── markCallNotAnswered ────────────────────────────────────────────────────
  markCallNotAnswered: async (leadId, callTs) => {
    try {
      // Find the specific call and update its status
      const { data: callData, error: callErr } = await supabase
        .from('crm_calls')
        .update({ status: 'not_answered' })
        .eq('lead_id', leadId)
        .eq('ts', callTs)
        .eq('type', 'call')
        .select();

      if (callErr) throw callErr;
      if (!callData || callData.length === 0) return null;

      // Update snooze logic
      const { data: row, error: fetchErr } = await supabase
        .from(TABLE).select('snooze_until_ms').eq('id', leadId).single();
      if (fetchErr) throw fetchErr;

      const now = Date.now();
      let snoozeUntilMs = row.snooze_until_ms || 0;
      if (!snoozeUntilMs || snoozeUntilMs < now) {
        // Set to 4 PM next business day if it's currently earlier
        const d = new Date();
        if (d.getHours() < 16) {
          d.setHours(16, 0, 0, 0);
          snoozeUntilMs = d.getTime();
        } else {
          // If already past 4 PM, just add 15 minutes as fallback
          snoozeUntilMs = Date.now() + 15 * 60 * 1000;
        }
      } else {
        snoozeUntilMs = Date.now() + 15 * 60 * 1000;
      }

      const { data, error } = await supabase
      .from(TABLE)
      .update({ snooze_until_ms: snoozeUntilMs })
      .eq('id', leadId)
      .select('*, crm_calls(*)');

      if (error) throw error;
      return Array.isArray(data) ? data[0] : data;
    } catch (e) {
      console.error('markCallNotAnswered error:', e);
      return null;
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
        call_history:    [],
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
          callback(eventType, newRow ? normalizeRow(newRow) : null, oldRow || null);
        }
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  },

  // ── Auth Methods ───────────────────────────────────────────────────────────
  getCurrentUser: async () => {
    if (currentUser) return currentUser;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return null;
    
    // Fetch profile
    const { data: profile } = await supabase.from('user_profiles').select('*').eq('id', session.user.id).single();
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
    const { data: profile } = await supabase.from('user_profiles').select('*').eq('id', data.session.user.id).single();
    if (profile && profile.daily_call_goal === -1) {
      await supabase.auth.signOut();
      throw new Error('Dein Account wurde vom Administrator deaktiviert.');
    }
    currentUser = { 
      id: data.session.user.id, 
      email: data.session.user.email, 
      name: profile ? profile.name : 'Unknown', 
      role: profile ? profile.role : 'minion',
      daily_call_goal: profile ? (profile.daily_call_goal || 100) : 100
    };
    return currentUser;
  },

  register: async (email, password) => {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw new Error(error.message);
    
    // Fallback: If trigger doesn't exist, try to insert profile manually
    if (data.user) {
       await supabase.from('user_profiles').insert({ id: data.user.id, name: email.split('@')[0], role: 'minion', daily_call_goal: 100 });
       currentUser = { 
         id: data.user.id, 
         email: data.user.email, 
         name: email.split('@')[0], 
         role: 'minion',
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
      const res = await fetch(`${baseUrl}/api/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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

  getAgentStats: async () => {
    if (!currentUser) throw new Error("Keine Berechtigung");
    
    const { data: users, error: userErr } = await supabase.from('user_profiles').select('id, name, role, daily_call_goal');
    if (userErr) throw new Error(userErr.message);
    
    let stats = {};
    users.forEach(u => {
      stats[u.id] = { 
        id: u.id, name: u.name, role: u.role, daily_call_goal: u.daily_call_goal || 100,
        today: { calls: 0, unanswered: 0, emails: 0, leads: 0, warm: 0, cold_tarif: 0, cold_gross: 0, offers: 0 },
        week: { calls: 0, unanswered: 0, emails: 0, leads: 0, warm: 0, cold_tarif: 0, cold_gross: 0, offers: 0 },
        total: { calls: 0, unanswered: 0, emails: 0, leads: 0, warm: 0, cold_tarif: 0, cold_gross: 0, offers: 0 }
      };
    });

    if (!stats[currentUser.id]) {
      stats[currentUser.id] = {
        id: currentUser.id, name: currentUser.name, role: currentUser.role, daily_call_goal: currentUser.daily_call_goal || 100,
        today: { calls: 0, unanswered: 0, emails: 0, leads: 0, warm: 0, cold_tarif: 0, cold_gross: 0, offers: 0 },
        week: { calls: 0, unanswered: 0, emails: 0, leads: 0, warm: 0, cold_tarif: 0, cold_gross: 0, offers: 0 },
        total: { calls: 0, unanswered: 0, emails: 0, leads: 0, warm: 0, cold_tarif: 0, cold_gross: 0, offers: 0 }
      }
    }
    
    const { data: leads, error } = await supabase.from(TABLE).select('claimed_by, created_at_ms');
    if (error) throw new Error(error.message);

    const { data: allCalls } = await supabase.from('crm_calls').select('by_user_id, ts, status, crm_leads!inner(entscheider, termin, rechnung, status, size)');
    const { data: allActs } = await supabase.from('lead_activities').select('by_user_id, ts, type, details');

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
        const isWarm = l && (l.entscheider === 1 || l.termin === 1 || l.rechnung === 1 || l.status === 'Kunde');
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

        if (call.status === 'not_answered') {
          stats[call.by_user_id].total.unanswered++;
          if (isToday) stats[call.by_user_id].today.unanswered++;
          if (isWeek) stats[call.by_user_id].week.unanswered++;
        }
      }
    }
    
    for (const act of (allActs || [])) {
      if (act.by_user_id && stats[act.by_user_id]) {
        const isToday = act.ts >= startOfDay;
        const isWeek = act.ts >= startOfWeek;
        
        if (act.type === 'email') {
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
    return Object.values(stats);
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
