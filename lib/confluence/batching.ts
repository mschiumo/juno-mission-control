/**
 * Batching helpers shared by the screening runner and the Robinhood providers.
 *
 * The Robinhood MCP read tools accept up to 10 symbols per call, so nightly
 * screening fetches in fixed-size chunks (1 MCP call ≈ 3 HTTP round-trips per
 * 10 symbols) instead of one call per symbol — the difference between finishing
 * a 250-name universe and getting rate-limited halfway through. This lives
 * outside the runner so providers can import it without a dependency cycle.
 */

/** Max symbols per Robinhood MCP read-tool call. */
export const MCP_SYMBOL_BATCH_SIZE = 10;

/** Split `items` into consecutive chunks of at most `size` (last may be short). */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  if (!Number.isInteger(size) || size < 1) {
    throw new Error(`chunk size must be a positive integer, got ${size}`);
  }
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

/**
 * Skip-reason entry for run metadata, e.g. 'AAPL:technicals_failed'. Kept as a
 * plain string so existing consumers of `skippedSymbols: string[]` still work.
 */
export function formatSkip(symbol: string, reason: string): string {
  return `${symbol}:${reason}`;
}
