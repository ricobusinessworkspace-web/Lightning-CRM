/**
 * api/oauth/authorize.js — die eine Seite, auf der du zustimmst
 * ─────────────────────────────────────────────────────────────────────────────
 * Hierher schickt der Connector den Browser. Weil es genau einen Nutzer gibt,
 * ist die "Anmeldung" schlicht: das Zugangswort MCP_TOKEN eingeben. Stimmt es,
 * wird ein kurzlebiger Code ausgestellt und der Browser springt zum Connector
 * zurück.
 *
 * Die Seite ist absichtlich nüchtern und sagt klar, was gleich erlaubt wird —
 * eine Zustimmung, die niemand liest, ist keine.
 */
import {
  packe, wortStimmt, rueckSprungErlaubt, mcpAdresse, CODE_GUELTIG_SEK
} from '../_lib/oauth.js';
import { mache_auf } from '../_lib/oauth.js';

const escapeHtml = (u) => String(u ?? '').replace(/[&<>"']/g,
  m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

function seite({ fehler, felder }) {
  const verstecktes = Object.entries(felder)
    .map(([k, v]) => `<input type="hidden" name="${escapeHtml(k)}" value="${escapeHtml(v)}">`)
    .join('\n      ');

  return `<!doctype html>
<html lang="de"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Lightning CRM — Zugriff erlauben</title>
<style>
  :root { color-scheme: dark; }
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
         background:#000; color:#f2f2f7; padding:24px;
         font-family:-apple-system,BlinkMacSystemFont,'Inter',system-ui,sans-serif; }
  .karte { width:100%; max-width:380px; background:#161618; border:1px solid rgba(255,255,255,0.08);
           border-radius:14px; padding:28px 24px; box-shadow:0 24px 64px rgba(0,0,0,0.7); }
  .blitz { font-size:28px; text-align:center; margin-bottom:12px; }
  h1 { margin:0 0 6px; font-size:17px; font-weight:600; text-align:center; }
  p  { margin:0 0 18px; font-size:13px; line-height:1.45; color:#8e8e93; text-align:center; }
  ul { margin:0 0 20px; padding:0 0 0 18px; font-size:13px; line-height:1.7; color:#8e8e93; }
  label { display:block; font-size:12px; font-weight:600; margin-bottom:6px; color:#8e8e93; }
  input[type=password] { width:100%; box-sizing:border-box; padding:11px 12px; border-radius:10px;
           border:1px solid rgba(255,255,255,0.1); background:rgba(255,255,255,0.03);
           color:#f2f2f7; font:inherit; font-size:14px; }
  input[type=password]:focus { outline:2px solid #0a84ff; outline-offset:-1px; }
  button { width:100%; margin-top:16px; padding:11px; border:none; border-radius:10px;
           background:#0a84ff; color:#fff; font:inherit; font-size:14px; font-weight:600; cursor:pointer; }
  button:hover { filter:brightness(1.1); }
  .fehler { margin:0 0 16px; padding:10px 12px; border-radius:10px; font-size:13px;
            background:rgba(255,69,58,0.12); border:1px solid #ff453a; color:#ff453a; text-align:left; }
</style></head>
<body>
  <form class="karte" method="POST">
    <div class="blitz">⚡</div>
    <h1>Zugriff auf Lightning CRM erlauben?</h1>
    <p>Ein Connector möchte mit deinem CRM arbeiten.</p>
    ${fehler ? `<div class="fehler">${escapeHtml(fehler)}</div>` : ''}
    <ul>
      <li>Leads lesen und durchsuchen</li>
      <li>Notizen und Aufgaben anlegen</li>
      <li>Pipeline-Stufe setzen</li>
      <li>Anrufe und Nachrichten festhalten</li>
    </ul>
    <label for="wort">Zugangswort</label>
    <input type="password" id="wort" name="zugangswort" autocomplete="current-password"
           autofocus required>
    ${verstecktes}
    <button type="submit">Erlauben</button>
  </form>
</body></html>`;
}

// Vercel liefert bei application/x-www-form-urlencoded ein Objekt; sonst Text.
function formularLesen(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return Object.fromEntries(new URLSearchParams(req.body));
  return {};
}

export default async function handler(req, res) {
  const q = req.method === 'POST' ? formularLesen(req) : (req.query || {});

  const {
    client_id, redirect_uri, state, code_challenge,
    code_challenge_method, scope, resource
  } = q;

  // ── Prüfungen, die NICHT zurückspringen dürfen ──────────────────────────
  // Solange die Rücksprung-Adresse nicht als vertrauenswürdig erwiesen ist,
  // wird kein Fehler dorthin geschickt — sonst wäre das eine offene
  // Weiterleitung.
  if (!redirect_uri || !rueckSprungErlaubt(redirect_uri)) {
    return res.status(400).send('Ungültige oder nicht erlaubte Rücksprung-Adresse.');
  }

  let kunde;
  try { kunde = mache_auf(client_id, 'client'); }
  catch (e) { return res.status(e.status || 500).send(e.message); }

  if (!kunde) return res.status(400).send('Unbekannte oder abgelaufene Connector-Kennung.');
  if (!kunde.redirect_uris.includes(redirect_uri)) {
    return res.status(400).send('Diese Rücksprung-Adresse gehört nicht zu dieser Kennung.');
  }

  // Ab hier ist ein Rücksprung erlaubt.
  const zurueck = (parameter) => {
    const u = new URL(redirect_uri);
    for (const [k, v] of Object.entries(parameter)) if (v !== undefined) u.searchParams.set(k, v);
    if (state !== undefined) u.searchParams.set('state', state);
    res.setHeader('Location', u.toString());
    return res.status(302).end();
  };

  if (code_challenge_method !== 'S256' || !code_challenge) {
    return zurueck({ error: 'invalid_request', error_description: 'PKCE mit S256 ist erforderlich.' });
  }

  const felder = {
    client_id, redirect_uri, code_challenge, code_challenge_method,
    ...(state !== undefined ? { state } : {}),
    ...(scope ? { scope } : {}),
    ...(resource ? { resource } : {})
  };

  if (req.method === 'GET') {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(seite({ fehler: null, felder }));
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).send('Nur GET oder POST.');
  }

  // ── Zustimmung geprüft ──────────────────────────────────────────────────
  if (!wortStimmt(q.zugangswort)) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(401).send(seite({ fehler: 'Zugangswort stimmt nicht.', felder }));
  }

  const code = packe('code', {
    client_id, redirect_uri, code_challenge,
    resource: resource || mcpAdresse(req)
  }, CODE_GUELTIG_SEK);

  return zurueck({ code });
}
