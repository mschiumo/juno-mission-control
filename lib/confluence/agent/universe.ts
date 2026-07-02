/**
 * The screening universe for the analysis agent — exact tickers (the data
 * sources are look-ups, not screeners). Configure with CONFLUENCE_UNIVERSE
 * (comma-separated); defaults to a small large-cap set.
 */
export function getAgentUniverse(): string[] {
  const raw = process.env.CONFLUENCE_UNIVERSE;
  if (raw && raw.trim()) {
    return raw
      .split(',')
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
  }
  return ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'KO', 'JNJ', 'PG', 'JPM'];
}
