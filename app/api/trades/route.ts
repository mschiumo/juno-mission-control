/**
 * Trades API - List and Create Trades
 * 
 * GET /api/trades - List trades with optional filtering
 * POST /api/trades - Create a new trade
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth-config';
import type { Trade, CreateTradeRequest, TradeListResponse } from '@/types/trading';
import { TradeStatus, Strategy, TradeSide } from '@/types/trading';
import { 
  getUserTrades, 
  saveUserTrade, 
  deleteUserTrade,
  clearUserTrades,
  getUserId,
  requireAuth
} from '@/lib/db/user-data';
import { getNowInEST } from '@/lib/date-utils';

// Helper to generate UUID
function generateId(): string {
  return crypto.randomUUID();
}

/**
 * GET /api/trades
 * 
 * Query Parameters:
 * - symbol: string (optional filter)
 * - status: 'OPEN' | 'CLOSED' | 'PARTIAL' (optional filter)
 * - strategy: string (optional filter)
 * - startDate: ISO date (optional filter)
 * - endDate: ISO date (optional filter)
 * - page: number (default: 1)
 * - perPage: number (default: 20)
 * - sortBy: 'entryDate' | 'exitDate' | 'netPnL' | 'symbol' (default: 'entryDate')
 * - sortOrder: 'asc' | 'desc' (default: 'desc')
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await auth();
    
    if (!session?.user?.email) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    const userId = getUserId(session.user.email);
    const { searchParams } = new URL(request.url);
    
    // Get all trades from Redis for this user
    const allTrades = await getUserTrades(userId);
    
    // Optional filters
    const symbol = searchParams.get('symbol');
    const status = searchParams.get('status') as Trade['status'] | null;
    const strategy = searchParams.get('strategy');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const tags = searchParams.get('tags')?.split(',');
    
    // Pagination
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const perPage = Math.min(100, Math.max(1, parseInt(searchParams.get('perPage') || '20', 10)));
    
    // Sorting
    const sortBy = searchParams.get('sortBy') || 'entryDate';
    const sortOrder = searchParams.get('sortOrder') || 'desc';
    
    // Apply filters
    let filteredTrades = allTrades;
    
    if (symbol) {
      filteredTrades = filteredTrades.filter(
        (t) => t.symbol.toUpperCase() === symbol.toUpperCase()
      );
    }
    
    if (status) {
      filteredTrades = filteredTrades.filter((t) => t.status === status);
    }
    
    if (strategy) {
      filteredTrades = filteredTrades.filter((t) => t.strategy === strategy);
    }
    
    if (startDate) {
      // Start of day in EST
      const start = new Date(`${startDate}T00:00:00-05:00`);
      filteredTrades = filteredTrades.filter(
        (t) => new Date(t.entryDate) >= start
      );
    }
    
    if (endDate) {
      // End of day in EST (23:59:59)
      const end = new Date(`${endDate}T23:59:59-05:00`);
      filteredTrades = filteredTrades.filter(
        (t) => new Date(t.entryDate) <= end
      );
    }
    
    if (tags && tags.length > 0) {
      filteredTrades = filteredTrades.filter((t) =>
        tags.some((tag) => t.tags?.includes(tag))
      );
    }
    
    // Sort trades
    filteredTrades.sort((a, b) => {
      let comparison = 0;
      
      switch (sortBy) {
        case 'entryDate':
          comparison = new Date(a.entryDate).getTime() - new Date(b.entryDate).getTime();
          break;
        case 'exitDate':
          const aExit = a.exitDate ? new Date(a.exitDate).getTime() : 0;
          const bExit = b.exitDate ? new Date(b.exitDate).getTime() : 0;
          comparison = aExit - bExit;
          break;
        case 'netPnL':
          comparison = (a.netPnL || 0) - (b.netPnL || 0);
          break;
        case 'symbol':
          comparison = a.symbol.localeCompare(b.symbol);
          break;
        default:
          comparison = new Date(a.entryDate).getTime() - new Date(b.entryDate).getTime();
      }
      
      return sortOrder === 'asc' ? comparison : -comparison;
    });
    
    const total = filteredTrades.length;
    const startIndex = (page - 1) * perPage;
    const endIndex = startIndex + perPage;
    const paginatedTrades = filteredTrades.slice(startIndex, endIndex);
    
    const response: TradeListResponse = {
      trades: paginatedTrades,
      total,
      page,
      perPage,
      hasMore: endIndex < total,
    };
    
    return NextResponse.json({ success: true, data: response });
    
  } catch (error) {
    console.error('Error fetching trades:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch trades' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/trades
 * 
 * Creates a new trade entry
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await auth();
    
    if (!session?.user?.email) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    const userId = getUserId(session.user.email);
    const body: CreateTradeRequest = await request.json();
    
    // Validation
    if (!body.symbol || !body.side || !body.entryPrice || !body.shares) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: symbol, side, entryPrice, shares' },
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
    
    const now = getNowInEST();
    
    // Create trade object
    const newTrade: Trade = {
      id: generateId(),
      userId: userId, // Set to the authenticated user's ID
      symbol: body.symbol.toUpperCase(),
      side: body.side,
      status: TradeStatus.OPEN,
      strategy: body.strategy || Strategy.OTHER,
      entryDate: body.entryDate || now,
      entryPrice: body.entryPrice,
      shares: body.shares,
      entryNotes: body.entryNotes,
      stopLoss: body.stopLoss,
      takeProfit: body.takeProfit,
      riskAmount: body.riskAmount,
      emotion: body.emotion,
      tags: body.tags || [],
      createdAt: now,
      updatedAt: now,
    };
    
    // Calculate risk percent if risk amount provided
    if (body.riskAmount && body.entryPrice > 0) {
      newTrade.riskPercent = (body.riskAmount / (body.entryPrice * body.shares)) * 100;
    }
    
    // Store trade in Redis
    await saveUserTrade(userId, newTrade);
    
    return NextResponse.json(
      { success: true, data: newTrade },
      { status: 201 }
    );
    
  } catch (error) {
    console.error('Error creating trade:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create trade' },
      { status: 500 }
    );
  }
}