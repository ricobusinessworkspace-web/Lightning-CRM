import { createClient } from '@supabase/supabase-js';
import { db } from './core/db.js';

async function testSave() {
  const alanId = '575dae28-49b9-47f3-ac9b-84eb1830eaac';
  
  // mock currentUser for db.js
  db.getCurrentUser = async () => ({ id: 'mock-user', role: 'admin' });

  console.log('Fetching one lead using db.getLeads...');
  const leads = await db.getLeads({all:true});
  const lead = leads[0];
  console.log('Got lead:', lead.id, lead.name);

  // simulate UI passing it back
  const uiPayload = {
        ...lead,
        claimed_by: alanId
  };

  console.log('Attempting to db.saveLead...');
  try {
     await db.saveLead(uiPayload);
     console.log('Update succeeded!');
  } catch (err) {
     console.error('Update failed:', err);
  }
}

testSave();
