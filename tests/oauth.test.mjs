/**
 * tests/oauth.test.mjs — der Anmelde-Vorgang, einmal ganz durchgespielt
 * ─────────────────────────────────────────────────────────────────────────────
 * Läuft ohne Netz und ohne Datenbank: die Serverfunktionen werden direkt mit
 * nachgebauten Anfragen aufgerufen. Geprüft wird vor allem, was NICHT gehen
 * darf — fremde Rücksprung-Adressen, fehlendes PKCE, verändertes Zeichen,
 * Zeichen für einen anderen Empfänger.
 */
import { createHash, randomBytes } from 'node:crypto';

const ok = [];
const fail = [];
const check = (name, cond) => (cond ? ok : fail).push(name);

process.env.MCP_TOKEN = 'test-zugangswort-mit-genug-laenge-1234567890';

const HOST = 'calling-station.vercel.app';
const BASIS = `https://${HOST}`;
const MCP = `${BASIS}/api/mcp`;
const RUECK = 'https://claude.ai/api/mcp/auth_callback';

const machRes = () => {
  const r = {
    code: 0, koerper: undefined, text: undefined, kopf: {}, beendet: false,
    status(c) { r.code = c; return r; },
    json(v) { r.koerper = v; r.beendet = true; return r; },
    send(v) { r.text = v; r.beendet = true; return r; },
    end() { r.beendet = true; return r; },
    setHeader(k, v) { r.kopf[k.toLowerCase()] = v; return r; }
  };
  return r;
};

const ruf = async (modul, { method = 'GET', query = {}, body, headers = {} } = {}) => {
  const { default: handler } = await import(modul);
  const res = machRes();
  await handler({
    method, query, body,
    headers: { host: HOST, 'x-forwarded-proto': 'https', ...headers }
  }, res);
  return res;
};

// ── 1. Die zwei Beschreibungen ────────────────────────────────────────────
let r = await ruf('../api/oauth/metadata.js', { query: { doc: 'resource' } });
check('Beschreibung der geschützten Sache kommt', r.code === 200);
check('Sie nennt den MCP-Server als Empfänger', r.koerper.resource === MCP);
check('Und mindestens einen Anmelde-Server', (r.koerper.authorization_servers || []).includes(BASIS));

r = await ruf('../api/oauth/metadata.js', { query: { doc: 'server' } });
check('Beschreibung des Anmelde-Servers kommt', r.code === 200);
check('Mit Zustimmungs-Adresse', r.koerper.authorization_endpoint === `${BASIS}/api/oauth/authorize`);
check('Mit Zeichen-Adresse', r.koerper.token_endpoint === `${BASIS}/api/oauth/token`);
check('Mit Selbstanmeldung', r.koerper.registration_endpoint === `${BASIS}/api/oauth/register`);
check('PKCE nur als S256', JSON.stringify(r.koerper.code_challenge_methods_supported) === '["S256"]');
check('Connector braucht kein Geheimnis',
      (r.koerper.token_endpoint_auth_methods_supported || []).includes('none'));

// ── 2. Selbstanmeldung ────────────────────────────────────────────────────
r = await ruf('../api/oauth/register.js', { method: 'POST', body: {} });
check('Ohne Rücksprung-Adresse: abgewiesen', r.code === 400);

r = await ruf('../api/oauth/register.js', {
  method: 'POST', body: { redirect_uris: ['https://boeser-server.example/klau'] }
});
check('Fremde Rücksprung-Adresse: abgewiesen', r.code === 400 && r.koerper.error === 'invalid_redirect_uri');

r = await ruf('../api/oauth/register.js', {
  method: 'POST', body: { redirect_uris: ['http://beispiel.de/cb'] }
});
check('Unverschlüsselte Adresse: abgewiesen', r.code === 400);

r = await ruf('../api/oauth/register.js', {
  method: 'POST', body: { redirect_uris: ['http://localhost:8765/cb'] }
});
check('localhost ist erlaubt (Entwicklung)', r.code === 201);

