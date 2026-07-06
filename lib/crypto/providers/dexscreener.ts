import type { CryptoChain, ScreenerToken } from '@/types/crypto-trader';

/**
 * DEX Screener public API — no key required (~300 req/min; 60/min on the
 * profile/boost endpoints). Used for token discovery and live prices.
 * Docs: https://docs.dexscreener.com/api/reference
 */

const BASE = 'https://api.dexscreener.com';

const SUPPORTED_CHAINS: CryptoChain[] = ['solana', 'ethereum', 'base'];

interface DexScreenerPair {
  chainId: string;
  pairAddress: string;
  url?: string;
  baseToken: { address: string; name: string; symbol: string };
  priceUsd?: string;
  priceChange?: { m5?: number; h1?: number; h6?: number; h24?: number };
  volume?: { m5?: number; h1?: number; h6?: number; h24?: number };
  txns?: {
    h1?: { buys?: number; sells?: number };
    h24?: { buys?: number; sells?: number };
  };
  liquidity?: { usd?: number };
  fdv?: number;
  marketCap?: number;
  pairCreatedAt?: number;
  boosts?: { active?: number };
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      // Screener data is bursty; never hang a serverless function on it.
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      console.error(`DEX Screener ${res.status} for ${url}`);
      return null;
    }
    return (await res.json()) as T;
  } catch (error) {
    console.error(`DEX Screener fetch failed for ${url}:`, error);
    return null;
  }
}

function normalizePair(pair: DexScreenerPair): ScreenerToken | null {
  if (!SUPPORTED_CHAINS.includes(pair.chainId as CryptoChain)) return null;
  const priceUsd = parseFloat(pair.priceUsd ?? '0');
  if (!priceUsd) return null;
  const createdAt = pair.pairCreatedAt ?? 0;
  return {
    chainId: pair.chainId as CryptoChain,
    tokenAddress: pair.baseToken.address,
    pairAddress: pair.pairAddress,
    symbol: pair.baseToken.symbol,
    name: pair.baseToken.name,
    priceUsd,
    priceChangePct: {
      m5: pair.priceChange?.m5 ?? 0,
      h1: pair.priceChange?.h1 ?? 0,
      h6: pair.priceChange?.h6 ?? 0,
      h24: pair.priceChange?.h24 ?? 0,
    },
    volumeUsd: {
      m5: pair.volume?.m5 ?? 0,
      h1: pair.volume?.h1 ?? 0,
      h6: pair.volume?.h6 ?? 0,
      h24: pair.volume?.h24 ?? 0,
    },
    txns: {
      h1Buys: pair.txns?.h1?.buys ?? 0,
      h1Sells: pair.txns?.h1?.sells ?? 0,
      h24Buys: pair.txns?.h24?.buys ?? 0,
      h24Sells: pair.txns?.h24?.sells ?? 0,
    },
    liquidityUsd: pair.liquidity?.usd ?? 0,
    marketCapUsd: pair.marketCap ?? 0,
    fdvUsd: pair.fdv ?? 0,
    // Missing pairCreatedAt means an older indexed pair, not a brand-new one —
    // treat as ~1 year so the min-age filter doesn't discard established tokens.
    ageHours: createdAt ? (Date.now() - createdAt) / 3600000 : 24 * 365,
    boosted: (pair.boosts?.active ?? 0) > 0,
    url: pair.url ?? `https://dexscreener.com/${pair.chainId}/${pair.pairAddress}`,
  };
}

/**
 * Discover candidate tokens: boosted tokens (paid promotion = attention proxy,
 * treated with suspicion but high recall) plus a set of search sweeps per chain.
 * Dedupes by token address, keeping the deepest-liquidity pair per token.
 */
export async function discoverTokens(chains: CryptoChain[] = SUPPORTED_CHAINS): Promise<ScreenerToken[]> {
  const results = new Map<string, ScreenerToken>();

  const collect = (pairs: DexScreenerPair[] | null | undefined) => {
    for (const pair of pairs ?? []) {
      const token = normalizePair(pair);
      if (!token || !chains.includes(token.chainId)) continue;
      const key = `${token.chainId}:${token.tokenAddress}`;
      const existing = results.get(key);
      if (!existing || token.liquidityUsd > existing.liquidityUsd) {
        results.set(key, token);
      }
    }
  };

  // 1. Actively boosted tokens → resolve to their pairs.
  const boosts = await fetchJson<{ tokenAddress: string; chainId: string }[]>(`${BASE}/token-boosts/top/v1`);
  const boostTargets = (boosts ?? [])
    .filter((b) => chains.includes(b.chainId as CryptoChain))
    .slice(0, 20);
  const boostBatches = await Promise.all(
    boostTargets.map((b) =>
      fetchJson<DexScreenerPair[]>(`${BASE}/token-pairs/v1/${b.chainId}/${b.tokenAddress}`),
    ),
  );
  for (const batch of boostBatches) collect(batch);

  // 2. Broad search sweeps — DEX Screener search returns pairs ranked by activity.
  const sweeps = chains.map((chain) =>
    fetchJson<{ pairs: DexScreenerPair[] }>(`${BASE}/latest/dex/search?q=${chain}`),
  );
  for (const sweep of await Promise.all(sweeps)) collect(sweep?.pairs);

  return Array.from(results.values());
}

/** Fetch the current best pair snapshot for a single token (used for price refresh). */
export async function getTokenSnapshot(
  chainId: CryptoChain,
  tokenAddress: string,
): Promise<ScreenerToken | null> {
  const pairs = await fetchJson<DexScreenerPair[]>(`${BASE}/token-pairs/v1/${chainId}/${tokenAddress}`);
  if (!pairs?.length) return null;
  const tokens = pairs
    .map(normalizePair)
    .filter((t): t is ScreenerToken => !!t && t.tokenAddress === tokenAddress);
  if (!tokens.length) return null;
  return tokens.reduce((best, t) => (t.liquidityUsd > best.liquidityUsd ? t : best));
}
