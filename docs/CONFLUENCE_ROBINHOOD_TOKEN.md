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

**Durable options (so you're not pasting tokens):**
- **In-app auto-refresh** — store `refresh_token` + `client_id` as env/secret;
  a small helper exchanges for a fresh access token and caches it in Redis with
  the `expires_in` TTL, and the live adapter reads the cached token. (Ask and
  I'll wire this — `lib/confluence/robinhood/oauth.ts`.)
- **Anthropic Managed Agents + Vault** — seed the `mcp_oauth` credential
  (access + refresh + `token_endpoint` + `client_id`); Anthropic auto-refreshes.

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
