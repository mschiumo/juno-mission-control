/**
 * FIFO trade pairing for the Performance Review module.
 *
 * PURE — no I/O, no Redis, no LLM. Turns a stream of normalized fills into
 * round trips (flat → position → flat), handling partial/split exits,
 * scale-ins, and short round trips (SELL TO OPEN → BUY TO CLOSE).
 *
 * A "round trip" is one flat-to-flat episode per (source, symbol): the
 * position leaves zero on the first entry fill and the trip closes on the
 * fill that returns it to zero. Within an episode, per-share P/L is FIFO
 * lot-matched (relevant if an episode ever crosses through zero in a single
 * fill — that fill is split so each episode stays flat-to-flat).
 *
 * Tested against the golden fixture (11 round trips on 2026-07-02, incl. a
 * 500-share TZA short and a 2/498 split exit).
 */

import { createHash } from 'crypto';
import type { ReviewExecution, ReviewOpenPosition, RoundTrip } from '@/types/confluence-review';
import { round2 } from './parser';

export interface PairingResult {
  roundTrips: RoundTrip[];
  openPositions: ReviewOpenPosition[];
}

interface EpisodeFill {
  executionId: string;
  side: 'buy' | 'sell';
  qty: number;
  price: number;
  fees: number;
  executedAt: string;
  etDate: string;
}

/** Deterministic round-trip id so re-imports converge on the same rows. */
function roundTripId(source: string, symbol: string, openedAt: string, closedAt: string, qty: number): string {
  const digest = createHash('sha256')
    .update(`${source}|${symbol}|${openedAt}|${closedAt}|${qty}`)
    .digest('hex')
    .slice(0, 16);
  return `rt_${digest}`;
}

function buildRoundTrip(source: ReviewExecution['source'], symbol: string, fills: EpisodeFill[]): RoundTrip {
  const direction = fills[0].side === 'buy' ? 'long' : 'short';
  const entrySide = direction === 'long' ? 'buy' : 'sell';
  const entries = fills.filter((f) => f.side === entrySide);
  const exits = fills.filter((f) => f.side !== entrySide);

  const entryQty = entries.reduce((s, f) => s + f.qty, 0);
  const exitQty = exits.reduce((s, f) => s + f.qty, 0);
  const entryValue = entries.reduce((s, f) => s + f.qty * f.price, 0);
  const exitValue = exits.reduce((s, f) => s + f.qty * f.price, 0);
  const fees = round2(fills.reduce((s, f) => s + f.fees, 0));

  // Long: proceeds − cost; short: proceeds (entry sells) − cover cost.
  const grossPl = round2(direction === 'long' ? exitValue - entryValue : entryValue - exitValue);
  const openedAt = fills[0].executedAt;
  const closedAt = fills[fills.length - 1].executedAt;
  const closeFill = fills[fills.length - 1];

  return {
    id: roundTripId(source, symbol, openedAt, closedAt, entryQty),
    source,
    symbol,
    direction,
    qty: entryQty,
    avgEntry: entryQty > 0 ? entryValue / entryQty : 0,
    avgExit: exitQty > 0 ? exitValue / exitQty : 0,
    grossPl,
    fees,
    netPl: round2(grossPl - fees),
    openedAt,
    closedAt,
    etDate: closeFill.etDate,
    holdingSeconds: Math.max(0, Math.round((Date.parse(closedAt) - Date.parse(openedAt)) / 1000)),
    executionIds: [...new Set(fills.map((f) => f.executionId))],
    entryFills: entries.length,
    exitFills: exits.length,
  };
}

/**
 * Pair fills into round trips. Fills are processed in execution order per
 * (source, symbol); an episode closes the moment the running position
 * returns to zero. A single fill that crosses through zero (e.g. sell 800
 * while long 500) is split: 500 close the long episode, 300 open a short
 * one — its fees are apportioned by quantity.
 */
export function pairExecutions(executions: ReviewExecution[]): PairingResult {
  const roundTrips: RoundTrip[] = [];
  const openPositions: ReviewOpenPosition[] = [];

  const byKey = new Map<string, ReviewExecution[]>();
  for (const exec of executions) {
    const key = `${exec.source}|${exec.symbol}`;
    const list = byKey.get(key) ?? [];
    list.push(exec);
    byKey.set(key, list);
  }

  for (const [key, list] of byKey) {
    const [source, symbol] = key.split('|') as [ReviewExecution['source'], string];
    const sorted = [...list].sort(
      (a, b) => a.executedAt.localeCompare(b.executedAt) || a.id.localeCompare(b.id),
    );

    let position = 0; // signed shares
    let episode: EpisodeFill[] = [];

    const pushFill = (exec: ReviewExecution, qty: number, feeShare: number) => {
      episode.push({
        executionId: exec.id,
        side: exec.side,
        qty,
        price: exec.price,
        fees: feeShare,
        executedAt: exec.executedAt,
        etDate: exec.etDate,
      });
    };

    for (const exec of sorted) {
      const signed = exec.side === 'buy' ? exec.qty : -exec.qty;
      const next = position + signed;

      if (position !== 0 && Math.sign(next) === -Math.sign(position) && next !== 0) {
        // Crosses through zero: split the fill across two episodes.
        const closingQty = Math.abs(position);
        const openingQty = Math.abs(next);
        const closingFee = round2((exec.fees * closingQty) / exec.qty);
        pushFill(exec, closingQty, closingFee);
        roundTrips.push(buildRoundTrip(source, symbol, episode));
        episode = [];
        pushFill(exec, openingQty, round2(exec.fees - closingFee));
        position = next;
        continue;
      }

      pushFill(exec, exec.qty, exec.fees);
      position = next;

      if (position === 0) {
        roundTrips.push(buildRoundTrip(source, symbol, episode));
        episode = [];
      }
    }

    if (position !== 0 && episode.length > 0) {
      // Leftover open position: exits aren't in the data (or not yet).
      const entrySide = position > 0 ? 'buy' : 'sell';
      const entries = episode.filter((f) => f.side === entrySide);
      const entryQty = entries.reduce((s, f) => s + f.qty, 0);
      const entryValue = entries.reduce((s, f) => s + f.qty * f.price, 0);
      openPositions.push({
        source,
        symbol,
        qty: position,
        avgCost: entryQty > 0 ? entryValue / entryQty : 0,
        openedAt: episode[0].executedAt,
      });
    }
  }

  roundTrips.sort((a, b) => a.closedAt.localeCompare(b.closedAt) || a.symbol.localeCompare(b.symbol));
  return { roundTrips, openPositions };
}

/** Apply a risk unit to round trips → R-multiples (trades stay untouched
 * until a config exists; the column is nullable by design). */
export function applyRiskUnit(roundTrips: RoundTrip[], riskUnitUsd: number): RoundTrip[] {
  if (!(riskUnitUsd > 0)) return roundTrips;
  return roundTrips.map((rt) => ({
    ...rt,
    rMultiple: Math.round((rt.netPl / riskUnitUsd) * 10000) / 10000,
  }));
}
