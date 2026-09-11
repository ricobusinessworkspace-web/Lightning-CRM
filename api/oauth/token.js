/**
 * api/oauth/token.js — Code gegen Zeichen tauschen
 * ─────────────────────────────────────────────────────────────────────────────
 * Zwei Wege:
 *   authorization_code — der frische Code von der Zustimmungsseite, zusammen
 *                        mit dem PKCE-Geheimnis. Nur wer beides hat, bekommt
 *                        ein Zeichen. Ein allein abgefangener Code nützt nichts.
 *   refresh_token      — das lange Zeichen gegen ein neues kurzes tauschen,
 *                        damit man sich nicht alle acht Stunden neu anmelden muss.
 *
 * Das ausgestellte Zeichen trägt die Adresse des MCP-Servers als Empfänger
 * (aud). api/mcp.js prüft das: ein Zeichen für etwas anderes wird abgelehnt.
 */
import {
  packe, mache_auf, pkceStimmt, mcpAdresse,
  ZEICHEN_GUELTIG_SEK, ERNEUERUNG_GUELTIG_SEK
} from '../_lib/oauth.js';

function formularLesen(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return Object.fromEntries(new URLSearchParams(req.body));
  return {};
}

const panne = (res, code, was, warum) =>
  res.status(code).json({ error: was, error_description: warum });

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return panne(res, 405, 'invalid_request', 'Nur POST.');
  }

  const q = formularLesen(req);
  const empfaenger = mcpAdresse(req);

  const zeichenAusstellen = (client_id, resource) => {
    const aud = resource || empfaenger;
    return res.status(200).json({
      access_token: packe('zeichen', { client_id, aud }, ZEICHEN_GUELTIG_SEK),
      token_type: 'Bearer',
      expires_in: ZEICHEN_GUELTIG_SEK,
      refresh_token: packe('erneuerung', { client_id, aud }, ERNEUERUNG_GUELTIG_SEK),
      scope: 'mcp'
    });
  };

  try {
    if (q.grant_type === 'authorization_code') {
      const code = mache_auf(q.code, 'code');
      if (!code) return panne(res, 400, 'invalid_grant', 'Code ist ungültig oder abgelaufen.');

      // Der Code gehört zu genau diesem Connector und dieser Rücksprung-Adresse.
      if (q.client_id && q.client_id !== code.client_id) {
        return panne(res, 400, 'invalid_grant', 'Code gehört zu einem anderen Connector.');
      }
      if (q.redirect_uri && q.redirect_uri !== code.redirect_uri) {
        return panne(res, 400, 'invalid_grant', 'Rücksprung-Adresse passt nicht zum Code.');
      }
      if (!pkceStimmt(q.code_verifier, code.code_challenge, 'S256')) {
        return panne(res, 400, 'invalid_grant', 'PKCE-Prüfung fehlgeschlagen.');
      }
      return zeichenAusstellen(code.client_id, code.resource);
    }

    if (q.grant_type === 'refresh_token') {
      const alt = mache_auf(q.refresh_token, 'erneuerung');
      if (!alt) return panne(res, 400, 'invalid_grant', 'Erneuerungs-Zeichen ist ungültig oder abgelaufen.');
      if (q.client_id && q.client_id !== alt.client_id) {
        return panne(res, 400, 'invalid_grant', 'Zeichen gehört zu einem anderen Connector.');
      }
      return zeichenAusstellen(alt.client_id, alt.aud);
    }

    return panne(res, 400, 'unsupported_grant_type',
      'Nur authorization_code und refresh_token.');
  } catch (e) {
    return panne(res, e.status || 500, 'server_error', e.message);
  }
}
