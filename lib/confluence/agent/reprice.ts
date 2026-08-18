/**
 * Approval-time re-pricing — the freshness check between a screen and an order.
 *
 * WHY THIS EXISTS. A proposal's suggested limit is a point-in-time function of
 * ONE input: the last settled close at screening time (entry = close × 0.995
 * for the value-TA strategy). Proposals stay actionable for a week, and the
 * approve route used to submit `suggestedLimitPrice` verbatim however old it
 * was. Approve a proposal after the next session has closed and the limit is
 * anchored to a stale close — in a market that drifted up it sits below the
 * whole day's range, so the GFD order expires unfilled at 4pm. Every unfilled
 * agentic entry in Aug 2026 (SLB, HBAN, D, SU) matched that signature exactly:
 * priced off session N−1, submitted during session N+1.
 *
 * WHAT IT DOES. Re-fetch the symbol's technicals, compare the settled session
 * the plan was priced from against the latest settled session, and — when they
 * differ — re-run the SAME strategy against current data to produce a fresh
 * plan. It never mutates the proposal and never places anything: the caller
 * blocks the approval and hands the fresh numbers back to the human, who
 * approves them explicitly (recorded as a normal `proposal.edited` diff).
 *
 * Deliberately fails OPEN: if the data can't be fetched we report `unverified`
 * and the approval proceeds as before. A stale limit doesn't lose money — it
 * just doesn't fill — so blocking trading on a provider blip would be the
 * worse failure.
 */

import { getFundamentalsProvider } from '@/lib/confluence/fundamentals';
import { getTechnicalsProvider } from '@/lib/confluence/technicals';
import { getStrategy } from './strategies';
import { strategyContextFor } from './context';
import type { Candidate } from './strategy';
import type { Proposal, SystemState } from '@/types/confluence';

/** The freshly-computed plan for a proposal whose pricing session has rolled. */
export interface RepricedPlan {
  limitPrice: number;
  quantity: number;
  stopPrice?: number;
  targetPrice?: number;
  thesis: string;
}

export type RepriceResult =
  /** The plan is still priced off the latest settled session — submit as-is. */
  | { code: 'fresh'; asOf: string }
  /** A newer session has settled and the setup still qualifies: here's the plan. */
  | { code: 'stale'; pricedAsOf: string; asOf: string; plan: RepricedPlan }
  /** A newer session has settled and the setup no longer clears its gates. */
  | { code: 'setup_gone'; pricedAsOf: string; asOf: string }
  /** Couldn't establish freshness (no basis recorded, provider error, …). */
  | { code: 'unverified'; reason: string };

/**
 * The most recent trading session that had settled at `instant`, as an ET
 * date (YYYY-MM-DD). Mirrors what the technicals provider would have seen:
 * today's bar counts only once the session is over (~16:15 ET), and weekends
 * roll back to Friday. Holidays are not modelled — this is only the fallback
 * basis for proposals written before `pricedAsOf` was recorded, and the
 * authoritative comparison is always against a real fetched `asOf`.
 */
export function lastSettledSessionAt(instant: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
    weekday: 'short',
  }).formatToParts(instant);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const minutes = Number(get('hour')) * 60 + Number(get('minute'));
  const etDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(instant);

  // Walk back from today until we land on a weekday whose session has closed.
  const settledToday = get('weekday') !== 'Sat' && get('weekday') !== 'Sun' && minutes > 16 * 60 + 15;
  const cursor = new Date(`${etDate}T12:00:00Z`);
  if (!settledToday) cursor.setUTCDate(cursor.getUTCDate() - 1);
  while (cursor.getUTCDay() === 0 || cursor.getUTCDay() === 6) {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return cursor.toISOString().slice(0, 10);
}

/** The session a proposal's prices came from: recorded, else inferred. */
function basisSessionFor(proposal: Proposal): string | null {
  if (proposal.pricedAsOf) return proposal.pricedAsOf;
  if (!proposal.createdAt) return null;
  const created = new Date(proposal.createdAt);
  return Number.isNaN(created.getTime()) ? null : lastSettledSessionAt(created);
}

/**
 * Upper bound on the whole check. The approve route holds a 60s per-proposal
 * mutex, and the technicals read retries transient failures — left unbounded a
 * bad day at the broker could outlive the lock and let a second tap through as
 * a duplicate order. Overrunning this is just `unverified`, which is the old
 * behaviour, so the bound costs nothing but a slow path.
 */
const REPRICE_TIMEOUT_MS = 12_000;

/**
 * Check a pending proposal's prices against current data. Read-only: fetches
 * the symbol's technicals (+ fundamentals when the strategy's gate needs them)
 * and re-runs the strategy. Never writes, never orders.
 *
 * Always settles within {@link REPRICE_TIMEOUT_MS}.
 */
export async function repriceProposal(proposal: Proposal, state: SystemState): Promise<RepriceResult> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<RepriceResult>((resolve) => {
    timer = setTimeout(
      () => resolve({ code: 'unverified', reason: `Freshness check exceeded ${REPRICE_TIMEOUT_MS}ms.` }),
      REPRICE_TIMEOUT_MS,
    );
  });
  try {
    // The loser of the race is a read-only fetch — safe to leave dangling.
    return await Promise.race([repriceNow(proposal, state), deadline]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function repriceNow(proposal: Proposal, state: SystemState): Promise<RepriceResult> {
  const basis = basisSessionFor(proposal);
  if (!basis) {
    return { code: 'unverified', reason: 'Proposal records no pricing session.' };
  }

  const strat = getStrategy();
  // A strategy that never reads bars has no session basis to go stale against.
  if (!strat.needsTechnicals) {
    return { code: 'unverified', reason: `Strategy ${strat.id} does not price off market bars.` };
  }

  const symbol = proposal.symbol.toUpperCase();
  let technicals;
  try {
    technicals = await getTechnicalsProvider().getTechnicals(symbol);
  } catch (err) {
    return { code: 'unverified', reason: `Technicals fetch failed: ${err instanceof Error ? err.message : 'unknown error'}` };
  }
  if (!technicals) {
    return { code: 'unverified', reason: `No bars available for ${symbol}.` };
  }

  // The authoritative comparison: has a newer session settled since pricing?
  if (technicals.asOf <= basis) {
    return { code: 'fresh', asOf: technicals.asOf };
  }

  const ctx = strategyContextFor(state);

  // Hedge-sleeve proposals are technicals-only and evaluated by the sleeve.
  const isSleeve = strat.sleeve != null && proposal.strategyId != null && proposal.strategyId !== strat.id;
  let candidate: Candidate | null = null;
  try {
    if (isSleeve) {
      candidate = strat.sleeve!.evaluate(symbol, technicals, ctx);
    } else {
      const fundamentals = await getFundamentalsProvider().getFundamentals(symbol);
      candidate = fundamentals ? strat.evaluate(fundamentals, technicals, ctx) : null;
    }
  } catch (err) {
    return { code: 'unverified', reason: `Re-evaluation failed: ${err instanceof Error ? err.message : 'unknown error'}` };
  }

  if (!candidate) {
    return { code: 'setup_gone', pricedAsOf: basis, asOf: technicals.asOf };
  }
  return {
    code: 'stale',
    pricedAsOf: basis,
    asOf: technicals.asOf,
    plan: {
      limitPrice: candidate.suggestedLimitPrice,
      quantity: candidate.suggestedQuantity,
      stopPrice: candidate.suggestedStopPrice,
      targetPrice: candidate.suggestedTargetPrice,
      thesis: candidate.thesis,
    },
  };
}
