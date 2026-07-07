# Crypto Screener + Trading Agent

A crypto counterpart to the ConfluenceTrading stock agent: a memecoin/crypto momentum
screener plus an agentic trader that proposes (and optionally auto-executes) trades
through a guardrail-gated execution path. Lives under **Trading → Crypto**.

## Architecture

The design follows the practitioner consensus for LLM trading bots: **the model ranks
and vetoes; deterministic code owns discovery, safety, sizing, and every limit.**

```
DEX Screener discovery ──► momentum scoring (code) ──► rug gate (RugCheck/GoPlus, code)
        └── every 10 min cron / manual run                          │
                                                                    ▼
guardrails (code) ◄── proposals ◄── Claude analyst (rank/veto, JSON verdicts)
      │
      ▼
broker adapter ──► paper (simulated fills w/ price impact)  [default]
              └──► Jupiter Ultra (live Solana swaps)        [env-gated]
      │
      ▼
positions ──► exit engine every cron tick:
              hard stop → TP ladder (50% @ 2x, 25% @ 5x) → trailing stop (moonbag)
```

- **Screener** (`lib/crypto/screener.ts`): DEX Screener API (free, no key) discovers
  boosted + trending pairs on Solana/Ethereum/Base; a momentum composite (volume
  acceleration vs baseline, buy pressure, aligned price action, turnover) scores each.
- **Rug gate** (`lib/crypto/providers/safety.ts`): RugCheck (Solana) / GoPlus (EVM).
  Hard fails — mint/freeze authority live, unlocked LP, honeypot, >10% tax, top-10
  holders >30%, unverified contract — disqualify a token before the model sees it.
  Missing safety data counts as unsafe.
- **Analyst** (`lib/crypto/agent/analyst.ts`): Claude receives a structured dossier
  and returns buy/skip verdicts with conviction + thesis. Max 3 buys per run, sizes
  and stops clamped in code, unknown tokens dropped. Falls back to a deterministic
  momentum ranking when `ANTHROPIC_API_KEY` is absent.
- **Guardrails** (`lib/crypto/guardrails.ts`): kill switch, live-arming gate,
  per-position cap, total exposure cap, max positions, daily-loss circuit breaker,
  post-loss cooldown, safety-score floor, liquidity floor, slippage cap, one position
  per token. Re-checked authoritatively at execution time.
- **Execution** (`lib/crypto/execution.ts`): idempotent orders (refId), full audit
  trail, realized P&L feeds the circuit breaker.
- **Exit engine** (`lib/crypto/position-manager.ts`): runs every cron tick even when
  the kill switch is on (exits are risk-reducing). Wide hard stop (~45%), laddered
  take-profits that recover principal at 2x, trailing stop on the remainder.

## Modes

| Mode | Default | Meaning |
|---|---|---|
| Kill switch | **ON** (trading disabled) | No buys anywhere. Exits still run. |
| Paper | **ON** | Simulated fills at live prices with modeled slippage + fees. |
| Auto-trade | **OFF** | Agent proposals wait for owner approval in the UI. |

Turning any of these toward "more live" is an explicit owner action in the UI, and
live mode additionally requires the server env gate below.

## Environment

```bash
# Optional — Claude analyst (falls back to deterministic ranking without it)
ANTHROPIC_API_KEY=...
CRYPTO_AGENT_MODEL=claude-sonnet-4-6   # override the analyst model

# Live execution (ALL required before a single live order is possible)
CRYPTO_ALLOW_LIVE=true                 # server-level arming gate
CRYPTO_WALLET_SECRET_KEY=...           # base58 or JSON-array secret key — DEDICATED hot wallet
SOLANA_RPC_URL=...                     # optional; defaults to public mainnet RPC
```

No new npm dependencies: Solana signing uses Node's built-in ed25519, and execution
goes through the Jupiter Ultra API (which broadcasts the transaction itself).

## Wallet policy (live mode)

- Use a **dedicated hot wallet** created for the bot. Fund it with USDC only up to
  what you are fully prepared to lose; keep everything else in your main wallet.
- Sweep profits out on a schedule; never raise the hot-wallet balance to "let it run".
- The wallet key lives only in Vercel env vars.

## Go-live checklist

1. Paper trade **30+ days**, including at least one sharp market dump; review the
   audit log for surprises.
2. Verify the kill switch: enable trading, flip it off, confirm a manual run creates
   proposals whose approval is rejected with `kill_switch`.
3. Verify the circuit breaker trips at the daily loss limit in paper.
4. Create the dedicated hot wallet, fund minimally, set the env vars, redeploy.
5. Flip paper mode off in the UI (requires `CRYPTO_ALLOW_LIVE=true`).
6. Start with tiny caps ($25 per position / $100 exposure) and scale only after
   fills, slippage, and exits behave.

## MCP server (agentic trading over Model Context Protocol)

`POST /api/mcp/crypto` is a Streamable-HTTP MCP server that lets external Claude
agents (Claude Code, claude.ai connectors, the Anthropic API MCP connector,
scheduled cloud agents) observe and trade through the SAME guardrails as the UI.

Authority model, defense in depth:
- **Transport**: bearer `AGENT_SECRET` (enforced in `middleware.ts` for `/api/mcp/*`).
- **Observe + propose** tools always work.
- **execute_proposal / close_position** additionally require the owner to turn on
  the **MCP** toggle in the agent console (`mcpTradingEnabled`, default OFF).
- Execution then re-runs every code guardrail (kill switch, live-arming, caps,
  circuit breaker, cooldown, safety/liquidity floors). An MCP agent can never
  raise a cap or bypass the kill switch. Paper fills unless the server is armed
  for live. Every mutating call is audited (`actor: agent`, `actorId: mcp`).

Tools: `get_system_state`, `get_wallet_status`, `get_screener`,
`get_token_safety`, `get_positions`, `get_orders`, `get_audit_log`,
`create_trade_proposal`, `execute_proposal`, `close_position`.

Connect from Claude Code:
```bash
claude mcp add --transport http crypto-trader \
  https://<host>/api/mcp/crypto --header "Authorization: Bearer $AGENT_SECRET"
```

## Endpoints

- `GET /api/crypto/screener` — screener snapshot (any logged-in user; 2-min cache, `?refresh=1`)
- `GET|PUT /api/crypto/system` — owner; kill switch, modes, caps
- `GET|POST /api/crypto/runs` — owner; agent runs / trigger a run
- `GET /api/crypto/proposals`, `POST /api/crypto/proposals/[id]/approve|reject` — owner
- `GET /api/crypto/positions`, `POST /api/crypto/positions/[id]/close` — owner
- `GET /api/crypto/orders`, `GET /api/crypto/audit` — owner
- `GET /api/cron-jobs/crypto-agent` — CRON_SECRET; exit management every 10 min +
  agent run when auto-trade is armed

## Redis keys

```
crypto:system-state:{userId}   crypto:proposals:{userId}   crypto:orders:{userId}
crypto:positions:{userId}      crypto:agent-runs:{userId}  crypto:audit:{userId}
crypto:risk:{userId}           crypto:screener:latest
crypto:paper-fill:{refId}      crypto:live-fill:{refId}    crypto:decimals:{mint}
```
