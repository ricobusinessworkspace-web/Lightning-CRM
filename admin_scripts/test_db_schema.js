import { createClient } from '@supabase/supabase-js';
const supabase = createClient('https://duzmanqvyhqurxlpxrrg.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR1em1hbnF2eWhxdXJ4bHB4cnJnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzOTk1NTQsImV4cCI6MjA5NDk3NTU1NH0.v7dSCQQn2T_3LHrTj4j2K5Byz3oKvuKE2zO7M9BA4Uo');

async function testCols(cols) {
  for (let c of cols) {
    const { error } = await supabase.from('crm_leads').select(c).limit(1);
    if (error) console.log(`Missing: ${c}`);
  }
}
testCols(['impressum_phone', 'legal_company_name', 'director_name', 'phone_source', 'estimated_kwh', 'locations']);