r = await ruf('../api/oauth/register.js', {
  method: 'POST', body: { redirect_uris: [RUECK], client_name: 'Claude' }
});
check('Anmeldung gelingt', r.code === 201 && !!r.koerper.client_id);
check('Kein Geheimnis ausgegeben', r.koerper.client_secret === undefined);
const CLIENT_ID = r.koerper.client_id;

// ── 3. Zustimmungsseite ───────────────────────────────────────────────────
const verifier = randomBytes(32).toString('base64url');
const challenge = createHash('sha256').update(verifier).digest('base64url');
const basisAnfrage = {
  client_id: CLIENT_ID, redirect_uri: RUECK, state: 'xyz',
  code_challenge: challenge, code_challenge_method: 'S256', resource: MCP
};

r = await ruf('../api/oauth/authorize.js', {
  query: { ...basisAnfrage, redirect_uri: 'https://boeser-server.example/klau' }
});
check('Fremde Rücksprung-Adresse wird nicht bedient', r.code === 400);
check('Und es wird NICHT dorthin weitergeleitet', r.kopf['location'] === undefined);

r = await ruf('../api/oauth/authorize.js', {
  query: { ...basisAnfrage, client_id: 'ausgedacht.kaputt' }
});
check('Unbekannte Connector-Kennung: abgewiesen', r.code === 400);

r = await ruf('../api/oauth/authorize.js', {
  query: { ...basisAnfrage, code_challenge_method: 'plain' }
});
check('PKCE ohne S256: abgewiesen', r.code === 302 &&
      r.kopf['location'].includes('error=invalid_request'));

r = await ruf('../api/oauth/authorize.js', { query: basisAnfrage });
check('Zustimmungsseite wird gezeigt', r.code === 200 && r.text.includes('Zugriff auf Lightning CRM'));
check('Sie sagt, was erlaubt wird', r.text.includes('Pipeline-Stufe setzen'));
check('Zugangswort wird verdeckt eingegeben', r.text.includes('type="password"'));

r = await ruf('../api/oauth/authorize.js', {
  method: 'POST', body: { ...basisAnfrage, zugangswort: 'falsch' }
});
check('Falsches Zugangswort: kein Code', r.code === 401 && r.kopf['location'] === undefined);
check('Aber die Seite kommt wieder, mit Hinweis', r.text.includes('stimmt nicht'));

r = await ruf('../api/oauth/authorize.js', {
  method: 'POST', body: { ...basisAnfrage, zugangswort: process.env.MCP_TOKEN }
});
check('Richtiges Zugangswort: Rücksprung mit Code', r.code === 302);
const ziel = new URL(r.kopf['location']);
check('Rücksprung geht an die angemeldete Adresse', ziel.origin + ziel.pathname === RUECK);
check('Der Zustand wird durchgereicht', ziel.searchParams.get('state') === 'xyz');
const CODE = ziel.searchParams.get('code');
check('Ein Code liegt bei', !!CODE);

// ── 4. Code gegen Zeichen ─────────────────────────────────────────────────
r = await ruf('../api/oauth/token.js', {
  method: 'POST',
  body: { grant_type: 'authorization_code', code: CODE, redirect_uri: RUECK,
          client_id: CLIENT_ID, code_verifier: 'falsches-geheimnis' }
});
check('Falsches PKCE-Geheimnis: kein Zeichen', r.code === 400 && r.koerper.error === 'invalid_grant');

r = await ruf('../api/oauth/token.js', {
  method: 'POST',
  body: { grant_type: 'authorization_code', code: CODE,
          redirect_uri: 'https://claude.ai/anderswo',
          client_id: CLIENT_ID, code_verifier: verifier }
});
check('Andere Rücksprung-Adresse beim Einlösen: abgewiesen', r.code === 400);

r = await ruf('../api/oauth/token.js', {
  method: 'POST',
  body: { grant_type: 'authorization_code', code: CODE + 'x', redirect_uri: RUECK,
          client_id: CLIENT_ID, code_verifier: verifier }
});
check('Veränderter Code: abgewiesen', r.code === 400);

