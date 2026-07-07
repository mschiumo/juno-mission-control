# ConfluenceTrading — Performance Review module (Milestone R)

Grades both the user's discretionary ThinkOrSwim trading and the swing agent's
Robinhood account with the same scorecard. Lives at **Trading → Agents →
Review** (owner-only, like the rest of ConfluenceTrading).

## Design principles

- **Code computes, the LLM narrates.** Every number (win rate, R-multiples,
  expectancy, violations) is produced by pure, unit-tested functions
  (`lib/confluence/review/{parser,pairing,metrics,rules}.ts`). The weekly
  review agent reads the computed results and writes prose; it has **no
  tools** and never does arithmetic that lands in the UI.
- **No new execution surface.** The module is read-only over trade history.
  Its only executable change is ADDING pre-trade checks to the existing
  execution service; the human-approval gate and the existing guardrails are
  untouched.
- **The analyst never grades its own homework.** The metrics engine that
  scores trades shares no code or prompts with the agent that proposes them.

## Data flow

```
manual_tos:  ToS statement CSV ──▶ parser ──▶ executions ─┐
agentic_rh:  execution-service order log ──▶ mapper ──────┤
                                                          ▼
                              FIFO pairing ──▶ trades (round trips)
                                                          ▼
                       metrics engine + rules engine (pure functions)
                                                          ▼
                metrics API · rule_violations · weekly_reviews (narrated)
```

Entities (Redis, `confluence:review:*:{userId}`): `executions`, `trades`,
`symbol-pl`, `risk-config` (append-only history), `violations`,
`weekly-reviews`, `import-batches`.

## Risk framework (defaults from the 2026-07-02 statement analysis)

| key                       | default | rationale                                     |
| ------------------------- | ------- | --------------------------------------------- |
| `riskUnitUsd`             | $50     | observed modal stop-out size (−$35…−$60 band) |
| `maxRMultiple`            | 1.5     | caps any loss at ~$75                         |
| `churnThreshold`          | 2       | max round trips per symbol per session        |
| `probationWindowSessions` | 20      | sessions a symbol must prove itself over      |
| `breadthCap`              | 15      | active symbols in trailing window             |

Editable under Review → Risk config; stored as append-only rows, read by both
rules paths. Saving recomputes R-multiples + observed violations.

## The two rules paths

**Agentic (enforced pre-trade, in code):** `checkPreTradeReviewRules()` runs
inside `executeApprovedProposal` after the existing guardrails —

1. every approved proposal must carry a stop such that max loss ≤
   `maxRMultiple × riskUnitUsd` (default $75);
2. proposals in symbols on probation (net-negative over the trailing
   `probationWindowSessions` AND churn above `churnThreshold`) are rejected;
3. symbol-breadth cap over open (active-order) symbols.

The stop is both a pre-trade gate AND broker-side protection: after the
entry fills (while execution is armed), the service automatically places a
`stop_market` GTC exit at the approved stop price. Caveats: a disarmed
system places nothing (the position shows NO STOP until re-armed +
refreshed), and a stop_market can fill below the stop on gaps — the
"max loss ≤ $75" line is a normal-conditions bound, not a guarantee.

⚠️ Consequence: **approving a proposal without a stop now fails** with
`stop_required`. The Value-TA strategy always proposes stops; seeded/manual
proposals need one entered at approval. Sizing must also fit the $75 max-loss
line — widen `riskUnitUsd`/`maxRMultiple` in Review → Risk config if the
strategy's risk-per-trade config is larger.

**Manual (observed post-import):** the same rules run over imported round
trips; violations are written to the scorecard. Nothing is blocked — ToS
trades happen outside the system.

## Imports

- Review → Import → choose the ThinkOrSwim "Account Statement" CSV export.
- Idempotent: an identical file re-import is a 409 (sha-256 dedupe).
  Overlapping statements are safe — fills dedupe on their natural key.
- Atomic: a parse failure rejects the whole batch; nothing partial is written.
- The statement's Profits and Losses section imports as YTD summary context
  (`symbol_pl_summary`); it is never reconstructed from fills.
- "Sync agentic fills" (Review → Scorecard) maps the execution service's
  filled orders into the same schema; the weekly cron also does this.

## Weekly review

Cron `0 13 * * 6` (Saturday 9am ET) → `/api/cron-jobs/confluence-weekly-review`
syncs agentic fills and writes one narrative for the just-completed Mon–Sun
week: the three tracking numbers (win rate, payoff ratio, largest loss in R),
delta vs. the prior week, and the single highest-impact behavior to fix.
Uses `ANTHROPIC_API_KEY` + `CONFLUENCE_REVIEW_MODEL` (default
`claude-opus-4-8`); if no key is set the cron reports "skipped" and nothing
breaks. Re-running a week replaces that week's review ("Run now" button).

## Golden fixture

`test/fixtures/2026-07-02-AccountStatement.csv` is a **synthesized** statement
(generator: `scripts/generate-review-fixture.mjs`) reproducing every number
pinned in the milestone spec — 11 round trips on 7/2 (8×TZA incl. a 500-share
short @3.8101→3.8199 and a 2/498 split exit, 1×MSTR, 1×CWD, 1×CONL), gross by
symbol (TZA −$6.44, MSTR +$5.76, CWD +$1.55, CONL +$0.31, session +$1.18),
$1.16 misc fees, and a 158-symbol P/L section totalling −$1,095.28 — plus the
format quirks (BOM, `="…"` refs, parenthesized negatives, quoted thousands,
REJECTED/TRIGGERED/CANCELED-partial rows, STP continuation rows).

If the real 2026-07-02 export is placed at the same path, the golden tests
assert only the spec numbers, so they should hold verbatim; interior details
of the six plain TZA round trips (individual entry/exit prices) are synthetic
and deliberately not asserted.

Run the suite: `npm test` (vitest).
