/**
 * Trade timestamp granularity
 *
 * Trade timestamps reach the app from sources that disagree about precision:
 *
 *  - Manual entry and CSV imports carry a real execution time
 *    ("2026-07-01T11:40:54-04:00").
 *  - SnapTrade's activities feed carries only what the brokerage reports. Per
 *    SnapTrade's own docs the `trade_date` granularity "depends on the
 *    brokerage" — some give the exact time, others give the date alone. Schwab
 *    (the connected brokerage) reports the date only, and SnapTrade pads it to
 *    a fixed "T12:00:00-05:00" — the same wall-clock time on every fill, all
 *    year, ignoring the DST change. Every synced trade therefore claimed to
 *    have been entered at 12:00.
 *
 * Nothing else in the activities response carries the missing time, so for a
 * padded timestamp the time of day is simply unknown. The UI omits it rather
 * than printing a placeholder as if it were a fact; trades from a brokerage
 * that does report exact times keep showing them.
 */

/**
 * Wall-clock times we treat as padding rather than a real fill: exact midnight
 * and exact noon, the two values providers use to stand in for "date only".
 * A fill at precisely 12:00:00 would be hidden too — the tradeoff is a blank
 * cell on a rare real trade instead of a fabricated one on every synced trade.
 */
const PADDED_TIMES = new Set(['00:00', '12:00']);

/**
 * The `HH:MM` of a trade timestamp, or null when the timestamp does not carry
 * a real time of day (date-only string, or a provider's padded placeholder).
 */
export function tradeTimeLabel(iso?: string | null): string | null {
  if (!iso) return null;
  const timePart = iso.split('T')[1];
  if (!timePart) return null; // date-only string

  const hhmm = timePart.slice(0, 5);
  if (!/^\d{2}:\d{2}$/.test(hhmm)) return null;

  // Seconds are absent on some inputs; only "…:00" (or no seconds at all)
  // counts as padding, so a genuine 12:00:37 fill still renders.
  const seconds = timePart.slice(6, 8);
  if (PADDED_TIMES.has(hhmm) && (seconds === '' || seconds === '00')) return null;

  return hhmm;
}

/** True when the timestamp carries a real time of day. */
export function hasTradeTime(iso?: string | null): boolean {
  return tradeTimeLabel(iso) !== null;
}
