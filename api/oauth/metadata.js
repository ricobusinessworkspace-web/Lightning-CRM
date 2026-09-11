/**
 * api/oauth/metadata.js — die zwei Beschreibungen, die der Connector sucht
 * ─────────────────────────────────────────────────────────────────────────────
 * Erreichbar unter /.well-known/... (siehe vercel.json). Der Connector liest
 * zuerst die Beschreibung der geschützten Sache (RFC 9728) und erfährt daraus,
 * welcher Anmelde-Server zuständig ist. Dann liest er dessen Beschreibung
 * (RFC 8414) und weiß, wohin er den Nutzer schickt und wo er das Zeichen holt.
 */
import { basisAdresse, mcpAdresse } from '../_lib/oauth.js';

export default function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).json({ error: 'Nur GET.' });
  }

  const basis = basisAdresse(req);
  const welche = (req.query && req.query.doc) || 'resource';

  // Der Connector fragt diese Adressen von aussen ab, teils aus dem Browser.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=300');

  if (welche === 'server') {
    return res.status(200).json({
      issuer: basis,
      authorization_endpoint: `${basis}/api/oauth/authorize`,
      token_endpoint: `${basis}/api/oauth/token`,
      registration_endpoint: `${basis}/api/oauth/register`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'],
      scopes_supported: ['mcp'],
      service_documentation: 'https://github.com/ricobusinessworkspace-web/Lightning-CRM/blob/master/docs/mcp-server-einrichten.md'
    });
  }

  return res.status(200).json({
    resource: mcpAdresse(req),
    authorization_servers: [basis],
    scopes_supported: ['mcp'],
    bearer_methods_supported: ['header'],
    resource_name: 'Lightning CRM'
  });
}
