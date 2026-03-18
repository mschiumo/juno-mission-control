/**
 * Watchlist API - List and Manage Watchlist Items (Potential Trades)
 * 
 * GET /api/watchlist - Fetch all watchlist items
 * POST /api/watchlist - Add or update a watchlist item
 * DELETE /api/watchlist/:id - Remove an item from watchlist
 */

import { NextRequest, NextResponse } from 'next/server';
import { WatchlistItem } from '@/types/watchlist';
import { 
  getWatchlist, 
  saveWatchlistItem, 
  deleteWatchlistItem 
} from '@/lib/db/watchlist';

// Helper to generate UUID
function generateId(): string {
  return crypto.randomUUID();
}

/**
 * GET /api/watchlist
 * 
 * Query Parameters:
 * - userId: string (optional, defaults to 'default')
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId') || 'default';
    
    const items = await getWatchlist(userId);
    
    return NextResponse.json({ success: true, data: items });
    
  } catch (error) {
    console.error('Error fetching watchlist:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch watchlist' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/watchlist
 * 
 * Creates or updates a watchlist item
 * Request body: WatchlistItem (without id for new items)
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId') || 'default';
    
    const body = await request.json();
    
    // Validation - only ticker is required
    if (!body.ticker) {
      return NextResponse.json(
        { success: false, error: 'Missing required field: ticker' },
        { status: 400 }
      );
    }
    
    // Create or update watchlist item
    const item: WatchlistItem = {
      id: body.id || generateId(),
      ticker: body.ticker.toUpperCase(),
      entryPrice: body.entryPrice ? parseFloat(body.entryPrice) : 0,
      stopPrice: body.stopPrice ? parseFloat(body.stopPrice) : 0,
      targetPrice: body.targetPrice ? parseFloat(body.targetPrice) : 0,
      riskRatio: body.riskRatio ? parseFloat(body.riskRatio) : 2,
      stopSize: body.stopSize ? parseFloat(body.stopSize) : 0,
      shareSize: body.shareSize ? parseInt(body.shareSize) : 0,
      potentialReward: body.potentialReward ? parseFloat(body.potentialReward) : 0,
      positionValue: body.positionValue ? parseFloat(body.positionValue) : 0,
      createdAt: body.createdAt || new Date().toISOString(),
      isFavorite: body.isFavorite || false,
      order: body.order,
    };
    
    await saveWatchlistItem(item, userId);
    
    return NextResponse.json(
      { success: true, data: item },
      { status: 201 }
    );
    
  } catch (error) {
    console.error('Error saving watchlist item:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to save watchlist item' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/watchlist?id={id}
 * 
 * Removes an item from the watchlist
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
    
    await deleteWatchlistItem(id, userId);
    
    return NextResponse.json({ 
      success: true, 
      message: 'Watchlist item deleted successfully' 
    });
    
  } catch (error) {
    console.error('Error deleting watchlist item:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete watchlist item' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/watchlist
 * 
 * Partial update of a watchlist item (e.g., toggle favorite)
 * Request body: { id: string, updates: Partial<WatchlistItem> }
 */
export async function PUT(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId') || 'default';
    
    const body = await request.json();
    const { id, updates } = body;
    
    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Missing required field: id' },
        { status: 400 }
      );
    }
    
    if (!updates || typeof updates !== 'object') {
      return NextResponse.json(
        { success: false, error: 'Missing required field: updates' },
        { status: 400 }
      );
    }
    
    // Get existing watchlist
    const items = await getWatchlist(userId);
    const existingItem = items.find(item => item.id === id);
    
    if (!existingItem) {
      return NextResponse.json(
        { success: false, error: 'Watchlist item not found' },
        { status: 404 }
      );
    }
    
    // Merge updates
    const updatedItem: WatchlistItem = {
      ...existingItem,
      ...updates,
      id, // Ensure id doesn't change
    };
    
    await saveWatchlistItem(updatedItem, userId);
    
    return NextResponse.json({ 
      success: true, 
      data: updatedItem,
      message: 'Watchlist item updated successfully' 
    });
    
  } catch (error) {
    console.error('Error updating watchlist item:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update watchlist item' },
      { status: 500 }
    );
  }
}
