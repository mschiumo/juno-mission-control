/**
 * Performance computation for the Agents → Performance panel.
 *
 * Positions and P&L are derived deterministically from the filled-order log
 * (FIFO), so the panel works in paper mode today. Open positions are marked to
 * market with best-effort quotes (graceful when unavailable — e.g. no egress).
 * The top-line account (value / buying power / cash) comes from the real
 * Robinhood portfolio in LIVE mode, or a simple paper model in PAPER mode.
 */

import { getAllOrders } from '@/lib/db/confluence/orders';
import { getAllProposals } from '@/lib/db/confluence/proposals';
import { getSystemState } from '@/lib/db/confluence/system-state';
import { recordBalancePoint } from '@/lib/db/confluence/balance-history';
import { orderNotional } from './guardrails';
import { isRobinhoodConfigured } from './robinhood/oauth';
import { getAccountSummary } from './broker/live-adapter';
import { isActiveOrderStatus } from '@/types/confluence';
import type { ExecutionOrder, PerformanceStats, Position } from '@/types/confluence';

/** Simulated starting cash for the paper account model. */
const PAPER_STARTING_CASH = 10_000;

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
  const openExposure = orders.filter((o) => isActiveOrderStatus(o.status)).reduce((s, o) => s + orderNotional(o.limitPrice, o.quantity), 0);

  // Account top-line: real portfolio in live mode, else the paper model.
  let source: 'live' | 'paper' = 'paper';
  let accountValue: number;
  let buyingPower: number;
  let cash: number;

  const liveAvailable = !state.paperMode && isRobinhoodConfigured() && !!state.agenticAccount;
  if (liveAvailable) {
    try {
      const summary = await getAccountSummary(state.agenticAccount!);
      source = 'live';
      accountValue = summary.accountValue;
      buyingPower = summary.buyingPower;
      cash = summary.cash;
    } catch {
      // fall through to paper model if the live fetch fails
      source = 'paper';
      accountValue = 0;
      buyingPower = 0;
      cash = 0;
    }
  }
  if (source === 'paper') {
    cash = PAPER_STARTING_CASH - investedCost + realizedPnl;
    // Value = cash + positions marked (or at cost when quotes are unavailable).
    accountValue = cash + (quotesAvailable ? markedValue : investedCost);
    buyingPower = cash;
  }

  const stats: PerformanceStats = {
    source,
    accountValue: Number(accountValue!.toFixed(2)),
    buyingPower: Number(buyingPower!.toFixed(2)),
    cash: Number(cash!.toFixed(2)),
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

  // Record today's equity point for the curve (upsert).
  const today = new Date().toISOString().slice(0, 10);
  await recordBalancePoint(userId, today, stats.accountValue);

  return { stats, positions };
}
