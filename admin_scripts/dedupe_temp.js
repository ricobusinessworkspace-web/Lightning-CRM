const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL     = 'https://duzmanqvyhqurxlpxrrg.supabase.co';
const SUPABASE_KEY     = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR1em1hbnF2eWhxdXJ4bHB4cnJnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzOTk1NTQsImV4cCI6MjA5NDk3NTU1NH0.v7dSCQQn2T_3LHrTj4j2K5Byz3oKvuKE2zO7M9BA4Uo';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const TABLE = 'crm_leads';

async function main() {
  const { data: allLeads, error } = await supabase.from(TABLE).select('*');
  if (error) {
    console.error("Error fetching leads:", error);
    return;
  }
  
  const groups = {};
  for (const l of allLeads) {
    let key = '';
    if (l.google_place_id) {
       key = 'gid_' + l.google_place_id;
    } else {
       const name = (l.name || '').toLowerCase().trim();
       const city = (l.maps_city || '').toLowerCase().trim();
       key = 'name_' + name + '_' + city;
    }
    if (!groups[key]) groups[key] = [];
    groups[key].push(l);
  }

  let mergedCount = 0;
  let deletedCount = 0;

  for (const key in groups) {
    const group = groups[key];
    if (group.length > 1) {
      // Sort to find the primary
      group.sort((a, b) => {
         const statusScore = (s) => (s === 'Kunde' ? 2 : (s === 'Interessiert' ? 1 : 0));
         const scoreA = statusScore(a.status);
         const scoreB = statusScore(b.status);
         if (scoreA !== scoreB) return scoreB - scoreA;
         if ((a.last_contact_ms || 0) !== (b.last_contact_ms || 0)) return (b.last_contact_ms || 0) - (a.last_contact_ms || 0);
         return (b.created_at_ms || 0) - (a.created_at_ms || 0);
      });

      const primary = group[0];
      let updatedPrimary = false;

      for (let i = 1; i < group.length; i++) {
         const dup = group[i];
         
         // Merge text/number fields
         const fieldsToMerge = ['phone', 'email', 'notes', 'maps_city', 'website_url', 'opening_hours', 'director_name', 'google_maps_url', 'zaehlernummern', 'abschlussdatum'];
         for (const f of fieldsToMerge) {
           if (!primary[f] && dup[f]) {
             primary[f] = dup[f];
             updatedPrimary = true;
           } else if (f === 'notes' && dup[f] && primary[f] && !primary[f].includes(dup[f])) {
             primary[f] += '\n' + dup[f];
             updatedPrimary = true;
           }
         }

         // Merge numeric/boolean flags
         const numericFields = ['entscheider', 'termin', 'rechnung', 'umsatz', 'provi_umsatz'];
         for (const f of numericFields) {
           if (!primary[f] && dup[f]) {
             primary[f] = dup[f];
             updatedPrimary = true;
           }
         }
         if (dup.starred === 1 && primary.starred !== 1) {
             primary.starred = 1;
             updatedPrimary = true;
         }

         // Merge call_history
         const histP = Array.isArray(primary.call_history) ? primary.call_history : [];
         const histD = Array.isArray(dup.call_history) ? dup.call_history : [];
         if (histD.length > 0) {
            const combined = [...histP, ...histD];
            const uniqueHist = [];
            const seenTs = new Set();
            for (const entry of combined) {
               const ts = typeof entry === 'number' ? entry : entry.ts;
               if (ts && !seenTs.has(ts)) {
                  seenTs.add(ts);
                  uniqueHist.push(entry);
               }
            }
            uniqueHist.sort((a,b) => {
               const ta = typeof a === 'number' ? a : a.ts;
               const tb = typeof b === 'number' ? b : b.ts;
               return ta - tb;
            });
            primary.call_history = uniqueHist;
            
            if (uniqueHist.length > 0) {
              const last = uniqueHist[uniqueHist.length - 1];
              primary.last_contact_ms = typeof last === 'number' ? last : (last?.ts || 0);
            }
            updatedPrimary = true;
         }
         
         // Delete duplicate
         const { error: delErr } = await supabase.from(TABLE).delete().eq('id', dup.id);
         if (!delErr) deletedCount++;
      }
      
      if (updatedPrimary) {
         primary.last_edited_ms = Date.now();
         const { id, created_at, ...updatePayload } = primary;
         const { error: updErr } = await supabase.from(TABLE).update(updatePayload).eq('id', primary.id);
         if (!updErr) mergedCount++;
      }
    }
  }

  console.log(`Deduplizierung fertig! ${mergedCount} Leads aktualisiert, ${deletedCount} Duplikate gelöscht.`);
}

main();
