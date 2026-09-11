/**
 * api/oauth/register.js — Connector meldet sich selbst an (RFC 7591)
 * ─────────────────────────────────────────────────────────────────────────────
 * Der Connector kennt uns vorher nicht und wir ihn auch nicht. Er schickt seine
 * Rücksprung-Adressen und bekommt eine Kennung zurück. Gespeichert wird nichts:
 * die Kennung trägt die Rücksprung-Adressen in sich und ist unterschrieben.
 * Damit lässt sie sich später prüfen, ohne dass irgendwo eine Liste liegen muss.
 *
 * Kein Geheimnis für den Connector: er läuft im Browser des Nutzers und könnte
 * es ohnehin nicht geheim halten. Die Absicherung macht PKCE.
 */
import { packe, rueckSprungErlaubt, ERNEUERUNG_GUELTIG_SEK } from '../_lib/oauth.js';

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json({ error: 'invalid_request', error_description: 'Nur POST.' });
  }

  let koerper = req.body;
  if (typeof koerper === 'string') {
    try { koerper = JSON.parse(koerper); } catch (e) { koerper = null; }
  }
  if (!koerper || typeof koerper !== 'object') {
    return res.status(400).json({ error: 'invalid_client_metadata', error_description: 'Kein gültiges JSON.' });
  }

  const adressen = Array.isArray(koerper.redirect_uris) ? koerper.redirect_uris : [];
  if (adressen.length === 0) {
    return res.status(400).json({ error: 'invalid_redirect_uri', error_description: 'redirect_uris fehlt.' });
  }
  const unerlaubt = adressen.filter(a => !rueckSprungErlaubt(a));
  if (unerlaubt.length) {
    return res.status(400).json({
      error: 'invalid_redirect_uri',
      error_description: `Nicht erlaubte Rücksprung-Adresse: ${unerlaubt[0]}`
    });
  }

  try {
    const client_id = packe('client', { redirect_uris: adressen }, ERNEUERUNG_GUELTIG_SEK * 12);
    return res.status(201).json({
      client_id,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      redirect_uris: adressen,
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      client_name: koerper.client_name || 'MCP Client',
      scope: 'mcp'
    });
  } catch (e) {
    return res.status(e.status || 500).json({ error: 'server_error', error_description: e.message });
  }
}
