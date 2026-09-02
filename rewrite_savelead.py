import re

with open('core/db.js', 'r') as f:
    content = f.read()

# The saveLead function starts at "saveLead: async (lead) => {"
# and ends before "logCall: async (id, status = 'answered') => {"
start_idx = content.find("saveLead: async (lead) => {")
end_idx = content.find("logCall: async (id, status = 'answered') => {")

if start_idx == -1 or end_idx == -1:
    print("Could not find start or end index.")
    exit(1)
    
# Extract indentation before logCall
end_part = content[end_idx-20:end_idx]
newline_idx = end_part.rfind('\n')
indent = end_part[newline_idx+1:] if newline_idx != -1 else '  '

new_save_lead = """saveLead: async (lead) => {
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
      'name', 'phone', 'notes', 'size', 'entscheider', 'termin', 'rechnung', 'snooze_until_ms',
      'status', 'task_text', 'maps_city', 'lat', 'lng', 'website_url', 'google_maps_url',
      'google_place_id', 'umsatz', 'starred', 'interest_strom', 'interest_gas', 'closed_strom',
      'closed_gas', 'zaehlernummern', 'abschlussdatum', 'provi_umsatz', 'last_edited_ms',
      'locations', 'email', 'impressum_phone', 'legal_company_name', 'director_name',
      'phone_source', 'estimated_kwh', 'opening_hours', 'linked_leads', 'last_contact_ms',
      'claimed_by', 'created_at_ms'
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
        .select('created_at_ms, claimed_by, entscheider, termin, rechnung, status, last_edited_ms')
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
      const pEnt = 'entscheider' in payload ? payload.entscheider : existing.entscheider;
      const pTer = 'termin' in payload ? payload.termin : existing.termin;
      const pRech = 'rechnung' in payload ? payload.rechnung : existing.rechnung;
      const pStat = 'status' in payload ? payload.status : existing.status;
      
      const isInPipeline = pEnt === 1 || pTer === 1 || pRech === 1 || pStat === 'Kunde';
      let finalClaimedBy = undefined;
      
      if ('claimed_by' in lead) {
        finalClaimedBy = lead.claimed_by === 'unassigned' ? null : lead.claimed_by;
      } else {
        if (currentUser && !existing.claimed_by && isInPipeline) {
          finalClaimedBy = currentUser.id;
        } else if (!isInPipeline && existing.claimed_by) {
          finalClaimedBy = null;
        }
      }
      
      if (finalClaimedBy !== undefined) {
        payload.claimed_by = finalClaimedBy;
      }

      if (!existing.created_at_ms && !('created_at_ms' in payload)) {
        payload.created_at_ms = now;
      }

      // Phase 3.3: Statuswechsel-Logging (entkoppelt von window.api)
      try {
        if (pEnt === 1 && existing.entscheider !== 1) await db.logStatusChange(lead.id, 'PITCH');
        if (pTer === 1 && existing.termin !== 1) await db.logStatusChange(lead.id, 'FOLLOW-UP');
        if (pRech === 1 && existing.rechnung !== 1) await db.logStatusChange(lead.id, 'OFFER');
        if (pStat === 'Kunde' && existing.status !== 'Kunde') await db.logStatusChange(lead.id, 'CLOSED');
        if (pEnt === 0 && pTer === 0 && pRech === 0 && pStat === 'Lead' && (existing.entscheider !== 0 || existing.termin !== 0 || existing.rechnung !== 0)) {
          await db.logStatusChange(lead.id, 'COLD');
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
         
         return { id: existingDup.id, inserted: false, updated: 1, duplicate_prevented: true };
      }

      // No duplicate found, safe to insert!
      const { data, error } = await supabase.from(TABLE).insert(payload).select('id').single();
      if (error) throw new Error(error.message || error.details || JSON.stringify(error));
      
      const registerLocalWrite = (id) => {
        if (typeof window !== 'undefined' && window.pendingLocalWrites) {
          window.pendingLocalWrites.add(id);
          setTimeout(() => window.pendingLocalWrites.delete(id), 2000);
        }
      };
      if (data && data.id) registerLocalWrite(data.id);

      return { id: data.id, inserted: true };
    }
  },
"""

new_content = content[:start_idx] + new_save_lead + indent + content[end_idx:]

with open('core/db.js', 'w') as f:
    f.write(new_content)
    
print("Rewrite complete.")
