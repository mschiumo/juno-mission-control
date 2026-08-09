/**
 * Broker logo lookup
 *
 * Maps a SnapTrade institution name ("Charles Schwab", "Robinhood", …) to one
 * of the square logo tiles bundled in /public/brokers. Matching is fuzzy —
 * institution names vary between SnapTrade partners ("Schwab", "Charles
 * Schwab & Co.") — so we test normalized substrings. Returns null when no
 * bundled logo matches; callers fall back to a generic indicator.
 */

const LOGO_PATTERNS: Array<[pattern: RegExp, file: string]> = [
  [/schwab/, 'schwab.png'],
  [/thinkorswim|think\s*or\s*swim/, 'thinkorswim.png'],
  [/robinhood/, 'robinhood.png'],
  [/fidelity/, 'fidelity.png'],
  [/webull/, 'webull.png'],
  [/vanguard/, 'vanguard.png'],
  [/e\s?\*?\s?-?trade/, 'etrade.png'],
  [/interactive\s*brokers|ibkr/, 'interactive-brokers.png'],
  [/tastytrade|tastyworks/, 'tastytrade.png'],
  [/coinbase/, 'coinbase.png'],
];

export function brokerLogoPath(institutionName: string | null | undefined): string | null {
  if (!institutionName) return null;
  const name = institutionName.toLowerCase();
  for (const [pattern, file] of LOGO_PATTERNS) {
    if (pattern.test(name)) return `/brokers/${file}`;
  }
  return null;
}
