import { NextResponse } from 'next/server';
import { getAllTrades } from '@/lib/db/trades-v2';

export async function GET() {
  try {
    const trades = await getAllTrades();
    
    if (trades.length === 0) {
      return NextResponse.json({
        success: true,
        dailyStats: []
      });
    }
    
    // Group trades by date
    const byDate: Record<string, typeof trades> = {};
    
    trades.forEach(trade => {
      const date = trade.entryDate.split('T')[0];
      if (!byDate[date]) byDate[date] = [];
      byDate[date].push(trade);
    });
    
    // Calculate daily stats
    const dailyStats = Object.entries(byDate).map(([date, dayTrades]) => {
      const bySymbol: Record<string, typeof trades> = {};
      
      // Group by symbol for PnL calculation
      dayTrades.forEach(trade => {
        if (!bySymbol[trade.symbol]) bySymbol[trade.symbol] = [];
        bySymbol[trade.symbol].push(trade);
      });
      
      let totalPnL = 0;
      let wins = 0;
      let losses = 0;
      
      Object.values(bySymbol).forEach(symbolTrades => {
        const longs = symbolTrades.filter(t => t.side === 'LONG');
        const shorts = symbolTrades.filter(t => t.side === 'SHORT');
        
        // Calculate based on netPnL if available
        const symbolPnL = symbolTrades.reduce((sum, t) => sum + (t.netPnL || 0), 0);
        totalPnL += symbolPnL;
        
        if (symbolPnL > 0) wins++;
        else if (symbolPnL < 0) losses++;
      });
      
      const totalTrades = wins + losses;
      
      return {
        date,
        pnl: totalPnL,
        trades: dayTrades.length,
        winRate: totalTrades > 0 ? Math.round((wins / totalTrades) * 100) : undefined
      };
    }).sort((a, b) => a.date.localeCompare(b.date));
    
    return NextResponse.json({
      success: true,
      dailyStats
    });
    
  } catch (error) {
    console.error('Daily stats error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch daily stats' },
      { status: 500 }
    );
  }
}
