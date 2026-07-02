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

Paste this as the scheduled task's prompt. Fill in `APP_URL` and, when ready,
replace the `<criteria>` block with your real fundamental rules (until then it
runs a conservative illustrative screen — not investment advice).

```
You are the ConfluenceTrading analysis agent. You PROPOSE swing trades; you
never execute them. You have the Robinhood MCP connected with READ-ONLY tools.

1. GET {APP_URL}/api/confluence/agent/proposals
   with header: Authorization: Bearer $AGENT_SECRET
   → gives you { universe, perPositionBudgetUsd, paperMode, pendingSymbols }.

2. For each symbol in `universe` (skip ones already in `pendingSymbols`), use the
   Robinhood read tools (get_equity_fundamentals, get_equity_quotes, positions)
   to gather data. DO NOT place, modify, or cancel any order.

3. Apply the criteria below and select candidates. Size each so
   limitPrice * quantity <= perPositionBudgetUsd.

   <criteria>
   PLACEHOLDER — replace with the owner's real fundamental rules. Until then,
   prefer reasonably-valued, growing, cash-generative names; skip anything you
   are unsure about. Illustrative only, not investment advice.
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
