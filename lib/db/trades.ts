import { getRedisClient } from '@/lib/redis';
import { TOSTrade, DayData } from '@/lib/parsers/tos-parser';

const TRADES_KEY_PREFIX = 'trades:';
const TRADE_IDS_KEY = 'trade_ids';

export async function saveTrade(trade: TOSTrade): Promise<void> {
  const redis = await getRedisClient();
  const key = `${TRADES_KEY_PREFIX}${trade.id}`;
  
  await redis.hSet(key, {
    id: trade.id || '',
    symbol: trade.symbol,
    side: trade.side,
    quantity: trade.quantity.toString(),
    price: trade.price.toString(),
    date: trade.date,
    time: trade.time,
    execTime: trade.execTime,
    posEffect: trade.posEffect || '',
    orderType: trade.orderType || '',
    pnl: trade.pnl?.toString() || '0'
  });
  
  // Add to index
  await redis.sAdd(TRADE_IDS_KEY, trade.id || '');
}

export async function saveTrades(trades: TOSTrade[]): Promise<number> {
  let saved = 0;
  for (const trade of trades) {
    await saveTrade(trade);
    saved++;
  }
  return saved;
}

export async function getAllTrades(): Promise<TOSTrade[]> {
  const redis = await getRedisClient();
  const ids = await redis.sMembers(TRADE_IDS_KEY);
  
  if (!ids.length) return [];
  
  const trades: TOSTrade[] = [];
  
  for (const id of ids) {
    const data = await redis.hGetAll(`${TRADES_KEY_PREFIX}${id}`);
    if (data && data.id) {
      trades.push({
        id: data.id,
        symbol: data.symbol,
        side: data.side as 'BUY' | 'SELL',
        quantity: parseInt(data.quantity, 10),
        price: parseFloat(data.price),
        date: data.date,
        time: data.time,
        execTime: data.execTime,
        posEffect: data.posEffect || undefined,
        orderType: data.orderType || undefined,
        pnl: data.pnl ? parseFloat(data.pnl) : undefined
      });
    }
  }
  
  // Sort by date, then time
  return trades.sort((a, b) => {
    const dateCompare = a.date.localeCompare(b.date);
    if (dateCompare !== 0) return dateCompare;
    return a.time.localeCompare(b.time);
  });
}

export async function getTradesByDate(date: string): Promise<TOSTrade[]> {
  const allTrades = await getAllTrades();
  return allTrades.filter(t => t.date === date);
}

export async function getTradesBySymbol(symbol: string): Promise<TOSTrade[]> {
  const allTrades = await getAllTrades();
  return allTrades.filter(t => t.symbol === symbol);
}

export async function calculateDailyStats(): Promise<DayData[]> {
  const trades = await getAllTrades();
  
  const byDate: Record<string, TOSTrade[]> = {};
  
  // Group trades by date
  trades.forEach(trade => {
    if (!byDate[trade.date]) byDate[trade.date] = [];
    byDate[trade.date].push(trade);
  });
  
  // Calculate PnL for each day
  return Object.entries(byDate).map(([date, dayTrades]) => {
    const bySymbol: Record<string, TOSTrade[]> = {};
    
    // Group by symbol for round-trip matching
    dayTrades.forEach(trade => {
      if (!bySymbol[trade.symbol]) bySymbol[trade.symbol] = [];
      bySymbol[trade.symbol].push(trade);
    });
    
    let totalPnL = 0;
    let wins = 0;
    let losses = 0;
    
    Object.values(bySymbol).forEach(symbolTrades => {
      const buys = symbolTrades.filter(t => t.side === 'BUY');
      const sells = symbolTrades.filter(t => t.side === 'SELL');
      
      if (buys.length > 0 && sells.length > 0) {
        const buyValue = buys.reduce((sum, t) => sum + t.price * t.quantity, 0);
        const buyQty = buys.reduce((sum, t) => sum + t.quantity, 0);
        const avgBuy = buyQty > 0 ? buyValue / buyQty : 0;
        
        const sellValue = sells.reduce((sum, t) => sum + t.price * t.quantity, 0);
        const sellQty = sells.reduce((sum, t) => sum + t.quantity, 0);
        const avgSell = sellQty > 0 ? sellValue / sellQty : 0;
        
        const matchedQty = Math.min(buyQty, sellQty);
        const pnl = (avgSell - avgBuy) * matchedQty;
        
        totalPnL += pnl;
        
        if (pnl > 0) wins++;
        else if (pnl < 0) losses++;
      }
    });
    
    const totalTrades = wins + losses;
    
    return {
      date,
      pnl: totalPnL,
      trades: dayTrades.length,
      winRate: totalTrades > 0 ? Math.round((wins / totalTrades) * 100) : undefined,
      hasJournal: false
    };
  }).sort((a, b) => a.date.localeCompare(b.date));
}

export async function deleteTrade(id: string): Promise<void> {
  const redis = await getRedisClient();
  await redis.del(`${TRADES_KEY_PREFIX}${id}`);
  await redis.sRem(TRADE_IDS_KEY, id);
}

export async function clearAllTrades(): Promise<void> {
  const redis = await getRedisClient();
  const ids = await redis.sMembers(TRADE_IDS_KEY);
  
  for (const id of ids) {
    await redis.del(`${TRADES_KEY_PREFIX}${id}`);
  }
  
  await redis.del(TRADE_IDS_KEY);
}
