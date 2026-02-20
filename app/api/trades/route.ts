import { NextResponse } from 'next/server';
import { calculateDailyStats, getAllTrades, getTradesByDate } from '@/lib/db/trades';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');
    const all = searchParams.get('all') === 'true';
    
    if (date) {
      // Get trades for specific date
      const trades = await getTradesByDate(date);
      return NextResponse.json({
        success: true,
        trades,
        date
      });
    }
    
    if (all) {
      // Get all trades
      const trades = await getAllTrades();
      return NextResponse.json({
        success: true,
        trades
      });
    }
    
    // Get all daily stats for calendar
    const dailyStats = await calculateDailyStats();
    const allTrades = await getAllTrades();
    
    return NextResponse.json({
      success: true,
      dailyStats,
      totalTrades: allTrades.length,
      uniqueDays: dailyStats.length
    });
    
  } catch (error) {
    console.error('Error fetching trades:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to fetch trades' 
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    
    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Trade ID required' },
        { status: 400 }
      );
    }
    
    const { deleteTrade } = await import('@/lib/db/trades');
    await deleteTrade(id);
    
    return NextResponse.json({
      success: true,
      message: 'Trade deleted'
    });
    
  } catch (error) {
    console.error('Error deleting trade:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to delete trade' 
      },
      { status: 500 }
    );
  }
}
