const { createClient } = require('@supabase/supabase-js');
const sb = createClient('https://xyz.supabase.co', 'eyJ...');
let query = sb.from('test').select('*');
query = query.or('and(status.eq.Lead,stage.eq.cold),claimed_by.eq.123');
console.log(query.url.toString());
