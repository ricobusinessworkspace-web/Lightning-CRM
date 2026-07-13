import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL     = 'https://duzmanqvyhqurxlpxrrg.supabase.co';
const SUPABASE_KEY     = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR1em1hbnF2eWhxdXJ4bHB4cnJnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzOTk1NTQsImV4cCI6MjA5NDk3NTU1NH0.v7dSCQQn2T_3LHrTj4j2K5Byz3oKvuKE2zO7M9BA4Uo';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
  const { data: users, error: fetchErr } = await supabase.from('user_profiles').select('*');
  if (fetchErr) {
    console.error('Error fetching users:', fetchErr);
    return;
  }
  
  const alan = users.find(u => u.name && u.name.toLowerCase().includes('alan'));
  if (!alan) {
    console.log('User alan not found!');
    return;
  }

  const { data: updated, error: updateErr } = await supabase
    .from('user_profiles')
    .update({ role: 'admin' })
    .eq('id', alan.id)
    .select();

  if (updateErr) {
    console.error('Error updating alan:', updateErr);
  } else {
    console.log('Successfully updated alan to admin:', updated);
  }
}

main();
