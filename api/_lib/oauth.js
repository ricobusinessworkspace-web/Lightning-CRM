/**
 * api/_lib/oauth.js — das Nötigste an OAuth 2.1, ohne Datenbank
 * ─────────────────────────────────────────────────────────────────────────────
 * Warum es das gibt
 * ─────────────────
 * Die Connector-Maske von Claude nimmt kein festes Zugangswort entgegen. Sie
 * verlangt den Weg, den die MCP-Spezifikation vorschreibt: der Server sagt im
 * 401, wo seine Beschreibung liegt, die Beschreibung nennt einen
 * Anmelde-Server, und über den holt sich der Connector ein eigenes Zeichen
 * (Token). Ein fest eingetragenes Wort ist dort nicht vorgesehen.
 *
 * Dieser Anmelde-Server ist bewusst winzig:
 *
 *   - Es gibt genau einen Nutzer. Die "Anmeldung" ist deshalb: beweise, dass du
 *     das Zugangswort MCP_TOKEN kennst.
 *   - Es gibt keine Datenbank für Codes und Zeichen. Beides trägt alles Nötige
 *     in sich und ist mit einem Schlüssel unterschrieben, der aus MCP_TOKEN
 *     abgeleitet wird. Wer den Inhalt ändert, macht die Unterschrift ungültig.
 *     Das passt zu Serverfunktionen, die zwischen zwei Aufrufen nichts behalten.
 *
 * Was bewusst NICHT drin ist: mehrere Nutzer, Rechtestufen, Widerruf einzelner
 * Zeichen. Zum Sperren ändert man MCP_TOKEN — damit sind alle ausgestellten
 * Zeichen auf einen Schlag wertlos, weil der Unterschrift-Schlüssel daran hängt.
 */
import { createHmac, timingSafeEqual, randomBytes, createHash } from 'node:crypto';

export const CODE_GUELTIG_SEK  = 300;        // 5 Minuten, nur zum Einlösen
export const ZEICHEN_GUELTIG_SEK = 60 * 60 * 8;   // 8 Stunden
export const ERNEUERUNG_GUELTIG_SEK = 60 * 60 * 24 * 30;  // 30 Tage

export function geheimnis() {
  const t = process.env.MCP_TOKEN;
  if (!t || t.length < 24) {
    const e = new Error('MCP_TOKEN fehlt oder ist kürzer als 24 Zeichen.');
    e.status = 500;
    throw e;
  }
  return t;
}

// ── Verpacken und aufmachen ────────────────────────────────────────────────
// Aufbau: <nutzlast base64url>.<unterschrift base64url>
const b64 = (buf) => Buffer.from(buf).toString('base64url');

export function packe(art, daten, gueltigSek) {
  const nutzlast = b64(JSON.stringify({
    art,
    ...daten,
    exp: Math.floor(Date.now() / 1000) + gueltigSek
  }));
  const unterschrift = createHmac('sha256', geheimnis()).update(nutzlast).digest('base64url');
  return `${nutzlast}.${unterschrift}`;
}

export function mache_auf(wert, erwarteteArt) {
  if (typeof wert !== 'string' || !wert.includes('.')) return null;
  const [nutzlast, unterschrift] = wert.split('.', 2);
  if (!nutzlast || !unterschrift) return null;

  const soll = createHmac('sha256', geheimnis()).update(nutzlast).digest('base64url');
  const a = Buffer.from(unterschrift), b = Buffer.from(soll);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  let daten;
  try { daten = JSON.parse(Buffer.from(nutzlast, 'base64url').toString('utf8')); }
  catch (e) { return null; }

  if (daten.art !== erwarteteArt) return null;
  if (!daten.exp || daten.exp < Math.floor(Date.now() / 1000)) return null;
  return daten;
}

// ── Zugangswort prüfen ─────────────────────────────────────────────────────
export function wortStimmt(eingabe) {
  const soll = Buffer.from(geheimnis());
  const ist = Buffer.from(String(eingabe || ''));
  if (ist.length !== soll.length) return false;
  return timingSafeEqual(ist, soll);
}

// ── PKCE ───────────────────────────────────────────────────────────────────
// Der Connector denkt sich ein Geheimnis aus, schickt nur dessen Prüfsumme mit
// der Anfrage und das Geheimnis selbst erst beim Einlösen. Damit nützt ein
// abgefangener Code allein nichts.
export function pkceStimmt(verifier, challenge, methode) {
  if (!challenge) return false;
  if (methode === 'S256' || methode === undefined) {
    if (methode === undefined) return false;   // S256 ist Pflicht, plain nicht erlaubt
    const gerechnet = createHash('sha256').update(String(verifier || '')).digest('base64url');
    const a = Buffer.from(gerechnet), b = Buffer.from(String(challenge));
    return a.length === b.length && timingSafeEqual(a, b);
  }
  return false;
}

// ── Adressen ───────────────────────────────────────────────────────────────
export function basisAdresse(req) {
  // Hinter Vercel steht die echte Adresse in den Weiterleitungs-Kopfzeilen.
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const schema = req.headers['x-forwarded-proto'] || 'https';
  return `${schema}://${host}`;
}

export function mcpAdresse(req) {
  return `${basisAdresse(req)}/api/mcp`;
}

/**
 * Die Rücksprung-Adresse muss auf einen vertrauenswürdigen Ort zeigen.
 * Offene Weiterleitungen sind sonst ein Einfallstor: ein Angreifer schickt den
 * Anmelde-Vorgang auf seine eigene Seite und fängt den Code ab.
 */
export function rueckSprungErlaubt(url) {
  let u;
  try { u = new URL(url); } catch (e) { return false; }
  if (u.protocol === 'http:') {
    return u.hostname === 'localhost' || u.hostname === '127.0.0.1';
  }
  if (u.protocol !== 'https:') return false;
  const erlaubt = ['claude.ai', 'claude.com', 'anthropic.com'];
  return erlaubt.some(d => u.hostname === d || u.hostname.endsWith('.' + d));
}

export const zufall = (n = 24) => randomBytes(n).toString('base64url');
