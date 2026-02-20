import { NextResponse } from 'next/server';
import { getAllTrades } from '@/lib/db/trades';

export async function GET() {
  try {
    const trades = await getAllTrades();
    
    if (trades.length === 0) {
      return NextResponse.json({
        success: true,
        analytics: null,
        message: 'No trade data available'
      });
    }
    
    // Calculate analytics
    const totalTrades = trades.length;
    
    // Group by symbol
    const bySymbol: Record<string, { trades: typeof trades; wins: number; losses: number; pnl: number }> = {};
    trades.forEach(trade => {
      if (!bySymbol[trade.symbol]) {
        bySymbol[trade.symbol] = { trades: [], wins: 0, losses: 0, pnl: 0 };
      }
      bySymbol[trade.symbol].trades.push(trade);
    });
    
    // Calculate PnL per symbol
    Object.entries(bySymbol).forEach(([symbol, data]) => {
      const buys = data.trades.filter(t => t.side === 'BUY');
      const sells = data.trades.filter(t => t.side === 'SELL');
      
      if (buys.length > 0 && sells.length > 0) {
        const buyValue = buys.reduce((sum, t) => sum + t.price * t.quantity, 0);
        const buyQty = buys.reduce((sum, t) => sum + t.quantity, 0);
        const avgBuy = buyQty > 0 ? buyValue / buyQty : 0;
        
        const sellValue = sells.reduce((sum, t) => sum + t.price * t.quantity, 0);
        const sellQty = sells.reduce((sum, t) => sum + t.quantity, 0);
        const avgSell = sellQty > 0 ? sellValue / sellQty : 0;
        
        const matchedQty = Math.min(buyQty, sellQty);
        data.pnl = (avgSell - avgBuy) * matchedQty;
        
        if (data.pnl > 0) data.wins = 1;
        else if (data.pnl < 0) data.losses = 1;
      }
    });
    
    // Group by date
    const byDate: Record<string, number> = {};
    trades.forEach(trade => {
      if (!byDate[trade.date]) byDate[trade.date] = 0;
    });
    const uniqueDays = Object.keys(byDate).length;
    
    // Group by day of week
    const byDayOfWeek: Record<string, { trades: number; pnl: number }> = {
      'Sunday': { trades: 0, pnl: 0 },
      'Monday': { trades: 0, pnl: 0 },
      'Tuesday': { trades: 0, pnl: 0 },
      'Wednesday': { trades: 0, pnl: 0 },
      'Thursday': { trades: 0, pnl: 0 },
      'Friday': { trades: 0, pnl: 0 },
      'Saturday': { trades: 0, pnl: 0 },
    };
    
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    
    Object.entries(bySymbol).forEach(([symbol, data]) => {
      // Get date from first trade of this symbol
      const firstTrade = data.trades[0];
      if (firstTrade) {
        const date = new Date(firstTrade.date);
        const dayName = dayNames[date.getDay()];
        byDayOfWeek[dayName].trades += data.trades.length;
        byDayOfWeek[dayName].pnl += data.pnl;
      }
    });
    
    // Group by time of day (hour)
    const byHour: Record<string, { trades: number; pnl: number }> = {};
    trades.forEach(trade => {
      const hour = parseInt(trade.time.split(':')[0]);
      const hourKey = `${hour}:00`;
      if (!byHour[hourKey]) {
        byHour[hourKey] = { trades: 0, pnl: 0 };
      }
      byHour[hourKey].trades++;
    });
    
    // Add PnL to hours
    Object.entries(bySymbol).forEach(([symbol, data]) => {
      const firstTrade = data.trades[0];
      if (firstTrade) {
        const hour = parseInt(firstTrade.time.split(':')[0]);
        const hourKey = `${hour}:00`;
        if (byHour[hourKey]) {
          byHour[hourKey].pnl += data.pnl;
        }
      }
    });
    
    // Overall stats
    const totalPnL = Object.values(bySymbol).reduce((sum, s) => sum + s.pnl, 0);
    const totalWins = Object.values(bySymbol).reduce((sum, s) => sum + s.wins, 0);
    const totalLosses = Object.values(bySymbol).reduce((sum, s) => sum + s.losses, 0);
    const winRate = totalWins + totalLosses > 0 ? (totalWins / (totalWins + totalLosses)) * 100 : 0;
    
    // Best and worst symbols
    const sortedSymbols = Object.entries(bySymbol)
      .map(([symbol, data]) => ({ symbol, ...data }))
      .sort((a, b) => b.pnl - a.pnl);
    
    const analytics = {
      overview: {
        totalTrades,
        uniqueDays,
        totalPnL,
        winRate,
        wins: totalWins,
        losses: totalLosses,
        avgTradesPerDay: uniqueDays > 0 ? totalTrades / uniqueDays : 0
      },
      bySymbol: sortedSymbols,
      byDayOfWeek,
      byHour
    };
    
    return NextResponse.json({
      success: true,
      analytics
    });
    
  } catch (error) {
    console.error('Error calculating analytics:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to calculate analytics' 
      },
      { status: 500 }
    );
  }
}
