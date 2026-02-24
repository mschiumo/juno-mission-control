/**
 * CSV Export API
 * 
 * GET /api/trades/export - Export trades to CSV
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth-config';
import type { Trade } from '@/types/trading';
import { getUserTrades, getUserId } from '@/lib/db/user-data';

/**
 * GET /api/trades/export
 * 
 * Export trades to CSV format
 * 
 * Query Parameters:
 * - format: 'csv' | 'json' (default: 'csv')
 * - startDate: ISO date (optional filter)
 * - endDate: ISO date (optional filter)
 * - status: 'OPEN' | 'CLOSED' | 'PARTIAL' (optional filter)
 * - symbol: string (optional filter)
 * - includeJournal: boolean (default: false)
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
    
    // Optional filters
    const format = searchParams.get('format') || 'csv';
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const status = searchParams.get('status') as Trade['status'] | null;
    const symbol = searchParams.get('symbol');
    const includeJournal = searchParams.get('includeJournal') === 'true';
    
    // Get all trades from Redis for this user
    let trades = await getUserTrades(userId);
    
    // Apply filters
    if (startDate) {
      const start = new Date(startDate);
      trades = trades.filter((t) => t.entryDate && new Date(t.entryDate) >= start);
    }
    
    if (endDate) {
      const end = new Date(endDate);
      trades = trades.filter((t) => t.entryDate && new Date(t.entryDate) <= end);
    }
    
    if (status) {
      trades = trades.filter((t) => t.status === status);
    }
    
    if (symbol) {
      trades = trades.filter(
        (t) => t.symbol.toUpperCase() === symbol.toUpperCase()
      );
    }
    
    // Sort by entry date
    trades.sort(
      (a, b) => {
        const dateA = a.entryDate ? new Date(a.entryDate).getTime() : 0;
        const dateB = b.entryDate ? new Date(b.entryDate).getTime() : 0;
        return dateA - dateB;
      }
    );
    
    if (format === 'json') {
      return NextResponse.json({ success: true, data: trades });
    }
    
    // Generate CSV
    const csv = generateCSV(trades, includeJournal);
    
    // Return as downloadable file
    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="trades_${new Date().toISOString().split('T')[0]}.csv"`,
      },
    });
    
  } catch (error) {
    console.error('Error exporting trades:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to export trades' },
      { status: 500 }
    );
  }
}

function generateCSV(trades: Trade[], includeJournal: boolean): string {
  // Standard columns
  const columns = [
    'id',
    'symbol',
    'side',
    'status',
    'strategy',
    'entryDate',
    'entryPrice',
    'shares',
    'exitDate',
    'exitPrice',
    'grossPnL',
    'netPnL',
    'returnPercent',
    'stopLoss',
    'takeProfit',
    'riskAmount',
    'riskPercent',
    'emotion',
    'setupQuality',
    'mistakes',
    'lessons',
    'tags',
    'entryNotes',
    'exitNotes',
    'createdAt',
    'updatedAt',
  ];
  
  // Journal columns (if requested)
  if (includeJournal) {
    columns.push(
      'preTradeAnalysis',
      'postTradeReview',
      'convictionLevel',
      'followedPlan',
      'wouldTakeAgain'
    );
  }
  
  // Header row
  const header = columns.join(',');
  
  // Data rows
  const rows = trades.map((trade) => {
    const values = columns.map((col) => {
      let value: unknown;
      
      switch (col) {
        case 'id':
          value = trade.id;
          break;
        case 'symbol':
          value = trade.symbol;
          break;
        case 'side':
          value = trade.side;
          break;
        case 'status':
          value = trade.status;
          break;
        case 'strategy':
          value = trade.strategy;
          break;
        case 'entryDate':
          value = trade.entryDate;
          break;
        case 'entryPrice':
          value = trade.entryPrice;
          break;
        case 'shares':
          value = trade.shares;
          break;
        case 'exitDate':
          value = trade.exitDate || '';
          break;
        case 'exitPrice':
          value = trade.exitPrice !== undefined ? trade.exitPrice : '';
          break;
        case 'grossPnL':
          value = trade.grossPnL !== undefined ? trade.grossPnL : '';
          break;
        case 'netPnL':
          value = trade.netPnL !== undefined ? trade.netPnL : '';
          break;
        case 'returnPercent':
          value = trade.returnPercent !== undefined ? trade.returnPercent : '';
          break;
        case 'stopLoss':
          value = trade.stopLoss !== undefined ? trade.stopLoss : '';
          break;
        case 'takeProfit':
          value = trade.takeProfit !== undefined ? trade.takeProfit : '';
          break;
        case 'riskAmount':
          value = trade.riskAmount !== undefined ? trade.riskAmount : '';
          break;
        case 'riskPercent':
          value = trade.riskPercent !== undefined ? trade.riskPercent : '';
          break;
        case 'emotion':
          value = trade.emotion || '';
          break;
        case 'setupQuality':
          value = trade.setupQuality || '';
          break;
        case 'mistakes':
          value = trade.mistakes || '';
          break;
        case 'lessons':
          value = trade.lessons || '';
          break;
        case 'tags':
          value = trade.tags ? trade.tags.join(';') : '';
          break;
        case 'entryNotes':
          value = trade.entryNotes || '';
          break;
        case 'exitNotes':
          value = trade.exitNotes || '';
          break;
        case 'createdAt':
          value = trade.createdAt;
          break;
        case 'updatedAt':
          value = trade.updatedAt;
          break;
        default:
          value = '';
      }
      
      // Escape CSV value
      return escapeCSV(String(value));
    });
    
    return values.join(',');
  });
  
  return [header, ...rows].join('\n');
}

function escapeCSV(value: string): string {
  // If value contains comma, newline, or quote, wrap in quotes and escape internal quotes
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}