r = await ruf('../api/oauth/token.js', {
  method: 'POST',
  body: { grant_type: 'authorization_code', code: CODE, redirect_uri: RUECK,
          client_id: CLIENT_ID, code_verifier: verifier }
});
check('Richtiges Geheimnis: Zeichen kommt', r.code === 200 && !!r.koerper.access_token);
check('Es ist ein Bearer-Zeichen', r.koerper.token_type === 'Bearer');
check('Mit Ablauf', r.koerper.expires_in > 0);
check('Und einem Erneuerungs-Zeichen', !!r.koerper.refresh_token);
check('Antwort wird nicht zwischengespeichert', r.kopf['cache-control'] === 'no-store');
const ZEICHEN = r.koerper.access_token;
const ERNEUERUNG = r.koerper.refresh_token;

r = await ruf('../api/oauth/token.js', {
  method: 'POST', body: { grant_type: 'refresh_token', refresh_token: ERNEUERUNG, client_id: CLIENT_ID }
});
check('Erneuern gelingt', r.code === 200 && !!r.koerper.access_token);

r = await ruf('../api/oauth/token.js', {
  method: 'POST', body: { grant_type: 'password', username: 'x', password: 'y' }
});
check('Andere Verfahren: abgewiesen', r.code === 400 && r.koerper.error === 'unsupported_grant_type');

// ── 5. Der MCP-Server nimmt das Zeichen an ────────────────────────────────
const mcpRuf = async (kopfzeile) => {
  const { default: handler } = await import('../api/mcp.js?t=' + Math.random());
  const res = machRes();
  await handler({
    method: 'POST',
    headers: { host: HOST, 'x-forwarded-proto': 'https',
               ...(kopfzeile ? { authorization: kopfzeile } : {}) },
    body: { jsonrpc: '2.0', id: 1, method: 'tools/list' }
  }, res);
  return res;
};

r = await mcpRuf(`Bearer ${ZEICHEN}`);
check('Mit ausgestelltem Zeichen: Werkzeuge kommen', r.code === 200 && !!r.koerper.result);

r = await mcpRuf(`Bearer ${process.env.MCP_TOKEN}`);
check('Mit festem Zugangswort: geht weiterhin', r.code === 200 && !!r.koerper.result);

r = await mcpRuf(`Bearer ${ZEICHEN}x`);
check('Verändertes Zeichen: abgewiesen', r.code === 401);

r = await mcpRuf(`Bearer ${ERNEUERUNG}`);
check('Erneuerungs-Zeichen taugt nicht als Zugang', r.code === 401);

r = await mcpRuf(null);
check('Ohne alles: abgewiesen', r.code === 401);
check('Der 401 sagt, wo die Beschreibung liegt',
      (r.kopf['www-authenticate'] || '').includes('/.well-known/oauth-protected-resource'));

// Ein Zeichen, das für einen ANDEREN Server ausgestellt wurde, darf hier nicht
// durchgehen — die Spezifikation nennt das ausdrücklich als Einfallstor.
const { packe } = await import('../api/_lib/oauth.js');
const fremdesZeichen = packe('zeichen', { client_id: CLIENT_ID, aud: 'https://woanders.example/mcp' }, 600);
r = await mcpRuf(`Bearer ${fremdesZeichen}`);
check('Zeichen für einen anderen Empfänger: abgewiesen', r.code === 401);

// ── 6. Ein geändertes Zugangswort macht alle Zeichen wertlos ──────────────
const altesWort = process.env.MCP_TOKEN;
process.env.MCP_TOKEN = 'ein-ganz-anderes-zugangswort-abcdefghij';
r = await mcpRuf(`Bearer ${ZEICHEN}`);
check('Nach Wechsel des Zugangsworts: altes Zeichen wertlos', r.code === 401);
process.env.MCP_TOKEN = altesWort;

console.log('\n✅ BESTANDEN (' + ok.length + ')');
ok.forEach(t => console.log('   ' + t));
if (fail.length) {
  console.log('\n❌ FEHLGESCHLAGEN (' + fail.length + ')');
  fail.forEach(t => console.log('   ' + t));
  process.exit(1);
}
console.log('\nAlle Prüfungen bestanden.');
