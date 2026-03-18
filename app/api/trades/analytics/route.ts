import { NextResponse } from 'next/server';
import { getAllTrades } from '@/lib/db/trades-v2';
import { Trade, TradeSide, TradeStatus } from '@/types/trading';

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
    const closedTrades = trades.filter(t => t.status === TradeStatus.CLOSED);
    
    // Group by symbol
    const bySymbol: Record<string, { 
      trades: Trade[]; 
      wins: number; 
      losses: number; 
      pnl: number;
      longs: number;
      shorts: number;
    }> = {};
    
    trades.forEach(trade => {
      if (!bySymbol[trade.symbol]) {
        bySymbol[trade.symbol] = { 
          trades: [], 
          wins: 0, 
          losses: 0, 
          pnl: 0,
          longs: 0,
          shorts: 0
        };
      }
      bySymbol[trade.symbol].trades.push(trade);
      
      if (trade.side === TradeSide.LONG) {
        bySymbol[trade.symbol].longs++;
      } else {
        bySymbol[trade.symbol].shorts++;
      }
      
      if (trade.netPnL !== undefined) {
        bySymbol[trade.symbol].pnl += trade.netPnL;
        if (trade.netPnL > 0) {
          bySymbol[trade.symbol].wins++;
        } else if (trade.netPnL < 0) {
          bySymbol[trade.symbol].losses++;
        }
      }
    });
    
    // Group by date
    const byDate: Record<string, number> = {};
    trades.forEach(trade => {
      const date = trade.entryDate.split('T')[0];
      if (!byDate[date]) byDate[date] = 0;
      byDate[date] += trade.netPnL || 0;
    });
    const uniqueDays = Object.keys(byDate).length;
    
    // Group by day of week
    const byDayOfWeek: Record<string, { trades: number; pnl: number; wins: number; losses: number }> = {
      'Sunday': { trades: 0, pnl: 0, wins: 0, losses: 0 },
      'Monday': { trades: 0, pnl: 0, wins: 0, losses: 0 },
      'Tuesday': { trades: 0, pnl: 0, wins: 0, losses: 0 },
      'Wednesday': { trades: 0, pnl: 0, wins: 0, losses: 0 },
      'Thursday': { trades: 0, pnl: 0, wins: 0, losses: 0 },
      'Friday': { trades: 0, pnl: 0, wins: 0, losses: 0 },
      'Saturday': { trades: 0, pnl: 0, wins: 0, losses: 0 },
    };
    
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    
    trades.forEach(trade => {
      const date = new Date(trade.entryDate);
      const dayName = dayNames[date.getDay()];
      byDayOfWeek[dayName].trades++;
      if (trade.netPnL !== undefined) {
        byDayOfWeek[dayName].pnl += trade.netPnL;
        if (trade.netPnL > 0) {
          byDayOfWeek[dayName].wins++;
        } else if (trade.netPnL < 0) {
          byDayOfWeek[dayName].losses++;
        }
      }
    });
    
    // Group by time of day (hour) - extract hour from ISO timestamp with timezone
    const byHour: Record<string, { trades: number; pnl: number; wins: number; losses: number }> = {};
    trades.forEach(trade => {
      // Parse the ISO timestamp to extract hour in the original timezone
      // Format: 2026-02-20T16:00:00-05:00
      const timeMatch = trade.entryDate.match(/T(\d{2}):\d{2}:\d{2}/);
      if (timeMatch) {
        const hour = parseInt(timeMatch[1], 10);
        const hourKey = `${hour}:00`;
        if (!byHour[hourKey]) {
          byHour[hourKey] = { trades: 0, pnl: 0, wins: 0, losses: 0 };
        }
        byHour[hourKey].trades++;
        if (trade.netPnL !== undefined) {
          byHour[hourKey].pnl += trade.netPnL;
          if (trade.netPnL > 0) {
            byHour[hourKey].wins++;
          } else if (trade.netPnL < 0) {
            byHour[hourKey].losses++;
          }
        }
      }
    });
    
    // Overall stats
    const totalPnL = trades.reduce((sum, t) => sum + (t.netPnL || 0), 0);
    const totalWins = closedTrades.filter(t => (t.netPnL || 0) > 0).length;
    const totalLosses = closedTrades.filter(t => (t.netPnL || 0) < 0).length;
    const breakeven = closedTrades.filter(t => (t.netPnL || 0) === 0).length;
    const winRate = totalWins + totalLosses > 0 ? (totalWins / (totalWins + totalLosses)) * 100 : 0;
    
    // Best and worst symbols
    const sortedSymbols = Object.entries(bySymbol)
      .map(([symbol, data]) => ({ 
        symbol, 
        trades: data.trades.length,
        wins: data.wins,
        losses: data.losses,
        pnl: data.pnl,
        longs: data.longs,
        shorts: data.shorts
      }))
      .sort((a, b) => b.pnl - a.pnl);
    
    // Strategy performance
    const byStrategy: Record<string, { trades: number; pnl: number; wins: number; losses: number }> = {};
    trades.forEach(trade => {
      const strategy = trade.strategy || 'OTHER';
      if (!byStrategy[strategy]) {
        byStrategy[strategy] = { trades: 0, pnl: 0, wins: 0, losses: 0 };
      }
      byStrategy[strategy].trades++;
      if (trade.netPnL !== undefined) {
        byStrategy[strategy].pnl += trade.netPnL;
        if (trade.netPnL > 0) {
          byStrategy[strategy].wins++;
        } else if (trade.netPnL < 0) {
          byStrategy[strategy].losses++;
        }
      }
    });
    
    const analytics = {
      overview: {
        totalTrades,
        closedTrades: closedTrades.length,
        uniqueDays,
        totalPnL,
        winRate: Number(winRate.toFixed(2)),
        wins: totalWins,
        losses: totalLosses,
        breakeven,
        avgTradesPerDay: uniqueDays > 0 ? totalTrades / uniqueDays : 0,
        avgPnLPerTrade: closedTrades.length > 0 ? totalPnL / closedTrades.length : 0
      },
      bySymbol: sortedSymbols,
      byDayOfWeek,
      byHour,
      byStrategy
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
