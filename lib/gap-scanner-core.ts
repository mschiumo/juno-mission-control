/**
 * Gap Scanner Core Logic
 *
 * Shared between /api/gap-scanner (HTTP route) and
 * /api/cron-jobs/gap-scanner-trigger (cron, no self-referencing fetch).
 */

import { getStockUniverse, getStockInfoMap, refreshStockUniverse, StockInfo } from '@/lib/stock-universe';
import { createClient } from 'redis';

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

export interface ScanResult {
  success: boolean;
  data: {
    gainers: GapStock[];
    losers: GapStock[];
  };
  timestamp: string;
  source: string;
  scanned: number;
  found: number;
  isWeekend: boolean;
  tradingDate: string;
  previousDate: string;
  marketSession: string;
  marketStatus: string;
  isPreMarket: boolean;
  durationMs: number;
  debug: {
    apiKeyPresent: boolean;
    apiKeyLength: number;
    universeSize: number;
    skippedETF: number;
    skippedGap: number;
    skippedVolume: number;
    skippedPrice: number;
    skippedMarketCap: number;
    quoteFailures: number;
    profileFailures: number;
    errors: string[];
  };
  filters: {
    minGapPercent: number;
    minVolume: number;
    maxPrice: number;
    minMarketCap: number;
    excludeETFs: boolean;
    excludeWarrants: boolean;
  };
}

const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;

function getFinnhubApiKey(): string {
  if (!FINNHUB_API_KEY) throw new Error('FINNHUB_API_KEY environment variable is required');
  return FINNHUB_API_KEY;
}

const MARKET_HOLIDAYS_2026 = [
  '2026-01-01', '2026-01-19', '2026-02-16', '2026-04-03',
  '2026-05-25', '2026-06-19', '2026-07-03', '2026-09-07',
  '2026-11-26', '2026-12-25',
];

function isMarketHoliday(dateStr: string): boolean {
  return MARKET_HOLIDAYS_2026.includes(dateStr);
}

export function getLastTradingDate(date: Date = new Date()): string {
  const prevDate = new Date(date);
  prevDate.setDate(prevDate.getDate() - 1);
  while (
    prevDate.getDay() === 0 ||
    prevDate.getDay() === 6 ||
    isMarketHoliday(prevDate.toISOString().split('T')[0])
  ) {
    prevDate.setDate(prevDate.getDate() - 1);
  }
  return prevDate.toISOString().split('T')[0];
}

export function getMarketSession(): {
  session: 'pre-market' | 'market-open' | 'post-market' | 'closed';
  isPreMarket: boolean;
  marketStatus: 'open' | 'closed';
} {
  const now = new Date();
  const estTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));

  // Weekends and holidays are always closed
  const day = estTime.getDay();
  if (day === 0 || day === 6 || isMarketHoliday(estTime.toISOString().split('T')[0])) {
    return { session: 'closed', isPreMarket: false, marketStatus: 'closed' };
  }

  const timeInMinutes = estTime.getHours() * 60 + estTime.getMinutes();

  if (timeInMinutes >= 240 && timeInMinutes < 570)
    return { session: 'pre-market', isPreMarket: true, marketStatus: 'open' };
  if (timeInMinutes >= 570 && timeInMinutes < 960)
    return { session: 'market-open', isPreMarket: false, marketStatus: 'open' };
  if (timeInMinutes >= 960 && timeInMinutes < 1200)
    return { session: 'post-market', isPreMarket: false, marketStatus: 'open' };
  return { session: 'closed', isPreMarket: false, marketStatus: 'closed' };
}

