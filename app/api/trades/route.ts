import { NextResponse } from 'next/server';
import { createClient } from 'redis';
import type { Trade, TradeFilter } from '@/types/trading';

const STORAGE_KEY = 'trades_data';

let redisClient: ReturnType<typeof createClient> | null = null;

async function getRedisClient() {
  if (redisClient) return redisClient;
  
  try {
    const client = createClient({ url: process.env.REDIS_URL || undefined });
    client.on('error', (err) => console.error('Redis Client Error:', err));
    await client.connect();
    redisClient = client;
    return client;
  } catch (error) {
    console.error('Failed to connect to Redis:', error);
    return null;
  }
}

// GET /api/trades - List trades with filters
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const filter: TradeFilter = {
      startDate: searchParams.get('startDate') || undefined,
      endDate: searchParams.get('endDate') || undefined,
      symbol: searchParams.get('symbol') || undefined,
      side: (searchParams.get('side') as 'long' | 'short') || undefined,
      strategy: (searchParams.get('strategy') as any) || undefined,
      minPnl: searchParams.get('minPnl') ? parseFloat(searchParams.get('minPnl')!) : undefined,
      maxPnl: searchParams.get('maxPnl') ? parseFloat(searchParams.get('maxPnl')!) : undefined,
      tags: searchParams.get('tags')?.split(',') || undefined,
    };

    const redis = await getRedisClient();
    
    if (!redis) {
      return NextResponse.json({ 
        success: false, 
        error: 'Redis not available' 
      }, { status: 503 });
    }

    const stored = await redis.get(STORAGE_KEY);
    let trades: Trade[] = stored ? JSON.parse(stored) : [];

    // Apply filters
    if (filter.startDate) {
      trades = trades.filter(t => t.entryTime >= filter.startDate!);
    }
    if (filter.endDate) {
      trades = trades.filter(t => t.entryTime <= filter.endDate!);
    }
    if (filter.symbol) {
      trades = trades.filter(t => t.symbol.toLowerCase() === filter.symbol!.toLowerCase());
    }
    if (filter.side) {
      trades = trades.filter(t => t.side === filter.side);
    }
    if (filter.strategy) {
      trades = trades.filter(t => t.strategy === filter.strategy);
    }
    if (filter.minPnl !== undefined) {
      trades = trades.filter(t => (t.netPnl || 0) >= filter.minPnl!);
    }
    if (filter.maxPnl !== undefined) {
      trades = trades.filter(t => (t.netPnl || 0) <= filter.maxPnl!);
    }
    if (filter.tags && filter.tags.length > 0) {
      trades = trades.filter(t => filter.tags!.some(tag => t.tags.includes(tag)));
    }

    // Sort by entry time descending
    trades.sort((a, b) => new Date(b.entryTime).getTime() - new Date(a.entryTime).getTime());

    return NextResponse.json({
      success: true,
      data: trades,
      count: trades.length,
      filters: filter
    });
  } catch (error) {
    console.error('Trades GET error:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Failed to fetch trades' 
    }, { status: 500 });
  }
}

// POST /api/trades - Create new trade
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { 
      symbol, side, entryPrice, exitPrice, shares,
      entryTime, exitTime, fees, strategy, setupType,
      tags, emotion, mistakes, notes, screenshots, chartUrl
    } = body;

    // Validation
    if (!symbol || !side || !entryPrice || !shares || !entryTime) {
      return NextResponse.json({
        success: false,
        error: 'Missing required fields: symbol, side, entryPrice, shares, entryTime'
      }, { status: 400 });
    }

    const redis = await getRedisClient();
    
    if (!redis) {
      return NextResponse.json({ 
        success: false, 
        error: 'Redis not available' 
      }, { status: 503 });
    }

    // Calculate P&L
    const pnl = exitPrice 
      ? side === 'long' 
        ? (exitPrice - entryPrice) * shares
        : (entryPrice - exitPrice) * shares
      : null;
    const netPnl = pnl !== null ? pnl - (fees || 0) : null;

    const newTrade: Trade = {
      id: `trade_${Date.now()}`,
      userId: 'mj', // TODO: Get from auth
      symbol: symbol.toUpperCase(),
      side,
      entryPrice: parseFloat(entryPrice),
      exitPrice: exitPrice ? parseFloat(exitPrice) : null,
      shares: parseInt(shares),
      entryTime,
      exitTime: exitTime || null,
      pnl,
      fees: parseFloat(fees || 0),
      netPnl,
      strategy: strategy || 'other',
      setupType: setupType || '',
      tags: tags || [],
      emotion: emotion || 'neutral',
      mistakes: mistakes || '',
      notes: notes || '',
      screenshots: screenshots || [],
      chartUrl: chartUrl || null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const stored = await redis.get(STORAGE_KEY);
    const trades: Trade[] = stored ? JSON.parse(stored) : [];
    trades.push(newTrade);

    await redis.set(STORAGE_KEY, JSON.stringify(trades));

    return NextResponse.json({
      success: true,
      data: newTrade,
      message: 'Trade created successfully'
    });
  } catch (error) {
    console.error('Trades POST error:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Failed to create trade' 
    }, { status: 500 });
  }
}
