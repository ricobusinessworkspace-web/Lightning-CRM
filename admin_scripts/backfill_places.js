const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://duzmanqvyhqurxlpxrrg.supabase.co';
// Der anon-Schluessel ist oeffentlich gedacht (geschuetzt wird ueber die
// Zugriffsregeln) — anders als der Google-Schluessel darueber.
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR1em1hbnF2eWhxdXJ4bHB4cnJnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzOTk1NTQsImV4cCI6MjA5NDk3NTU1NH0.v7dSCQQn2T_3LHrTj4j2K5Byz3oKvuKE2zO7M9BA4Uo';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── Google-Schlüssel ───────────────────────────────────────────────────────
// Stand hier bis zum 11.09.2026 im Klartext — in einem oeffentlichen
// Repository. Der alte Schluessel ist damit verbrannt und muss in der Google
// Cloud Console gesperrt werden; aus der Git-Historie bekommt man ihn nicht
// mehr heraus. Neuer Schluessel kommt aus der Umgebung:
//
//     GOOGLE_PLACES_API_KEY=... node admin_scripts/backfill_places.js
//
const apiKey = process.env.GOOGLE_PLACES_API_KEY;
if (!apiKey) {
  console.error('GOOGLE_PLACES_API_KEY fehlt. Aufruf:');
  console.error('  GOOGLE_PLACES_API_KEY=dein_schluessel node admin_scripts/backfill_places.js');
  process.exit(1);
}

async function run() {
  console.log("Fetching leads with google_place_id...");
  const { data: leads, error } = await supabase.from('crm_leads').select('*').not('google_place_id', 'is', null).neq('google_place_id', '');
  if (error) throw error;
  
  console.log(`Found ${leads.length} leads to check.`);
  let updatedCount = 0;

  for (const lead of leads) {
    try {
      const res = await fetch(`https://places.googleapis.com/v1/places/${lead.google_place_id}`, {
        headers: {
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': 'regularOpeningHours'
        }
      });
      
      const data = await res.json();
      
      let opening_hours = null;
      if (data.regularOpeningHours && data.regularOpeningHours.weekdayDescriptions) {
        opening_hours = data.regularOpeningHours.weekdayDescriptions;
      }
      
      if (opening_hours) {
        let locations = lead.locations ? (typeof lead.locations === 'string' ? JSON.parse(lead.locations) : lead.locations) : [];
        if (!Array.isArray(locations)) locations = [];
        
        let changed = false;
        if (locations.length === 0) {
          locations.push({
             address: lead.maps_city,
             lat: lead.lat,
             lng: lead.lng,
             place_id: lead.google_place_id,
             opening_hours: opening_hours
          });
          changed = true;
        } else {
          if (!locations[0].opening_hours) {
             locations[0].opening_hours = opening_hours;
             changed = true;
          }
        }
        
        if (changed) {
          console.log(`Updating lead ${lead.id} (${lead.name}) with opening hours...`);
          await supabase.from('crm_leads').update({ locations }).eq('id', lead.id);
          updatedCount++;
        }
      }
    } catch(e) {
      console.error(`Error for lead ${lead.id}:`, e.message);
    }
  }
  console.log(`Finished! Updated ${updatedCount} leads.`);
}

run();
