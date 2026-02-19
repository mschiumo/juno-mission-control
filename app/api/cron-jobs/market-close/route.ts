/**
 * Market Close API Endpoint
 * 
 * GET: Fetch market close data
 * - Gets SPY, QQQ, VIX end-of-day prices
 * - Formats market summary
 * - POST to /api/cron-results
 */

import { NextResponse } from 'next/server';
import { 
  postToCronResults, 
  sendTelegramIfNeeded, 
  logToActivityLog,
  formatDate,
  isMarketOpenToday
} from '@/lib/cron-helpers';

const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;

interface MarketData {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  previousClose: number;
}

async function fetchStockQuote(symbol: string): Promise<MarketData | null> {
  if (!FINNHUB_API_KEY) {
    console.error('[MarketClose] FINNHUB_API_KEY not configured');
    return null;
  }

  try {
    const response = await fetch(
      `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${FINNHUB_API_KEY}`,
      { next: { revalidate: 0 } }
    );
    
    if (!response.ok) {
      console.warn(`[MarketClose] Finnhub error for ${symbol}:`, response.status);
      return null;
    }
    
    const data = await response.json();
    
    // Finnhub: c = current, pc = previous close, d = change, dp = change percent
    if (data && data.c !== 0 && data.pc !== 0) {
      const change = data.d || data.c - data.pc;
      const changePercent = data.dp || (change / data.pc) * 100;
      
      return {
        symbol,
        name: getStockName(symbol),
        price: data.c,
        change: Number(change.toFixed(2)),
        changePercent: Number(changePercent.toFixed(2)),
        previousClose: data.pc
      };
    }
    
    return null;
  } catch (error) {
    console.error(`[MarketClose] Error fetching ${symbol}:`, error);
    return null;
  }
}

function getStockName(symbol: string): string {
  const names: Record<string, string> = {
    'SPY': 'S&P 500 ETF',
    'QQQ': 'NASDAQ ETF',
    'DIA': 'Dow Jones ETF',
    'IWM': 'Russell 2000 ETF',
    'VIX': 'Volatility Index'
  };
  return names[symbol] || symbol;
}

function getEmoji(changePercent: number): string {
  if (changePercent >= 2) return '🚀';
  if (changePercent >= 1) return '📈';
  if (changePercent > 0) return '↗️';
  if (changePercent <= -2) return '🔴';
  if (changePercent <= -1) return '📉';
  if (changePercent < 0) return '↘️';
  return '➡️';
}

export async function GET() {
  const startTime = Date.now();
  
  try {
    console.log('[MarketClose] Generating market close report...');
    
    // Check if market was open today
    if (!isMarketOpenToday()) {
      const message = '📊 Market was closed today (weekend or holiday)';
      
      await postToCronResults('Market Close Report', message, 'market');
      await logToActivityLog('Market Close Report', 'Market closed today', 'cron');
      
      return NextResponse.json({
        success: true,
        data: { marketOpen: false, message },
        durationMs: Date.now() - startTime
      });
    }
    
    // Fetch market data for key symbols
    const symbols = ['SPY', 'QQQ', 'VIX'];
    const results = await Promise.all(symbols.map(fetchStockQuote));
    const validResults = results.filter((r): r is MarketData => r !== null);
    
    if (validResults.length === 0) {
      throw new Error('Failed to fetch any market data');
    }
    
    // Format the report
    const reportLines = [
      `📊 **Market Close Report** — ${formatDate()}`,
      ''
    ];
    
    // Sort: indices first, then by symbol
    validResults.sort((a, b) => {
      if (a.symbol === 'SPY') return -1;
      if (b.symbol === 'SPY') return 1;
      if (a.symbol === 'QQQ') return -1;
      if (b.symbol === 'QQQ') return 1;
      return a.symbol.localeCompare(b.symbol);
    });
    
    for (const data of validResults) {
      const emoji = getEmoji(data.changePercent);
      const sign = data.change >= 0 ? '+' : '';
      reportLines.push(
        `${emoji} **${data.symbol}** (${data.name})`,
        `   Price: $${data.price.toFixed(2)}`,
        `   Change: ${sign}${data.change} (${sign}${data.changePercent}%)`,
        ''
      );
    }
    
    // Market sentiment based on SPY
    const spyData = validResults.find(r => r.symbol === 'SPY');
    if (spyData) {
      let sentiment = '';
      if (spyData.changePercent >= 1.5) sentiment = '**Market Sentiment**: Strongly Bullish 🚀';
      else if (spyData.changePercent >= 0.5) sentiment = '**Market Sentiment**: Bullish 📈';
      else if (spyData.changePercent >= -0.5) sentiment = '**Market Sentiment**: Neutral ➡️';
      else if (spyData.changePercent >= -1.5) sentiment = '**Market Sentiment**: Bearish 📉';
      else sentiment = '**Market Sentiment**: Strongly Bearish 🔴';
      reportLines.push(sentiment);
    }
    
    const reportContent = reportLines.join('\n');
    
    // Post to cron results
    await postToCronResults('Market Close Report', reportContent, 'market');
    
    // Log to activity log
    await logToActivityLog(
      'Market Close Report Generated',
      `Fetched ${validResults.length} symbols`,
      'cron'
    );
    
    // Send Telegram notification if significant market move (> 2%)
    const significantMove = validResults.some(r => Math.abs(r.changePercent) >= 2);
    await sendTelegramIfNeeded(reportContent, significantMove);
    
    const duration = Date.now() - startTime;
    console.log(`[MarketClose] Report generated in ${duration}ms`);
    
    return NextResponse.json({
      success: true,
      data: {
        results: validResults,
        report: reportContent,
        durationMs: duration
      }
    });
    
  } catch (error) {
    console.error('[MarketClose] Error:', error);
    
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    await logToActivityLog('Market Close Report Failed', errorMessage, 'cron');
    
    return NextResponse.json({
      success: false,
      error: 'Failed to generate market close report',
      message: errorMessage
    }, { status: 500 });
  }
}
