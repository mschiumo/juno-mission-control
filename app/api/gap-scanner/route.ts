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

const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY || 'd6802j9r01qobepji5i0d6802j9r01qobepji5ig';

// Popular stocks to check for gaps (expanded universe)
const STOCK_UNIVERSE = [
  // Mega caps
  'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'META', 'NVDA', 'BRK.B', 'UNH', 'JNJ',
  'XOM', 'JPM', 'V', 'PG', 'HD', 'CVX', 'MA', 'LLY', 'BAC', 'ABBV',
  'PFE', 'KO', 'PEP', 'MRK', 'AVGO', 'TMO', 'COST', 'DIS', 'ABT', 'ADBE',
  // Tech
  'AMD', 'NFLX', 'CRM', 'INTC', 'CSCO', 'CMCSA', 'VZ', 'QCOM', 'AMAT', 'TXN',
  'INTU', 'NOW', 'IBM', 'MU', 'LRCX', 'ADI', 'KLAC', 'SNPS', 'CDNS', 'MRVL',
  // Growth/Momentum
  'PLTR', 'ABNB', 'UBER', 'COIN', 'HOOD', 'RBLX', 'SOFI', 'LMND', 'ASAN', 'DOCN',
  'NET', 'DDOG', 'CRWD', 'OKTA', 'TWLO', 'ZM', 'SNOW', 'U', 'IOT', 'S',
  // Trading favorites
  'FSLY', 'ENPH', 'SEDG', 'RUN', 'ARKK', 'ARKG', 'ARKW', 'ICLN', 'LIT', 'XBI',
  // Meme/Retail
  'GME', 'AMC', 'BB', 'NOK', 'EXPR', 'KOSS', 'BBBY', 'SPCE', 'TLRY', 'ACB',
  'CGC', 'SNDL', 'CRON', 'GRWG', 'APHA', 'HEXO', 'OGI', 'ARVL', 'RIVN', 'LCID',
  // EV/Energy
  'NIO', 'XPEV', 'LI', 'RIDE', 'GOEV', 'WKHS', 'FSR', 'BLNK', 'CHPT', 'QS',
  'BE', 'PLUG', 'SPWR', 'MAXN', 'NOVA', 'CWEN', 'NEE', 'ENLC', 'ET', 'MPLX',
  // Finance
  'SQ', 'PYPL', 'SOFI', 'AFRM', 'UPST', 'COF', 'DFS', 'AXP', 'ALLY', 'C',
  'WFC', 'GS', 'MS', 'SCHW', 'BLK', 'BX', 'KKR', 'APO', 'CG', 'OWL',
  // Consumer
  'SHOP', 'ETSY', 'EBAY', 'PINS', 'SNAP', 'TWTR', 'MTCH', 'BMBL', 'DASH', 'DID',
  'LULU', 'NKE', 'LULU', 'TJX', 'ROST', 'ULTA', 'BBY', 'TGT', 'WMT', 'COST',
  // Healthcare
  'GILD', 'BIIB', 'REGN', 'VRTX', 'ALNY', 'MRNA', 'BNTX', 'NVAX', 'INO', 'SRNE',
  'TDOC', 'AMWL', 'HIMS', 'OSH', 'AGL', 'PACS', 'OSH', 'CANO', 'SGFY', 'ACC',
  // Industrials
  'CAT', 'DE', 'GE', 'HON', 'MMM', 'ITW', 'EMR', 'ETN', 'ROK', 'AME',
  'TDG', 'HEI', 'FAST', 'GWW', 'CSX', 'UNP', 'NSC', 'ODFL', 'LSTR', 'KNX'
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
  
  try {
    console.log(`[GapScanner] Starting scan at ${timestamp}`);
    
    const gainers: GapStock[] = [];
    const losers: GapStock[] = [];
    let scanned = 0;
    
    // Check each stock in our universe
    for (const symbol of STOCK_UNIVERSE) {
      // Skip ETFs
      if (isETFOrDerivative(symbol)) continue;
      
      // Get real-time quote
      const quote = await fetchFinnhubQuote(symbol);
      if (!quote) continue;
      
      scanned++;
      
      // Calculate gap from current price vs previous close
      const gapPercent = ((quote.current - quote.previous) / quote.previous) * 100;
      
      // Apply filters
      if (Math.abs(gapPercent) < 2) continue; // Min 2% gap (changed from 5%)
      if (quote.volume < 100000) continue; // Min 100K volume
      if (quote.current > 500) continue; // Max $500 price
      
      // Get company info
      const profile = await fetchFinnhubProfile(symbol);
      
      // Skip if market cap < $250M (if available)
      if (profile && profile.marketCap > 0 && profile.marketCap < 250000000) continue;
      
      const stock: GapStock = {
        symbol,
        name: profile?.name || symbol,
        price: quote.current,
        previousClose: quote.previous,
        gapPercent: Number(gapPercent.toFixed(2)),
        volume: quote.volume,
        marketCap: profile?.marketCap || 0,
        status: gapPercent > 0 ? 'gainer' : 'loser'
      };
      
      if (gapPercent > 0) {
        gainers.push(stock);
      } else {
        losers.push(stock);
      }
      
      // Rate limiting - stay under 60 calls/min
      await new Promise(r => setTimeout(r, 100));
    }
    
    // Sort by gap magnitude
    gainers.sort((a, b) => b.gapPercent - a.gapPercent);
    losers.sort((a, b) => a.gapPercent - b.gapPercent);
    
    console.log(`[GapScanner] Found ${gainers.length} gainers, ${losers.length} losers from ${scanned} stocks`);
    
    return NextResponse.json({
      success: true,
      data: {
        gainers: gainers.slice(0, 10), // Top 10 gainers
        losers: losers.slice(0, 10)     // Top 10 losers
      },
      timestamp,
      source: 'live',
      scanned,
      found: gainers.length + losers.length,
      isWeekend: false,
      tradingDate: new Date().toISOString().split('T')[0],
      previousDate: new Date(Date.now() - 86400000).toISOString().split('T')[0],
      marketSession: 'pre-market',
      marketStatus: 'open',
      isPreMarket: true,
      enriched: true,
      filters: {
        minGapPercent: 2,
        minVolume: 100000,
        maxPrice: 500,
        minMarketCap: 250000000,
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