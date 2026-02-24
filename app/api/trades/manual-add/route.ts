/**
 * Manual Trade Addition API
 * 
 * POST /api/trades/manual-add - Add a manually entered trade for paper trading
 */

import { NextRequest, NextResponse } from 'next/server';
import { saveTrade, getAllTrades } from '@/lib/db/trades-v2';
import { Trade, TradeSide, TradeStatus, Strategy } from '@/types/trading';

// Helper to generate UUID
function generateId(): string {
  return crypto.randomUUID();
}

interface ManualTradeRequest {
  id: string;
  ticker: string;
  entryPrice: number;
  exitPrice?: number;
  shares: number;
  side: 'LONG' | 'SHORT';
  pnl: number;
  date: string; // YYYY-MM-DD
  notes?: string;
  source: 'manual';
}

/**
 * POST /api/trades/manual-add
 * 
 * Creates a new manual trade entry for paper trading
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body: ManualTradeRequest = await request.json();
    
    // Validation
    if (!body.ticker || !body.side || !body.entryPrice || !body.shares || !body.date) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: ticker, side, entryPrice, shares, date' },
        { status: 400 }
      );
    }
    
    // Validate ticker (basic validation)
    if (body.ticker.length < 1 || body.ticker.length > 20) {
      return NextResponse.json(
        { success: false, error: 'Invalid ticker symbol' },
        { status: 400 }
      );
    }
    
    // Validate price and shares are positive
    if (body.entryPrice <= 0 || body.shares <= 0) {
      return NextResponse.json(
        { success: false, error: 'Entry price and shares must be positive' },
        { status: 400 }
      );
    }
    
    // Validate date format (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(body.date)) {
      return NextResponse.json(
        { success: false, error: 'Invalid date format. Use YYYY-MM-DD' },
        { status: 400 }
      );
    }
    
    // Create entry and exit timestamps for the trade
    // Use noon EST to avoid timezone issues
    const entryDate = `${body.date}T12:00:00-05:00`;
    const exitDate = body.exitPrice ? `${body.date}T12:00:01-05:00` : undefined;
    
    // Determine trade status based on exit price
    const status = body.exitPrice ? TradeStatus.CLOSED : TradeStatus.OPEN;
    
    const now = new Date().toISOString();
    
    // Create trade object that matches the existing Trade interface
    const newTrade: Trade = {
      id: generateId(),
      userId: 'default',
      symbol: body.ticker.toUpperCase(),
      side: body.side as TradeSide,
      status,
      strategy: Strategy.OTHER, // Manual trades default to OTHER strategy
      entryDate,
      entryPrice: body.entryPrice,
      shares: body.shares,
      entryNotes: body.notes,
      exitDate,
      exitPrice: body.exitPrice,
      exitNotes: body.notes,
      // Set P&L - for closed trades with exit price, calculate from exit price
      // For open trades, use the manually entered P&L
      grossPnL: body.pnl,
      netPnL: body.pnl,
      // Calculate return percentage
      returnPercent: (body.pnl / (body.entryPrice * body.shares)) * 100,
      // Mark as manual source via tags
      tags: ['manual-entry', ...(body.notes ? [] : [])],
      createdAt: now,
      updatedAt: now,
    };
    
    // Store trade in Redis
    await saveTrade(newTrade);
    
    return NextResponse.json(
      { 
        success: true, 
        data: newTrade,
        message: 'Trade saved successfully'
      },
      { status: 201 }
    );
    
  } catch (error) {
    console.error('Error creating manual trade:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create trade' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/trades/manual-add
 * 
 * Returns all manual trades for the user
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const allTrades = await getAllTrades();
    
    // Filter trades that have the 'manual-entry' tag
    const manualTrades = allTrades.filter(
      trade => trade.tags?.includes('manual-entry')
    );
    
    return NextResponse.json({
      success: true,
      data: manualTrades,
      count: manualTrades.length
    });
    
  } catch (error) {
    console.error('Error fetching manual trades:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch manual trades' },
      { status: 500 }
    );
  }
}
