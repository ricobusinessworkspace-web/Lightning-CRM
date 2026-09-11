/**
 * api/mcp.js — MCP-Server für Lightning CRM
 * ─────────────────────────────────────────────────────────────────────────────
 * Nimmt MCP-Anfragen über HTTPS entgegen. Die Adresse, die in das Feld
 * „Server-URL" eines eigenen Connectors gehört, ist:
 *
 *     https://<deine-vercel-adresse>/api/mcp
 *
 * Nötige Environment Variables bei Vercel:
 *     MCP_TOKEN                  — langes zufälliges Zugangswort, selbst vergeben
 *     SUPABASE_SERVICE_ROLE_KEY  — liegt bereits vor (siehe api/invite.js)
 *     VITE_SUPABASE_URL          — optional, sonst greift der Standard
 *
 * ⚠️  Ohne MCP_TOKEN antwortet dieser Endpoint gar nicht. Das ist Absicht: er
 *     hängt an der produktiven Datenbank, und eine Fehlkonfiguration darf nicht
 *     dazu führen, dass er offen steht.
 *
 * Umgesetzt ist der Transportweg „Streamable HTTP": eine POST-Adresse, die
 * JSON-RPC-2.0-Nachrichten entgegennimmt und als JSON beantwortet. Bewusst von
 * Hand statt über ein zusätzliches Paket — gebraucht werden fünf Methoden, und
 * dieses Projekt kommt insgesamt mit fünf Abhängigkeiten aus.
 */
import { timingSafeEqual } from 'node:crypto';
import { WERKZEUGE, NACH_NAME } from './_lib/mcp_werkzeuge.js';

const PROTOKOLL = '2025-06-18';
const BEKANNTE_PROTOKOLLE = new Set([PROTOKOLL, '2025-03-26', '2024-11-05']);

const SERVER = {
  name: 'lightning-crm',
  title: 'Lightning CRM',
  version: '1.0.0'
};

// ── Zugang ─────────────────────────────────────────────────────────────────
// Vergleich über die gesamte Länge, damit die Antwortzeit nicht verrät, wie
// viele Zeichen am Anfang schon gestimmt haben.
function zugangGeprueft(req) {
  const erwartet = process.env.MCP_TOKEN;
  if (!erwartet || erwartet.length < 24) return false;   // fehlt oder zu kurz → zu
  const kopf = req.headers.authorization || '';
  if (!kopf.startsWith('Bearer ')) return false;
  const gegeben = Buffer.from(kopf.slice(7).trim());
  const soll = Buffer.from(erwartet);
  if (gegeben.length !== soll.length) return false;
  return timingSafeEqual(gegeben, soll);
}

// ── JSON-RPC ───────────────────────────────────────────────────────────────
const antwort = (id, result) => ({ jsonrpc: '2.0', id, result });
const panne = (id, code, message, data) => ({
  jsonrpc: '2.0', id, error: data === undefined ? { code, message } : { code, message, data }
});

function alsText(wert) {
  return { content: [{ type: 'text', text: JSON.stringify(wert, null, 2) }] };
}

async function nachrichtBehandeln(nachricht) {
  const { id, method, params } = nachricht || {};

  // Mitteilungen tragen keine id und bekommen keine Antwort.
  const istMitteilung = id === undefined || id === null;

  if (!nachricht || nachricht.jsonrpc !== '2.0' || typeof method !== 'string') {
    return istMitteilung ? null : panne(id ?? null, -32600, 'Keine gültige JSON-RPC-2.0-Nachricht.');
  }

  switch (method) {
    case 'initialize': {
      const gewuenscht = params && params.protocolVersion;
      return antwort(id, {
        protocolVersion: BEKANNTE_PROTOKOLLE.has(gewuenscht) ? gewuenscht : PROTOKOLL,
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER,
        instructions:
          'Zugriff auf das Lightning CRM: Leads suchen und anzeigen, Notizen und ' +
          'Aufgaben anlegen, Pipeline-Stufe setzen, Anrufe und Nachrichten festhalten. ' +
          'Schreibende Werkzeuge ändern die produktive Datenbank sofort und ohne ' +
          'weitere Rückfrage — vor dem Schreiben den Lead anzeigen lassen und mit ' +
          'dem Nutzer abstimmen.'
      });
    }

    case 'notifications/initialized':
    case 'notifications/cancelled':
      return null;

    case 'ping':
      return antwort(id, {});

    case 'tools/list':
      return antwort(id, {
        tools: WERKZEUGE.map(({ name, title, description, inputSchema }) =>
          ({ name, title, description, inputSchema }))
      });

    case 'tools/call': {
      const name = params && params.name;
      const werkzeug = NACH_NAME[name];
      if (!werkzeug) return panne(id, -32602, `Unbekanntes Werkzeug: ${name}`);
      try {
        const ergebnis = await werkzeug.run(params.arguments || {});
        return antwort(id, alsText(ergebnis));
      } catch (e) {
        // Fehler im Werkzeug gehen als Ergebnis zurück, nicht als Protokollfehler:
        // so sieht das Sprachmodell, was schiefging, und kann es dem Nutzer sagen.
        console.error(`Werkzeug ${name}:`, e);
        return antwort(id, {
          content: [{ type: 'text', text: e.message || 'Unbekannter Fehler.' }],
          isError: true
        });
      }
    }

    default:
      return istMitteilung ? null : panne(id, -32601, `Unbekannte Methode: ${method}`);
  }
}

// ── HTTP ───────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(204).end();
  }
  if (req.method !== 'POST') {
    // Kein offener Ereignisstrom: dieser Server hält keinen Zustand zwischen
    // zwei Anfragen, es gibt also nichts, was er von sich aus senden könnte.
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json({ error: 'Nur POST.' });
  }

  if (!zugangGeprueft(req)) {
    res.setHeader('WWW-Authenticate', 'Bearer');
    return res.status(401).json({ error: 'Zugang verweigert.' });
  }

  let koerper = req.body;
  if (typeof koerper === 'string') {
    try { koerper = JSON.parse(koerper); }
    catch (e) { return res.status(400).json(panne(null, -32700, 'Der Inhalt ist kein gültiges JSON.')); }
  }

  try {
    if (Array.isArray(koerper)) {
      const alle = await Promise.all(koerper.map(nachrichtBehandeln));
      const offene = alle.filter(Boolean);
      return offene.length ? res.status(200).json(offene) : res.status(202).end();
    }

    const ergebnis = await nachrichtBehandeln(koerper);
    if (!ergebnis) return res.status(202).end();   // war eine Mitteilung
    return res.status(200).json(ergebnis);
  } catch (e) {
    console.error('MCP:', e);
    return res.status(200).json(panne(koerper && koerper.id ? koerper.id : null, -32603, e.message || 'Interner Fehler.'));
  }
}
