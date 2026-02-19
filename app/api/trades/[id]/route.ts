/**
 * Single Trade API
 * 
 * GET /api/trades/[id] - Get a specific trade
 * PUT /api/trades/[id] - Update a trade
 * DELETE /api/trades/[id] - Delete a trade
 */

import { NextRequest, NextResponse } from 'next/server';
import type { Trade, UpdateTradeRequest } from '@/types/trading';

// Reference to the trades store from parent route
// In production, this would be a database connection
declare global {
  var tradesStore: Map<string, Trade> | undefined;
}

const tradesStore: Map<string, Trade> = global.tradesStore || new Map();
if (!global.tradesStore) {
  global.tradesStore = tradesStore;
}

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
    
    const trade = tradesStore.get(id);
    
    if (!trade) {
      return NextResponse.json(
        { success: false, error: 'Trade not found' },
        { status: 404 }
      );
    }
    
    // Verify user has access to this trade
    if (userId && trade.userId !== userId) {
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
    
    const trade = tradesStore.get(id);
    
    if (!trade) {
      return NextResponse.json(
        { success: false, error: 'Trade not found' },
        { status: 404 }
      );
    }
    
    // Verify user has access to this trade
    if (userId && trade.userId !== userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 403 }
      );
    }
    
    const now = new Date().toISOString();
    const updatedTrade: Trade = { ...trade, updatedAt: now };
    
    // Update basic fields
    if (body.symbol) updatedTrade.symbol = body.symbol.toUpperCase();
    if (body.side) updatedTrade.side = body.side;
    if (body.strategy) updatedTrade.strategy = body.strategy;
    if (body.entryDate) updatedTrade.entryDate = body.entryDate;
    if (body.entryPrice !== undefined) updatedTrade.entryPrice = body.entryPrice;
    if (body.shares !== undefined) updatedTrade.shares = body.shares;
    if (body.entryNotes !== undefined) updatedTrade.entryNotes = body.entryNotes;
    if (body.exitNotes !== undefined) updatedTrade.exitNotes = body.exitNotes;
    if (body.stopLoss !== undefined) updatedTrade.stopLoss = body.stopLoss;
    if (body.takeProfit !== undefined) updatedTrade.takeProfit = body.takeProfit;
    if (body.riskAmount !== undefined) updatedTrade.riskAmount = body.riskAmount;
    if (body.emotion !== undefined) updatedTrade.emotion = body.emotion;
    if (body.setupQuality !== undefined) updatedTrade.setupQuality = body.setupQuality;
    if (body.mistakes !== undefined) updatedTrade.mistakes = body.mistakes;
    if (body.lessons !== undefined) updatedTrade.lessons = body.lessons;
    if (body.tags !== undefined) updatedTrade.tags = body.tags;
    if (body.status) updatedTrade.status = body.status;
    
    // Handle trade closure
    if (body.exitDate !== undefined) updatedTrade.exitDate = body.exitDate;
    if (body.exitPrice !== undefined) {
      updatedTrade.exitPrice = body.exitPrice;
      
      // Auto-calculate P&L if exit price provided and trade wasn't already closed
      if (body.exitPrice > 0 && updatedTrade.entryPrice > 0) {
        const isLong = updatedTrade.side === 'LONG';
        const priceDiff = isLong 
          ? body.exitPrice - updatedTrade.entryPrice
          : updatedTrade.entryPrice - body.exitPrice;
        
        const grossPnL = priceDiff * updatedTrade.shares;
        // Assume $0.01 per share commission + $1 base fee as default
        const estimatedFees = 1 + (updatedTrade.shares * 0.01 * 2); // Entry + Exit
        
        updatedTrade.grossPnL = grossPnL;
        updatedTrade.netPnL = grossPnL - estimatedFees;
        updatedTrade.returnPercent = (priceDiff / updatedTrade.entryPrice) * 100;
        
        // Auto-update status if exit is provided
        if (!body.status) {
          updatedTrade.status = 'CLOSED';
        }
      }
    }
    
    // Recalculate risk percent if risk amount or entry changed
    if (body.riskAmount !== undefined || body.entryPrice !== undefined) {
      const riskAmount = body.riskAmount ?? updatedTrade.riskAmount;
      const entryPrice = body.entryPrice ?? updatedTrade.entryPrice;
      if (riskAmount && entryPrice > 0) {
        updatedTrade.riskPercent = (riskAmount / (entryPrice * updatedTrade.shares)) * 100;
      }
    }
    
    // Store updated trade
    tradesStore.set(id, updatedTrade);
    
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
    
    const trade = tradesStore.get(id);
    
    if (!trade) {
      return NextResponse.json(
        { success: false, error: 'Trade not found' },
        { status: 404 }
      );
    }
    
    // Verify user has access to this trade
    if (userId && trade.userId !== userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 403 }
      );
    }
    
    tradesStore.delete(id);
    
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
