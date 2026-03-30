/**
 * Polygon-based Gap Scanner
 *
 * Shared between /api/gap-scanner-polygon (HTTP route) and
 * /api/cron-jobs/gap-scanner-trigger (cron job).
 * Fetches ALL stock snapshots in a single API call.
 */

import { getAvgVolumeMap } from '@/lib/avg-volume';

const POLYGON_API_KEY = process.env.POLYGON_API_KEY;

// ── Types ───────────────────────────────────────────────────────────────────

export interface PolygonSnapshot {
  ticker: string;
  day: { c: number; h: number; l: number; o: number; v: number; vw: number };
  prevDay: { c: number; h: number; l: number; o: number; v: number; vw: number };
  lastTrade?: { p: number };
  lastQuote?: { p: number };
  min?: { c: number };
  todaysChange?: number;
  todaysChangePerc?: number;
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

export interface PolygonScanResult {
  success: boolean;
  data: { gainers: GapStock[]; losers: GapStock[] };
  timestamp: string;
  source: string;
  scanned: number;
  found: number;
  durationMs: number;
  isWeekend: boolean;
  tradingDate: string;
  previousDate: string;
  marketSession: 'pre-market' | 'market-open' | 'post-market' | 'closed';
  marketStatus: 'open' | 'closed';
  isPreMarket: boolean;
  debug: {
    apiKeyPresent: boolean;
    skippedByGap: number;
    skippedByVolume: number;
    skippedByPrice: number;
  };
  filters: {
    minGapPercent: number;
    minVolume: number;
    minPrice: number;
    maxPrice: number;
  };
}

// ── Market session helpers (all times in ET) ────────────────────────────────

export function getMarketSession(): {
  session: 'pre-market' | 'market-open' | 'post-market' | 'closed';
  isWeekend: boolean;
  tradingDate: string;
  previousDate: string;
  marketStatus: 'open' | 'closed';
  isPreMarket: boolean;
} {
  const now = new Date();
  const etTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const day = etTime.getDay();
  const timeInMinutes = etTime.getHours() * 60 + etTime.getMinutes();
  const isWeekend = day === 0 || day === 6;

  const fmt = (d: Date) =>
    d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric', timeZone: 'America/New_York' });

  const prevDate = new Date(etTime);
  prevDate.setDate(prevDate.getDate() - 1);
  while (prevDate.getDay() === 0 || prevDate.getDay() === 6) {
    prevDate.setDate(prevDate.getDate() - 1);
  }

  const tradingDate = new Date(etTime);
  while (tradingDate.getDay() === 0 || tradingDate.getDay() === 6) {
    tradingDate.setDate(tradingDate.getDate() - 1);
  }

  let session: 'pre-market' | 'market-open' | 'post-market' | 'closed';
  if (isWeekend) {
    session = 'closed';
  } else if (timeInMinutes >= 240 && timeInMinutes < 570) {
    session = 'pre-market';
  } else if (timeInMinutes >= 570 && timeInMinutes < 960) {
    session = 'market-open';
  } else if (timeInMinutes >= 960 && timeInMinutes < 1200) {
    session = 'post-market';
  } else {
    session = 'closed';
  }

  return {
    session,
    isWeekend,
    tradingDate: fmt(tradingDate),
    previousDate: fmt(prevDate),
    marketStatus: session === 'market-open' ? 'open' : 'closed',
    isPreMarket: session === 'pre-market',
  };
}

// ── Filters ─────────────────────────────────────────────────────────────────

const ETF_PATTERNS = [
  'SPY', 'QQQ', 'IWM', 'VTI', 'VOO', 'IVV', 'VEA', 'VWO', 'BND', 'AGG',
  'GLD', 'SLV', 'USO', 'UNG', 'TLT', 'IEF', 'SHY', 'LQD', 'HYG', 'EMB',
  'VIX', 'UVXY', 'SVXY', 'SQQQ', 'TQQQ', 'UPRO', 'SPXU', 'FAZ', 'FAS',
];

const EXCLUDED_SUFFIXES = ['.WS', '.WSA', '.WSB', '.WT', '+', '^', '=', '/WS', '/WT', '.U', '.UN', '.R', '.RT'];

function isETFOrDerivative(symbol: string): boolean {
  const s = symbol.toUpperCase();
  if (ETF_PATTERNS.includes(s)) return true;
  for (const suffix of EXCLUDED_SUFFIXES) if (s.endsWith(suffix)) return true;
  if (/[\/\^\+\=]/.test(symbol)) return true;
  if (/\.PR[A-Z]?$/.test(s) || /-P[ABCDEF]?$/.test(s)) return true;
  if (/\.[BC]$/.test(s) && s !== 'BRK.B') return true;
  return false;
}

const KNOWN_ADRS = new Set([
  'BABA', 'BIDU', 'JD', 'PDD', 'NIO', 'XPEV', 'LI', 'BILI', 'IQ',
  'TSM', 'ASML', 'SAP', 'TM', 'NVO', 'SONY', 'SHOP', 'RY', 'TD', 'BNS',
  'VALE', 'ITUB', 'BBD', 'SAN', 'BBVA', 'UL', 'BP', 'SHELL', 'AZN',
  'GSK', 'BTI', 'VOD', 'DEO', 'WPP',
]);

function isLikelyADRBySymbol(symbol: string): boolean {
  return KNOWN_ADRS.has(symbol.toUpperCase());
}

// ── Core scanning ───────────────────────────────────────────────────────────

export async function fetchAllSnapshots(
  session: 'pre-market' | 'market-open' | 'post-market' | 'closed'
): Promise<PolygonSnapshot[]> {
  if (!POLYGON_API_KEY) {
    throw new Error('POLYGON_API_KEY environment variable is required');
  }

  const url = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers?apiKey=${POLYGON_API_KEY}`;
  console.log('[GapScanner-Polygon] Fetching all stock snapshots...');

  const response = await fetch(url, { cache: 'no-store' });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Polygon API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  if (!data.tickers || !Array.isArray(data.tickers)) {
    throw new Error('Invalid response from Polygon API');
  }

  console.log(`[GapScanner-Polygon] Fetched ${data.tickers.length} snapshots`);
  return data.tickers;
}

export function processGaps(
  snapshots: PolygonSnapshot[],
  options: {
    minGapPercent: number;
    minVolume: number;
    minPrice: number;
    maxPrice: number;
    isPreMarket: boolean;
    avgVolumeMap?: Record<string, number>;
  }
): { gainers: GapStock[]; losers: GapStock[]; skipped: { gap: number; volume: number; price: number } } {
  const { minGapPercent, minVolume, minPrice, maxPrice, isPreMarket, avgVolumeMap } = options;

  const gainers: GapStock[] = [];
  const losers: GapStock[] = [];
  let skippedGap = 0;
  let skippedVolume = 0;
  let skippedPrice = 0;

  for (const snap of snapshots) {
    if (isETFOrDerivative(snap.ticker)) continue;
    if (isLikelyADRBySymbol(snap.ticker)) continue;
    if (!snap.day?.c || !snap.prevDay?.c) continue;

    const currentPrice = snap.lastTrade?.p || snap.day.c;
    const previousClose = snap.prevDay.c;
    const volume = snap.day.v || 0;
    // Use 90-day avg volume when available; fall back to prevDay volume during premarket
    const avgVol = avgVolumeMap?.[snap.ticker] ?? 0;
    const volumeForFilter = avgVol > 0
      ? avgVol
      : (isPreMarket ? (snap.prevDay?.v || 0) : volume);

    if (currentPrice < minPrice || currentPrice > maxPrice) { skippedPrice++; continue; }
    if (volumeForFilter < minVolume) { skippedVolume++; continue; }

    const gapPercent = ((currentPrice - previousClose) / previousClose) * 100;
    if (Math.abs(gapPercent) < minGapPercent) { skippedGap++; continue; }

    const stock: GapStock = {
      symbol: snap.ticker,
      name: snap.ticker,
      price: currentPrice,
      previousClose,
      gapPercent: Number(gapPercent.toFixed(2)),
      volume,
      marketCap: 0,
      status: gapPercent > 0 ? 'gainer' : 'loser',
    };

    if (gapPercent > 0) gainers.push(stock); else losers.push(stock);
  }

  gainers.sort((a, b) => b.gapPercent - a.gapPercent);
  losers.sort((a, b) => a.gapPercent - b.gapPercent);

  return {
    gainers,
    losers,
    skipped: { gap: skippedGap, volume: skippedVolume, price: skippedPrice },
  };
}

export async function runPolygonGapScan(options: {
  minGapPercent?: number;
  minVolume?: number;
  minPrice?: number;
  maxPrice?: number;
} = {}): Promise<PolygonScanResult> {
  const startTime = Date.now();
  const {
    minGapPercent = 5,
    minVolume = 1_000_000,
    minPrice = 1,
    maxPrice = 1000,
  } = options;

  const marketInfo = getMarketSession();
  const [snapshots, avgVolumeMap] = await Promise.all([
    fetchAllSnapshots(marketInfo.session),
    getAvgVolumeMap().catch(() => null),
  ]);

  const { gainers, losers, skipped } = processGaps(snapshots, {
    minGapPercent,
    minVolume,
    minPrice,
    maxPrice,
    isPreMarket: marketInfo.isPreMarket,
    avgVolumeMap: avgVolumeMap ?? undefined,
  });

  return {
    success: true,
    data: { gainers, losers },
    timestamp: new Date().toISOString(),
    source: 'polygon',
    scanned: snapshots.length,
    found: gainers.length + losers.length,
    durationMs: Date.now() - startTime,
    isWeekend: marketInfo.isWeekend,
    tradingDate: marketInfo.tradingDate,
    previousDate: marketInfo.previousDate,
    marketSession: marketInfo.session,
    marketStatus: marketInfo.marketStatus,
    isPreMarket: marketInfo.isPreMarket,
    debug: {
      apiKeyPresent: true,
      skippedByGap: skipped.gap,
      skippedByVolume: skipped.volume,
      skippedByPrice: skipped.price,
    },
    filters: { minGapPercent, minVolume, minPrice, maxPrice },
  };
}
