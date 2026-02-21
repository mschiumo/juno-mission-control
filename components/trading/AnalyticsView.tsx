'use client';

import { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { TrendingUp, TrendingDown, Calendar, DollarSign, Percent, BarChart3, ChevronDown } from 'lucide-react';
import { Trade, TradeStatus, TradeSide } from '@/types/trading';

type DateRange = 'thisMonth' | 'lastMonth' | 'last30Days' | 'allTime';

interface DateRangeOption {
  value: DateRange;
  label: string;
}

const DATE_RANGE_OPTIONS: DateRangeOption[] = [
  { value: 'thisMonth', label: 'This Month' },
  { value: 'lastMonth', label: 'Last Month' },
  { value: 'last30Days', label: 'Last 30 Days' },
  { value: 'allTime', label: 'All Time' },
];

interface AnalyticsData {
  overview: {
    totalTrades: number;
    closedTrades: number;
    uniqueDays: number;
    totalPnL: number;
    winRate: number;
    wins: number;
    losses: number;
    breakeven: number;
    avgTradesPerDay: number;
    avgPnLPerTrade: number;
  };
  bySymbol: Array<{
    symbol: string;
    trades: number;
    wins: number;
    losses: number;
    pnl: number;
    longs: number;
    shorts: number;
  }>;
  byDayOfWeek: Record<string, { trades: number; pnl: number; wins: number; losses: number }>;
  byHour: Record<string, { trades: number; pnl: number; wins: number; losses: number }>;
  byStrategy: Record<string, { trades: number; pnl: number; wins: number; losses: number }>;
}

function getDateRangeForFilter(range: DateRange): { startDate: Date | null; endDate: Date | null } {
  const now = new Date();
  const estOffset = -5 * 60 * 60 * 1000; // EST offset in milliseconds
  
  switch (range) {
    case 'thisMonth': {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      return { startDate: start, endDate: now };
    }
    case 'lastMonth': {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0);
      return { startDate: start, endDate: end };
    }
    case 'last30Days': {
      const start = new Date(now);
      start.setDate(start.getDate() - 30);
      return { startDate: start, endDate: now };
    }
    case 'allTime':
    default:
      return { startDate: null, endDate: null };
  }
}

function filterTradesByDateRange(trades: Trade[], range: DateRange): Trade[] {
  const { startDate, endDate } = getDateRangeForFilter(range);
  
  if (!startDate && !endDate) return trades;
  
  return trades.filter(trade => {
    const tradeDate = new Date(trade.entryDate);
    
    if (startDate && tradeDate < startDate) return false;
    if (endDate && tradeDate > endDate) return false;
    
    return true;
  });
}

