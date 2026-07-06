import type {
  CryptoChain,
  ScreenerFilters,
  ScreenerResult,
  ScreenerToken,
} from '@/types/crypto-trader';
import { discoverTokens } from './providers/dexscreener';
import { checkTokenSafety } from './providers/safety';
import { readJson, writeJson } from '@/lib/db/crypto/store';

/**
 * Crypto screener — discovery via DEX Screener, momentum scoring in code, rug
 * filtering via RugCheck/GoPlus. Results are cached in Redis so the UI and the
 * agent share one snapshot and we stay far inside free-tier rate limits.
 */

const CACHE_KEY = 'crypto:screener:latest';
const CACHE_TTL_SECONDS = 120;
/** Safety lookups are the slow/limited calls — only run them for the top N. */
const SAFETY_CHECK_LIMIT = 25;

export const DEFAULT_FILTERS: ScreenerFilters = {
  chain: 'all',
  minLiquidityUsd: 25000,
  minVolumeH24Usd: 50000,
  // Skip the sniper knife-fight on brand-new pairs; stale pairs aren't "movement".
  minAgeHours: 1,
  minMarketCapUsd: 100000,
  safeOnly: false,
};

export function marketCapTier(marketCapUsd: number): ScreenerResult['tier'] {
  if (marketCapUsd < 1_000_000) return 'micro';
  if (marketCapUsd < 25_000_000) return 'small';
  if (marketCapUsd < 500_000_000) return 'mid';
  return 'large';
}

/**
 * Momentum composite, 0–100. Rewards: short-window volume running hot vs the
 * 24h baseline, buy-side pressure, aligned positive price action, and real
 * liquidity. This is the deterministic "skill" fed to the LLM analyst — the
 * model ranks and vetoes, it does not invent signals.
 */
export function scoreMomentum(token: ScreenerToken): { score: number; signals: string[] } {
  const signals: string[] = [];
  let score = 0;

  // Volume acceleration: 1h volume vs the hourly average implied by 24h volume.
  const hourlyBaseline = token.volumeUsd.h24 / 24;
  const volMultiple = hourlyBaseline > 0 ? token.volumeUsd.h1 / hourlyBaseline : 0;
  if (volMultiple >= 5) {
    score += 30;
    signals.push(`volume ${volMultiple.toFixed(1)}x hourly baseline`);
  } else if (volMultiple >= 3) {
    score += 22;
    signals.push(`volume ${volMultiple.toFixed(1)}x hourly baseline`);
  } else if (volMultiple >= 1.5) {
    score += 12;
  }

  // Buy pressure over the last hour.
  const buyRatio = token.txns.h1Sells > 0 ? token.txns.h1Buys / token.txns.h1Sells : token.txns.h1Buys > 0 ? 2 : 1;
  if (buyRatio >= 2) {
    score += 20;
    signals.push(`buys ${buyRatio.toFixed(1)}x sells (1h)`);
  } else if (buyRatio >= 1.3) {
    score += 12;
  } else if (buyRatio < 0.7) {
    score -= 15;
    signals.push('sell pressure (1h)');
  }

  // Price action alignment: rising on 1h AND 6h, not just a 5m wick.
  if (token.priceChangePct.h1 > 3 && token.priceChangePct.h6 > 0) {
    score += 20;
    signals.push(`+${token.priceChangePct.h1.toFixed(1)}% 1h`);
  } else if (token.priceChangePct.h1 > 0) {
    score += 8;
  }
  // Chasing a candle that already went vertical is how entries get topped.
  if (token.priceChangePct.h1 > 60) {
    score -= 15;
    signals.push('extended: +60% in 1h');
  }

  // Liquidity depth: thicker pools mean survivable exits.
  if (token.liquidityUsd >= 250000) score += 15;
  else if (token.liquidityUsd >= 100000) score += 10;
  else if (token.liquidityUsd >= 50000) score += 5;

  // Turnover: volume/liquidity ratio shows genuine participation, not a dead pool.
  const turnover = token.liquidityUsd > 0 ? token.volumeUsd.h24 / token.liquidityUsd : 0;
  if (turnover >= 3) {
    score += 15;
    signals.push(`turnover ${turnover.toFixed(1)}x liquidity`);
  } else if (turnover >= 1) {
    score += 8;
  }

  return { score: Math.max(0, Math.min(100, score)), signals };
}

function applyFilters(tokens: ScreenerToken[], filters: ScreenerFilters): ScreenerToken[] {
  return tokens.filter((t) => {
    if (filters.chain !== 'all' && t.chainId !== filters.chain) return false;
    if (t.liquidityUsd < filters.minLiquidityUsd) return false;
    if (t.volumeUsd.h24 < filters.minVolumeH24Usd) return false;
    if (t.ageHours < filters.minAgeHours) return false;
    if (filters.maxAgeHours && t.ageHours > filters.maxAgeHours) return false;
    if (t.marketCapUsd && t.marketCapUsd < filters.minMarketCapUsd) return false;
    if (filters.maxMarketCapUsd && t.marketCapUsd > filters.maxMarketCapUsd) return false;
    return true;
  });
}

export interface ScreenerSnapshot {
  results: ScreenerResult[];
  generatedAt: string;
}

/**
 * Run the full screen: discover → filter → score → safety-check the top slice.
 * Set `force` to bypass the Redis cache (manual refresh button).
 */
export async function runScreener(
  filters: ScreenerFilters = DEFAULT_FILTERS,
  force = false,
): Promise<ScreenerSnapshot> {
  if (!force) {
    const cached = await readJson<ScreenerSnapshot | null>(CACHE_KEY, null);
    if (cached) return cached;
  }

  const chains: CryptoChain[] =
    filters.chain === 'all' ? ['solana', 'ethereum', 'base'] : [filters.chain];
  const discovered = await discoverTokens(chains);
  const filtered = applyFilters(discovered, filters);

  const scored = filtered
    .map((token) => {
      const { score, signals } = scoreMomentum(token);
      return { token, momentumScore: score, signals };
    })
    .sort((a, b) => b.momentumScore - a.momentumScore)
    .slice(0, SAFETY_CHECK_LIMIT);

  const results: ScreenerResult[] = await Promise.all(
    scored.map(async ({ token, momentumScore, signals }) => ({
      token,
      momentumScore,
      signals,
      safety: await checkTokenSafety(token),
      tier: marketCapTier(token.marketCapUsd),
    })),
  );

  const snapshot: ScreenerSnapshot = { results, generatedAt: new Date().toISOString() };
  await writeJson(CACHE_KEY, snapshot, CACHE_TTL_SECONDS);
  return snapshot;
}
