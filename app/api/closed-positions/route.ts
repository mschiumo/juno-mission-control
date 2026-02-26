/**
 * Closed Positions API - List and Manage Closed Positions
 * 
 * GET /api/closed-positions - Fetch all closed positions
 * POST /api/closed-positions - Add or update a closed position
 * PUT /api/closed-positions/:id - Update a closed position
 * DELETE /api/closed-positions/:id - Remove a closed position
 */

import { NextRequest, NextResponse } from 'next/server';
import { 
  getClosedPositions, 
  saveClosedPosition, 
  deleteClosedPosition,
  updateClosedPosition,
  ClosedPosition
} from '@/lib/db/closed-positions';

// Helper to generate UUID
function generateId(): string {
  return crypto.randomUUID();
}

/**
 * GET /api/closed-positions
 * 
 * Query Parameters:
 * - userId: string (optional, defaults to 'default')
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId') || 'default';
    
    const positions = await getClosedPositions(userId);
    
    return NextResponse.json({ success: true, data: positions });
    
  } catch (error) {
    console.error('Error fetching closed positions:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch closed positions' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/closed-positions
 * 
 * Creates a new closed position
 * Request body: ClosedPosition (without id for new positions)
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
    
    const now = new Date().toISOString();
    
    // Create closed position
    const position: ClosedPosition = {
      id: body.id || generateId(),
      ticker: body.ticker.toUpperCase(),
      plannedEntry: parseFloat(body.plannedEntry) || parseFloat(body.actualEntry),
      plannedStop: parseFloat(body.plannedStop) || 0,
      plannedTarget: parseFloat(body.plannedTarget) || 0,
      actualEntry: parseFloat(body.actualEntry),
      actualShares: parseInt(body.actualShares),
      exitPrice: body.exitPrice ? parseFloat(body.exitPrice) : undefined,
      exitDate: body.exitDate,
      pnl: body.pnl ? parseFloat(body.pnl) : undefined,
      openedAt: body.openedAt || now,
      closedAt: body.closedAt || now,
      notes: body.notes,
    };
    
    await saveClosedPosition(position, userId);
    
    return NextResponse.json(
      { success: true, data: position },
      { status: 201 }
    );
    
  } catch (error) {
    console.error('Error saving closed position:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to save closed position' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/closed-positions?id={id}
 * 
 * Updates an existing closed position
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
    const updates: Partial<ClosedPosition> = {};
    
    if (body.ticker !== undefined) updates.ticker = body.ticker.toUpperCase();
    if (body.plannedEntry !== undefined) updates.plannedEntry = parseFloat(body.plannedEntry);
    if (body.plannedStop !== undefined) updates.plannedStop = parseFloat(body.plannedStop);
    if (body.plannedTarget !== undefined) updates.plannedTarget = parseFloat(body.plannedTarget);
    if (body.actualEntry !== undefined) updates.actualEntry = parseFloat(body.actualEntry);
    if (body.actualShares !== undefined) updates.actualShares = parseInt(body.actualShares);
    if (body.exitPrice !== undefined) updates.exitPrice = parseFloat(body.exitPrice);
    if (body.exitDate !== undefined) updates.exitDate = body.exitDate;
    if (body.pnl !== undefined) updates.pnl = parseFloat(body.pnl);
    if (body.notes !== undefined) updates.notes = body.notes;
    if (body.openedAt !== undefined) updates.openedAt = body.openedAt;
    if (body.closedAt !== undefined) updates.closedAt = body.closedAt;
    
    const updated = await updateClosedPosition(id, updates, userId);
    
    if (!updated) {
      return NextResponse.json(
        { success: false, error: 'Closed position not found' },
        { status: 404 }
      );
    }
    
    return NextResponse.json({ success: true, data: updated });
    
  } catch (error) {
    console.error('Error updating closed position:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update closed position' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/closed-positions?id={id}
 * 
 * Removes a closed position
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
    
    await deleteClosedPosition(id, userId);
    
    return NextResponse.json({ 
      success: true, 
      message: 'Closed position deleted successfully' 
    });
    
  } catch (error) {
    console.error('Error deleting closed position:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete closed position' },
      { status: 500 }
    );
  }
}
