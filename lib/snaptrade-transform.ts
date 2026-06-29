/**
 * SnapTrade activity -> round-trip Trade transform
 *
 * SnapTrade reports individual executions (fills): "BUY 100 AAPL @ 150",
 * "SELL 100 AAPL @ 152". The app's Trade model is a round-trip with a single
 * entry/exit and P&L. This module converts a stream of executions into
 * round-trip Trades by tracking each symbol's net position and aggregating a
 * flat -> … -> flat cycle into one Trade (weighted-average entry/exit).
 *
 * Rules:
 *  - A cycle opens when position leaves flat (BUY -> LONG, SELL -> SHORT).
 *  - Same-direction fills scale into the entry side; opposite fills reduce it.
 *  - A Trade is emitted when the position returns to exactly flat.
 *  - An over-fill that flips the sign closes the current cycle and opens a new
 *    one with the remainder.
 *  - A position still open at the end of the window is emitted as an OPEN Trade.
 *  - Trade ids are deterministic (`st_<account>_<symbol>_<cycleIndex>`) so a
 *    re-sync upserts the same trade instead of duplicating it.
 *
 * Options and non-trade activity (dividends, transfers, fees) are ignored here;
 * only equity BUY/SELL executions are matched. Options support is a later phase.
 */

import { Trade, TradeSide, TradeStatus, Strategy } from '@/types/trading';

/** Minimal shape of a SnapTrade UniversalActivity we depend on. */
export interface SnapTradeActivity {
  id?: string;
  type?: string; // 'BUY' | 'SELL' | 'DIVIDEND' | …
  units?: number;
  price?: number;
  fee?: number;
  trade_date?: string | null;
  symbol?: { symbol?: string; raw_symbol?: string; description?: string | null } | null;
  option_symbol?: unknown | null;
  description?: string;
}

export interface BuildTradesContext {
  userId: string;
  accountId: string;
  brokerage?: string;
  /** Timestamp used for createdAt/updatedAt; injected for deterministic tests. */
  now?: string;
}

interface Execution {
  symbol: string;
  action: 'BUY' | 'SELL';
  qty: number;
  price: number;
  fee: number;
  date: string;
}

interface Cycle {
  side: TradeSide;
  entryQty: number;
  entryCost: number;
  entryFee: number;
  entryDateFirst: string;
  exitQty: number;
  exitProceeds: number;
  exitFee: number;
  exitDateLast: string;
}

/** Normalize raw activities into equity BUY/SELL executions, dropping the rest. */
function toExecutions(activities: SnapTradeActivity[]): Execution[] {
  const out: Execution[] = [];
  for (const a of activities) {
    if (a.option_symbol) continue; // skip options for now
    const action = (a.type || '').toUpperCase();
    if (action !== 'BUY' && action !== 'SELL') continue;
    const ticker = (a.symbol?.symbol || a.symbol?.raw_symbol || '').toUpperCase();
    const qty = Math.abs(a.units ?? 0);
    const price = a.price ?? 0;
    const date = a.trade_date || '';
    if (!ticker || qty <= 0 || price <= 0 || !date) continue;
    out.push({ symbol: ticker, action, qty, price, fee: Math.abs(a.fee ?? 0), date });
  }
  return out;
}

function sign(n: number): number {
  return n > 0 ? 1 : n < 0 ? -1 : 0;
}

