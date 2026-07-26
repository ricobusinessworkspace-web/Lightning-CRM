import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { subscription, userId } = req.body;
  
  if (!subscription || !userId) {
    return res.status(400).json({ error: 'Missing subscription or userId' });
  }

  const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://duzmanqvyhqurxlpxrrg.supabase.co';
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'Missing Service Role Key' });
  }

  try {
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // We can just try to insert. To prevent dupes on endpoint, we could do a select first.
    const { data: existing } = await supabaseAdmin
      .from('crm_push_subscriptions')
      .select('id, subscription')
      .eq('user_id', userId);
      
    // Find if endpoint already exists
    const exists = existing && existing.some(row => row.subscription && row.subscription.endpoint === subscription.endpoint);

    if (exists) {
      return res.status(200).json({ success: true, message: 'Already subscribed' });
    }

    const { error } = await supabaseAdmin
      .from('crm_push_subscriptions')
      .insert({
        user_id: userId,
        subscription: subscription
      });

    if (error) throw error;

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Subscription error:', error);
    res.status(500).json({ error: error.message });
  }
}
