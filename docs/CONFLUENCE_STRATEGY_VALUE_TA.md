# Value-TA Pullback — the ConfluenceTrading strategy

**Long-only. Low-risk, steady returns. Value investing picks the name; technical
analysis picks the moment.** A symbol is proposed only when BOTH gates pass —
that intersection is the "confluence" the app is named for.

Source of truth for every threshold:
[`lib/confluence/agent/strategies/value-ta-pullback.ts`](../lib/confluence/agent/strategies/value-ta-pullback.ts)
(`VALUE_TA_PARAMS`). This document explains the design; the code enforces it.
*Not investment advice — parameters are the owner's tuning surface.*

---

## Philosophy

- **Value gate ("what to own")** — durable large-cap businesses at fair
  prices that return or generate cash. This is the margin-of-safety half:
  when a technical read is wrong, the position degrades into holding a cheap,
  dividend-paying large cap rather than a broken momentum name.
- **Technical gate ("when to own it")** — buy pullbacks *within uptrends*,
  never breakdowns and never breakouts. Entries happen where dip-buyers have
  historically stepped in (the rising 50-day average) with momentum cooled but
  not broken.
- **Risk before reward** — every proposal carries a stop (3–8% below entry), a
  2:1 reward-to-risk target, and a risk-based position size, so the expected
  loss per losing trade is roughly constant. Steady returns come from bounded
  losses, not from big winners.

## The rules

### Gate 1 — Value (all required; missing data = fail)

| Rule | Threshold | Why |
|---|---|---|
| Market cap | ≥ $10B | Stability; no lottery tickets |
| P/E (TTM) | 0 < P/E ≤ 25 | Profitable, not paying for hype |
| …or forward P/E | 0 < P/E ≤ 22 | Slightly stricter when estimate-based |
| P/B | ≤ 8 when reported | Screens balance-sheet extremes |
| Cash discipline | Div yield ≥ 1% **or** FCF > 0 | Shareholder returns / self-funding |
| ROE | ≥ 10% *when provided* | Quality guard |
| Debt/equity | ≤ 2.0 *when provided* | Leverage guard |
| Revenue growth | ≥ 0 *when provided* | No melting ice cubes |

*"When provided"*: Robinhood fundamentals carry P/E, P/B, cap, and yield but
not ROE/leverage/growth — those guards arm automatically once a richer
provider (e.g. Massive) is wired in.

### Gate 2 — Technicals (all required; computed from ≥200 daily bars)

| Rule | Threshold | Why |
|---|---|---|
| Trend | close > SMA200 **and** SMA50 > SMA200 | Established uptrend only |
| Pullback | close within −2%…+4% of SMA50 | Buy the dip at support, don't chase |
| RSI(14) | 35–55 | Cooled off, not broken down |
| ATR(14) | ≤ 4% of price | Volatility ceiling = low risk |
| Liquidity | 20-day avg dollar volume ≥ $20M | Fills without slippage |
| 52-week high | close ≤ 97% of it | No buying at the top |

### Order construction

- **Entry**: limit ~0.5% below last close (patient, never market).
- **Stop**: 1.8×ATR below entry, widened to just under the 10-day swing low
  when that structure is nearby; hard bounds 3%–8% of entry.
- **Target**: entry + 2 × (entry − stop) — fixed **2:1 reward-to-risk**, per
  `docs/TRADING_STRATEGY_GUIDE.md`.
- **Size**: `min(riskBudget ÷ perShareRisk, positionBudget ÷ entry)` shares.
  Risk budget defaults to **1% of the total exposure cap** per trade
  (override: `CONFLUENCE_RISK_PER_TRADE_USD`).
- **Ranking**: when more names qualify than the run's proposal budget, a 0–100
  confluence score (valuation, yield, RSI position, SMA50 proximity, trend
  strength) decides which proposals are kept.

## How it plugs into the pipeline

```
universe → fundamentals provider ┐
                                 ├→ strategy.evaluate() → Candidate → pending Proposal
          technicals provider ───┘        (pure fn)            │
                                                    human approves in Agents tab
                                                               │
                                     guardrails (kill switch, caps, buying power)
                                                               │
                                       broker adapter: paper fill │ Robinhood MCP
                                                        place_equity_order (live)
```

The strategy **never places orders**. It emits candidates that become
`pending` proposals; every order still requires human approval in the Agents
tab and passes the code-level guardrails at execution time. Both agent modes
run the same rules:

- **`CONFLUENCE_AGENT_MODE=deterministic`** — code computes the gates from the
  configured providers (default; credential-free with mocks).
- **`CONFLUENCE_AGENT_MODE=claude`** — the MCP analyst receives the identical
  criteria (`VALUE_TA_CRITERIA_PROMPT`) in its `<criteria>` block and reads
  Robinhood data itself (read-only toolset; order tools disabled).

## Configuration

| Env var | Default | Notes |
|---|---|---|
| `CONFLUENCE_STRATEGY` | `value-ta-pullback` | `placeholder` restores the old stub |
| `CONFLUENCE_TECHNICALS_PROVIDER` | `mock` | `robinhood` = MCP `get_equity_historicals` |
| `CONFLUENCE_FUNDAMENTALS_PROVIDER` | `mock` | `robinhood` \| `massive` (existing) |
| `CONFLUENCE_RISK_PER_TRADE_USD` | 1% of exposure cap | Absolute risk-per-trade override |
| `CONFLUENCE_UNIVERSE` | 10 mega-caps | See recommendation below |

**Recommended universe** — the strategy is selective (it screens for both
value *and* setup), so give it a wide, diversified, value-tilted large-cap
watchlist rather than the default mega-cap 10:

```
CONFLUENCE_UNIVERSE=KO,JNJ,PG,JPM,PEP,MRK,ABBV,CVX,XOM,HD,MCD,UNH,CSCO,VZ,T,MMM,CAT,IBM,GS,BAC,WMT,COST,LOW,TGT,PFE
```

Expect **zero proposals on many runs**. That is the design working: the edge
is refusing B-grade setups, and cash is a position.

## Verification status

- Both gates, exits, sizing, and ranking verified numerically against the
  deterministic mock providers (KO passes end-to-end; AAPL/MSFT/NVDA/PG
  correctly rejected on valuation, JNJ on RSI).
- `RobinhoodTechnicalsProvider` follows the same env-gated transport as the
  fundamentals provider — its bar field mapping needs the same one-time live
  verification (see the file header note) before switching it on.
- Live order flow itself is unchanged by this feature and still governed by
  `docs/CONFLUENCE_GO_LIVE.md`.
