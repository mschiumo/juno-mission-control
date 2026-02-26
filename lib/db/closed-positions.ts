/**
 * Closed Positions Database Layer
 * 
 * Handles storage and retrieval of closed positions from Redis
 */

import { getRedisClient } from '@/lib/redis';

// Closed Position Type (matching the one in WatchlistView)
export interface ClosedPosition {
  id: string;
  ticker: string;
  plannedEntry: number;
  plannedStop: number;
  plannedTarget: number;
  actualEntry: number;
  actualShares: number;
  exitPrice?: number;
  exitDate?: string;
  pnl?: number;
  openedAt: string;
  closedAt: string;
  notes?: string;
  order?: number; // Optional order index for drag-and-drop sorting
}

const CLOSED_POSITIONS_KEY = 'trades:closed:data';

/**
 * Get all closed positions for a user from Redis
 */
export async function getClosedPositions(userId: string = 'default'): Promise<ClosedPosition[]> {
  try {
    const redis = await getRedisClient();
    const data = await redis.get(`${CLOSED_POSITIONS_KEY}:${userId}`);
    
    if (!data) {
      return [];
    }
    
    const parsed = JSON.parse(data);
    return parsed.positions || [];
  } catch (error) {
    console.error('Error getting closed positions from Redis:', error);
    return [];
  }
}

/**
 * Save a single closed position to Redis
 */
export async function saveClosedPosition(position: ClosedPosition, userId: string = 'default'): Promise<void> {
  try {
    const redis = await getRedisClient();
    const existing = await getClosedPositions(userId);
    
    // Check if position already exists (update)
    const index = existing.findIndex(p => p.id === position.id);
    
    if (index >= 0) {
      existing[index] = position;
    } else {
      existing.push(position);
    }
    
    await redis.set(`${CLOSED_POSITIONS_KEY}:${userId}`, JSON.stringify({ positions: existing }));
  } catch (error) {
    console.error('Error saving closed position to Redis:', error);
    throw error;
  }
}

/**
 * Save multiple closed positions to Redis
 */
export async function saveClosedPositions(positions: ClosedPosition[], userId: string = 'default'): Promise<number> {
  try {
    const redis = await getRedisClient();
    const existing = await getClosedPositions(userId);
    
    // Merge new positions with existing (avoid duplicates by id)
    const positionMap = new Map(existing.map(p => [p.id, p]));
    
    for (const position of positions) {
      positionMap.set(position.id, position);
    }
    
    const merged = Array.from(positionMap.values());
    await redis.set(`${CLOSED_POSITIONS_KEY}:${userId}`, JSON.stringify({ positions: merged }));
    
    return positions.length;
  } catch (error) {
    console.error('Error saving closed positions to Redis:', error);
    throw error;
  }
}

/**
 * Get a single closed position by ID
 */
export async function getClosedPositionById(id: string, userId: string = 'default'): Promise<ClosedPosition | null> {
  try {
    const positions = await getClosedPositions(userId);
    return positions.find(p => p.id === id) || null;
  } catch (error) {
    console.error('Error getting closed position by ID:', error);
    return null;
  }
}

/**
 * Delete a closed position by ID
 */
export async function deleteClosedPosition(id: string, userId: string = 'default'): Promise<void> {
  try {
    const redis = await getRedisClient();
    const existing = await getClosedPositions(userId);
    
    const filtered = existing.filter(p => p.id !== id);
    await redis.set(`${CLOSED_POSITIONS_KEY}:${userId}`, JSON.stringify({ positions: filtered }));
  } catch (error) {
    console.error('Error deleting closed position:', error);
    throw error;
  }
}

/**
 * Clear all closed positions for a user
 */
export async function clearClosedPositions(userId: string = 'default'): Promise<void> {
  try {
    const redis = await getRedisClient();
    await redis.del(`${CLOSED_POSITIONS_KEY}:${userId}`);
  } catch (error) {
    console.error('Error clearing closed positions:', error);
    throw error;
  }
}

/**
 * Update closed position by ID
 */
export async function updateClosedPosition(id: string, updates: Partial<ClosedPosition>, userId: string = 'default'): Promise<ClosedPosition | null> {
  try {
    const redis = await getRedisClient();
    const existing = await getClosedPositions(userId);
    
    const index = existing.findIndex(p => p.id === id);
    if (index === -1) {
      return null;
    }
    
    existing[index] = {
      ...existing[index],
      ...updates
    };
    
    await redis.set(`${CLOSED_POSITIONS_KEY}:${userId}`, JSON.stringify({ positions: existing }));
    return existing[index];
  } catch (error) {
    console.error('Error updating closed position:', error);
    throw error;
  }
}
