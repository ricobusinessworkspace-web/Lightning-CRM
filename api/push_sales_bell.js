import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';
import { requireUser } from './_lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // Ohne Auth kann jeder Push-Nachrichten mit beliebigem Text an alle Nutzer senden.
  let sender;
  try {
    sender = await requireUser(req);
  } catch (err) {
    return res.status(err.status || 401).json({ error: err.message });
  }

  const { title, message } = req.body || {};

  if (!title || !message) {
    return res.status(400).json({ error: 'Missing title or message' });
  }
  if (String(title).length > 120 || String(message).length > 400) {
    return res.status(400).json({ error: 'Titel oder Nachricht zu lang' });
  }

  // Der Absender wird aus dem Token abgeleitet, nicht aus dem Request-Body —
  // sonst koennte man die Glocke im Namen eines anderen laeuten.
  const excludeUserId = sender.user.id;

  const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://duzmanqvyhqurxlpxrrg.supabase.co';
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'Missing Service Role Key' });
  }

  // Set up web-push VAPID details
  // Note: These should ideally be in Vercel environment variables.
  // We hardcode them here temporarily for testing the Sales Bell.
  const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;

  if (!vapidPublicKey || !vapidPrivateKey) {
    return res.status(500).json({ error: 'Missing VAPID Keys' });
  }
  
  webpush.setVapidDetails(
    'mailto:test@lightning-crm.com',
    vapidPublicKey,
    vapidPrivateKey
  );

  try {
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // Fetch all subscriptions (optionally excluding the person who triggered it)
    let query = supabaseAdmin.from('crm_push_subscriptions').select('id, user_id, subscription');
    if (excludeUserId) {
      query = query.neq('user_id', excludeUserId);
    }
    
    const { data: subs, error } = await query;
    if (error) throw error;

    if (!subs || subs.length === 0) {
      return res.status(200).json({ success: true, message: 'No subscriptions found' });
    }

    const payload = JSON.stringify({ title, body: message });

    // Send push to all subscriptions in parallel
    const promises = subs.map(async (row) => {
      try {
        await webpush.sendNotification(row.subscription, payload);
      } catch (err) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          // Subscription has expired or is no longer valid, delete it from DB
          await supabaseAdmin.from('crm_push_subscriptions').delete().eq('id', row.id);
        } else {
          console.error('Error sending push to', row.id, err);
        }
      }
    });

    await Promise.all(promises);

    res.status(200).json({ success: true, sentTo: subs.length });
  } catch (error) {
    console.error('Sales Bell Push error:', error);
    res.status(500).json({ error: error.message });
  }
}
