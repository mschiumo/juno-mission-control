import { getRedisClient } from '@/lib/redis';
import { Trade } from '@/types/trading';

const TRADES_V2_KEY = 'trades:v2:data';

/**
 * Get all trades from Redis
 */
export async function getAllTrades(): Promise<Trade[]> {
  try {
    const redis = await getRedisClient();
    const data = await redis.get(TRADES_V2_KEY);
    
    if (!data) {
      return [];
    }
    
    const parsed = JSON.parse(data);
    return parsed.trades || [];
  } catch (error) {
    console.error('Error getting trades from Redis:', error);
    return [];
  }
}

/**
 * Save a single trade to Redis
 */
export async function saveTrade(trade: Trade): Promise<void> {
  try {
    const redis = await getRedisClient();
    const existing = await getAllTrades();
    
    // Check if trade already exists (update)
    const index = existing.findIndex(t => t.id === trade.id);
    
    if (index >= 0) {
      existing[index] = { ...trade, updatedAt: new Date().toISOString() };
    } else {
      existing.push(trade);
    }
    
    await redis.set(TRADES_V2_KEY, JSON.stringify({ trades: existing }));
  } catch (error) {
    console.error('Error saving trade to Redis:', error);
    throw error;
  }
}

/**
 * Save multiple trades to Redis
 */
export async function saveTrades(trades: Trade[]): Promise<number> {
  try {
    const redis = await getRedisClient();
    const existing = await getAllTrades();
    
    // Merge new trades with existing (avoid duplicates by id)
    const tradeMap = new Map(existing.map(t => [t.id, t]));
    
    for (const trade of trades) {
      tradeMap.set(trade.id, trade);
    }
    
    const merged = Array.from(tradeMap.values());
    await redis.set(TRADES_V2_KEY, JSON.stringify({ trades: merged }));
    
    return trades.length;
  } catch (error) {
    console.error('Error saving trades to Redis:', error);
    throw error;
  }
}

/**
 * Get a single trade by ID
 */
export async function getTradeById(id: string): Promise<Trade | null> {
  try {
    const trades = await getAllTrades();
    return trades.find(t => t.id === id) || null;
  } catch (error) {
    console.error('Error getting trade by ID:', error);
    return null;
  }
}

/**
 * Delete a trade by ID
 */
export async function deleteTrade(id: string): Promise<void> {
  try {
    const redis = await getRedisClient();
    const existing = await getAllTrades();
    
    const filtered = existing.filter(t => t.id !== id);
    await redis.set(TRADES_V2_KEY, JSON.stringify({ trades: filtered }));
  } catch (error) {
    console.error('Error deleting trade:', error);
    throw error;
  }
}

/**
 * Clear all trades
 */
export async function clearAllTrades(): Promise<void> {
  try {
    const redis = await getRedisClient();
    await redis.del(TRADES_V2_KEY);
  } catch (error) {
    console.error('Error clearing trades:', error);
    throw error;
  }
}

/**
 * Get trades by date range
 */
export async function getTradesByDateRange(startDate: string, endDate: string): Promise<Trade[]> {
  const trades = await getAllTrades();
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  return trades.filter(t => {
    const entryDate = new Date(t.entryDate);
    return entryDate >= start && entryDate <= end;
  });
}

/**
 * Get trades by symbol
 */
export async function getTradesBySymbol(symbol: string): Promise<Trade[]> {
  const trades = await getAllTrades();
  return trades.filter(t => 
    t.symbol.toUpperCase() === symbol.toUpperCase()
  );
}

/**
 * Update trade by ID
 */
export async function updateTrade(id: string, updates: Partial<Trade>): Promise<Trade | null> {
  try {
    const redis = await getRedisClient();
    const existing = await getAllTrades();
    
    const index = existing.findIndex(t => t.id === id);
    if (index === -1) {
      return null;
    }
    
    existing[index] = {
      ...existing[index],
      ...updates,
      updatedAt: new Date().toISOString()
    };
    
    await redis.set(TRADES_V2_KEY, JSON.stringify({ trades: existing }));
    return existing[index];
  } catch (error) {
    console.error('Error updating trade:', error);
    throw error;
  }
}