const ETF_PATTERNS = [
  'SPY', 'QQQ', 'IWM', 'VTI', 'VOO', 'IVV', 'VEA', 'VWO', 'BND', 'AGG',
  'GLD', 'SLV', 'USO', 'UNG', 'TLT', 'IEF', 'SHY', 'LQD', 'HYG', 'EMB',
  'VIX', 'UVXY', 'SVXY', 'SQQQ', 'TQQQ', 'UPRO', 'SPXU', 'FAZ', 'FAS',
];
const EXCLUDED_SUFFIXES = ['.WS', '.WSA', '.WSB', '.WT', '+', '^', '=', '/WS', '/WT', '.U', '.UN', '.R', '.RT'];

export function isETFOrDerivative(symbol: string): boolean {
  const s = symbol.toUpperCase();
  if (ETF_PATTERNS.includes(s)) return true;
  for (const suffix of EXCLUDED_SUFFIXES) if (s.endsWith(suffix)) return true;
  if (/[\/\^\+\=]/.test(symbol)) return true;
  if (/\.PR[A-Z]?$/.test(s) || /-P[ABCDEF]?$/.test(s)) return true;
  if (/\.[BC]$/.test(s) && s !== 'BRK.B') return true;
  return false;
}

// ── Redis ──────────────────────────────────────────────────────────────────

let redisClient: ReturnType<typeof createClient> | null = null;

async function getRedisClient() {
  if (redisClient?.isReady) return redisClient;
  try {
    const client = createClient({ url: process.env.UPSTASH_REDIS_URL || process.env.REDIS_URL || undefined });
    client.on('error', (err) => console.error('Redis Client Error:', err));
    await client.connect();
    redisClient = client;
    return client;
  } catch {
    return null;
  }
}

export async function storeScanResults(results: ScanResult): Promise<void> {
  try {
    const redis = await getRedisClient();
    if (redis) {
      const key = `gap_scanner:${results.tradingDate}`;
      await redis.setEx(key, 86400, JSON.stringify(results));
      console.log(`[GapScanner] Results stored in Redis: ${key}`);
    }
  } catch (error) {
    console.error('[GapScanner] Failed to store results:', error);
  }
}

export async function getCachedResults(date: string): Promise<ScanResult | null> {
  try {
    const redis = await getRedisClient();
    if (redis) {
      const data = await redis.get(`gap_scanner:${date}`);
      if (data) return JSON.parse(data);
    }
    return null;
  } catch {
    return null;
  }
}

// ── Core scan ──────────────────────────────────────────────────────────────

interface QuoteData { symbol: string; current: number; previous: number; volume: number; }

async function fetchBatchQuotes(symbols: string[], delayMs = 1000): Promise<Map<string, QuoteData>> {
  const apiKey = getFinnhubApiKey();
  const quotes = new Map<string, QuoteData>();

  for (let i = 0; i < symbols.length; i++) {
    const symbol = symbols[i];
    try {
      const res = await fetch(
        `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${apiKey}`,
        { next: { revalidate: 0 } }
      );
      if (!res.ok) { console.warn(`Finnhub quote error for ${symbol}:`, res.status); continue; }
      const data = await res.json();
      if (data?.c !== 0 && data?.pc !== 0) {
        quotes.set(symbol, { symbol, current: data.c, previous: data.pc, volume: data.v || 0 });
      }
    } catch (error) {
      console.error(`Error fetching quote for ${symbol}:`, error);
    }
    if (i < symbols.length - 1) await new Promise(r => setTimeout(r, delayMs));
  }
  return quotes;
}

