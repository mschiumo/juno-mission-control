#!/usr/bin/env node
/**
 * Robinhood MCP OAuth token capture (Authorization Code + PKCE).
 *
 * Mints an access + refresh token for THIS app so the live execution rail can
 * call the Robinhood Trading MCP server-side. You log in in your own browser —
 * this script never sees your password. See docs/CONFLUENCE_ROBINHOOD_TOKEN.md.
 *
 * Run:  node scripts/robinhood-oauth.mjs
 * Then paste the printed ROBINHOOD_OAUTH_* values into your app env.
 *
 * Requires Node 20+ (global fetch/crypto). Optional env:
 *   RH_PORT=8765            loopback callback port
 *   RH_CLIENT_ID=<id>       reuse a client_id (skip dynamic registration)
 *   RH_MCP=https://agent.robinhood.com/mcp/trading   the MCP resource URL
 */

import http from 'node:http';
import crypto from 'node:crypto';

const MCP_URL = process.env.RH_MCP || 'https://agent.robinhood.com/mcp/trading';
const DISCOVERY = 'https://agent.robinhood.com/.well-known/oauth-authorization-server/mcp/trading';
const FALLBACK = {
  authorization_endpoint: 'https://agent.robinhood.com/mcp/trading/authorize',
  token_endpoint: 'https://api.robinhood.com/oauth2/token/',
  registration_endpoint: 'https://agent.robinhood.com/mcp/trading/register',
};
const PORT = Number(process.env.RH_PORT || 8765);
const REDIRECT_URI = `http://localhost:${PORT}/callback`;

const b64url = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function main() {
  // 1. Discover endpoints (fall back to known values if discovery fails).
  let meta = FALLBACK;
  try {
    const res = await fetch(DISCOVERY, { headers: { Accept: 'application/json' } });
    if (res.ok) meta = { ...FALLBACK, ...(await res.json()) };
    else console.error(`! discovery ${res.status}; using fallback endpoints`);
  } catch (e) {
    console.error(`! discovery failed (${e.message}); using fallback endpoints`);
  }
  console.error('authorization_endpoint:', meta.authorization_endpoint);
  console.error('token_endpoint:        ', meta.token_endpoint);

  // 2. Client id — reuse or dynamically register a public client.
  let clientId = process.env.RH_CLIENT_ID;
  if (!clientId) {
    if (!meta.registration_endpoint) throw new Error('No registration_endpoint; set RH_CLIENT_ID.');
    const reg = await fetch(meta.registration_endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_name: 'confluencetrading-exec',
        redirect_uris: [REDIRECT_URI],
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        token_endpoint_auth_method: 'none',
      }),
    });
    const body = await reg.json();
    if (!reg.ok || !body.client_id) throw new Error(`registration failed: ${JSON.stringify(body)}`);
    clientId = body.client_id;
    console.error('registered client_id:  ', clientId);
  }

  // 3. PKCE + state.
  const codeVerifier = b64url(crypto.randomBytes(48));
  const codeChallenge = b64url(crypto.createHash('sha256').update(codeVerifier).digest());
  const state = b64url(crypto.randomBytes(16));

  const authUrl = new URL(meta.authorization_endpoint);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
  authUrl.searchParams.set('code_challenge', codeChallenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');
  authUrl.searchParams.set('state', state);
  if (Array.isArray(meta.scopes_supported) && meta.scopes_supported.length) {
    authUrl.searchParams.set('scope', meta.scopes_supported.join(' '));
  }
  if (meta.resource || MCP_URL) authUrl.searchParams.set('resource', MCP_URL);

  // 4. Wait for the browser redirect on the loopback listener.
  const code = await new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const u = new URL(req.url, `http://localhost:${PORT}`);
      if (u.pathname !== '/callback') { res.writeHead(404); res.end(); return; }
      const err = u.searchParams.get('error');
      const gotCode = u.searchParams.get('code');
      const gotState = u.searchParams.get('state');
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<h2>Done — you can close this tab and return to the terminal.</h2>');
      server.close();
      if (err) return reject(new Error(`authorize error: ${err}`));
      if (gotState !== state) return reject(new Error('state mismatch (possible CSRF) — abort'));
      resolve(gotCode);
    });
    server.listen(PORT, () => {
      console.error('\n▶ Open this URL in your browser, log in, complete MFA, and pick the AGENTIC account:\n');
      console.log(authUrl.toString());
      console.error(`\n(waiting for the redirect to ${REDIRECT_URI} …)`);
    });
  });

  // 5. Exchange the code for tokens.
  const tok = await fetch(meta.token_endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
      client_id: clientId,
      code_verifier: codeVerifier,
    }).toString(),
  });
  const tokens = await tok.json();
  if (!tok.ok || !tokens.access_token) throw new Error(`token exchange failed: ${JSON.stringify(tokens)}`);

  console.error('\n✅ Success. Set these in your app env (Vercel + .env.local):\n');
  console.log(`ROBINHOOD_OAUTH_CLIENT_ID=${clientId}`);
  console.log(`ROBINHOOD_OAUTH_REFRESH_TOKEN=${tokens.refresh_token || '(none returned!)'}`);
  console.error(`\n# one-off access token (expires in ${tokens.expires_in ?? '?'}s; the app auto-refreshes from the refresh token):`);
  console.log(`# ROBINHOOD_MCP_TOKEN=${tokens.access_token}`);
  console.error('\nThe app trades the refresh token for access tokens automatically (lib/confluence/robinhood/oauth.ts).');
}

main().catch((e) => { console.error('\n✗', e.message); process.exit(1); });