function calculateAnalytics(trades: Trade[]): AnalyticsData | null {
  if (trades.length === 0) return null;
  
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
  
  // Group by time of day (hour)
  const byHour: Record<string, { trades: number; pnl: number; wins: number; losses: number }> = {};
  trades.forEach(trade => {
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
  
  // Sort symbols by PnL
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
  
  return {
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
}

export default function AnalyticsView() {
  const searchParams = useSearchParams();
  const router = useRouter();
  
  // Initialize from URL param or default to 'thisMonth'
  const initialRange = (searchParams.get('range') as DateRange) || 'thisMonth';
  const [selectedRange, setSelectedRange] = useState<DateRange>(initialRange);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  
  const [trades, setTrades] = useState<Trade[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Update URL when range changes
  useEffect(() => {
    const params = new URLSearchParams(searchParams);
    params.set('range', selectedRange);
    router.replace(`?${params.toString()}`, { scroll: false });
  }, [selectedRange, router, searchParams]);

  useEffect(() => {
    fetchTrades();
  }, []);

  const fetchTrades = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/trades?perPage=10000'); // Get all trades
      const data = await response.json();
      
      if (data.success && data.data) {
        setTrades(data.data.trades);
      }
    } catch (error) {
      console.error('Error fetching trades:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Filter trades and calculate analytics based on selected range
  const analytics = useMemo(() => {
    const filteredTrades = filterTradesByDateRange(trades, selectedRange);
    return calculateAnalytics(filteredTrades);
  }, [trades, selectedRange]);

  const handleRangeChange = (range: DateRange) => {
    setSelectedRange(range);
    setIsDropdownOpen(false);
  };

  const selectedLabel = DATE_RANGE_OPTIONS.find(opt => opt.value === selectedRange)?.label || 'This Month';

  if (isLoading) {
    return (
      <div className="p-8 bg-[#161b22] border border-[#30363d] rounded-xl text-center">
        <div className="w-8 h-8 border-2 border-[#F97316]/30 border-t-[#F97316] rounded-full animate-spin mx-auto mb-4" />
        <p className="text-[#8b949e]">Loading analytics...</p>
      </div>
    );
  }

  if (!analytics) {
    return (
      <div className="space-y-6">
        {/* Date Range Filter */}
        <div className="flex justify-end">
          <div className="relative">
            <button
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className="flex items-center gap-2 px-4 py-2 bg-[#161b22] border border-[#30363d] rounded-lg text-white hover:border-[#58a6ff] transition-colors"
            >
              <Calendar className="w-4 h-4 text-[#8b949e]" />
              <span>{selectedLabel}</span>
              <ChevronDown className={`w-4 h-4 text-[#8b949e] transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
            </button>
            
            {isDropdownOpen && (
              <div className="absolute right-0 mt-2 w-48 bg-[#161b22] border border-[#30363d] rounded-lg shadow-lg z-10">
                {DATE_RANGE_OPTIONS.map(option => (
                  <button
                    key={option.value}
                    onClick={() => handleRangeChange(option.value)}
                    className={`w-full text-left px-4 py-2 text-sm hover:bg-[#21262d] transition-colors first:rounded-t-lg last:rounded-b-lg ${
                      selectedRange === option.value ? 'text-[#58a6ff] bg-[#58a6ff]/10' : 'text-white'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="p-8 bg-[#161b22] border border-[#30363d] rounded-xl text-center">
          <BarChart3 className="w-12 h-12 text-[#8b949e] mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-white mb-2">No Data Yet</h3>
          <p className="text-[#8b949e]">No trades found for the selected date range.</p>
        </div>
      </div>
    );
  }

  const { overview, bySymbol, byDayOfWeek } = analytics;

  return (
    <div className="space-y-6">
      {/* Date Range Filter */}
      <div className="flex justify-end">
        <div className="relative">
          <button
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className="flex items-center gap-2 px-4 py-2 bg-[#161b22] border border-[#30363d] rounded-lg text-white hover:border-[#58a6ff] transition-colors"
          >
            <Calendar className="w-4 h-4 text-[#8b949e]" />
            <span>{selectedLabel}</span>
            <ChevronDown className={`w-4 h-4 text-[#8b949e] transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
          </button>
          
          {isDropdownOpen && (
            <div className="absolute right-0 mt-2 w-48 bg-[#161b22] border border-[#30363d] rounded-lg shadow-lg z-10">
              {DATE_RANGE_OPTIONS.map(option => (
                <button
                  key={option.value}
                  onClick={() => handleRangeChange(option.value)}
                  className={`w-full text-left px-4 py-2 text-sm hover:bg-[#21262d] transition-colors first:rounded-t-lg last:rounded-b-lg ${
                    selectedRange === option.value ? 'text-[#58a6ff] bg-[#58a6ff]/10' : 'text-white'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Overview Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard 
          title="Total PnL" 
          value={`${overview.totalPnL >= 0 ? '+' : ''}$${overview.totalPnL.toFixed(2)}`}
          icon={DollarSign}
          color={overview.totalPnL >= 0 ? 'green' : 'red'}
        />
        <StatCard 
          title="Win Rate" 
          value={`${overview.winRate.toFixed(1)}%`}
          icon={Percent}
          color={overview.winRate >= 50 ? 'green' : 'yellow'}
        />
        <StatCard 
          title="Total Trades" 
          value={overview.totalTrades.toString()}
          icon={BarChart3}
          color="blue"
        />
        <StatCard 
          title="W/L" 
          value={`${overview.wins}W / ${overview.losses}L`}
          icon={overview.wins > overview.losses ? TrendingUp : TrendingDown}
          color={overview.wins > overview.losses ? 'green' : 'red'}
        />
      </div>

      {/* By Symbol */}
      <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Performance by Symbol</h3>
        
        <div className="space-y-3">
          {bySymbol.map(({ symbol, trades, wins, losses, pnl }) => (
            <div key={symbol} className="flex items-center justify-between p-3 bg-[#0d1117] rounded-lg">
              <div className="flex items-center gap-4">
                <span className="font-semibold text-white w-16">{symbol}</span>
                <span className="text-sm text-[#8b949e]">{trades} trades</span>
                <span className="text-sm">
                  <span className="text-[#3fb950]">{wins}W</span>
                  <span className="text-[#8b949e]"> / </span>
                  <span className="text-[#f85149]">{losses}L</span>
                </span>
              </div>
              <span className={`font-semibold ${pnl >= 0 ? 'text-[#3fb950]' : 'text-[#f85149]'}`}>
                {pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* By Day of Week */}
      <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-6">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Calendar className="w-5 h-5" />
          Performance by Day of Week
        </h3>
        
        <div className="grid grid-cols-5 gap-2">
          {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].map(day => {
            const data = byDayOfWeek[day];
            const hasTrades = data.trades > 0;
            
            return (
              <div key={day} className={`p-3 rounded-lg text-center ${hasTrades ? 'bg-[#0d1117]' : 'bg-[#161b22]/50'}`}>
                <div className="text-xs text-[#8b949e] mb-1">{day.slice(0, 3)}</div>
                {hasTrades ? (
                  <>
                    <div className="text-lg font-semibold text-white">{data.trades}</div>
                    <div className={`text-xs ${data.pnl >= 0 ? 'text-[#3fb950]' : 'text-[#f85149]'}`}>
                      {data.pnl >= 0 ? '+' : ''}${data.pnl.toFixed(0)}
                    </div>
                  </>
                ) : (
                  <div className="text-lg text-[#30363d]">-</div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function StatCard({ 
  title, 
  value, 
  icon: Icon, 
  color 
}: { 
  title: string; 
  value: string; 
  icon: React.ComponentType<{ className?: string }>; 
  color: 'green' | 'red' | 'yellow' | 'blue';
}) {
  const colorClasses = {
    green: 'text-[#3fb950]',
    red: 'text-[#f85149]',
    yellow: 'text-[#d29922]',
    blue: 'text-[#58a6ff]'
  };
  
  return (
    <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-[#8b949e]">{title}</span>
        <Icon className={`w-5 h-5 ${colorClasses[color]}`} />
      </div>
      <div className="text-2xl font-bold text-white">{value}</div>
    </div>
  );
}
