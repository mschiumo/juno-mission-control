/**
 * Crypto data for the Morning Market Briefing email — big movers among
 * established coins (CoinGecko top-250), trending searches (retail-attention
 * proxy), and the day's memecoin movers (DEX Screener). All free-tier, no keys.
 *
 * Self-contained on purpose: the crypto screener/trader feature (PR #417) has
 * richer infrastructure, but the daily email must not depend on an unmerged
 * branch or on that feature's Redis cache being warm at 8 AM.
 */

export interface CryptoMover {
  symbol: string;
  name: string;
  priceUsd: number;
  changePct24h: number;
  marketCapUsd: number;
}

export interface MemecoinMover {
  symbol: string;
  name: string;
  chain: string;
  priceUsd: number;
  changePct24h: number;
  volumeH24Usd: number;
  liquidityUsd: number;
  url: string;
}

export interface CryptoBriefData {
  /** Top-250 coins by market cap with the largest 24h moves (mcap ≥ $100M). */
  gainers: CryptoMover[];
  losers: CryptoMover[];
  /** CoinGecko trending searches — what retail is looking at right now. */
  trending: string[];
  /** Largest 24h movers among liquid Solana memecoins (DEX Screener). */
  memecoins: MemecoinMover[];
  /** One-line market context: total mcap 24h change + BTC dominance. */
  globalLine: string | null;
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      console.warn(`[CryptoBrief] ${res.status} for ${url}`);
      return null;
    }
    return (await res.json()) as T;
  } catch (err) {
    console.warn(`[CryptoBrief] fetch failed for ${url}:`, err);
    return null;
  }
}

interface CoinGeckoMarket {
  symbol: string;
  name: string;
  current_price: number;
  market_cap: number;
  price_change_percentage_24h: number | null;
}

async function fetchTopMovers(): Promise<{ gainers: CryptoMover[]; losers: CryptoMover[] }> {
  const markets = await fetchJson<CoinGeckoMarket[]>(
    'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=1&price_change_percentage=24h',
  );
  if (!markets) return { gainers: [], losers: [] };

  const movers: CryptoMover[] = markets
    // $100M mcap floor keeps this to coins that matter; stablecoins don't move.
    .filter((m) => m.market_cap >= 100_000_000 && m.price_change_percentage_24h !== null)
    .map((m) => ({
      symbol: m.symbol.toUpperCase(),
      name: m.name,
      priceUsd: m.current_price,
      changePct24h: m.price_change_percentage_24h as number,
      marketCapUsd: m.market_cap,
    }));

  const sorted = [...movers].sort((a, b) => b.changePct24h - a.changePct24h);
  return {
    gainers: sorted.slice(0, 5).filter((m) => m.changePct24h > 2),
    losers: sorted.slice(-5).reverse().filter((m) => m.changePct24h < -2),
  };
}

async function fetchTrending(): Promise<string[]> {
  const data = await fetchJson<{ coins?: { item?: { symbol?: string; name?: string } }[] }>(
    'https://api.coingecko.com/api/v3/search/trending',
  );
  return (data?.coins ?? [])
    .map((c) => (c.item?.symbol ? `${c.item.name} (${c.item.symbol.toUpperCase()})` : null))
    .filter((s): s is string => !!s)
    .slice(0, 7);
}

async function fetchGlobalLine(): Promise<string | null> {
  const data = await fetchJson<{
    data?: { market_cap_change_percentage_24h_usd?: number; market_cap_percentage?: { btc?: number } };
  }>('https://api.coingecko.com/api/v3/global');
  const change = data?.data?.market_cap_change_percentage_24h_usd;
  const btcDom = data?.data?.market_cap_percentage?.btc;
  if (change === undefined || change === null) return null;
  const parts = [`Total crypto market cap ${change >= 0 ? '+' : ''}${change.toFixed(1)}% (24h)`];
  if (btcDom) parts.push(`BTC dominance ${btcDom.toFixed(1)}%`);
  return parts.join(' · ');
}

interface GeckoTerminalPool {
  attributes?: {
    address?: string;
    name?: string; // "WIF / SOL"
    base_token_price_usd?: string;
    price_change_percentage?: { h24?: string | number };
    volume_usd?: { h24?: string | number };
    reserve_in_usd?: string;
    market_cap_usd?: string | null;
    fdv_usd?: string | null;
  };
}

/**
 * GeckoTerminal trending pools (free, 30 req/min) — the actual memecoin flow
 * of the day. Liquidity/volume floors keep out $5k-pool rug candidates.
 */
async function fetchMemecoinMovers(): Promise<MemecoinMover[]> {
  const data = await fetchJson<{ data?: GeckoTerminalPool[] }>(
    'https://api.geckoterminal.com/api/v2/networks/solana/trending_pools',
  );
  const seen = new Set<string>();
  return (data?.data ?? [])
    .map((pool) => {
      const a = pool.attributes ?? {};
      const symbol = (a.name ?? '').split(' / ')[0]?.trim() ?? '';
      const mcap = parseFloat(a.market_cap_usd ?? '') || parseFloat(a.fdv_usd ?? '') || 0;
      return {
        symbol,
        name: symbol,
        chain: 'solana',
        priceUsd: parseFloat(a.base_token_price_usd ?? '0'),
        changePct24h: Number(a.price_change_percentage?.h24 ?? 0),
        volumeH24Usd: Number(a.volume_usd?.h24 ?? 0),
        liquidityUsd: parseFloat(a.reserve_in_usd ?? '0'),
        marketCapUsd: mcap,
        url: a.address ? `https://www.geckoterminal.com/solana/pools/${a.address}` : '',
      };
    })
    .filter(
      (m) =>
        !!m.symbol &&
        m.liquidityUsd >= 100_000 &&
        m.volumeH24Usd >= 250_000 &&
        m.marketCapUsd > 0 &&
        m.marketCapUsd <= 500_000_000 && // memecoin territory, not majors
        m.changePct24h !== 0,
    )
    .sort((a, b) => Math.abs(b.changePct24h) - Math.abs(a.changePct24h))
    .filter((m) => {
      if (seen.has(m.symbol)) return false;
      seen.add(m.symbol);
      return true;
    })
    .slice(0, 3)
    .map(({ marketCapUsd: _mcap, ...m }) => m);
}

/** Fetch everything in parallel; every part degrades to empty on failure. */
export async function fetchCryptoBrief(): Promise<CryptoBriefData> {
  const [movers, trending, memecoins, globalLine] = await Promise.all([
    fetchTopMovers(),
    fetchTrending(),
    fetchMemecoinMovers(),
    fetchGlobalLine(),
  ]);
  return { ...movers, trending, memecoins, globalLine };
}
