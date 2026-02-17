import { NextResponse } from 'next/server';

interface GapStock {
  symbol: string;
  name: string;
  price: number;
  previousClose: number;
  gapPercent: number;
  volume: number;
  marketCap: number;
  status: 'gainer' | 'loser';
}

const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;

if (!FINNHUB_API_KEY) {
  throw new Error('FINNHUB_API_KEY environment variable is required');
}

// US Market Holidays 2026
const MARKET_HOLIDAYS_2026 = [
  '2026-01-01', // New Year's Day
  '2026-01-19', // Martin Luther King Jr. Day
  '2026-02-16', // Presidents' Day
  '2026-04-03', // Good Friday
  '2026-05-25', // Memorial Day
  '2026-06-19', // Juneteenth
  '2026-07-03', // Independence Day (observed)
  '2026-09-07', // Labor Day
  '2026-11-26', // Thanksgiving
  '2026-12-25', // Christmas Day
];

function isMarketHoliday(dateStr: string): boolean {
  return MARKET_HOLIDAYS_2026.includes(dateStr);
}

function getLastTradingDate(date: Date = new Date()): string {
  // Start with yesterday
  const prevDate = new Date(date);
  prevDate.setDate(prevDate.getDate() - 1);
  
  // Keep going back until we find a trading day (not weekend, not holiday)
  while (prevDate.getDay() === 0 || prevDate.getDay() === 6 || isMarketHoliday(prevDate.toISOString().split('T')[0])) {
    prevDate.setDate(prevDate.getDate() - 1);
  }
  
  return prevDate.toISOString().split('T')[0];
}

// Market hours in EST (UTC-5, or UTC-4 during DST)
// Pre-market: 4:00 AM - 9:30 AM EST
// Market open: 9:30 AM - 4:00 PM EST
// Post-market: 4:00 PM - 8:00 PM EST
function getMarketSession(): {
  session: 'pre-market' | 'market-open' | 'post-market' | 'closed';
  isPreMarket: boolean;
  marketStatus: 'open' | 'closed';
} {
  const now = new Date();
  // Convert to EST (Eastern Time)
  const estTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const hour = estTime.getHours();
  const minute = estTime.getMinutes();
  const timeInMinutes = hour * 60 + minute;
  
  // Pre-market: 4:00 AM (240 min) to 9:30 AM (570 min)
  if (timeInMinutes >= 240 && timeInMinutes < 570) {
    return { session: 'pre-market', isPreMarket: true, marketStatus: 'open' };
  }
  
  // Market hours: 9:30 AM (570 min) to 4:00 PM (960 min)
  if (timeInMinutes >= 570 && timeInMinutes < 960) {
    return { session: 'market-open', isPreMarket: false, marketStatus: 'open' };
  }
  
  // Post-market: 4:00 PM (960 min) to 8:00 PM (1200 min)
  if (timeInMinutes >= 960 && timeInMinutes < 1200) {
    return { session: 'post-market', isPreMarket: false, marketStatus: 'open' };
  }
  
  // Closed (outside market hours)
  return { session: 'closed', isPreMarket: false, marketStatus: 'closed' };
}

// Popular stocks to check for gaps (top 50 liquid stocks for free tier)
const STOCK_UNIVERSE = [
  // Mega caps
  'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'META', 'NVDA', 'BRK.B', 'UNH', 'JNJ',
  'XOM', 'JPM', 'V', 'PG', 'HD', 'CVX', 'MA', 'LLY', 'BAC', 'ABBV',
  // Tech
  'AMD', 'NFLX', 'CRM', 'INTC', 'CSCO', 'VZ', 'QCOM', 'AMAT', 'TXN', 'INTU',
  // Growth/Momentum
  'PLTR', 'ABNB', 'UBER', 'COIN', 'HOOD', 'RBLX', 'SOFI', 'NET', 'DDOG', 'CRWD',
  // Trading favorites
  'FSLY', 'ENPH', 'SEDG', 'RUN', 'ARKK', 'ARKG', 'ARKW', 'ICLN', 'LIT', 'XBI'
];

// ETF patterns to exclude
const ETF_PATTERNS = [
  'SPY', 'QQQ', 'IWM', 'VTI', 'VOO', 'IVV', 'VEA', 'VWO', 'BND', 'AGG',
  'GLD', 'SLV', 'USO', 'UNG', 'TLT', 'IEF', 'SHY', 'LQD', 'HYG', 'EMB',
  'VIX', 'UVXY', 'SVXY', 'SQQQ', 'TQQQ', 'UPRO', 'SPXU', 'FAZ', 'FAS',
];

// Warrant/Unit/Right suffixes
const EXCLUDED_SUFFIXES = ['.WS', '.WSA', '.WSB', '.WT', '+', '^', '=', '/WS', '/WT', '.U', '.UN', '.R', '.RT'];

function isETFOrDerivative(symbol: string): boolean {
  const upperSymbol = symbol.toUpperCase();
  if (ETF_PATTERNS.includes(upperSymbol)) return true;
  for (const suffix of EXCLUDED_SUFFIXES) {
    if (upperSymbol.endsWith(suffix)) return true;
  }
  if (/[\/\^\+\=]/.test(symbol)) return true;
  if (/\.PR[A-Z]?$/.test(upperSymbol) || /-P[ABCDEF]?$/.test(upperSymbol)) return true;
  if (/\.[BC]$/.test(upperSymbol) && upperSymbol !== 'BRK.B') return true;
  return false;
}

