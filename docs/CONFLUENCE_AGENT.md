# ConfluenceTrading — Scheduled Agent Runbook

How to run the ConfluenceTrading analysis agent as a **scheduled Claude agent**
that already has the Robinhood MCP connected. This is the path where **no OAuth
token lives in the app** — the Claude client owns the Robinhood OAuth (the same
connection you authorized on desktop), reads fundamentals, applies your
criteria, and reports proposals to the app over an `AGENT_SECRET`-authenticated
endpoint. The app then surfaces them in Trading → Agents for you to approve.

```
Scheduled Claude agent (has Robinhood MCP + your criteria)
   │  reads fundamentals/quotes/positions   (READ-ONLY)
   ▼
POST /api/confluence/agent/proposals  (Bearer AGENT_SECRET)
   ▼
App stores pending proposals → you Approve/Edit/Reject → deterministic execution
```

The agent **only proposes**. Nothing it does places an order — execution stays
behind the human gate in the app (approval → deterministic execution service).

---

## One-time setup

1. **Connect the Robinhood Trading MCP** to the agent's runtime (once; OAuth on
   desktop):
   ```
   claude mcp add robinhood-trading --transport http https://agent.robinhood.com/mcp/trading
   ```
   Reload and complete the browser OAuth, selecting the **Agentic** account.

2. **Keep it read-only (the safety guarantee in this model).** The agent must
   never call order tools. Deny them in the agent's permissions so the harness
   blocks them even if the model tries:
   ```jsonc
   // .claude/settings.json → permissions.deny
   "mcp__robinhood-trading__place_equity_order",
   "mcp__robinhood-trading__place_option_order",
   "mcp__robinhood-trading__cancel_equity_order",
   "mcp__robinhood-trading__cancel_option_order"
   ```
   (Allow only the read tools: `get_equity_fundamentals`, `get_equity_quotes`,
   `get_equity_positions`, `get_portfolio`, `get_accounts`, `get_earnings_*`,
   `search`.)

3. **Set `AGENT_SECRET`** in the app's environment (Vercel + local `.env.local`)
   if not already set — the Collaborative Goals agent uses the same secret. Give
   the same value to the scheduled agent.

4. **Note the app base URL** the agent will POST to (e.g. the production domain,
   or `http://localhost:3000` for local testing).

---

## The agent prompt

Paste this as the scheduled task's prompt. Fill in `APP_URL`. The `<criteria>`
block below is the **Value-TA Pullback** strategy — the same rules the in-app
deterministic runner enforces (see `docs/CONFLUENCE_STRATEGY_VALUE_TA.md` and
`lib/confluence/agent/strategies/value-ta-pullback.ts`, which is the source of
truth for the thresholds). Not investment advice.

```
You are the ConfluenceTrading analysis agent. You PROPOSE swing trades; you
never execute them. You have the Robinhood MCP connected with READ-ONLY tools.

1. GET {APP_URL}/api/confluence/agent/proposals
   with header: Authorization: Bearer $AGENT_SECRET
   → gives you { universe, perPositionBudgetUsd, paperMode, pendingSymbols }.

2. For each symbol in `universe` (skip ones already in `pendingSymbols`), use the
   Robinhood read tools (get_equity_fundamentals, get_equity_quotes, positions)
   to gather data, and pull ≥200 daily bars with get_equity_historicals to
   compute SMA50, SMA200, RSI(14), and ATR(14). DO NOT place, modify, or cancel
   any order.

3. Apply the criteria below and select candidates. Size each so
   limitPrice * quantity <= perPositionBudgetUsd.

   <criteria>
   STRATEGY: Value-TA Pullback — long-only, low-risk, steady returns. Propose a
   symbol ONLY when BOTH gates pass. If data for a gate is unavailable, the
   gate FAILS (never assume).

   VALUE GATE (all required):
   - Market cap >= $10B.
   - P/E (TTM) in (0, 25] — or forward P/E in (0, 22] if TTM is unavailable.
   - P/B <= 8 when reported.
   - Dividend yield >= 1% OR clearly positive free cash flow.

   TECHNICAL GATE (all required, from >=200 daily bars):
   - Uptrend: last close > 200-day SMA AND 50-day SMA > 200-day SMA.
   - Pullback: last close within -2% to +4% of the 50-day SMA.
   - RSI(14) between 35 and 55.
   - ATR(14) <= 4% of price; 20-day avg dollar volume >= $20M.
   - Last close no higher than 97% of the 52-week high (do not chase).

   ORDER CONSTRUCTION (every proposal):
   - suggestedLimitPrice: ~0.5% below last close.
   - suggestedStopPrice: 1.8×ATR(14) below entry, moved just under the 10-day
     swing low when that is close; total risk always 3%–8% of entry.
   - suggestedTargetPrice: entry + 2× the entry-to-stop distance (2:1 R:R).
   - suggestedQuantity: risk-based — risk budget ÷ per-share stop distance,
     capped by perPositionBudgetUsd.
   - Propose NOTHING when no symbol clears both gates — an empty list is a
     good outcome.
   </criteria>

4. POST {APP_URL}/api/confluence/agent/proposals
   with header: Authorization: Bearer $AGENT_SECRET
   body: {
     "cadence": "nightly",
     "proposals": [
       { "symbol": "AAPL", "direction": "buy", "thesis": "...",
         "suggestedLimitPrice": 182.5, "suggestedQuantity": 5,
         "suggestedStopPrice": 174, "suggestedTargetPrice": 205,
         "fundamentals": [ { "label": "Fwd P/E", "value": "26.4" } ] }
     ]
   }
   Send an empty proposals list only if nothing qualifies (the endpoint requires
   at least one; if none qualify, simply don't POST).

Report a one-line summary of what you proposed. Do not place any trades.
```

---

## Scheduling

Run it on a swing cadence (nightly, weekdays — not intraday). Either:

- **Claude routines / the `schedule` skill** — create a recurring cloud agent
  with the prompt above (e.g. cron `0 2 * * 2-6` ≈ post-close weeknights ET).
- **Claude Code scheduled task** on a machine that has the Robinhood MCP
  connected.

---

## Endpoints (reference)

- `GET  /api/confluence/agent/proposals` → run context (universe, budget, paper
  mode, current pending symbols). Auth: `Bearer AGENT_SECRET`.
- `POST /api/confluence/agent/proposals` → ingest proposals; opens an
  `agent_run` and writes them as `pending`. Auth: `Bearer AGENT_SECRET`.

Configure the universe with `CONFLUENCE_UNIVERSE` (comma-separated tickers).

---

## Safety recap

- The scheduled agent is **read-only** (order tools denied) — it cannot trade.
- It only writes **pending** proposals; you approve every one before anything is
  placed.
- The app's **kill switch** (Agents → Settings, `trading_enabled`) and exposure
  caps gate the deterministic execution service regardless of what the agent
  proposes.
- Ships in **paper mode** — proposals execute against the paper adapter until you
  arm live mode and pin the agentic account.

---

## Alternatives

Two other auth models exist for the same agent (see the PR description):
- **In-app Claude MCP connector** (`CONFLUENCE_AGENT_MODE=claude`) — the app calls
  the Anthropic API with the Robinhood MCP as a connector; needs a server-side
  `ROBINHOOD_MCP_TOKEN`. Read-only is enforced by an API-level tool allowlist.
- **Managed Agents + Vault** — seed the Robinhood OAuth credential into a Vault
  once; Anthropic auto-refreshes it.

This runbook is the "no token in the app" path.