export async function runGapScan(options: {
  minGapPercent?: number;
  minVolume?: number;
  maxPrice?: number;
  minMarketCap?: number;
  batchSize?: number;
  delayMs?: number;
  limit?: number;
  useCache?: boolean;
  forceRefresh?: boolean;
  dryRun?: boolean;
} = {}): Promise<ScanResult> {
  const startTime = Date.now();
  const {
    minGapPercent = 5,
    minVolume = 100000,
    maxPrice = 1000,
    minMarketCap = 100_000_000,
    batchSize = 50,
    delayMs = 1000,
    limit,
    useCache = true,
    forceRefresh = false,
    dryRun = false,
  } = options;

  if (forceRefresh) await refreshStockUniverse();

  let symbols = await getStockUniverse();
  const stockInfo = await getStockInfoMap();

  if (limit && limit < symbols.length) {
    console.log(`[GapScanner] Limiting scan to ${limit} stocks`);
    symbols = symbols.slice(0, limit);
  }

  const today = new Date().toISOString().split('T')[0];
  if (useCache && !forceRefresh && !dryRun) {
    const cached = await getCachedResults(today);
    if (cached) { console.log('[GapScanner] Returning cached results'); return { ...cached, source: 'cache' }; }
  }

  const marketSession = getMarketSession();

  const gainers: GapStock[] = [];
  const losers: GapStock[] = [];
  let scanned = 0, quoteFailures = 0, profileFailures = 0;
  let skippedETF = 0, skippedGap = 0, skippedVolume = 0, skippedPrice = 0, skippedMarketCap = 0;
  const errors: string[] = [];

  const totalBatches = Math.ceil(symbols.length / batchSize);
  console.log(`[GapScanner] Processing ${symbols.length} stocks in ${totalBatches} batches`);

  for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
    const batch = symbols.slice(batchIndex * batchSize, Math.min((batchIndex + 1) * batchSize, symbols.length));
    const quotes = await fetchBatchQuotes(batch, delayMs);

    for (const [symbol, quote] of quotes) {
      const info = stockInfo.get(symbol) as StockInfo | undefined;
      if (info && info.marketCap < minMarketCap) { skippedMarketCap++; continue; }
      scanned++;
      const gapPercent = ((quote.current - quote.previous) / quote.previous) * 100;
      if (Math.abs(gapPercent) < minGapPercent) { skippedGap++; continue; }
      if (quote.volume < minVolume) { skippedVolume++; continue; }
      if (quote.current > maxPrice) { skippedPrice++; continue; }

      const stock: GapStock = {
        symbol, name: info?.name || symbol,
        price: quote.current, previousClose: quote.previous,
        gapPercent: Number(gapPercent.toFixed(2)), volume: quote.volume,
        marketCap: info?.marketCap || 0, status: gapPercent > 0 ? 'gainer' : 'loser',
      };
      gapPercent > 0 ? gainers.push(stock) : losers.push(stock);
    }

    if ((batchIndex + 1) % 10 === 0 || batchIndex === totalBatches - 1) {
      console.log(`[GapScanner] Progress: ${Math.round(((batchIndex + 1) / totalBatches) * 100)}%`);
    }
  }

  gainers.sort((a, b) => b.gapPercent - a.gapPercent);
  losers.sort((a, b) => a.gapPercent - b.gapPercent);

  const result: ScanResult = {
    success: true,
    data: { gainers, losers },
    timestamp: new Date().toISOString(),
    source: 'live',
    scanned,
    found: gainers.length + losers.length,
    isWeekend: new Date().getDay() === 0 || new Date().getDay() === 6,
    tradingDate: today,
    previousDate: getLastTradingDate(),
    marketSession: marketSession.session,
    marketStatus: marketSession.marketStatus,
    isPreMarket: marketSession.isPreMarket,
    durationMs: Date.now() - startTime,
    debug: {
      apiKeyPresent: !!FINNHUB_API_KEY,
      apiKeyLength: FINNHUB_API_KEY?.length || 0,
      universeSize: symbols.length,
      skippedETF, skippedGap, skippedVolume, skippedPrice, skippedMarketCap,
      quoteFailures, profileFailures, errors,
    },
    filters: { minGapPercent, minVolume, maxPrice, minMarketCap, excludeETFs: true, excludeWarrants: true },
  };

  if (!dryRun && result.found > 0) {
    await storeScanResults(result);
  } else if (!dryRun) {
    console.log('[GapScanner] Skipping cache — no gaps found (likely outside trading hours)');
  }

  return result;
}