// Fetch real-time quote from Finnhub (includes pre-market)
async function fetchFinnhubQuote(symbol: string): Promise<{ current: number; previous: number; volume: number } | null> {
  try {
    const response = await fetch(
      `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${FINNHUB_API_KEY}`,
      { next: { revalidate: 0 } } // No cache - real-time data
    );
    
    if (!response.ok) {
      console.warn(`Finnhub quote error for ${symbol}:`, response.status);
      return null;
    }
    
    const data = await response.json();
    
    // Finnhub quote response:
    // c: current price (includes pre-market)
    // pc: previous close
    // v: volume
    if (!data || data.c === 0 || data.pc === 0) {
      return null;
    }
    
    return {
      current: data.c,
      previous: data.pc,
      volume: data.v || 0
    };
  } catch (error) {
    console.error(`Error fetching Finnhub quote for ${symbol}:`, error);
    return null;
  }
}

// Fetch company profile for name and market cap
async function fetchFinnhubProfile(symbol: string): Promise<{ name: string; marketCap: number } | null> {
  try {
    const response = await fetch(
      `https://finnhub.io/api/v1/stock/profile2?symbol=${symbol}&token=${FINNHUB_API_KEY}`,
      { next: { revalidate: 3600 } }
    );
    
    if (!response.ok) return null;
    
    const data = await response.json();
    if (!data || !data.name) return null;
    
    return {
      name: data.name,
      marketCap: (data.marketCapitalization || 0) * 1000000 // Convert from millions
    };
  } catch (error) {
    return null;
  }
}

export async function GET() {
  const timestamp = new Date().toISOString();
  const errors: string[] = [];
  
  try {
    console.log(`[GapScanner] Starting scan at ${timestamp}`);
    console.log(`[GapScanner] API Key present: ${!!FINNHUB_API_KEY}`);
    console.log(`[GapScanner] API Key length: ${FINNHUB_API_KEY?.length || 0}`);
    
    const gainers: GapStock[] = [];
    const losers: GapStock[] = [];
    let scanned = 0;
    let quoteFailures = 0;
    let profileFailures = 0;
    let skippedETF = 0;
    let skippedGap = 0;
    let skippedVolume = 0;
    let skippedPrice = 0;
    let skippedMarketCap = 0;
    
    // Check each stock in our universe
    for (const symbol of STOCK_UNIVERSE) {
      // Skip ETFs
      if (isETFOrDerivative(symbol)) {
        skippedETF++;
        continue;
      }
      
      // Get real-time quote
      const quote = await fetchFinnhubQuote(symbol);
      if (!quote) {
        quoteFailures++;
        if (quoteFailures <= 5) {
          errors.push(`Quote failed for ${symbol}`);
        }
        continue;
      }
      
      scanned++;
      
      // Calculate gap from current price vs previous close
      const gapPercent = ((quote.current - quote.previous) / quote.previous) * 100;
      
      // Apply filters with logging
      if (Math.abs(gapPercent) < 2) {
        skippedGap++;
        continue;
      }
      if (quote.volume < 100000) {
        skippedVolume++;
        continue;
      }
      if (quote.current > 500) {
        skippedPrice++;
        continue;
      }
      
      // Skip profile call to save API rate limit - use symbol as name
      // Profile call is 1 extra API call per stock, hitting rate limits
      const stock: GapStock = {
        symbol,
        name: symbol,
        price: quote.current,
        previousClose: quote.previous,
        gapPercent: Number(gapPercent.toFixed(2)),
        volume: quote.volume,
        marketCap: 0, // Skip market cap check to save API calls
        status: gapPercent > 0 ? 'gainer' : 'loser'
      };
      
      if (gapPercent > 0) {
        gainers.push(stock);
      } else {
        losers.push(stock);
      }
      
      // Rate limiting - 1000ms = max 60 calls/min (Finnhub free tier)
      await new Promise(r => setTimeout(r, 1000));
    }
    
    // Sort by gap magnitude
    gainers.sort((a, b) => b.gapPercent - a.gapPercent);
    losers.sort((a, b) => a.gapPercent - b.gapPercent);
    
    console.log(`[GapScanner] Results: ${gainers.length} gainers, ${losers.length} losers from ${scanned} stocks scanned`);
    console.log(`[GapScanner] Skipped: ${skippedETF} ETFs, ${skippedGap} gap<2%, ${skippedVolume} vol<100K, ${skippedPrice} price>$500, ${skippedMarketCap} cap<$50M`);
    console.log(`[GapScanner] Failures: ${quoteFailures} quotes, ${profileFailures} profiles`);
    
    // Determine actual market session
    const marketSession = getMarketSession();
    
    return NextResponse.json({
      success: true,
      data: {
        gainers: gainers.slice(0, 10),
        losers: losers.slice(0, 10)
      },
      timestamp,
      source: 'live',
      scanned,
      found: gainers.length + losers.length,
      isWeekend: false,
      tradingDate: new Date().toISOString().split('T')[0],
      previousDate: getLastTradingDate(),
      marketSession: marketSession.session,
      marketStatus: marketSession.marketStatus,
      isPreMarket: marketSession.isPreMarket,
      debug: {
        apiKeyPresent: !!FINNHUB_API_KEY,
        apiKeyLength: FINNHUB_API_KEY?.length || 0,
        universeSize: STOCK_UNIVERSE.length,
        skippedETF,
        skippedGap,
        skippedVolume,
        skippedPrice,
        skippedMarketCap,
        quoteFailures,
        profileFailures,
        errors: errors.slice(0, 10)
      },
      enriched: true,
      filters: {
        minGapPercent: 2,
        minVolume: 100000,
        maxPrice: 500,
        minMarketCap: 50000000,
        excludeETFs: true,
        excludeWarrants: true
      }
    });
    
  } catch (error) {
    console.error('[GapScanner] Error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch gap data',
      timestamp
    }, { status: 500 });
  }
}