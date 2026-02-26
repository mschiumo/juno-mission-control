/**
 * Watchlist Database Layer
 * 
 * Handles storage and retrieval of watchlist items (potential trades) from Redis
 */

import { getRedisClient } from '@/lib/redis';
import { WatchlistItem } from '@/types/watchlist';

const WATCHLIST_KEY = 'trades:watchlist:data';

/**
 * Get all watchlist items for a user from Redis
 */
export async function getWatchlist(userId: string = 'default'): Promise<WatchlistItem[]> {
  try {
    const redis = await getRedisClient();
    const data = await redis.get(`${WATCHLIST_KEY}:${userId}`);
    
    if (!data) {
      return [];
    }
    
    const parsed = JSON.parse(data);
    return parsed.items || [];
  } catch (error) {
    console.error('Error getting watchlist from Redis:', error);
    return [];
  }
}

/**
 * Save a single watchlist item to Redis
 */
export async function saveWatchlistItem(item: WatchlistItem, userId: string = 'default'): Promise<void> {
  try {
    const redis = await getRedisClient();
    const existing = await getWatchlist(userId);
    
    // Check if item already exists (update)
    const index = existing.findIndex(i => i.id === item.id);
    
    if (index >= 0) {
      existing[index] = item;
    } else {
      existing.push(item);
    }
    
    await redis.set(`${WATCHLIST_KEY}:${userId}`, JSON.stringify({ items: existing }));
  } catch (error) {
    console.error('Error saving watchlist item to Redis:', error);
    throw error;
  }
}

/**
 * Save multiple watchlist items to Redis
 */
export async function saveWatchlistItems(items: WatchlistItem[], userId: string = 'default'): Promise<number> {
  try {
    const redis = await getRedisClient();
    const existing = await getWatchlist(userId);
    
    // Merge new items with existing (avoid duplicates by id)
    const itemMap = new Map(existing.map(i => [i.id, i]));
    
    for (const item of items) {
      itemMap.set(item.id, item);
    }
    
    const merged = Array.from(itemMap.values());
    await redis.set(`${WATCHLIST_KEY}:${userId}`, JSON.stringify({ items: merged }));
    
    return items.length;
  } catch (error) {
    console.error('Error saving watchlist items to Redis:', error);
    throw error;
  }
}

/**
 * Get a single watchlist item by ID
 */
export async function getWatchlistItemById(id: string, userId: string = 'default'): Promise<WatchlistItem | null> {
  try {
    const items = await getWatchlist(userId);
    return items.find(i => i.id === id) || null;
  } catch (error) {
    console.error('Error getting watchlist item by ID:', error);
    return null;
  }
}

/**
 * Delete a watchlist item by ID
 */
export async function deleteWatchlistItem(id: string, userId: string = 'default'): Promise<void> {
  try {
    const redis = await getRedisClient();
    const existing = await getWatchlist(userId);
    
    const filtered = existing.filter(i => i.id !== id);
    await redis.set(`${WATCHLIST_KEY}:${userId}`, JSON.stringify({ items: filtered }));
  } catch (error) {
    console.error('Error deleting watchlist item:', error);
    throw error;
  }
}

/**
 * Clear all watchlist items for a user
 */
export async function clearWatchlist(userId: string = 'default'): Promise<void> {
  try {
    const redis = await getRedisClient();
    await redis.del(`${WATCHLIST_KEY}:${userId}`);
  } catch (error) {
    console.error('Error clearing watchlist:', error);
    throw error;
  }
}
