/**
 * Optimize Target Price + R:R validation helpers
 *
 * Shared by the Position Calculator and the Active / Potential trade edit
 * modals so the "Optimize" button and the save-time validation agree on the
 * exact same arithmetic.
 *
 * Two subtle problems this module fixes — together they guarantee that clicking
 * Optimize always produces a target the trade can be saved/started with:
 *
 * 1. Nearest-cent rounding can undershoot the requested ratio. `target.toFixed(2)`
 *    rounds to the closest cent, which can round the *reward* leg down — e.g. a
 *    requested 2:1 on a sub-cent price produces a target worth only 1.5:1.
 *    `optimizeTargetPrice` instead rounds the reward leg AWAY from entry (ceil
 *    for longs, floor for shorts) so the produced target always *meets or
 *    exceeds* the ratio.
 *
 * 2. Float dust in the reward/risk division. Even a mathematically-perfect 2:1
 *    target (e.g. entry $1.00, stop $0.37, target $2.26) divides to
 *    1.9999999999999998 in IEEE-754, so a naive `ratio < 2` check rejects a
 *    valid trade — the "off by a cent" symptom. `meetsMinRatio` rounds to the
 *    2-decimal precision the UI actually displays before comparing.
 */

/** Cents-space epsilon that absorbs IEEE-754 dust when directionally rounding. */
const CENT_EPSILON = 1e-6;

/**
 * Reward-to-risk target price that always satisfies `ratio` after rounding to
 * the nearest cent.
 *
 * Direction follows entry vs stop: a long (entry > stop) rounds the target UP,
 * a short (entry < stop) rounds it DOWN — in both cases enlarging, never
 * shrinking, the reward leg, so the resulting R:R is always >= `ratio`.
 *
 * @returns the rounded target price, or `null` when the inputs aren't a usable
 *          setup (non-positive / NaN values, or entry === stop).
 */
export function optimizeTargetPrice(
  entry: number,
  stop: number,
  ratio: number
): number | null {
  if (!(entry > 0) || !(stop > 0) || !(ratio > 0) || entry === stop) return null;

  const stopSize = Math.abs(entry - stop);
  const isLong = entry > stop;
  const rawTarget = isLong ? entry + stopSize * ratio : entry - stopSize * ratio;

  const cents = rawTarget * 100;
  const roundedCents = isLong
    ? Math.ceil(cents - CENT_EPSILON) // long: round target up   → reward never shrinks
    : Math.floor(cents + CENT_EPSILON); // short: round target down → reward never shrinks
  return roundedCents / 100;
}

/**
 * True when a reward-to-risk `ratio` satisfies `minRatio`, tolerant of float
 * dust. Rounds to 2-decimal display precision first so a 1.9999999:1 result of
 * a perfectly-valid 2:1 trade is accepted rather than rejected.
 */
export function meetsMinRatio(ratio: number, minRatio: number): boolean {
  if (!(ratio > 0)) return false;
  const rounded = Math.round(ratio * 100) / 100;
  return rounded >= minRatio - 1e-9;
}
