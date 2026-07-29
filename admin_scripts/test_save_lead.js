import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://duzmanqvyhqurxlpxrrg.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR1em1hbnF2eWhxdXJ4bHB4cnJnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzOTk1NTQsImV4cCI6MjA5NDk3NTU1NH0.v7dSCQQn2T_3LHrTj4j2K5Byz3oKvuKE2zO7M9BA4Uo';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function testSave() {
  console.log('Fetching users to find Alan...');
  const { data: users, error: uErr } = await supabase.from('user_profiles').select('*');
  if (uErr) {
    console.error('User fetch error:', uErr);
    return;
  }
  
  const alan = users.find(u => u.name && u.name.toLowerCase().includes('alan'));
  console.log('Alan ID:', alan ? alan.id : 'Not found');

  if (!alan) return;

  console.log('Fetching one lead...');
  const { data: leads, error: lErr } = await supabase.from('crm_leads').select('*').limit(1);
  if (lErr) {
    console.error('Lead fetch error:', lErr);
    return;
  }
  const lead = leads[0];
  console.log('Got lead:', lead.id, lead.name);
  
  // Prepare payload exactly as in db.js
  const payload = {
     claimed_by: alan.id,
     linked_leads: [],
     opening_hours: null,
     name: lead.name,
     // just these fields
  };

  console.log('Attempting to update lead to Alan...');
  const { error: updErr } = await supabase.from('crm_leads').update(payload).eq('id', lead.id);
  
  if (updErr) {
     console.error('Update failed with error:', updErr);
  } else {
     console.log('Update succeeded!');
  }
}

testSave();
