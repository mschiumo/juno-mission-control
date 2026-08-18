# Capturing & refreshing `ROBINHOOD_MCP_TOKEN` (live execution rail)

The live execution path (Milestone 3) calls the Robinhood Trading MCP
server-side. Robinhood agentic access is **OAuth 2.1 + PKCE** — there is **no
static API key**. This runbook mints a token **for this app** by running the
OAuth flow yourself.

> **Why not just reuse the token Claude Desktop/Code already has?** That token
> belongs to a different (interactive) client and repurposing it for a headless
> server is credential-misuse — don't. Run the flow below to get the app its own
> access + refresh tokens.

> ⚠️ **Verify against the discovery endpoint (the source of truth).** The exact
> URLs below are from Robinhood's published OAuth metadata as of writing; the
> `.well-known` response is authoritative — use whatever it returns. Do this
> **interactively / supervised**, and test first against the small $50 account
> with tiny caps and the kill switch handy. Known gotcha: the native Claude Code
> OAuth exchange for this server can silently persist an empty token
> ([claude-code#65895](https://github.com/anthropics/claude-code/issues/65895)) —
> the manual exchange below sidesteps it.

---

## 0. Endpoints (confirm via discovery)

```bash
# RFC 8414 path-inserted form (the suffix form 404s):
curl -s https://agent.robinhood.com/.well-known/oauth-authorization-server/mcp/trading | jq
```
Expected fields: `authorization_endpoint`, `token_endpoint`, `registration_endpoint`,
`code_challenge_methods_supported` (includes `S256`), `scopes_supported`.

Known values (verify against the above):
- **token_endpoint:** `https://api.robinhood.com/oauth2/token/`
- grant types: `authorization_code`, `refresh_token`; PKCE `S256`;
  `token_endpoint_auth_method: none` (public client — no client secret).

---

## 1. Register a client (once)

If discovery exposes a `registration_endpoint` (Dynamic Client Registration):

```bash
curl -s -X POST "<registration_endpoint>" -H 'Content-Type: application/json' -d '{
  "client_name": "confluencetrading-exec",
  "redirect_uris": ["http://localhost:8765/callback"],
  "grant_types": ["authorization_code", "refresh_token"],
  "response_types": ["code"],
  "token_endpoint_auth_method": "none"
}' | jq
```
Save the returned `client_id`. (`redirect_uris` must include the loopback URL you
use in step 3.)

---

## 2. PKCE pair

```bash
code_verifier=$(openssl rand -base64 64 | tr -d '\n=+/' | cut -c1-64)
code_challenge=$(printf '%s' "$code_verifier" | openssl dgst -binary -sha256 | openssl base64 | tr '+/' '-_' | tr -d '=')
echo "verifier=$code_verifier"; echo "challenge=$code_challenge"
```

---

## 3. Authorize (browser)

Open this URL, log in, complete MFA, and **select the Agentic account**:

```
<authorization_endpoint>?response_type=code&client_id=<client_id>
  &redirect_uri=http://localhost:8765/callback
  &code_challenge=<code_challenge>&code_challenge_method=S256
  &scope=<space-separated scopes from discovery>&state=<random>
```

You'll be redirected to `http://localhost:8765/callback?code=<AUTH_CODE>&state=...`.
Copy `AUTH_CODE`. (Run any tiny loopback listener, or just read the code out of
the browser's address bar — the page won't load, that's fine.)

---

## 4. Exchange the code → tokens

```bash
curl -s -X POST https://api.robinhood.com/oauth2/token/ \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data-urlencode "grant_type=authorization_code" \
  --data-urlencode "code=<AUTH_CODE>" \
  --data-urlencode "redirect_uri=http://localhost:8765/callback" \
  --data-urlencode "client_id=<client_id>" \
  --data-urlencode "code_verifier=$code_verifier" | jq
```
Response includes `access_token`, `refresh_token`, `expires_in`, `scope`, plus
Robinhood extras (`user_uuid`, …). Then set on the app (Vercel env + local
`.env.local`):

```
ROBINHOOD_MCP_TOKEN=<access_token>
```
Store `refresh_token` and `client_id` as secrets — you need them for step 5.

---

## 5. Refresh (access tokens are short-lived)

Before `expires_in` elapses, mint a new access token:

```bash
curl -s -X POST https://api.robinhood.com/oauth2/token/ \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data-urlencode "grant_type=refresh_token" \
  --data-urlencode "refresh_token=<refresh_token>" \
  --data-urlencode "client_id=<client_id>" | jq
```
Update `ROBINHOOD_MCP_TOKEN` with the new `access_token`; if a new
`refresh_token` is returned, replace the stored one (rotation).

**Durable option — in-app auto-refresh (BUILT).** Instead of pasting an access
token, set:

```
ROBINHOOD_OAUTH_CLIENT_ID=<client_id from step 1>
ROBINHOOD_OAUTH_REFRESH_TOKEN=<refresh_token from step 4>
# ROBINHOOD_OAUTH_TOKEN_URL=https://api.robinhood.com/oauth2/token/   # default
```

`lib/confluence/robinhood/oauth.ts` then trades the refresh token for access
tokens on demand, caches them in Redis until ~60s before expiry, and **persists a
rotated refresh token** (in Redis) so it survives across serverless invocations —
you never touch an access token again. If a refresh fails (`invalid_grant` — the
refresh token expired or was rotated away), the app surfaces a clear error and
you re-run steps 1–4 to re-seed `ROBINHOOD_OAUTH_REFRESH_TOKEN`.

> Precedence: if the OAuth vars above are set they win; otherwise a static
> `ROBINHOOD_MCP_TOKEN` is used. Set one or the other.

**Alternative — Anthropic Managed Agents + Vault** — seed the `mcp_oauth`
credential (access + refresh + `token_endpoint` + `client_id`); Anthropic
auto-refreshes.

---

## Notes & safety

- This is **your** account and **your** app — a legitimate first-party OAuth
  client. Scope minimally; never commit tokens; treat the refresh token like a
  password.
- The account you authorize must be `agentic_allowed=true` (the "Agentic"
  account, `462746538`). Non-agentic accounts are rejected by the order tools.
- Live orders still require every app-side gate: `CONFLUENCE_ALLOW_LIVE=true`,
  pinned account, armed kill switch, exposure caps, and the live buying-power
  pre-check. See the go-live checklist in the PR / `docs/CONFLUENCE_AGENT.md`.
- The app's live MCP transport + Robinhood response-field mapping are **not yet
  E2E-verified** — the first real order is a supervised test on the $50 account.


---

## Recovery: `401 … client id not allowed: <missing>`

Seen in production 2026-08-18. `/api/confluence/robinhood/health` reported:

```
connected: false, configured: true,
auth: { tokenSource: "refresh", clientIdSet: true, staticTokenSet: false,
        refreshTokenSource: "redis", accessTokenCached: true }
error: "Robinhood MCP initialize failed (HTTP 401) for get_accounts:
        client id not allowed: <missing>"
```

**What it means.** The failure is at MCP `initialize`, which is only reached
after a token has been obtained — so the grant is intact and tokens are still
being issued. Robinhood derives the OAuth client id *from* the bearer, so
`<missing>` means it resolved no permitted agentic client.

The cause is the split between two hosts. `scripts/robinhood-oauth.mjs`
registers the client **dynamically** against `agent.robinhood.com`, but tokens
are refreshed at `api.robinhood.com`. The token service happily keeps minting
access tokens for a dynamically-registered client the MCP service has since
dropped — so the app looks authenticated right up until every call 401s.

**Recovery, in order (all four steps, or it fails differently):**

1. `node scripts/robinhood-oauth.mjs` — mints a **new** `client_id`.
2. Update **both** `ROBINHOOD_OAUTH_CLIENT_ID` *and*
   `ROBINHOOD_OAUTH_REFRESH_TOKEN` in Vercel. Updating only the token leaves the
   dead client id in place and reproduces the same 401.
3. **Agents → Settings → Reconnect Robinhood** (or `POST
   /api/confluence/robinhood/reset-auth`). The refresh token cached in Redis
   (`confluence:robinhood:refresh`) outranks the env seed, and pairing it with
   the new client id fails as `invalid_grant` — which reads like a botched
   capture rather than a stale cache. This also clears the cached access token
   (`confluence:robinhood:access`), which would otherwise be reused until it
   expires.
4. Re-check `/api/confluence/robinhood/health` → expect `connected: true`.

Do **not** set `ROBINHOOD_MCP_TOKEN` in production. It is a short-lived pasted
access token, it is not part of the deployed setup, and its only effect when
the OAuth path breaks is to mask the failure behind a token that cannot work.
