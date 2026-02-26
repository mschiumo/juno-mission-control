/**
 * Manual Trade Import API
 * 
 * POST /api/trades/import-manual - Create a trade manually from form data
 */

import { NextRequest, NextResponse } from 'next/server';
import { Trade, TradeSide, TradeStatus, Strategy } from '@/types/trading';
import { saveTrade } from '@/lib/db/trades-v2';
import { getNowInEST, toESTISOString } from '@/lib/date-utils';

// Helper to generate UUID
function generateId(): string {
  return crypto.randomUUID();
}

interface ManualTradeRequest {
  symbol: string;
  side: TradeSide;
  entryPrice: number;
  exitPrice?: number;
  shares: number;
  entryDate: string;
  exitDate?: string;
  notes?: string;
  userId?: string;
}

/**
 * POST /api/trades/import-manual
 * 
 * Creates a new trade from manual form entry
 * Supports both open trades (no exit) and closed trades (with exit)
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body: ManualTradeRequest = await request.json();
    
    // Validation
    if (!body.symbol || !body.side || !body.entryPrice || !body.shares || !body.entryDate) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: symbol, side, entryPrice, shares, entryDate' },
        { status: 400 }
      );
    }
    
    // Validate symbol (basic validation)
    if (body.symbol.length < 1 || body.symbol.length > 20) {
      return NextResponse.json(
        { success: false, error: 'Invalid symbol' },
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
    
    // Validate exit price if provided
    if (body.exitPrice !== undefined && body.exitPrice <= 0) {
      return NextResponse.json(
        { success: false, error: 'Exit price must be positive' },
        { status: 400 }
      );
    }
    
    const now = getNowInEST();
    const hasExit = body.exitPrice !== undefined && body.exitDate !== undefined;
    
    // Calculate PnL if exit price is provided
    let grossPnL: number | undefined;
    let netPnL: number | undefined;
    let returnPercent: number | undefined;
    
    if (hasExit && body.exitPrice !== undefined) {
      const priceDiff = body.side === TradeSide.LONG 
        ? body.exitPrice - body.entryPrice 
        : body.entryPrice - body.exitPrice;
      
      grossPnL = priceDiff * body.shares;
      // Assume some commission/fees - roughly $0.65 per contract or $1 per stock trade (round trip)
      const estimatedFees = 1.30; // Estimated round-trip fees
      netPnL = grossPnL - estimatedFees;
      
      const positionValue = body.entryPrice * body.shares;
      returnPercent = (netPnL / positionValue) * 100;
    }
    
    // Create trade object
    const newTrade: Trade = {
      id: generateId(),
      userId: body.userId || 'default',
      symbol: body.symbol.toUpperCase(),
      side: body.side,
      status: hasExit ? TradeStatus.CLOSED : TradeStatus.OPEN,
      strategy: Strategy.DAY_TRADE, // Default for manual entry
      entryDate: toESTISOString(new Date(body.entryDate)),
      entryPrice: body.entryPrice,
      shares: body.shares,
      entryNotes: body.notes,
      exitDate: hasExit && body.exitDate ? toESTISOString(new Date(body.exitDate)) : undefined,
      exitPrice: body.exitPrice,
      grossPnL,
      netPnL,
      returnPercent,
      tags: ['manual-entry'],
      createdAt: now,
      updatedAt: now,
    };
    
    // Store trade in Redis
    await saveTrade(newTrade);
    
    return NextResponse.json(
      { success: true, data: newTrade },
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
