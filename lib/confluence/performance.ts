/**
 * Performance computation for the Agents → Performance panel.
 *
 * Positions and P&L are derived deterministically from the filled-order log
 * (FIFO), so the panel works in paper mode today. Open positions are marked to
 * market with best-effort quotes (graceful when unavailable — e.g. no egress).
 * The top-line account (value / buying power / cash) comes from the real
 * Robinhood portfolio in LIVE mode, or a simple paper model in PAPER mode —
 * never one standing in for the other (see the top-line block below).
 */

import { getAllOrders } from '@/lib/db/confluence/orders';
import { getAllProposals } from '@/lib/db/confluence/proposals';
import { getSystemState } from '@/lib/db/confluence/system-state';
import { recordBalancePoint } from '@/lib/db/confluence/balance-history';
import { orderNotional } from './guardrails';
import { getAccountSummary, type LiveAccountSummary } from './broker/live-adapter';
import { isActiveOrderStatus } from '@/types/confluence';
import type { ExecutionOrder, PerformanceStats, Position } from '@/types/confluence';

/** Simulated starting cash for the paper account model. */
const PAPER_STARTING_CASH = 10_000;

export interface AccountTopLine {
  source: 'live' | 'paper' | 'live_unavailable';
  accountValue: number | null;
  buyingPower: number | null;
  cash: number | null;
  liveError?: string;
}

/**
 * Decide the account top-line. Pure — the broker fetch happens in the caller.
 *
 * The one invariant worth stating outright: **the paper model is only ever
 * reachable in paper mode.** This used to fall through to it whenever a live
 * read failed, which rendered a $10,000 simulated buying power beside a LIVE
 * MODE badge for an account holding $120 — a number indistinguishable from a
 * real balance, and the one the proposal queue used to judge affordability.
 * In live mode an unreadable broker yields nulls and a reason, never a stand-in.
 */
export function resolveAccountTopLine(input: {
  paperMode: boolean;
  /** The broker's answer, or null when it could not be read. */
  live: LiveAccountSummary | null;
  /** Why the broker read failed (live mode only). */
  fetchError?: string;
  investedCost: number;
  realizedPnl: number;
  markedValue: number;
  quotesAvailable: boolean;
}): AccountTopLine {
  if (input.paperMode) {
    const cash = PAPER_STARTING_CASH - input.investedCost + input.realizedPnl;
    return {
      source: 'paper',
      // Value = cash + positions marked (or at cost when quotes are unavailable).
      accountValue: cash + (input.quotesAvailable ? input.markedValue : input.investedCost),
      buyingPower: cash,
      cash,
    };
  }
  if (!input.live) {
    return {
      source: 'live_unavailable',
      accountValue: null,
      buyingPower: null,
      cash: null,
      liveError: input.fetchError ?? 'The Robinhood portfolio could not be read.',
    };
  }
  return {
    source: 'live',
    accountValue: input.live.accountValue,
    buyingPower: input.live.buyingPower,
    cash: input.live.cash,
  };
}

