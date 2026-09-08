import { createClient } from '@supabase/supabase-js';
import { requireAdmin } from './_lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // Autorisierung MUSS serverseitig passieren: dieser Endpoint haelt den
  // Service-Role-Key und kann beliebige Accounts anlegen.
  let inviter;
  try {
    inviter = await requireAdmin(req);
  } catch (err) {
    return res.status(err.status || 401).json({ error: err.message });
  }

  const { email } = req.body || {};
  if (!email || typeof email !== 'string' || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
    return res.status(400).json({ error: 'Gueltige E-Mail Adresse fehlt' });
  }

  const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://duzmanqvyhqurxlpxrrg.supabase.co';
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ 
      error: 'SUPABASE_SERVICE_ROLE_KEY fehlt in den Vercel Environment Variables.' 
    });
  }

  try {
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email.trim());

    if (error) {
      throw error;
    }

    // Optional: Add default profile if trigger isn't doing it
    if (data && data.user) {
      await supabaseAdmin.from('user_profiles').upsert({ 
        id: data.user.id, 
        name: email.split('@')[0], 
        role: 'agent', 
        daily_call_goal: 100 
      }, { onConflict: 'id' });
    }

    res.status(200).json({ success: true, message: 'Einladung gesendet.', user: data.user });
  } catch (error) {
    console.error('Invite error (durch %s):', inviter.user.id, error);
    res.status(500).json({ error: error.message });
  }
}
