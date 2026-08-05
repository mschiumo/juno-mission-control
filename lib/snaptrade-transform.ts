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
 *  - Fills sharing one identical timestamp (day-granularity brokers) are
 *    ordered deterministically and FIFO-quantity-matched: a carried position
 *    closes first, matched buy/sell quantity completes as a round trip, and
 *    only the unmatched tail stays open. Flat starts default to LONG unless
 *    the description marks a short sale.
 *  - Trade ids are deterministic (`st_<account>_<symbol>_<cycleIndex>`) so a
 *    re-sync upserts the same trade instead of duplicating it.
 *
 * Options and non-trade activity (dividends, transfers, fees) are ignored here;
 * only equity BUY/SELL executions are matched. Options support is a later phase.
 */

import { Trade, TradeSide, TradeStatus, Strategy } from '@/types/trading';
import { toESTISOString } from '@/lib/date-utils';

/** Minimal shape of a SnapTrade UniversalActivity we depend on. */
export interface SnapTradeActivity {
  id?: string;
  type?: string; // 'BUY' | 'SELL' | 'DIVIDEND' | …
  units?: number;
  price?: number;
  fee?: number;
  /** Cash amount for non-trade activities (dividends, contributions, fees, …). */
  amount?: number | null;
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
  /** Broker's description explicitly marks a short sale ("Sell Short"). */
  shortSale: boolean;
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

/**
 * SnapTrade's trade_date is a UTC timestamp (or, for brokerages that only
 * report day granularity, a bare YYYY-MM-DD). The app's storage convention —
 * set by the CSV import parsers — is an Eastern-time wall-clock ISO string,
 * and every consumer derives the trading day from it: the Journal calendar's
 * daily buckets take the string's leading date, and /api/trades filters by an
 * ET day window. A raw UTC timestamp breaks both for evening fills (8pm ET is
 * already the next day in UTC), so convert to ET here at ingestion.
 */
export function toETTimestamp(raw: string): string {
  // Bare date: keep the calendar day exactly as the broker reported it; noon
  // can't drift into a neighboring day under any consumer's date math.
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return `${raw}T12:00:00-05:00`;
  const parsed = new Date(raw);
  if (isNaN(parsed.getTime())) return raw; // unknown format — pass through
  // A timestamp of exactly midnight UTC is a day-granularity stamp, not a real
  // fill time — Schwab reports every fill as "<trading day>T00:00:00Z".
  // Converting it as an instant would land on the previous ET evening (8pm)
  // and shift the whole session back a calendar day, so keep the stamped day.
  if (parsed.getTime() % 86_400_000 === 0) {
    return `${parsed.toISOString().slice(0, 10)}T12:00:00-05:00`;
  }
  return toESTISOString(parsed);
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
    out.push({
      symbol: ticker,
      action,
      qty,
      price,
      fee: Math.abs(a.fee ?? 0),
      date: toETTimestamp(date),
      shortSale: action === 'SELL' && /\bshort\b/i.test(a.description || ''),
    });
  }
  return out;
}

function sign(n: number): number {
  return n > 0 ? 1 : n < 0 ? -1 : 0;
}

/**
 * Day-granularity brokers stamp every fill of a session with one identical
 * trade_date, so same-stamp fills carry no intra-day sequence and the feed's
 * order for them is arbitrary — processing a session's sell before its buy
 * reconstructs a long round trip as a SHORT with entry/exit swapped (the P&L
 * survives, proceeds-minus-cost being order-independent, which made the bad
 * labels look self-consistent). Naively processing all buys before all sells
 * has the opposite failure: on a day whose buys outnumber sells the position
 * never returns to flat, so the day's realized round trips merge into one
 * still-open cycle and their P&L silently disappears from the day.
 *
 * Make the order deterministic AND quantity-matched instead (FIFO): within
 * each identical-timestamp run, first close any carried position, then pair
 * min(buys, sells) shares — opening side up to the match, whole closing side,
 * unmatched tail last — so completed round trips emit as CLOSED trades and
 * only the true remainder stays open. A flat start is LONG (buys first)
 * unless the broker's description explicitly marks a short sale; a true
 * intraday short without such a description is labeled LONG — with one stamp
 * per day the real sequence is unknowable, and the long default matches the
 * common retail case; the side stays editable in the Journal.
 */
function orderSameStampRuns(execs: Execution[]): Execution[] {
  const out: Execution[] = [];
  let pos = 0; // simulated running position, mirrors the cycle builder's
  let i = 0;
  while (i < execs.length) {
    let j = i;
    while (j < execs.length && execs[j].date === execs[i].date) j++;
    const run = execs.slice(i, j);
    let buys = run.filter(e => e.action === 'BUY');
    let sells = run.filter(e => e.action === 'SELL');

    // Close a carried position first (FIFO — oldest lots exit first), so the
    // carry's cycle can reach flat and emit before the day's new lots open.
    if (pos > 0) {
      const { taken, rest } = takeQty(sells, pos);
      out.push(...taken);
      sells = rest;
    } else if (pos < 0) {
      const { taken, rest } = takeQty(buys, -pos);
      out.push(...taken);
      buys = rest;
    }

    // From flat, pair the matched quantity (opening side up to the match,
    // then the whole closing side) so the round trip completes and emits;
    // only the unmatched tail follows and stays open.
    const buyQty = buys.reduce((s, e) => s + e.qty, 0);
    const sellQty = sells.reduce((s, e) => s + e.qty, 0);
    const short = sells.some(e => e.shortSale);
    const opener = short ? sells : buys;
    const closer = short ? buys : sells;
    const { taken, rest } = takeQty(opener, Math.min(buyQty, sellQty));
    out.push(...taken, ...closer, ...rest);

    for (const e of run) pos += e.action === 'BUY' ? e.qty : -e.qty;
    i = j;
  }
  return out;
}

/**
 * Take `want` shares off the front of `fills` (feed order), splitting the
 * boundary fill with a fee prorated by quantity so entry/exit fee totals are
 * preserved exactly.
 */
function takeQty(fills: Execution[], want: number): { taken: Execution[]; rest: Execution[] } {
  const taken: Execution[] = [];
  const rest: Execution[] = [];
  let remaining = want;
  for (const f of fills) {
    if (remaining <= 0) {
      rest.push(f);
    } else if (f.qty <= remaining) {
      taken.push(f);
      remaining -= f.qty;
    } else {
      const ratio = remaining / f.qty;
      taken.push({ ...f, qty: remaining, fee: f.fee * ratio });
      rest.push({ ...f, qty: f.qty - remaining, fee: f.fee * (1 - ratio) });
      remaining = 0;
    }
  }
  return { taken, rest };
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

  for (const [symbol, rawExecs] of bySymbol) {
    rawExecs.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    const execs = orderSameStampRuns(rawExecs);

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
