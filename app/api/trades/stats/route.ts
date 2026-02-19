/**
 * Trade Statistics API
 * 
 * GET /api/trades/stats - Get trading performance statistics
 */

import { NextRequest, NextResponse } from 'next/server';
import type { Trade, Metrics, DailySummary, TradeStatsResponse } from '@/types/trading';

// Reference to the trades store
declare global {
  var tradesStore: Map<string, Trade> | undefined;
}

const tradesStore: Map<string, Trade> = global.tradesStore || new Map();
if (!global.tradesStore) {
  global.tradesStore = tradesStore;
}

/**
 * GET /api/trades/stats
 * 
 * Query Parameters:
 * - userId: string (required)
 * - period: 'day' | 'week' | 'month' | 'year' | 'all' (default: 'month')
 * - startDate: ISO date (optional, overrides period)
 * - endDate: ISO date (optional, overrides period)
 * - symbol: string (optional filter)
 * - strategy: string (optional filter)
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    
    // Required parameters
    const userId = searchParams.get('userId');
    
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'userId is required' },
        { status: 400 }
      );
    }
    
    // Get date range
    const period = (searchParams.get('period') as Metrics['period']) || 'month';
    let startDate: Date;
    let endDate: Date = new Date();
    
    const customStartDate = searchParams.get('startDate');
    const customEndDate = searchParams.get('endDate');
    
    if (customStartDate && customEndDate) {
      startDate = new Date(customStartDate);
      endDate = new Date(customEndDate);
    } else {
      // Calculate based on period
      startDate = new Date();
      switch (period) {
        case 'day':
          startDate.setHours(0, 0, 0, 0);
          break;
        case 'week':
          startDate.setDate(startDate.getDate() - 7);
          break;
        case 'month':
          startDate.setMonth(startDate.getMonth() - 1);
          break;
        case 'year':
          startDate.setFullYear(startDate.getFullYear() - 1);
          break;
        case 'all':
          startDate = new Date('2000-01-01');
          break;
      }
    }
    
    // Optional filters
    const symbol = searchParams.get('symbol');
    const strategy = searchParams.get('strategy');
    
    // Get all user trades in date range
    let trades = Array.from(tradesStore.values()).filter((trade) => {
      if (trade.userId !== userId) return false;
      
      const tradeDate = new Date(trade.entryDate);
      if (tradeDate < startDate || tradeDate > endDate) return false;
      
      if (symbol && trade.symbol.toUpperCase() !== symbol.toUpperCase()) return false;
      if (strategy && trade.strategy !== strategy) return false;
      
      return true;
    });
    
    // Sort by entry date
    trades.sort((a, b) => new Date(a.entryDate).getTime() - new Date(b.entryDate).getTime());
    
    // Calculate metrics
    const metrics = calculateMetrics(trades, period, startDate, endDate);
    const dailySummaries = calculateDailySummaries(trades);
    
    const response: TradeStatsResponse = {
      period,
      metrics,
      dailySummaries,
    };
    
    return NextResponse.json({ success: true, data: response });
    
  } catch (error) {
    console.error('Error calculating trade stats:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to calculate statistics' },
      { status: 500 }
    );
  }
}

function calculateMetrics(
  trades: Trade[],
  period: Metrics['period'],
  startDate: Date,
  endDate: Date
): Metrics {
  const closedTrades = trades.filter((t) => t.status === 'CLOSED' && t.netPnL !== undefined);
  
  const totalTrades = trades.length;
  const winningTrades = closedTrades.filter((t) => (t.netPnL || 0) > 0).length;
  const losingTrades = closedTrades.filter((t) => (t.netPnL || 0) < 0).length;
  const breakevenTrades = closedTrades.filter((t) => (t.netPnL || 0) === 0).length;
  
  const grossProfit = closedTrades
    .filter((t) => (t.netPnL || 0) > 0)
    .reduce((sum, t) => sum + (t.netPnL || 0), 0);
  
  const grossLoss = Math.abs(
    closedTrades
      .filter((t) => (t.netPnL || 0) < 0)
      .reduce((sum, t) => sum + (t.netPnL || 0), 0)
  );
  
  const netProfit = closedTrades.reduce((sum, t) => sum + (t.netPnL || 0), 0);
  
  const wins = closedTrades.filter((t) => (t.netPnL || 0) > 0).map((t) => t.netPnL || 0);
  const losses = closedTrades
    .filter((t) => (t.netPnL || 0) < 0)
    .map((t) => Math.abs(t.netPnL || 0));
  
  const averageWin = wins.length > 0 ? wins.reduce((a, b) => a + b, 0) / wins.length : 0;
  const averageLoss = losses.length > 0 ? losses.reduce((a, b) => a + b, 0) / losses.length : 0;
  const averageTrade = closedTrades.length > 0 
    ? netProfit / closedTrades.length 
    : 0;
  
  const largestWin = wins.length > 0 ? Math.max(...wins) : 0;
  const largestLoss = losses.length > 0 ? Math.max(...losses) : 0;
  
  const winRate = closedTrades.length > 0 
    ? (winningTrades / closedTrades.length) * 100 
    : 0;
  
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;
  
  // Calculate streaks
  let currentWinStreak = 0;
  let currentLossStreak = 0;
  let maxWinStreak = 0;
  let maxLossStreak = 0;
  let tempWinStreak = 0;
  let tempLossStreak = 0;
  
  for (const trade of closedTrades) {
    const pnl = trade.netPnL || 0;
    if (pnl > 0) {
      tempWinStreak++;
      tempLossStreak = 0;
      maxWinStreak = Math.max(maxWinStreak, tempWinStreak);
    } else if (pnl < 0) {
      tempLossStreak++;
      tempWinStreak = 0;
      maxLossStreak = Math.max(maxLossStreak, tempLossStreak);
    }
  }
  
  // Current streak
  for (let i = closedTrades.length - 1; i >= 0; i--) {
    const pnl = closedTrades[i].netPnL || 0;
    if (pnl > 0) {
      if (currentLossStreak === 0) currentWinStreak++;
      else break;
    } else if (pnl < 0) {
      if (currentWinStreak === 0) currentLossStreak++;
      else break;
    } else {
      break;
    }
  }
  
  // Calculate max drawdown
  let maxDrawdown = 0;
  let peak = 0;
  let runningPnl = 0;
  
  for (const trade of closedTrades) {
    runningPnl += trade.netPnL || 0;
    if (runningPnl > peak) {
      peak = runningPnl;
    }
    const drawdown = peak - runningPnl;
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
    }
  }
  
  const maxDrawdownPercent = peak > 0 ? (maxDrawdown / peak) * 100 : 0;
  
  return {
    id: crypto.randomUUID(),
    userId: 'default-user', // Should match the request
    period,
    startDate: startDate.toISOString().split('T')[0],
    endDate: endDate.toISOString().split('T')[0],
    totalTrades,
    winningTrades,
    losingTrades,
    breakevenTrades,
    grossProfit,
    grossLoss,
    netProfit,
    totalFees: 0, // Would need to track fees separately
    winRate: Number(winRate.toFixed(2)),
    profitFactor: Number(profitFactor.toFixed(2)),
    averageWin: Number(averageWin.toFixed(2)),
    averageLoss: Number(averageLoss.toFixed(2)),
    averageTrade: Number(averageTrade.toFixed(2)),
    largestWin: Number(largestWin.toFixed(2)),
    largestLoss: Number(largestLoss.toFixed(2)),
    maxDrawdown: Number(maxDrawdown.toFixed(2)),
    maxDrawdownPercent: Number(maxDrawdownPercent.toFixed(2)),
    sharpeRatio: undefined, // Would need risk-free rate calculation
    currentWinStreak,
    currentLossStreak,
    maxWinStreak,
    maxLossStreak,
    strategyPerformance: [], // Would need aggregation by strategy
    hourlyPerformance: [],
    weekdayPerformance: [],
    calculatedAt: new Date().toISOString(),
  };
}

function calculateDailySummaries(trades: Trade[]): DailySummary[] {
  const summariesByDate = new Map<string, DailySummary>();
  
  for (const trade of trades) {
    const date = trade.entryDate.split('T')[0];
    
    if (!summariesByDate.has(date)) {
      summariesByDate.set(date, {
        id: crypto.randomUUID(),
        userId: trade.userId,
        date,
        totalTrades: 0,
        winningTrades: 0,
        losingTrades: 0,
        breakevenTrades: 0,
        grossPnL: 0,
        netPnL: 0,
        fees: 0,
        winRate: 0,
        profitFactor: 0,
        averageWin: 0,
        averageLoss: 0,
        largestWin: 0,
        largestLoss: 0,
        maxDrawdown: 0,
        riskRewardRatio: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
    
    const summary = summariesByDate.get(date)!;
    summary.totalTrades++;
    
    if (trade.status === 'CLOSED' && trade.netPnL !== undefined) {
      summary.netPnL += trade.netPnL;
      
      if (trade.netPnL > 0) {
        summary.winningTrades++;
        summary.largestWin = Math.max(summary.largestWin, trade.netPnL);
      } else if (trade.netPnL < 0) {
        summary.losingTrades++;
        summary.largestLoss = Math.min(summary.largestLoss, trade.netPnL);
      } else {
        summary.breakevenTrades++;
      }
    }
  }
  
  // Calculate derived metrics for each summary
  for (const summary of summariesByDate.values()) {
    const closedTrades = summary.winningTrades + summary.losingTrades + summary.breakevenTrades;
    if (closedTrades > 0) {
      summary.winRate = (summary.winningTrades / closedTrades) * 100;
    }
    
    const grossProfit = summary.netPnL > 0 ? summary.netPnL : 0;
    const grossLoss = summary.netPnL < 0 ? Math.abs(summary.netPnL) : 0;
    summary.profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;
  }
  
  return Array.from(summariesByDate.values()).sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
}
