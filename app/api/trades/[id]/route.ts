/**
 * Single Trade API
 * 
 * GET /api/trades/[id] - Get a specific trade
 * PUT /api/trades/[id] - Update a trade
 * DELETE /api/trades/[id] - Delete a trade
 */

import { NextRequest, NextResponse } from 'next/server';
import type { Trade, UpdateTradeRequest } from '@/types/trading';
import { TradeStatus, TradeSide } from '@/types/trading';
import { getTradeById, updateTrade, deleteTrade } from '@/lib/db/trades-v2';

interface RouteParams {
  params: Promise<{
    id: string;
  }>;
}

/**
 * GET /api/trades/[id]
 * 
 * Retrieves a specific trade by ID
 */
export async function GET(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    
    const trade = await getTradeById(id);
    
    if (!trade) {
      return NextResponse.json(
        { success: false, error: 'Trade not found' },
        { status: 404 }
      );
    }
    
    // Verify user has access to this trade
    if (userId && trade.userId && trade.userId !== userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 403 }
      );
    }
    
    return NextResponse.json({ success: true, data: trade });
    
  } catch (error) {
    console.error('Error fetching trade:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch trade' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/trades/[id]
 * 
 * Updates a trade. Can be used to:
 * - Update entry details
 * - Close a trade (add exit details)
 * - Update journal fields
 */
export async function PUT(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    const { id } = await params;
    const body: UpdateTradeRequest = await request.json();
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    
    const trade = await getTradeById(id);
    
    if (!trade) {
      return NextResponse.json(
        { success: false, error: 'Trade not found' },
        { status: 404 }
      );
    }
    
    // Verify user has access to this trade
    if (userId && trade.userId && trade.userId !== userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 403 }
      );
    }
    
    const now = new Date().toISOString();
    const updates: Partial<Trade> = { updatedAt: now };
    
    // Update basic fields
    if (body.symbol) updates.symbol = body.symbol.toUpperCase();
    if (body.side) updates.side = body.side;
    if (body.strategy) updates.strategy = body.strategy;
    if (body.entryDate) updates.entryDate = body.entryDate;
    if (body.entryPrice !== undefined) updates.entryPrice = body.entryPrice;
    if (body.shares !== undefined) updates.shares = body.shares;
    if (body.entryNotes !== undefined) updates.entryNotes = body.entryNotes;
    if (body.exitNotes !== undefined) updates.exitNotes = body.exitNotes;
    if (body.stopLoss !== undefined) updates.stopLoss = body.stopLoss;
    if (body.takeProfit !== undefined) updates.takeProfit = body.takeProfit;
    if (body.riskAmount !== undefined) updates.riskAmount = body.riskAmount;
    if (body.emotion !== undefined) updates.emotion = body.emotion;
    if (body.setupQuality !== undefined) updates.setupQuality = body.setupQuality;
    if (body.mistakes !== undefined) updates.mistakes = body.mistakes;
    if (body.lessons !== undefined) updates.lessons = body.lessons;
    if (body.tags !== undefined) updates.tags = body.tags;
    if (body.status) updates.status = body.status;
    
    // Handle trade closure
    if (body.exitDate !== undefined) updates.exitDate = body.exitDate;
    if (body.exitPrice !== undefined) {
      updates.exitPrice = body.exitPrice;
      
      // Auto-calculate P&L if exit price provided and trade wasn't already closed
      if (body.exitPrice > 0 && trade.entryPrice > 0) {
        const isLong = trade.side === TradeSide.LONG;
        const priceDiff = isLong 
          ? body.exitPrice - trade.entryPrice
          : trade.entryPrice - body.exitPrice;
        
        const grossPnL = priceDiff * trade.shares;
        // Assume $0.01 per share commission + $1 base fee as default
        const estimatedFees = 1 + (trade.shares * 0.01 * 2); // Entry + Exit
        
        updates.grossPnL = grossPnL;
        updates.netPnL = grossPnL - estimatedFees;
        updates.returnPercent = (priceDiff / trade.entryPrice) * 100;
        
        // Auto-update status if exit is provided
        if (!body.status) {
          updates.status = TradeStatus.CLOSED;
        }
      }
    }
    
    // Recalculate risk percent if risk amount or entry changed
    if (body.riskAmount !== undefined || body.entryPrice !== undefined) {
      const riskAmount = body.riskAmount ?? trade.riskAmount;
      const entryPrice = body.entryPrice ?? trade.entryPrice;
      const shares = body.shares ?? trade.shares;
      if (riskAmount && entryPrice > 0) {
        updates.riskPercent = (riskAmount / (entryPrice * shares)) * 100;
      }
    }
    
    // Update trade in Redis
    const updatedTrade = await updateTrade(id, updates);
    
    if (!updatedTrade) {
      return NextResponse.json(
        { success: false, error: 'Failed to update trade' },
        { status: 500 }
      );
    }
    
    return NextResponse.json({ success: true, data: updatedTrade });
    
  } catch (error) {
    console.error('Error updating trade:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update trade' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/trades/[id]
 * 
 * Deletes a trade permanently
 */
export async function DELETE(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    
    const trade = await getTradeById(id);
    
    if (!trade) {
      return NextResponse.json(
        { success: false, error: 'Trade not found' },
        { status: 404 }
      );
    }
    
    // Verify user has access to this trade
    if (userId && trade.userId && trade.userId !== userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 403 }
      );
    }
    
    await deleteTrade(id);
    
    return NextResponse.json({ 
      success: true, 
      message: 'Trade deleted successfully' 
    });
    
  } catch (error) {
    console.error('Error deleting trade:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete trade' },
      { status: 500 }
    );
  }
}
