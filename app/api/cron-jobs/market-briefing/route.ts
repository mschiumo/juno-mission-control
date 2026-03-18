/**
 * Morning Market Briefing API Endpoint
 * 
 * GET: Fetch and format morning market data
 * - Fetches indices and key stock prices
 * - Formats brief summary
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

interface MarketItem {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  status: 'up' | 'down' | 'flat';
}

async function fetchQuote(symbol: string): Promise<MarketItem | null> {
  if (!FINNHUB_API_KEY) {
    console.error('[MarketBriefing] FINNHUB_API_KEY not configured');
    return null;
  }

  try {
    const response = await fetch(
      `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${FINNHUB_API_KEY}`,
      { next: { revalidate: 0 } }
    );
    
    if (!response.ok) {
      console.warn(`[MarketBriefing] Finnhub error for ${symbol}:`, response.status);
      return null;
    }
    
    const data = await response.json();
    
    if (data && data.c !== 0 && data.pc !== 0) {
      const change = data.d || data.c - data.pc;
      const changePercent = data.dp || (change / data.pc) * 100;
      
      return {
        symbol,
        name: getSymbolName(symbol),
        price: data.c,
        change: Number(change.toFixed(2)),
        changePercent: Number(changePercent.toFixed(2)),
        status: change >= 0 ? 'up' : 'down'
      };
    }
    
    return null;
  } catch (error) {
    console.error(`[MarketBriefing] Error fetching ${symbol}:`, error);
    return null;
  }
}

async function fetchCryptoPrice(symbol: string): Promise<MarketItem | null> {
  if (!FINNHUB_API_KEY) return null;

  try {
    // Use Finnhub for crypto (BTCUSD, ETHUSD)
    const response = await fetch(
      `https://finnhub.io/api/v1/quote?symbol=${symbol}USD&token=${FINNHUB_API_KEY}`,
      { next: { revalidate: 0 } }
    );
    
    if (!response.ok) {
      return null;
    }
    
    const data = await response.json();
    
    if (data && data.c !== 0) {
      const change = data.d || data.c - data.pc;
      const changePercent = data.dp || (change / data.pc) * 100;
      
      return {
        symbol: symbol.replace('BINANCE:', ''),
        name: `${symbol.replace('BINANCE:', '')} (Crypto)`,
        price: data.c,
        change: Number(change.toFixed(2)),
        changePercent: Number(changePercent.toFixed(2)),
        status: change >= 0 ? 'up' : 'down'
      };
    }
    
    return null;
  } catch (error) {
    console.error(`[MarketBriefing] Error fetching crypto ${symbol}:`, error);
    return null;
  }
}

function getSymbolName(symbol: string): string {
  const names: Record<string, string> = {
    'SPY': 'S&P 500',
    'QQQ': 'NASDAQ',
    'DIA': 'Dow Jones',
    'IWM': 'Russell 2000',
    'VIX': 'VIX',
    'AAPL': 'Apple',
    'MSFT': 'Microsoft',
    'GOOGL': 'Alphabet',
    'AMZN': 'Amazon',
    'TSLA': 'Tesla',
    'NVDA': 'NVIDIA',
    'META': 'Meta',
    'BTC': 'Bitcoin',
    'ETH': 'Ethereum'
  };
  return names[symbol] || symbol;
}

function getEmoji(changePercent: number): string {
  if (changePercent >= 2) return '🚀';
  if (changePercent >= 1) return '🟢';
  if (changePercent > 0) return '📈';
  if (changePercent <= -2) return '🔴';
  if (changePercent <= -1) return '🟥';
  if (changePercent < 0) return '📉';
  return '➡️';
}

export async function GET() {
  const startTime = Date.now();
  
  try {
    console.log('[MarketBriefing] Generating morning market briefing...');
    
    // Check if market is open today
    if (!isMarketOpenToday()) {
      const message = '🪐 Market is closed today (weekend or holiday). No morning briefing needed.';
      
      await postToCronResults('Morning Market Briefing', message, 'market');
      await logToActivityLog('Morning Market Briefing', 'Market closed', 'cron');
      
      return NextResponse.json({
        success: true,
        data: { marketOpen: false, message },
        durationMs: Date.now() - startTime
      });
    }
    
    // Fetch market indices
    const indices = await Promise.all([
      fetchQuote('SPY'),
      fetchQuote('QQQ'),
      fetchQuote('DIA'),
      fetchQuote('VIX')
    ]);
    
    // Fetch key stocks
    const stocks = await Promise.all([
      fetchQuote('AAPL'),
      fetchQuote('NVDA'),
      fetchQuote('MSFT'),
      fetchQuote('TSLA')
    ]);
    
    // Fetch crypto
    const crypto = await Promise.all([
      fetchCryptoPrice('BTC'),
      fetchCryptoPrice('ETH')
    ]);
    
    const validIndices = indices.filter((i): i is MarketItem => i !== null);
    const validStocks = stocks.filter((s): s is MarketItem => s !== null);
    const validCrypto = crypto.filter((c): c is MarketItem => c !== null);
    
    // Format the briefing
    const reportLines = [
      `🪐 **Morning Market Briefing** — ${formatDate()}`,
      ''
    ];
    
    // Major Indices
    if (validIndices.length > 0) {
      reportLines.push('**MAJOR INDICES**');
      for (const item of validIndices) {
        const emoji = getEmoji(item.changePercent);
        const sign = item.change >= 0 ? '+' : '';
        reportLines.push(
          `${emoji} ${item.name} (${item.symbol}): $${item.price.toFixed(2)} ${sign}${item.change} (${sign}${item.changePercent}%)`
        );
      }
      reportLines.push('');
    }
    
    // Key Stocks
    if (validStocks.length > 0) {
      reportLines.push('**KEY STOCKS**');
      for (const item of validStocks) {
        const emoji = getEmoji(item.changePercent);
        const sign = item.change >= 0 ? '+' : '';
        reportLines.push(
          `${emoji} ${item.name} (${item.symbol}): $${item.price.toFixed(2)} ${sign}${item.change} (${sign}${item.changePercent}%)`
        );
      }
      reportLines.push('');
    }
    
    // Crypto
    if (validCrypto.length > 0) {
      reportLines.push('**CRYPTO**');
      for (const item of validCrypto) {
        const emoji = getEmoji(item.changePercent);
        const sign = item.change >= 0 ? '+' : '';
        reportLines.push(
          `${emoji} ${item.name}: $${item.price.toLocaleString()} ${sign}${item.change} (${sign}${item.changePercent}%)`
        );
      }
      reportLines.push('');
    }
    
    // Market sentiment summary
    const spyData = validIndices.find(i => i.symbol === 'SPY');
    const qqqData = validIndices.find(i => i.symbol === 'QQQ');
    
    if (spyData && qqqData) {
      const avgChange = (spyData.changePercent + qqqData.changePercent) / 2;
      let sentiment = '';
      if (avgChange >= 1) sentiment = 'Markets looking strong this morning 🚀';
      else if (avgChange >= 0.5) sentiment = 'Positive pre-market sentiment 📈';
      else if (avgChange >= -0.5) sentiment = 'Markets relatively flat ➡️';
      else if (avgChange >= -1) sentiment = 'Some early selling pressure 📉';
      else sentiment = 'Markets under pressure this morning 🔴';
      
      reportLines.push(`*${sentiment}*`);
    }
    
    const reportContent = reportLines.join('\n');
    
    // Post to cron results
    await postToCronResults('Morning Market Briefing', reportContent, 'market');
    
    // Log to activity log
    await logToActivityLog(
      'Morning Market Briefing',
      `Generated with ${validIndices.length} indices, ${validStocks.length} stocks`,
      'cron'
    );
    
    // Send Telegram notification
    await sendTelegramIfNeeded(reportContent);
    
    const duration = Date.now() - startTime;
    console.log(`[MarketBriefing] Briefing generated in ${duration}ms`);
    
    return NextResponse.json({
      success: true,
      data: {
        indices: validIndices.length,
        stocks: validStocks.length,
        crypto: validCrypto.length,
        durationMs: duration
      }
    });
    
  } catch (error) {
    console.error('[MarketBriefing] Error:', error);
    
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    await logToActivityLog('Morning Market Briefing Failed', errorMessage, 'cron');
    
    return NextResponse.json({
      success: false,
      error: 'Failed to generate market briefing',
      message: errorMessage
    }, { status: 500 });
  }
}
