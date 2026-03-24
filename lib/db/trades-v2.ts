import { getRedisClient } from '@/lib/redis';
import { Trade } from '@/types/trading';

function tradesKey(userId: string) {
  return `trades:v2:data:${userId}`;
}

export async function getAllTrades(userId: string): Promise<Trade[]> {
  try {
    const redis = await getRedisClient();
    const data = await redis.get(tradesKey(userId));
    if (!data) return [];
    const parsed = JSON.parse(data);
    return parsed.trades || [];
  } catch (error) {
    console.error('Error getting trades from Redis:', error);
    return [];
  }
}

export async function saveTrade(trade: Trade, userId: string): Promise<void> {
  try {
    const redis = await getRedisClient();
    const existing = await getAllTrades(userId);
    const index = existing.findIndex(t => t.id === trade.id);
    if (index >= 0) {
      existing[index] = { ...trade, updatedAt: new Date().toISOString() };
    } else {
      existing.push(trade);
    }
    await redis.set(tradesKey(userId), JSON.stringify({ trades: existing }));
  } catch (error) {
    console.error('Error saving trade to Redis:', error);
    throw error;
  }
}

export async function saveTrades(trades: Trade[], userId: string): Promise<number> {
  try {
    const redis = await getRedisClient();
    const existing = await getAllTrades(userId);
    const tradeMap = new Map(existing.map(t => [t.id, t]));
    for (const trade of trades) {
      tradeMap.set(trade.id, trade);
    }
    const merged = Array.from(tradeMap.values());
    await redis.set(tradesKey(userId), JSON.stringify({ trades: merged }));
    return trades.length;
  } catch (error) {
    console.error('Error saving trades to Redis:', error);
    throw error;
  }
}

/**
 * Replace trades on specific dates then add the new ones.
 * Used by CSV import so re-importing a larger statement doesn't create duplicates.
 */
export async function saveTradesReplacingByDate(trades: Trade[], userId: string): Promise<number> {
  try {
    const redis = await getRedisClient();
    const existing = await getAllTrades(userId);

    // Collect every calendar date (YYYY-MM-DD) touched by the incoming trades
    const incomingDates = new Set(trades.map(t => {
      const ts = (t.status === 'CLOSED' && t.exitDate) ? t.exitDate : t.entryDate;
      return ts.slice(0, 10); // fast YYYY-MM-DD extraction
    }));

    // Keep only existing trades that fall outside the incoming date set
    const kept = existing.filter(t => {
      const ts = (t.status === 'CLOSED' && t.exitDate) ? t.exitDate : t.entryDate;
      return !incomingDates.has(ts.slice(0, 10));
    });

    await redis.set(tradesKey(userId), JSON.stringify({ trades: [...kept, ...trades] }));
    return trades.length;
  } catch (error) {
    console.error('Error saving trades to Redis:', error);
    throw error;
  }
}

export async function getTradeById(id: string, userId: string): Promise<Trade | null> {
  try {
    const trades = await getAllTrades(userId);
    return trades.find(t => t.id === id) || null;
  } catch (error) {
    console.error('Error getting trade by ID:', error);
    return null;
  }
}

export async function deleteTrade(id: string, userId: string): Promise<void> {
  try {
    const redis = await getRedisClient();
    const existing = await getAllTrades(userId);
    const filtered = existing.filter(t => t.id !== id);
    await redis.set(tradesKey(userId), JSON.stringify({ trades: filtered }));
  } catch (error) {
    console.error('Error deleting trade:', error);
    throw error;
  }
}

export async function clearAllTrades(userId: string): Promise<void> {
  try {
    const redis = await getRedisClient();
    await redis.del(tradesKey(userId));
  } catch (error) {
    console.error('Error clearing trades:', error);
    throw error;
  }
}

export async function getTradesByDateRange(startDate: string, endDate: string, userId: string): Promise<Trade[]> {
  const trades = await getAllTrades(userId);
  const start = new Date(startDate);
  const end = new Date(endDate);
  return trades.filter(t => {
    const entryDate = new Date(t.entryDate);
    return entryDate >= start && entryDate <= end;
  });
}

export async function getTradesBySymbol(symbol: string, userId: string): Promise<Trade[]> {
  const trades = await getAllTrades(userId);
  return trades.filter(t => t.symbol.toUpperCase() === symbol.toUpperCase());
}

export async function updateTrade(id: string, updates: Partial<Trade>, userId: string): Promise<Trade | null> {
  try {
    const redis = await getRedisClient();
    const existing = await getAllTrades(userId);
    const index = existing.findIndex(t => t.id === id);
    if (index === -1) return null;
    existing[index] = { ...existing[index], ...updates, updatedAt: new Date().toISOString() };
    await redis.set(tradesKey(userId), JSON.stringify({ trades: existing }));
    return existing[index];
  } catch (error) {
    console.error('Error updating trade:', error);
    throw error;
  }
}
