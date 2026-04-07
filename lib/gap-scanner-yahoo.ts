/**
 * Yahoo Finance Gap Scanner (shared library)
 *
 * Uses Yahoo Finance's pre-computed day gainers/losers screener.
 * No API key required — reliable fallback when Polygon is unavailable.
 */

interface YahooQuote {
  symbol: string;
  longName?: string;
  shortName?: string;
  regularMarketPrice: number;
  regularMarketPreviousClose: number;
  regularMarketChangePercent: number;
  regularMarketVolume: number;
  averageDailyVolume3Month?: number;
  marketCap?: number;
  exchange?: string;
  quoteType?: string;
  preMarketPrice?: number;
  preMarketChangePercent?: number;
  preMarketVolume?: number;
}

export interface GapStock {
  symbol: string;
  name: string;
  price: number;
  previousClose: number;
  gapPercent: number;
  volume: number;
  marketCap: number;
  status: 'gainer' | 'loser';
}

export interface YahooScanResult {
  success: boolean;
  data: { gainers: GapStock[]; losers: GapStock[] };
  timestamp: string;
  source: string;
  scanned: number;
  found: number;
  durationMs: number;
  marketSession?: string;
}

const US_EXCHANGES = new Set(['NYQ', 'NMS', 'NGM', 'NCM', 'ASE', 'PCX', 'BTS', 'BATS', 'NMFGS']);

const ADR_NAME_RE = /(\bADR\b|\bplc\.?$|\bAG$|\bS\.A\.?$|\bN\.V\.?$|\bB\.V\.?$|\bAB$|\bASA$|\bA\/S$|\bSE$|\bKGaA$|\bLimited$|\bLtd\.?$|\bS\.p\.A\.?$|\bGmbH$|\bOyj$|\bInc\b.*\bLtd\b)/i;

function isLikelyADR(q: YahooQuote): boolean {
  const name = q.longName || q.shortName || '';
  if (ADR_NAME_RE.test(name)) return true;
  if (q.exchange && !US_EXCHANGES.has(q.exchange)) return true;
  return false;
}

type ScreenerId = 'day_gainers' | 'day_losers' | 'pre_market_gainers' | 'pre_market_losers';

async function fetchScreener(scrId: ScreenerId, count: number): Promise<YahooQuote[]> {
  const url = `https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved?count=${count}&scrIds=${scrId}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
  });
  if (!res.ok) throw new Error(`Yahoo Finance screener error: ${res.status}`);
  const data = await res.json();
  return (data?.finance?.result?.[0]?.quotes ?? []) as YahooQuote[];
}

function toGapStock(q: YahooQuote, status: 'gainer' | 'loser', isPreMarket: boolean): GapStock {
  const price = isPreMarket && q.preMarketPrice ? q.preMarketPrice : q.regularMarketPrice;
  const gapPercent = isPreMarket && q.preMarketPrice && q.regularMarketPreviousClose
    ? ((q.preMarketPrice - q.regularMarketPreviousClose) / q.regularMarketPreviousClose) * 100
    : q.regularMarketChangePercent;
  return {
    symbol: q.symbol,
    name: q.longName || q.shortName || q.symbol,
    price,
    previousClose: q.regularMarketPreviousClose,
    gapPercent: Number(gapPercent.toFixed(2)),
    volume: (isPreMarket && q.preMarketVolume) ? q.preMarketVolume : q.regularMarketVolume,
    marketCap: q.marketCap ?? 0,
    status,
  };
}

export async function runYahooGapScan(options: {
  minGapPercent?: number;
  minVolume?: number;
  minMarketCap?: number;
  minPrice?: number;
  maxPrice?: number;
  count?: number;
  limit?: number;
  isPreMarket?: boolean;
} = {}): Promise<YahooScanResult> {
  const startTime = Date.now();
  const {
    minGapPercent = 5,
    minVolume = 1_000_000,
    minMarketCap = 50_000_000,
    minPrice = 1,
    maxPrice = 1000,
    count = 50,
    limit = 20,
    isPreMarket = false,
  } = options;

  // Use pre-market screeners before the regular session opens — Yahoo's day_gainers/
  // day_losers screeners reflect the previous session's close during pre-market and
  // return stale data. The pre_market_gainers/losers screeners surface stocks with
  // active pre-market price movement and include preMarketPrice/preMarketChangePercent.
  const gainersScreener: ScreenerId = isPreMarket ? 'pre_market_gainers' : 'day_gainers';
  const losersScreener: ScreenerId = isPreMarket ? 'pre_market_losers' : 'day_losers';

  const [gainersRaw, losersRaw] = await Promise.all([
    fetchScreener(gainersScreener, count),
    fetchScreener(losersScreener, count),
  ]);

  const filter = (q: YahooQuote) => {
    if ((q.averageDailyVolume3Month ?? 0) < minVolume) return false;
    if ((q.marketCap ?? 0) < minMarketCap) return false;
    const price = isPreMarket && q.preMarketPrice ? q.preMarketPrice : q.regularMarketPrice;
    const changePercent = isPreMarket && q.preMarketPrice && q.regularMarketPreviousClose
      ? ((q.preMarketPrice - q.regularMarketPreviousClose) / q.regularMarketPreviousClose) * 100
      : q.regularMarketChangePercent;
    if (Math.abs(changePercent) < minGapPercent) return false;
    if (price < minPrice || price > maxPrice) return false;
    if (isLikelyADR(q)) return false;
    return true;
  };

  const gainers = gainersRaw.filter(filter).slice(0, limit).map((q) => toGapStock(q, 'gainer', isPreMarket));
  const losers = losersRaw.filter(filter).slice(0, limit).map((q) => toGapStock(q, 'loser', isPreMarket));

  return {
    success: true,
    data: { gainers, losers },
    timestamp: new Date().toISOString(),
    source: 'yahoo',
    scanned: gainersRaw.length + losersRaw.length,
    found: gainers.length + losers.length,
    durationMs: Date.now() - startTime,
  };
}
