/**
 * Active Trades Database Layer
 * 
 * Handles storage and retrieval of active trades from Redis
 */

import { getRedisClient } from '@/lib/redis';
import { ActiveTradeWithPnL } from '@/types/active-trade';

const ACTIVE_TRADES_KEY = 'trades:active:data';

/**
 * Get all active trades for a user from Redis
 */
export async function getActiveTrades(userId: string = 'default'): Promise<ActiveTradeWithPnL[]> {
  try {
    const redis = await getRedisClient();
    const data = await redis.get(`${ACTIVE_TRADES_KEY}:${userId}`);
    
    if (!data) {
      return [];
    }
    
    const parsed = JSON.parse(data);
    return parsed.trades || [];
  } catch (error) {
    console.error('Error getting active trades from Redis:', error);
    return [];
  }
}

/**
 * Save a single active trade to Redis
 */
export async function saveActiveTrade(trade: ActiveTradeWithPnL, userId: string = 'default'): Promise<void> {
  try {
    const redis = await getRedisClient();
    const existing = await getActiveTrades(userId);
    
    // Check if trade already exists (update)
    const index = existing.findIndex(t => t.id === trade.id);
    
    if (index >= 0) {
      existing[index] = trade;
    } else {
      existing.push(trade);
    }
    
    await redis.set(`${ACTIVE_TRADES_KEY}:${userId}`, JSON.stringify({ trades: existing }));
  } catch (error) {
    console.error('Error saving active trade to Redis:', error);
    throw error;
  }
}

/**
 * Save multiple active trades to Redis
 */
export async function saveActiveTrades(trades: ActiveTradeWithPnL[], userId: string = 'default'): Promise<number> {
  try {
    const redis = await getRedisClient();
    const existing = await getActiveTrades(userId);
    
    // Merge new trades with existing (avoid duplicates by id)
    const tradeMap = new Map(existing.map(t => [t.id, t]));
    
    for (const trade of trades) {
      tradeMap.set(trade.id, trade);
    }
    
    const merged = Array.from(tradeMap.values());
    await redis.set(`${ACTIVE_TRADES_KEY}:${userId}`, JSON.stringify({ trades: merged }));
    
    return trades.length;
  } catch (error) {
    console.error('Error saving active trades to Redis:', error);
    throw error;
  }
}

/**
 * Get a single active trade by ID
 */
export async function getActiveTradeById(id: string, userId: string = 'default'): Promise<ActiveTradeWithPnL | null> {
  try {
    const trades = await getActiveTrades(userId);
    return trades.find(t => t.id === id) || null;
  } catch (error) {
    console.error('Error getting active trade by ID:', error);
    return null;
  }
}

/**
 * Delete an active trade by ID
 */
export async function deleteActiveTrade(id: string, userId: string = 'default'): Promise<void> {
  try {
    const redis = await getRedisClient();
    const existing = await getActiveTrades(userId);
    
    const filtered = existing.filter(t => t.id !== id);
    await redis.set(`${ACTIVE_TRADES_KEY}:${userId}`, JSON.stringify({ trades: filtered }));
  } catch (error) {
    console.error('Error deleting active trade:', error);
    throw error;
  }
}

/**
 * Clear all active trades for a user
 */
export async function clearActiveTrades(userId: string = 'default'): Promise<void> {
  try {
    const redis = await getRedisClient();
    await redis.del(`${ACTIVE_TRADES_KEY}:${userId}`);
  } catch (error) {
    console.error('Error clearing active trades:', error);
    throw error;
  }
}

/**
 * Update active trade by ID
 */
export async function updateActiveTrade(id: string, updates: Partial<ActiveTradeWithPnL>, userId: string = 'default'): Promise<ActiveTradeWithPnL | null> {
  try {
    const redis = await getRedisClient();
    const existing = await getActiveTrades(userId);
    
    const index = existing.findIndex(t => t.id === id);
    if (index === -1) {
      return null;
    }
    
    existing[index] = {
      ...existing[index],
      ...updates
    };
    
    await redis.set(`${ACTIVE_TRADES_KEY}:${userId}`, JSON.stringify({ trades: existing }));
    return existing[index];
  } catch (error) {
    console.error('Error updating active trade:', error);
    throw error;
  }
}
