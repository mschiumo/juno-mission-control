/**
 * Journal-calendar "pending sync" classification (client-safe, pure).
 *
 * A linked brokerage delivers each day's fills with a lag, so the calendar
 * can't tell "no trades" from "not synced yet" by looking at local data alone.
 * SnapTrade tells us the last day it has fully synced (`lastCompleteTradeDay`);
 * every trading day after it is provisional until one of these resolves it:
 *
 *  - `in-progress`: it's today (ET) and the market hasn't closed yet, so
 *    there's nothing to be late about. Rendered in its own colour.
 *  - `syncing`: the day is over and its fills haven't fully arrived.
 *  - `none`: nothing to flag — the day is complete, is in the future, is a
 *    non-trading day with no fills, was declared a no-trade day by the user,
 *    or has sat empty for longer than the grace period (so there most likely
 *    were no trades that day).
 */
import { addDays, isTradingDay } from './trading-days';

export type PendingSyncState = 'none' | 'in-progress' | 'syncing';

/**
 * Window event fired when the user declares a no-trade day (detail = the
 * YYYY-MM-DD ET date) so an already-mounted calendar can update in place.
 */
export const NO_TRADE_DAY_EVENT = 'ct:no-trade-day';

/** Wall clock in America/New_York: calendar day + minutes since midnight. */
export interface EtClock {
  ymd: string;
  minutes: number;
}

/** Regular NYSE close, 4:00 PM ET. Early-close days are treated the same. */
export const MARKET_CLOSE_MINUTES = 16 * 60;

/**
 * How long after a day's close we keep flagging it as "still syncing" when no
 * fills have arrived at all. Past this, an empty day is assumed to be a real
 * no-trade day and goes back to grey.
 */
export const PENDING_SYNC_GRACE_HOURS = 36;

/** Current ET clock. Uses Intl so it's correct in any viewer timezone. */
export function getEtClock(now: Date = new Date()): EtClock {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? '';
  let hour = parseInt(get('hour'), 10);
  if (hour === 24) hour = 0;
  return {
    ymd: `${get('year')}-${get('month')}-${get('day')}`,
    minutes: hour * 60 + parseInt(get('minute'), 10),
  };
}

/** ET clock point at which an empty `date` stops being flagged as syncing. */
export function pendingSyncDeadline(date: string): EtClock {
  const total = MARKET_CLOSE_MINUTES + PENDING_SYNC_GRACE_HOURS * 60;
  return { ymd: addDays(date, Math.floor(total / 1440)), minutes: total % 1440 };
}

function atOrAfter(now: EtClock, point: EtClock): boolean {
  return now.ymd > point.ymd || (now.ymd === point.ymd && now.minutes >= point.minutes);
}

export interface PendingSyncInput {
  /** Calendar day being rendered (YYYY-MM-DD). */
  date: string;
  /** Whether any locally stored trades exist for the day. */
  hasTrades: boolean;
  /** Last day SnapTrade reported fully synced; null → no brokerage linked. */
  lastCompleteTradeDay: string | null;
  /** Days the user explicitly marked as "not trading". */
  noTradeDays: ReadonlySet<string>;
  /** Current ET clock (injected so the rule is testable). */
  now: EtClock;
}

export function classifyPendingSync(input: PendingSyncInput): PendingSyncState {
  const { date, hasTrades, lastCompleteTradeDay, noTradeDays, now } = input;

  if (!lastCompleteTradeDay) return 'none';
  if (date <= lastCompleteTradeDay) return 'none';
  if (date > now.ymd) return 'none';

  const tradingDay = isTradingDay(date);
  // A weekend/holiday only matters if fills actually landed on it.
  if (!hasTrades && !tradingDay) return 'none';
  // The user said they weren't trading — believe them unless fills say otherwise.
  if (!hasTrades && noTradeDays.has(date)) return 'none';

  if (date === now.ymd && tradingDay && now.minutes < MARKET_CLOSE_MINUTES) {
    return 'in-progress';
  }

  // Empty for longer than the grace period → most likely a real no-trade day.
  if (!hasTrades && atOrAfter(now, pendingSyncDeadline(date))) return 'none';

  return 'syncing';
}
