/**
 * /api/rueckrufe — faellige Wiedervorlagen als Push-Mitteilung verschicken.
 *
 * Zwei Aufrufer:
 *   1. Die Zeitschaltuhr in der Datenbank (pg_cron + pg_net), jede Minute,
 *      aber nur tagsueber und nur, wenn wirklich etwas faellig ist. Sie weist
 *      sich mit dem Zugangswort aus dem Vault aus (Kopfzeile
 *      x-rueckruf-zugang). Das Wort kennt nur die Datenbank — geprueft wird es
 *      ueber rueckruf_zugang_pruefen(), die nur service_role aufrufen darf.
 *   2. Der Knopf "Test senden" im CRM: angemeldeter Nutzer, { test: true }.
 *      Schickt eine Probe an die eigenen Geraete — so sieht man sofort, ob
 *      Schluessel und Geraet zusammenpassen.
 *
 * Nachtruhe 21–8 Uhr (Berlin): nichts senden. Was nachts faellig wird, geht
 * um 8:00 gesammelt raus.
 */
import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';
import { requireUser } from './_lib/auth.js';
import { nachtruhe, zuMelden, mitteilung, verteilen } from './_lib/rueckrufe.js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://duzmanqvyhqurxlpxrrg.supabase.co';

function admin() {
  return createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

function pushVorbereiten() {
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  webpush.setVapidDetails('https://calling-station.vercel.app', pub, priv);
  return true;
}

// Senden; tote Abos (404/410) fliegen raus. Rueckgabe: Anzahl zugestellt.
async function senden(db, abo, nachricht) {
  try {
    await webpush.sendNotification(abo.subscription, JSON.stringify(nachricht), { TTL: 60 * 60, urgency: 'high' });
    return 1;
  } catch (err) {
    if (err.statusCode === 404 || err.statusCode === 410) {
      await db.from('crm_push_subscriptions').delete().eq('id', abo.id);
    } else {
      console.error('Push an', abo.id, 'fehlgeschlagen:', err.statusCode, err.body || err.message);
    }
    return 0;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Nur POST' });
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return res.status(500).json({ error: 'Service-Schlüssel fehlt' });
  if (!pushVorbereiten()) return res.status(500).json({ error: 'VAPID-Schlüssel fehlen' });

  const db = admin();

  // ── Probe-Mitteilung an die eigenen Geraete ────────────────────────────────
  if (req.body && req.body.test) {
    let ctx;
    try { ctx = await requireUser(req); }
    catch (err) { return res.status(err.status || 401).json({ error: err.message }); }

    const { data: abos, error } = await db.from('crm_push_subscriptions')
      .select('id, user_id, subscription').eq('user_id', ctx.user.id);
    if (error) return res.status(500).json({ error: error.message });
    if (!abos || abos.length === 0) return res.status(200).json({ ok: false, zugestellt: 0, grund: 'Kein Gerät angemeldet' });

    let zugestellt = 0;
    for (const abo of abos) {
      zugestellt += await senden(db, abo, {
        typ: 'test', title: 'Mitteilungen funktionieren',
        body: 'So meldet sich ein fälliger Rückruf.', url: '/', tag: 'test'
      });
    }
    return res.status(200).json({ ok: zugestellt > 0, zugestellt, geraete: abos.length });
  }

  // ── Aufruf der Zeitschaltuhr ───────────────────────────────────────────────
  const zugang = req.headers['x-rueckruf-zugang'];
  const { data: erlaubt, error: pruefFehler } = await db.rpc('rueckruf_zugang_pruefen', { p: zugang || null });
  if (pruefFehler) return res.status(500).json({ error: pruefFehler.message });
  if (!erlaubt) return res.status(401).json({ error: 'Kein Zugang' });

  const jetzt = Date.now();
  if (nachtruhe(jetzt)) return res.status(200).json({ ok: true, nachtruhe: true });

  const { data: kandidaten, error } = await db.from('crm_leads')
    .select('id, name, phone, impressum_phone, claimed_by, snooze_until_ms, snooze_notified_ms, snooze_erledigt_ms, last_contact_ms')
    .gt('snooze_until_ms', 0)
    .lte('snooze_until_ms', jetzt);
  if (error) return res.status(500).json({ error: error.message });

  const faellig = (kandidaten || []).filter(l => zuMelden(l, jetzt));
  if (faellig.length === 0) return res.status(200).json({ ok: true, gemeldet: 0 });

  // Erst als gemeldet markieren, dann senden: laeuft der naechste Minutentakt
  // an, waehrend hier noch gesendet wird, meldet er nicht doppelt.
  const ids = faellig.map(l => l.id);
  const { error: markFehler } = await db.from('crm_leads')
    .update({ snooze_notified_ms: jetzt }).in('id', ids);
  if (markFehler) return res.status(500).json({ error: markFehler.message });

  const { data: abos } = await db.from('crm_push_subscriptions').select('id, user_id, subscription');
  let zugestellt = 0;
  for (const { abo, leads } of verteilen(faellig, abos || []).values()) {
    zugestellt += await senden(db, abo, mitteilung(leads, jetzt));
  }
  return res.status(200).json({ ok: true, gemeldet: faellig.length, zugestellt });
}
