/**
 * Active Trades API - List and Manage Active Trades
 * 
 * GET /api/active-trades - Fetch all active trades
 * POST /api/active-trades - Add or update an active trade
 * PUT /api/active-trades/:id - Update an active trade (full update)
 * DELETE /api/active-trades/:id - Remove an active trade
 */

import { NextRequest, NextResponse } from 'next/server';
import { ActiveTradeWithPnL } from '@/types/active-trade';
import { 
  getActiveTrades, 
  saveActiveTrade, 
  deleteActiveTrade,
  updateActiveTrade
} from '@/lib/db/active-trades';

// Helper to generate UUID
function generateId(): string {
  return crypto.randomUUID();
}

/**
 * GET /api/active-trades
 * 
 * Query Parameters:
 * - userId: string (optional, defaults to 'default')
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId') || 'default';
    
    const trades = await getActiveTrades(userId);
    
    return NextResponse.json({ success: true, data: trades });
    
  } catch (error) {
    console.error('Error fetching active trades:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch active trades' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/active-trades
 * 
 * Creates a new active trade
 * Request body: ActiveTrade (without id for new trades)
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId') || 'default';
    
    const body = await request.json();
    
    // Validation
    if (!body.ticker || !body.actualEntry || !body.actualShares) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: ticker, actualEntry, actualShares' },
        { status: 400 }
      );
    }
    
    // Create active trade
    const trade: ActiveTradeWithPnL = {
      id: body.id || generateId(),
      ticker: body.ticker.toUpperCase(),
      plannedEntry: parseFloat(body.plannedEntry) || parseFloat(body.actualEntry),
      plannedStop: parseFloat(body.plannedStop) || 0,
      plannedTarget: parseFloat(body.plannedTarget) || 0,
      actualEntry: parseFloat(body.actualEntry),
      actualShares: parseInt(body.actualShares),
      positionValue: body.positionValue ? parseFloat(body.positionValue) : (parseFloat(body.actualEntry) * parseInt(body.actualShares)),
      openedAt: body.openedAt || new Date().toISOString(),
      notes: body.notes,
      watchlistId: body.watchlistId,
      // Optional PnL fields
      currentPrice: body.currentPrice ? parseFloat(body.currentPrice) : undefined,
      unrealizedPnL: body.unrealizedPnL ? parseFloat(body.unrealizedPnL) : undefined,
      unrealizedPnLPercent: body.unrealizedPnLPercent ? parseFloat(body.unrealizedPnLPercent) : undefined,
    };
    
    await saveActiveTrade(trade, userId);
    
    return NextResponse.json(
      { success: true, data: trade },
      { status: 201 }
    );
    
  } catch (error) {
    console.error('Error saving active trade:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to save active trade' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/active-trades?id={id}
 * 
 * Updates an existing active trade
 */
export async function PUT(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId') || 'default';
    const id = searchParams.get('id');
    
    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Missing required parameter: id' },
        { status: 400 }
      );
    }
    
    const body = await request.json();
    
    // Prepare updates
    const updates: Partial<ActiveTradeWithPnL> = {};
    
    if (body.ticker !== undefined) updates.ticker = body.ticker.toUpperCase();
    if (body.plannedEntry !== undefined) updates.plannedEntry = parseFloat(body.plannedEntry);
    if (body.plannedStop !== undefined) updates.plannedStop = parseFloat(body.plannedStop);
    if (body.plannedTarget !== undefined) updates.plannedTarget = parseFloat(body.plannedTarget);
    if (body.actualEntry !== undefined) updates.actualEntry = parseFloat(body.actualEntry);
    if (body.actualShares !== undefined) updates.actualShares = parseInt(body.actualShares);
    if (body.positionValue !== undefined) updates.positionValue = parseFloat(body.positionValue);
    if (body.notes !== undefined) updates.notes = body.notes;
    if (body.currentPrice !== undefined) updates.currentPrice = parseFloat(body.currentPrice);
    if (body.unrealizedPnL !== undefined) updates.unrealizedPnL = parseFloat(body.unrealizedPnL);
    if (body.unrealizedPnLPercent !== undefined) updates.unrealizedPnLPercent = parseFloat(body.unrealizedPnLPercent);
    
    const updated = await updateActiveTrade(id, updates, userId);
    
    if (!updated) {
      return NextResponse.json(
        { success: false, error: 'Active trade not found' },
        { status: 404 }
      );
    }
    
    return NextResponse.json({ success: true, data: updated });
    
  } catch (error) {
    console.error('Error updating active trade:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update active trade' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/active-trades?id={id}
 * 
 * Removes an active trade
 */
export async function DELETE(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId') || 'default';
    const id = searchParams.get('id');
    
    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Missing required parameter: id' },
        { status: 400 }
      );
    }
    
    await deleteActiveTrade(id, userId);
    
    return NextResponse.json({ 
      success: true, 
      message: 'Active trade deleted successfully' 
    });
    
  } catch (error) {
    console.error('Error deleting active trade:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete active trade' },
      { status: 500 }
    );
  }
}
