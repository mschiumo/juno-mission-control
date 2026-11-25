/**
 * The properties tracked by the usage-analytics pipeline. Pure module (no
 * Redis, no server imports) so client components can share the site type
 * and parser with the server without pulling the storage layer into the
 * browser bundle.
 */

export type AnalyticsSite = 'app' | 'mjswrites';

export const ANALYTICS_SITES: readonly AnalyticsSite[] = ['app', 'mjswrites'];

/** Coerce a query/payload value to a site, defaulting to the app itself. */
export function parseAnalyticsSite(value: unknown): AnalyticsSite {
  return value === 'mjswrites' ? 'mjswrites' : 'app';
}
