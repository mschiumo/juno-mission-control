# ConfluenceTrading — Production go-live checklist

The supervised first real order. **Do this during market hours** (regular
trading hours; Robinhood limit orders here use `regular_hours`).

## What's already verified (as of the PR)
- OAuth auto-refresh, the server-side MCP transport, and account access
  (`get_accounts`) — **verified live**.
- The order-parameter mapping and pre-trade checks — **verified live** via the
  dry-run (`review_equity_order` echoed the mapped params + flagged
  insufficient buying power on a too-large test).
- The only thing the Monday test proves is the final **`place_equity_order`**
  call itself. Everything up to it is confirmed.

## Prerequisites (do NOT skip)
Two things live outside the repo and must be set in production — they do **not**
travel with the merge:

### 1. Vercel environment variables
`.env.local` is gitignored, so your local tokens are **not** committed. Add these
in Vercel → Project → Settings → Environment Variables (Production), then redeploy:

```
ROBINHOOD_OAUTH_CLIENT_ID=<from the capture script>
ROBINHOOD_OAUTH_REFRESH_TOKEN=<from the capture script>
CONFLUENCE_ALLOW_LIVE=true
```
(`ANTHROPIC_API_KEY` and the Upstash Redis vars are already set.)

> **Re-capture the token right before testing.** The same client_id/refresh_token
> *can* work in prod, but the local read/dry-run tests exercised the refresh flow,
> and if Robinhood rotates refresh tokens the original may be spent (the rotated
> one is only in *local* Redis). Re-run to be safe, then paste into Vercel:
> ```
> node scripts/robinhood-oauth.mjs
> ```
> (Log in in your browser, pick the Agentic account. See docs/CONFLUENCE_ROBINHOOD_TOKEN.md.)

### 2. In-app settings (production Redis is separate from local)
The account pin / mode / caps you set locally live in *local* Redis. Set them
fresh in the deployed app, **Agents → Settings** (owner-only):
- Pin the **agentic account**: `462746538`.
- Set **tiny caps** (e.g. per-position `$50`, total `$50`).
- Do **not** arm / go Live yet — verify first (below).

## The sub-$50 constraint (important)
The agentic account has ~**$50** buying power, and **Robinhood limit orders do not
allow fractional shares**. So the test order's `limit_price × quantity` must be
**≤ ~$50**, at **1 whole share** → pick a stock priced **under ~$50/share**
(the demo seeds — KO ~$84, AAPL, MSFT — are all too expensive for one share).

## Go-live sequence
1. **Set the Vercel env vars** (above) and redeploy.
2. **Connection check** (read-only, no order):
   `GET /api/confluence/robinhood/health` → expect `connected: true` and the
   Agentic account listed.
3. In **Agents → Settings**: pin `462746538`, set `$50` caps.
4. **Create a small proposal** — a sub-$50 stock, `buy`, `quantity 1`, a limit at
   or near market (Proposals → manual, or `POST /api/confluence/proposals`).
5. **Dry-run it** (no order placed):
   `POST /api/confluence/robinhood/dry-run` with `{ "proposalId": "<id>" }` →
   confirm there is **no `EQUITY_NOT_ENOUGH_BP`** alert and the params look right.
6. **Arm** trading and switch to **Live** (confirm dialog) in Settings.
7. **Approve** the proposal → a REAL limit order is placed. Watch it in
   **Orders** (staged → submitted → filled) and verify in the Robinhood app.

## Protective stops & order lifecycle (automated)

- **The stop IS placed automatically now:** when an entry order fills while
  execution is armed, the service places a sell `stop_market`, GTC, at the
  approved stop price for the filled quantity (partial fills included — a
  cancelled entry with a partial fill still gets its stop). Fills are detected
  by the market-hours poll cron (every 30 min, weekdays) or any manual refresh.
- **Disarmed-at-fill caveat:** the kill switch is absolute — if trading is
  disarmed when the fill lands, the stop is NOT placed. You get a loud
  `order.protective_stop_skipped` audit event and a **NO STOP** flag on the
  Positions card. Arm execution and hit refresh on the order to place it.
- **Stale entries auto-cancel:** unfilled entry orders older than
  `entryOrderMaxAgeDays` (Settings, default 5) are cancelled by the poll cron.
  Protective stops are never auto-cancelled.
- **Gap caveat:** a `stop_market` exit can fill below the stop on a gap; the
  max-loss line is a normal-conditions bound, not a guarantee.

## ⚠️ Still true

- **A `failed` order status is not ground truth.** If the MCP call times out
  or returns an unexpected shape *after* Robinhood accepted the order, the app
  can record `failed` while the order is live at the broker. Before retrying
  anything, check the Robinhood app for a working order — cancel it there if
  it exists. (Approve is single-flight per proposal, so a double tap cannot
  place two orders, but a timeout can still desync app state from the broker.)

## Safety & rollback
- **Kill switch**: Agents → Settings → "Engage kill switch" (disarms; the
  execution service refuses to place anything).
- **Cancel**: Orders monitor → Cancel on a working order.
- **Hard stop**: unset `CONFLUENCE_ALLOW_LIVE` in Vercel and redeploy — live orders
  are refused server-side regardless of the UI.
- Every order still requires: your approval → armed kill switch → per-position +
  total caps → live buying-power pre-check → `CONFLUENCE_ALLOW_LIVE` → pinned
  account. Start tiny; scale only once trusted.

## After the test
- Reconcile the fill in the **Orders** monitor + **Audit** log, and check
  **Performance** (live mode shows the real Robinhood balance/positions).
- To return to safe/paper: switch back to **Paper** in Settings (or unset
  `CONFLUENCE_ALLOW_LIVE`).