/** Best-effort current price via Yahoo (keyless); undefined on any failure. */
async function fetchQuote(symbol: string): Promise<number | undefined> {
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`,
      { headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' } },
    );
    if (!res.ok) return undefined;
    const data = await res.json();
    const meta = data?.chart?.result?.[0]?.meta;
    const price = meta?.regularMarketPrice ?? meta?.previousClose ?? meta?.chartPreviousClose;
    return typeof price === 'number' && price > 0 ? price : undefined;
  } catch {
    return undefined;
  }
}

interface Lot {
  qty: number;
  cost: number;
}

/** FIFO through filled orders → open positions (net) + realized P&L. */
function derivePositions(orders: ExecutionOrder[]): { positions: Position[]; realizedPnl: number } {
  const filled = orders
    .filter((o) => o.status === 'filled' || o.status === 'partially_filled')
    .filter((o) => o.filledQuantity > 0)
    .sort((a, b) => ((a.filledAt || a.createdAt) < (b.filledAt || b.createdAt) ? -1 : 1));

  const lotsBySymbol = new Map<string, Lot[]>();
  let realizedPnl = 0;

  for (const o of filled) {
    const price = o.avgFillPrice ?? o.limitPrice;
    const qty = o.filledQuantity;
    const lots = lotsBySymbol.get(o.symbol) ?? [];
    if (o.side === 'buy') {
      lots.push({ qty, cost: price });
    } else {
      // sell: consume open lots FIFO
      let remaining = qty;
      while (remaining > 0 && lots.length > 0) {
        const lot = lots[0];
        const take = Math.min(remaining, lot.qty);
        realizedPnl += (price - lot.cost) * take;
        lot.qty -= take;
        remaining -= take;
        if (lot.qty <= 1e-9) lots.shift();
      }
    }
    lotsBySymbol.set(o.symbol, lots);
  }

  const positions: Position[] = [];
  for (const [symbol, lots] of lotsBySymbol) {
    const qty = lots.reduce((s, l) => s + l.qty, 0);
    if (qty <= 1e-9) continue;
    const costTotal = lots.reduce((s, l) => s + l.qty * l.cost, 0);
    positions.push({ symbol, quantity: qty, avgCost: costTotal / qty });
  }
  return { positions, realizedPnl };
}

export interface PerformanceResult {
  stats: PerformanceStats;
  positions: Position[];
}

/** Compute the performance snapshot and record today's equity point. */
export async function computePerformance(userId: string): Promise<PerformanceResult> {
  const [orders, proposals, state] = await Promise.all([
    getAllOrders(userId),
    getAllProposals(userId),
    getSystemState(userId),
  ]);

  const { positions, realizedPnl } = derivePositions(orders);

  // Best-effort mark-to-market.
  const quotes = await Promise.all(positions.map((p) => fetchQuote(p.symbol)));
  let quotesAvailable = false;
  let unrealizedPnl = 0;
  let markedValue = 0;
  positions.forEach((p, i) => {
    const price = quotes[i];
    if (price != null) {
      quotesAvailable = true;
      p.marketPrice = price;
      p.marketValue = price * p.quantity;
      p.unrealizedPnl = (price - p.avgCost) * p.quantity;
      p.unrealizedPnlPct = p.avgCost > 0 ? ((price - p.avgCost) / p.avgCost) * 100 : 0;
      unrealizedPnl += p.unrealizedPnl;
      markedValue += p.marketValue;
    }
  });

  const investedCost = positions.reduce((s, p) => s + p.avgCost * p.quantity, 0);
  // Protective stops are resting exits — they don't add exposure.
  const openExposure = orders
    .filter((o) => isActiveOrderStatus(o.status) && (o.kind ?? 'entry') === 'entry')
    .reduce((s, o) => s + orderNotional(o.limitPrice, o.quantity), 0);

  // ── Account top-line. Fetch first (live mode only), then decide purely.
  let live: LiveAccountSummary | null = null;
  let fetchError: string | undefined;
  if (!state.paperMode) {
    try {
      if (!state.agenticAccount) {
        throw new Error('No agentic account is pinned (Agents → Settings).');
      }
      // Let the broker call raise: its message carries the actual cause (an
      // expired refresh token, transport failure, …), which is what the owner
      // needs to see. A pre-flight "is a token configured" check can only
      // report presence, never validity.
      live = await getAccountSummary(state.agenticAccount);
    } catch (err) {
      fetchError = err instanceof Error ? err.message : 'Unknown error reading the Robinhood portfolio.';
    }
  }
  const { source, accountValue, buyingPower, cash, liveError } = resolveAccountTopLine({
    paperMode: state.paperMode,
    live,
    fetchError,
    investedCost,
    realizedPnl,
    markedValue,
    quotesAvailable,
  });

  const round2 = (v: number | null) => (v == null ? null : Number(v.toFixed(2)));
  const stats: PerformanceStats = {
    source,
    ...(liveError ? { liveError } : {}),
    accountValue: round2(accountValue),
    buyingPower: round2(buyingPower),
    cash: round2(cash),
    investedCost: Number(investedCost.toFixed(2)),
    openExposure: Number(openExposure.toFixed(2)),
    totalExposureCapUsd: state.totalExposureCapUsd,
    realizedPnl: Number(realizedPnl.toFixed(2)),
    unrealizedPnl: quotesAvailable ? Number(unrealizedPnl.toFixed(2)) : undefined,
    positionsCount: positions.length,
    quotesAvailable,
    proposals: {
      pending: proposals.filter((p) => p.status === 'pending').length,
      approved: proposals.filter((p) => p.status === 'approved').length,
      rejected: proposals.filter((p) => p.status === 'rejected').length,
      expired: proposals.filter((p) => p.status === 'expired').length,
      total: proposals.length,
    },
    orders: {
      filled: orders.filter((o) => o.status === 'filled').length,
      active: orders.filter((o) => isActiveOrderStatus(o.status)).length,
      closed: orders.filter((o) => ['cancelled', 'rejected', 'failed'].includes(o.status)).length,
      total: orders.length,
    },
  };

  // Record today's equity point for the curve (upsert). Skipped when the
  // account value is unknown — a gap in the curve is honest; a zero is not.
  if (stats.accountValue != null) {
    const today = new Date().toISOString().slice(0, 10);
    await recordBalancePoint(userId, today, stats.accountValue);
  }

  return { stats, positions };
}