export function buildTradesFromActivities(
  activities: SnapTradeActivity[],
  ctx: BuildTradesContext
): Trade[] {
  const now = ctx.now ?? new Date().toISOString();
  const executions = toExecutions(activities);

  // Group by symbol, each group sorted by trade date ascending (stable).
  const bySymbol = new Map<string, Execution[]>();
  for (const e of executions) {
    const list = bySymbol.get(e.symbol) ?? [];
    list.push(e);
    bySymbol.set(e.symbol, list);
  }

  const trades: Trade[] = [];

  for (const [symbol, execs] of bySymbol) {
    execs.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

    let pos = 0; // signed net position
    let cycle: Cycle | null = null;
    let cycleIndex = 0;

    const openCycle = (side: TradeSide, date: string): Cycle => ({
      side,
      entryQty: 0,
      entryCost: 0,
      entryFee: 0,
      entryDateFirst: date,
      exitQty: 0,
      exitProceeds: 0,
      exitFee: 0,
      exitDateLast: date,
    });

    const addEntry = (c: Cycle, e: Execution, qty: number) => {
      c.entryQty += qty;
      c.entryCost += qty * e.price;
      c.entryFee += e.fee * (qty / e.qty);
      if (e.date < c.entryDateFirst) c.entryDateFirst = e.date;
    };

    const addExit = (c: Cycle, e: Execution, qty: number) => {
      c.exitQty += qty;
      c.exitProceeds += qty * e.price;
      c.exitFee += e.fee * (qty / e.qty);
      if (e.date > c.exitDateLast) c.exitDateLast = e.date;
    };

    const emit = (c: Cycle, openShares?: number) => {
      const isOpen = openShares !== undefined;
      const avgEntry = c.entryCost / c.entryQty;
      const id = `st_${ctx.accountId}_${symbol}_${cycleIndex}`;
      cycleIndex += 1;

      const base: Trade = {
        id,
        userId: ctx.userId,
        symbol,
        side: c.side,
        status: isOpen ? TradeStatus.OPEN : TradeStatus.CLOSED,
        strategy: Strategy.OTHER,
        entryDate: c.entryDateFirst,
        entryPrice: round(avgEntry),
        shares: isOpen ? openShares! : c.entryQty,
        createdAt: now,
        updatedAt: now,
        source: 'broker',
        externalId: id,
        brokerAccountId: ctx.accountId,
        brokerage: ctx.brokerage,
      };

      if (isOpen) {
        trades.push(base);
        return;
      }

      const avgExit = c.exitProceeds / c.exitQty;
      const shares = c.entryQty;
      const fees = c.entryFee + c.exitFee;
      const gross =
        c.side === TradeSide.LONG
          ? (avgExit - avgEntry) * shares
          : (avgEntry - avgExit) * shares;
      const returnPercent =
        c.side === TradeSide.LONG
          ? (avgExit / avgEntry - 1) * 100
          : (avgEntry / avgExit - 1) * 100;
      const sameDay = c.entryDateFirst.slice(0, 10) === c.exitDateLast.slice(0, 10);

      trades.push({
        ...base,
        strategy: sameDay ? Strategy.DAY_TRADE : Strategy.SWING_TRADE,
        exitDate: c.exitDateLast,
        exitPrice: round(avgExit),
        grossPnL: round(gross),
        netPnL: round(gross - fees),
        returnPercent: round(returnPercent),
      });
    };

    for (const e of execs) {
      const signed = e.action === 'BUY' ? e.qty : -e.qty;

      if (pos === 0) {
        cycle = openCycle(e.action === 'BUY' ? TradeSide.LONG : TradeSide.SHORT, e.date);
        addEntry(cycle, e, e.qty);
        pos += signed;
        continue;
      }

      if (sign(pos) === sign(signed)) {
        // Same direction → scale into the entry.
        addEntry(cycle!, e, e.qty);
        pos += signed;
        continue;
      }

      // Opposite direction → reduce (and possibly flip).
      const closingQty = Math.min(e.qty, Math.abs(pos));
      addExit(cycle!, e, closingQty);
      pos += sign(signed) * closingQty;

      if (pos === 0) {
        emit(cycle!);
        cycle = null;
      }

      const remainder = e.qty - closingQty;
      if (remainder > 0) {
        // Over-fill flipped the position; open a fresh cycle with the remainder.
        cycle = openCycle(e.action === 'BUY' ? TradeSide.LONG : TradeSide.SHORT, e.date);
        addEntry(cycle, e, remainder);
        pos += (e.action === 'BUY' ? 1 : -1) * remainder;
      }
    }

    if (cycle && pos !== 0) {
      emit(cycle, Math.abs(pos));
    }
  }

  return trades;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
