'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { Calendar, ChevronLeft, ChevronRight, Plus, Upload, TrendingUp, TrendingDown, Info, RefreshCw, ChevronDown, ArrowUpDown, Filter, Download, Trash2, X, CheckSquare, Square } from 'lucide-react';
import { getTodayInEST, parseDateToEST } from '@/lib/date-utils';

interface DayData {
  date: string;
  pnl: number;
  trades: number;
  hasJournal: boolean;
  sharpeRatio?: number;
  avgCost?: number;
  winRate?: number;
}

interface TOSTrade {
  id: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  shares: number;
  entryPrice: number;
  entryDate: string;
  exitPrice?: number;
  exitDate?: string;
  netPnL?: number;
  grossPnL?: number;
  status: 'OPEN' | 'CLOSED';
  orderType?: string;
}

type SortField = 'date' | 'symbol' | 'side' | 'entryPrice' | 'shares';
type SortDirection = 'asc' | 'desc';

export default function CalendarView() {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [dailyStats, setDailyStats] = useState<DayData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedDateTrades, setSelectedDateTrades] = useState<TOSTrade[]>([]);

  // Trades section state
  const [allTrades, setAllTrades] = useState<TOSTrade[]>([]);
  const [tradesExpanded, setTradesExpanded] = useState(false);
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [filterSymbol, setFilterSymbol] = useState('');
  const [filterSide, setFilterSide] = useState<'' | 'LONG' | 'SHORT'>('');
  const [selectedTrades, setSelectedTrades] = useState<Set<string>>(new Set());
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Fetch real data from API
  useEffect(() => {
    fetchDailyStats();
    fetchAllTrades();
  }, []);

  const fetchDailyStats = async () => {
    try {
      setIsLoading(true);
      const response = await fetch(`/api/trades/daily-stats?_t=${Date.now()}`);
      const data = await response.json();
      
      if (data.success && data.dailyStats) {
        setDailyStats(data.dailyStats);
      }
    } catch (error) {
      console.error('Error fetching trades:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchAllTrades = async () => {
    try {
      const response = await fetch('/api/trades?userId=default&perPage=1000');
      const data = await response.json();
      
      if (data.success && data.data && data.data.trades) {
        setAllTrades(data.data.trades);
        setSelectedTrades(new Set());
      }
    } catch (error) {
      console.error('Error fetching all trades:', error);
    }
  };

  const fetchTradesForDate = async (date: string) => {
    try {
      console.log('[DEBUG] fetchTradesForDate called with date:', date);
      
      // Use startDate and endDate for the specific day
      const apiUrl = `/api/trades?userId=default&startDate=${date}&endDate=${date}&perPage=100&_t=${Date.now()}`;
      console.log('[DEBUG] API URL:', apiUrl);
      
      const [tradesRes, journalRes] = await Promise.all([
        fetch(apiUrl),
        fetch(`/api/trades/journal?date=${date}&_t=${Date.now()}`)
      ]);
      
      const tradesData = await tradesRes.json();
      const journalData = await journalRes.json();
      console.log('[DEBUG] API response:', tradesData);
      console.log('[DEBUG] tradesData.success:', tradesData.success);
      console.log('[DEBUG] tradesData.data:', tradesData.data);
      console.log('[DEBUG] tradesData.data?.trades:', tradesData.data?.trades);
      console.log('[DEBUG] tradesData.data?.trades?.length:', tradesData.data?.trades?.length);
      
      if (tradesData.success && tradesData.data && tradesData.data.trades) {
        console.log('[DEBUG] Setting selectedDateTrades with', tradesData.data.trades.length, 'trades');
        setSelectedDateTrades(tradesData.data.trades);
      } else {
        console.log('[DEBUG] No trades found in response, setting empty array');
        setSelectedDateTrades([]);
      }
      
      if (journalData.success && journalData.notes) {
        // Pre-fill journal text if it exists
        // This will be handled by the DayDetailModal component
      }
    } catch (error) {
      console.error('Error fetching trades for date:', error);
    }
  };

  const handleDateClick = (date: string) => {
    console.log('[DEBUG] handleDateClick called with date:', date);
    setSelectedDate(date);
    fetchTradesForDate(date);
  };

  const monthData = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    
    // Create first day in EST to avoid timezone shift
    const firstDay = new Date(`${year}-${String(month + 1).padStart(2, '0')}-01T12:00:00-05:00`);
    const lastDay = new Date(year, month + 1, 0);
    const startPadding = firstDay.getDay(); // 0 = Sunday
    
    const days: (DayData | null)[] = [];
    
    // Padding for days before month starts
    for (let i = 0; i < startPadding; i++) {
      days.push(null);
    }
    
    // Actual days
    for (let day = 1; day <= lastDay.getDate(); day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const dayData = dailyStats.find(d => d.date === dateStr);
      days.push(dayData || { date: dateStr, pnl: 0, trades: 0, hasJournal: false });
    }
    
    return days;
  }, [currentMonth, dailyStats]);

  // Group days by week for weekly totals
  const weeks = useMemo(() => {
    const weeksArray: { days: (DayData | null)[]; weekNum: number; weekTotal: { pnl: number; trades: number } }[] = [];
    let currentWeek: (DayData | null)[] = [];
    let weekNumber = 1;
    
    for (let i = 0; i < monthData.length; i++) {
      currentWeek.push(monthData[i]);
      
      if (currentWeek.length === 7 || i === monthData.length - 1) {
        // Calculate week totals
        const weekTotal = currentWeek.reduce((acc, day) => {
          if (day) {
            acc.pnl += day.pnl;
            acc.trades += day.trades;
          }
          return acc;
        }, { pnl: 0, trades: 0 });
        
        weeksArray.push({
          days: [...currentWeek],
          weekNum: weekNumber,
          weekTotal
        });
        
        currentWeek = [];
        weekNumber++;
      }
    }
    
    return weeksArray;
  }, [monthData]);

  const monthStats = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const monthDays = dailyStats.filter(d => {
      const date = new Date(d.date);
      return date.getFullYear() === year && date.getMonth() === month && d.trades > 0;
    });
    
    const totalPnl = monthDays.reduce((sum, d) => sum + d.pnl, 0);
    const totalTrades = monthDays.reduce((sum, d) => sum + d.trades, 0);
    const winDays = monthDays.filter(d => d.pnl > 0).length;
    const lossDays = monthDays.filter(d => d.pnl < 0).length;
    const avgSharpe = monthDays.length > 0 
      ? monthDays.reduce((sum, d) => sum + (d.sharpeRatio || 0), 0) / monthDays.length 
      : 0;
    
    return { totalPnl, totalTrades, winDays, lossDays, avgSharpe };
  }, [currentMonth, dailyStats]);

  const handleImportSuccess = () => {
    console.log('Import success - refreshing data');
    fetchDailyStats(); // Refresh data after import
    fetchAllTrades(); // Refresh all trades too
  };

  // Debug: Log current state
  useEffect(() => {
    console.log('dailyStats:', dailyStats);
  }, [dailyStats]);

  const navigateMonth = (direction: 'prev' | 'next') => {
    setCurrentMonth(prev => {
      const newDate = new Date(prev);
      if (direction === 'prev') {
        newDate.setMonth(newDate.getMonth() - 1);
      } else {
        newDate.setMonth(newDate.getMonth() + 1);
      }
      return newDate;
    });
  };

  const formatCurrency = (value: number) => {
    const absValue = Math.abs(value);
    if (absValue >= 1000) {
      return `$${(value / 1000).toFixed(1)}k`;
    }
    return `$${value.toFixed(0)}`;
  };

  const getDayColor = (dayData: DayData | null) => {
    if (!dayData || dayData.trades === 0) return 'bg-[#21262d] text-[#8b949e]';
    if (dayData.pnl > 0) return 'bg-[#238636]/20 border-[#238636]/50 text-[#3fb950]';
    return 'bg-[#da3633]/20 border-[#da3633]/50 text-[#f85149]';
  };

  // Trades table handlers
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const filteredTrades = allTrades.filter(trade => {
    const matchesSymbol = !filterSymbol || trade.symbol.toLowerCase().includes(filterSymbol.toLowerCase());
    const matchesSide = !filterSide || trade.side === filterSide;
    return matchesSymbol && matchesSide;
  });

  const sortedTrades = [...filteredTrades].sort((a, b) => {
    let comparison = 0;
    switch (sortField) {
      case 'date':
        comparison = new Date(a.entryDate).getTime() - new Date(b.entryDate).getTime();
        break;
      case 'symbol':
        comparison = a.symbol.localeCompare(b.symbol);
        break;
      case 'side':
        comparison = a.side.localeCompare(b.side);
        break;
      case 'entryPrice':
        comparison = a.entryPrice - b.entryPrice;
        break;
      case 'shares':
        comparison = a.shares - b.shares;
        break;
    }
    return sortDirection === 'asc' ? comparison : -comparison;
  });

  const toggleSelection = (tradeId: string) => {
    const newSelected = new Set(selectedTrades);
    if (newSelected.has(tradeId)) {
      newSelected.delete(tradeId);
    } else {
      newSelected.add(tradeId);
    }
    setSelectedTrades(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedTrades.size === sortedTrades.length) {
      setSelectedTrades(new Set());
    } else {
      setSelectedTrades(new Set(sortedTrades.map(t => t.id)));
    }
  };

  const deleteSelectedTrades = async () => {
    setIsDeleting(true);
    const idsToDelete = Array.from(selectedTrades);
    
    try {
      for (const tradeId of idsToDelete) {
        await fetch(`/api/trades/${tradeId}?userId=default`, {
          method: 'DELETE'
        });
      }
      
      await fetchAllTrades();
      await fetchDailyStats();
      setShowDeleteModal(false);
    } catch (error) {
      console.error('Error deleting trades:', error);
      alert('Failed to delete some trades');
    } finally {
      setIsDeleting(false);
    }
  };

  const exportToCSV = () => {
    const headers = ['Date', 'Symbol', 'Side', 'Shares', 'Entry Price', 'Exit Price', 'PnL', 'Status'];
    const rows = sortedTrades.map(t => [
      t.entryDate,
      t.symbol,
      t.side,
      t.shares,
      t.entryPrice.toFixed(2),
      t.exitPrice?.toFixed(2) || '',
      t.grossPnL !== undefined ? t.grossPnL.toFixed(2) : (t.netPnL?.toFixed(2) || ''),
      t.status
    ]);
    
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trades_export_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-[#F97316]/30 border-t-[#F97316] rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header - Mobile Optimized */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 sm:gap-4">
          <button
            onClick={() => navigateMonth('prev')}
            className="p-2 hover:bg-[#262626] rounded-lg transition-colors"
          >
            <ChevronLeft className="w-5 h-5 text-[#8b949e]" />
          </button>
          <h2 className="text-lg sm:text-xl font-bold text-white min-w-[120px] sm:min-w-[150px] text-center">
            {currentMonth.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
          </h2>
          <button
            onClick={() => navigateMonth('next')}
            className="p-2 hover:bg-[#262626] rounded-lg transition-colors"
          >
            <ChevronRight className="w-5 h-5 text-[#8b949e]" />
          </button>
        </div>
        
        <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
          {/* Month Stats - Hidden on small mobile */}
          <div className="hidden sm:flex items-center gap-3 text-sm bg-[#161b22] border border-[#30363d] rounded-lg px-3 py-2">
            <div className="flex flex-col items-center">
              <span className="text-[10px] text-[#8b949e] uppercase tracking-wide">PnL</span>
              <span className={monthStats.totalPnl >= 0 ? 'text-[#3fb950] font-semibold' : 'text-[#f85149] font-semibold'}>
                {monthStats.totalPnl >= 0 ? '+' : ''}{formatCurrency(monthStats.totalPnl)}
              </span>
            </div>
            
            <div className="w-px h-6 bg-[#30363d]" />
            
            <div className="flex flex-col items-center">
              <span className="text-[10px] text-[#8b949e] uppercase tracking-wide">W/L</span>
              <div className="flex items-center gap-1 text-xs">
                <span className="text-[#3fb950] font-semibold">{monthStats.winDays}W</span>
                <span className="text-[#8b949e]">/</span>
                <span className="text-[#f85149] font-semibold">{monthStats.lossDays}L</span>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowImportModal(true)}
              className="flex items-center gap-2 px-3 py-2 bg-[#238636] hover:bg-[#2ea043] text-white rounded-lg transition-colors font-medium text-sm"
            >
              <Upload className="w-4 h-4" />
              <span className="hidden sm:inline">Import</span>
            </button>
            
            <button
              onClick={fetchDailyStats}
              disabled={isLoading}
              className="p-2 bg-[#30363d] hover:bg-[#3d444d] text-white rounded-lg transition-colors disabled:opacity-50"
              title="Refresh data"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
            
            {/* Info Tooltip */}
            <div className="group relative">
              <button
                className="p-2 hover:bg-[#30363d] rounded-lg transition-colors"
                aria-label="Import help"
              >
                <Info className="w-4 h-4 text-[#8b949e] hover:text-[#58a6ff]" />
              </button>
              
              {/* Tooltip - Mobile optimized */}
              <div className="absolute right-0 top-full mt-2 w-72 sm:w-80 p-4 bg-[#0d1117] border border-[#30363d] rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
                <div className="text-sm font-medium text-white mb-2">How to Import Trades</div>
                <div className="text-xs text-[#8b949e] space-y-2">
                  <p><strong className="text-[#F97316]">1.</strong> Open ThinkOrSwim (TOS)</p>
                  <p><strong className="text-[#F97316]">2.</strong> Go to <span className="text-white">Monitor → Account Statement</span></p>
                  <p><strong className="text-[#F97316]">3.</strong> Set date range and click <span className="text-white">Export</span></p>
                  <p><strong className="text-[#F97316]">4.</strong> Select <span className="text-white">CSV</span> format</p>
                  <p><strong className="text-[#F97316]">5.</strong> Upload the file here</p>
                </div>
                
                <div className="mt-3 pt-3 border-t border-[#30363d] text-xs text-[#8b949e]">
                  💡 We extract filled orders from "Today's Trade Activity" section
                </div>
                
                {/* Arrow */}
                <div className="absolute -top-1 right-4 w-2 h-2 bg-[#0d1117] border-l border-t border-[#30363d] transform -rotate-45"></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden">
        {/* Day Headers - 7 days on mobile, 8 on desktop */}
        <div className="grid grid-cols-7 md:grid-cols-8 border-b border-[#30363d]">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
            <div key={day} className="p-2 md:p-3 text-center text-[10px] md:text-xs font-medium text-[#8b949e] bg-[#0d1117] border-r border-[#30363d] last:border-r-0">
              <span className="hidden md:inline">{day}</span>
              <span className="md:hidden">{day.slice(0, 1)}</span>
            </div>
          ))}
          <div className="hidden md:block p-3 text-center text-xs font-medium text-[#8b949e] bg-[#0d1117] border-r border-[#30363d] last:border-r-0">
            Total
          </div>
        </div>
        
        {/* Calendar Weeks */}
        <div>
          {weeks.map((week, weekIndex) => (
            <div key={weekIndex} className="grid grid-cols-7 md:grid-cols-8 border-b border-[#30363d] last:border-b-0">
              {/* Days */}
              {week.days.map((dayData, dayIndex) => {
                if (!dayData) {
                  return (
                    <div key={`empty-${weekIndex}-${dayIndex}`} className="aspect-[3/4] md:aspect-[4/3] border-r border-[#21262d] bg-[#0d1117]/30" />
                  );
                }
                
                // Parse date components directly to avoid timezone shift
                const [y, m, d] = dayData.date.split('-').map(Number);
                const dayNumber = d;
                const hasData = dayData.trades > 0;
                const isCurrentMonth = m - 1 === currentMonth.getMonth();
                
                return (
                  <div
                    key={dayData.date}
                    onClick={() => hasData && handleDateClick(dayData.date)}
                    className={`
                      aspect-[3/4] md:aspect-[4/3] border-r border-[#21262d] p-1 md:p-2 cursor-pointer
                      transition-all hover:brightness-110 relative
                      ${getDayColor(dayData)}
                      ${hasData ? 'hover:ring-1 hover:ring-[#F97316] hover:z-10' : ''}
                      ${!isCurrentMonth ? 'opacity-50' : ''}
                    `}
                  >
                    <div className="flex flex-col h-full">
                      {/* Day number */}
                      <span className={`text-xs md:text-sm font-semibold ${hasData ? 'text-white' : 'text-[#8b949e]'}`}>
                        {dayNumber}
                      </span>
                      
                      {/* P&L and trades */}
                      {hasData && (
                        <div className="mt-auto">
                          <div className={`font-bold text-[10px] md:text-sm ${dayData.pnl >= 0 ? 'text-[#3fb950]' : 'text-[#f85149]'}`}>
                            {dayData.pnl >= 0 ? '+' : ''}{formatCurrency(dayData.pnl)}
                          </div>
                          <div className="text-[8px] md:text-xs text-[#8b949e] truncate">
                            {dayData.trades}t
                          </div>
                        </div>
                      )}
                    </div>
                    
                    {/* Journal indicator */}
                    {dayData.hasJournal && (
                      <div className="absolute top-1 right-1 md:top-2 md:right-2 w-1.5 h-1.5 md:w-2 md:h-2 bg-[#a371f7] rounded-full" />
                    )}
                  </div>
                );
              })}
              
              {/* Week Total - Desktop only */}
              <div className={`
                hidden md:flex aspect-[4/3] p-2 flex-col justify-center items-center
                ${week.weekTotal.trades > 0 
                  ? (week.weekTotal.pnl >= 0 ? 'bg-[#238636]/10' : 'bg-[#da3633]/10')
                  : 'bg-[#0d1117]/30'
                }
              `}>
                {week.weekTotal.trades > 0 && (
                  <>
                    <div className={`text-xs font-medium text-[#8b949e] mb-1`}>Week {week.weekNum}</div>
                    <div className={`font-bold text-sm ${week.weekTotal.pnl >= 0 ? 'text-[#3fb950]' : 'text-[#f85149]'}`}>
                      {week.weekTotal.pnl >= 0 ? '+' : ''}{formatCurrency(week.weekTotal.pnl)}
                    </div>
                    <div className="text-xs text-[#8b949e]">{week.weekTotal.trades} trades</div>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 text-xs sm:text-sm">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 sm:w-4 sm:h-4 bg-[#238636]/20 border border-[#238636]/50 rounded" />
          <span className="text-[#8b949e]">Win</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 sm:w-4 sm:h-4 bg-[#da3633]/20 border border-[#da3633]/50 rounded" />
          <span className="text-[#8b949e]">Loss</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 sm:w-4 sm:h-4 bg-[#21262d] rounded" />
          <span className="text-[#8b949e]">No Trades</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-[#a371f7] rounded-full" />
          <span className="text-[#8b949e]">Journal</span>
        </div>
      </div>

      {/* All Trades Section - Collapsible */}
      <div className="mt-6 bg-[#0d1117] border border-[#30363d] rounded-xl overflow-hidden">
        {/* Header */}
        <button
          onClick={() => setTradesExpanded(!tradesExpanded)}
          className="w-full flex items-center justify-between p-4 bg-[#161b22] hover:bg-[#1c2128] transition-colors"
        >
          <div className="flex items-center gap-3">
            <ChevronDown className={`w-5 h-5 text-[#8b949e] transition-transform ${tradesExpanded ? 'rotate-180' : ''}`} />
            <span className="text-white font-semibold">All Trades</span>
            <span className="px-2 py-0.5 bg-[#30363d] text-[#8b949e] text-xs rounded-full">
              {allTrades.length}
            </span>
          </div>
          {!tradesExpanded && (
            <div className="flex items-center gap-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  exportToCSV();
                }}
                className="flex items-center gap-2 px-3 py-1.5 bg-[#238636] hover:bg-[#2ea043] text-white rounded-lg text-sm transition-colors"
              >
                <Download className="w-4 h-4" />
                Export
              </button>
            </div>
          )}
        </button>

        {/* Expanded Content */}
        {tradesExpanded && (
          <div className="p-4">
            {/* Controls */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4">
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <Filter className="w-4 h-4 text-[#8b949e]" />
                  <input
                    type="text"
                    placeholder="Filter by symbol..."
                    value={filterSymbol}
                    onChange={(e) => setFilterSymbol(e.target.value)}
                    className="px-3 py-1.5 bg-[#161b22] border border-[#30363d] rounded-lg text-white text-sm focus:outline-none focus:border-[#F97316]"
                  />
                </div>
                
                <select
                  value={filterSide}
                  onChange={(e) => setFilterSide(e.target.value as '' | 'LONG' | 'SHORT')}
                  className="px-3 py-1.5 bg-[#161b22] border border-[#30363d] rounded-lg text-white text-sm focus:outline-none focus:border-[#F97316]"
                >
                  <option value="">All Sides</option>
                  <option value="LONG">Long</option>
                  <option value="SHORT">Short</option>
                </select>
                
                <button
                  onClick={fetchAllTrades}
                  className="p-2 bg-[#30363d] hover:bg-[#3d444d] text-white rounded-lg transition-colors"
                  title="Refresh"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>
              
              <div className="flex items-center gap-2">
                {selectedTrades.size > 0 && (
                  <button
                    onClick={() => setShowDeleteModal(true)}
                    className="flex items-center gap-2 px-3 py-1.5 bg-[#da3633]/20 hover:bg-[#da3633]/30 text-[#f85149] rounded-lg text-sm transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete ({selectedTrades.size})
                  </button>
                )}
                
                <button
                  onClick={exportToCSV}
                  className="flex items-center gap-2 px-3 py-1.5 bg-[#238636] hover:bg-[#2ea043] text-white rounded-lg text-sm transition-colors"
                >
                  <Download className="w-4 h-4" />
                  Export CSV
                </button>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto bg-[#161b22] border border-[#30363d] rounded-lg">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#30363d] bg-[#0d1117]">
                    <th className="py-3 px-2 text-center w-10">
                      <button
                        onClick={toggleSelectAll}
                        className="text-[#8b949e] hover:text-white transition-colors"
                        title={selectedTrades.size === sortedTrades.length ? "Deselect all" : "Select all"}
                      >
                        {selectedTrades.size === sortedTrades.length ? (
                          <CheckSquare className="w-5 h-5" />
                        ) : selectedTrades.size > 0 ? (
                          <div className="relative">
                            <Square className="w-5 h-5" />
                            <div className="absolute inset-0 flex items-center justify-center">
                              <div className="w-2 h-2 bg-[#F97316] rounded-sm" />
                            </div>
                          </div>
                        ) : (
                          <Square className="w-5 h-5" />
                        )}
                      </button>
                    </th>
                    <th 
                      className="text-left py-3 px-4 text-[#8b949e] font-medium cursor-pointer hover:text-white"
                      onClick={() => handleSort('date')}
                    >
                      <div className="flex items-center gap-1">
                        Date/Time
                        {sortField === 'date' && (
                          <ArrowUpDown className={`w-3 h-3 ${sortDirection === 'desc' ? 'rotate-180' : ''}`} />
                        )}
                      </div>
                    </th>
                    <th 
                      className="text-left py-3 px-4 text-[#8b949e] font-medium cursor-pointer hover:text-white"
                      onClick={() => handleSort('symbol')}
                    >
                      <div className="flex items-center gap-1">
                        Symbol
                        {sortField === 'symbol' && (
                          <ArrowUpDown className={`w-3 h-3 ${sortDirection === 'desc' ? 'rotate-180' : ''}`} />
                        )}
                      </div>
                    </th>
                    <th 
                      className="text-left py-3 px-4 text-[#8b949e] font-medium cursor-pointer hover:text-white"
                      onClick={() => handleSort('side')}
                    >
                      <div className="flex items-center gap-1">
                        Side
                        {sortField === 'side' && (
                          <ArrowUpDown className={`w-3 h-3 ${sortDirection === 'desc' ? 'rotate-180' : ''}`} />
                        )}
                      </div>
                    </th>
                    <th 
                      className="text-right py-3 px-4 text-[#8b949e] font-medium cursor-pointer hover:text-white"
                      onClick={() => handleSort('shares')}
                    >
                      <div className="flex items-center justify-end gap-1">
                        Shares
                        {sortField === 'shares' && (
                          <ArrowUpDown className={`w-3 h-3 ${sortDirection === 'desc' ? 'rotate-180' : ''}`} />
                        )}
                      </div>
                    </th>
                    <th 
                      className="text-right py-3 px-4 text-[#8b949e] font-medium cursor-pointer hover:text-white"
                      onClick={() => handleSort('entryPrice')}
                    >
                      <div className="flex items-center justify-end gap-1">
                        Entry
                        {sortField === 'entryPrice' && (
                          <ArrowUpDown className={`w-3 h-3 ${sortDirection === 'desc' ? 'rotate-180' : ''}`} />
                        )}
                      </div>
                    </th>
                    <th className="text-right py-3 px-4 text-[#8b949e] font-medium">Exit</th>
                    <th className="text-right py-3 px-4 text-[#8b949e] font-medium">PnL</th>
                    <th className="text-left py-3 px-4 text-[#8b949e] font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedTrades.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-[#8b949e]">
                        {allTrades.length === 0 ? (
                          <div className="space-y-2">
                            <TrendingUp className="w-8 h-8 mx-auto text-[#30363d]" />
                            <p>No trades yet. Import trades to get started.</p>
                          </div>
                        ) : (
                          <p>No trades match your filters</p>
                        )}
                      </td>
                    </tr>
                  ) : (
                    sortedTrades.map((trade) => (
                      <tr 
                        key={trade.id} 
                        className={`border-b border-[#21262d] hover:bg-[#21262d]/50 ${selectedTrades.has(trade.id) ? 'bg-[#F97316]/10' : ''}`}
                      >
                        <td className="py-3 px-2 text-center">
                          <button
                            onClick={() => toggleSelection(trade.id)}
                            className="text-[#8b949e] hover:text-[#F97316] transition-colors"
                          >
                            {selectedTrades.has(trade.id) ? (
                              <CheckSquare className="w-5 h-5 text-[#F97316]" />
                            ) : (
                              <Square className="w-5 h-5" />
                            )}
                          </button>
                        </td>
                        <td className="py-3 px-4 text-white">
                          <div className="text-xs text-[#8b949e]">{trade.entryDate?.split('T')[0]}</div>
                          <div>{trade.entryDate?.split('T')[1]?.substring(0, 5)}</div>
                        </td>
                        <td className="py-3 px-4 font-medium text-white">{trade.symbol}</td>
                        <td className="py-3 px-4">
                          <span className={`flex items-center gap-1 ${trade.side === 'LONG' ? 'text-[#3fb950]' : 'text-[#f85149]'}`}>
                            {trade.side === 'LONG' ? (
                              <>
                                <TrendingUp className="w-3 h-3" />
                                LONG
                              </>
                            ) : (
                              <>
                                <TrendingDown className="w-3 h-3" />
                                SHORT
                              </>
                            )}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right text-white">{trade.shares}</td>
                        <td className="py-3 px-4 text-right text-white">${trade.entryPrice?.toFixed(2)}</td>
                        <td className="py-3 px-4 text-right text-white">{trade.exitPrice ? `$${trade.exitPrice.toFixed(2)}` : '-'}</td>
                        <td className={`py-3 px-4 text-right ${(trade.grossPnL !== undefined ? trade.grossPnL : trade.netPnL) && (trade.grossPnL !== undefined ? trade.grossPnL : trade.netPnL)! >= 0 ? 'text-[#3fb950]' : (trade.grossPnL !== undefined ? trade.grossPnL : trade.netPnL) && (trade.grossPnL !== undefined ? trade.grossPnL : trade.netPnL)! < 0 ? 'text-[#f85149]' : 'text-[#8b949e]'}`}>
                          {(trade.grossPnL !== undefined ? trade.grossPnL : trade.netPnL) ? `${(trade.grossPnL !== undefined ? trade.grossPnL : trade.netPnL)! >= 0 ? '+' : ''}$${(trade.grossPnL !== undefined ? trade.grossPnL : trade.netPnL)!.toFixed(2)}` : '-'}
                        </td>
                        <td className="py-3 px-4">
                          <span className={`text-xs px-2 py-1 rounded-full ${trade.status === 'CLOSED' ? 'bg-[#238636]/20 text-[#3fb950]' : 'bg-[#d29922]/20 text-[#d29922]'}`}>
                            {trade.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            
            {/* Footer */}
            <div className="mt-3 text-sm text-[#8b949e] flex items-center justify-between">
              <span>Showing {sortedTrades.length} of {allTrades.length} trades</span>
              {selectedTrades.size > 0 && (
                <span className="text-[#F97316]">{selectedTrades.size} selected</span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Day Detail Modal */}
      {selectedDate && (
        <DayDetailModal 
          date={selectedDate} 
          data={dailyStats.find(d => d.date === selectedDate) || { date: selectedDate, pnl: 0, trades: 0, hasJournal: false }} 
          trades={selectedDateTrades}
          onClose={() => {
            setSelectedDate(null);
            setSelectedDateTrades([]);
          }}
          onTradeDeleted={() => {
            fetchDailyStats();
            fetchAllTrades();
            fetchTradesForDate(selectedDate);
          }}
        />
      )}

      {/* Import Modal */}
      {showImportModal && (
        <ImportModal onClose={() => setShowImportModal(false)} onSuccess={handleImportSuccess} />
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#161b22] border border-[#30363d] rounded-xl w-full max-w-md p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">Delete Trades</h3>
              <button
                onClick={() => setShowDeleteModal(false)}
                className="p-2 hover:bg-[#30363d] rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-[#8b949e]" />
              </button>
            </div>
            
            <div className="mb-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-3 bg-[#da3633]/20 rounded-full">
                  <Trash2 className="w-6 h-6 text-[#f85149]" />
                </div>
                <div>
                  <p className="text-white font-medium">
                    Delete {selectedTrades.size} trade{selectedTrades.size !== 1 ? 's' : ''}?
                  </p>
                  <p className="text-sm text-[#8b949e]">
                    This action cannot be undone.
                  </p>
                </div>
              </div>
            </div>
            
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteModal(false)}
                className="flex-1 px-4 py-3 bg-[#30363d] hover:bg-[#3d444d] text-white rounded-lg transition-colors font-medium"
              >
                Cancel
              </button>
              <button
                onClick={deleteSelectedTrades}
                disabled={isDeleting}
                className="flex-1 px-4 py-3 bg-[#da3633] hover:bg-[#f85149] text-white rounded-lg transition-colors font-medium disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isDeleting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    Delete
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DayDetailModal({ date, data, trades, onClose, onTradeDeleted }: { date: string; data: DayData; trades: TOSTrade[]; onClose: () => void; onTradeDeleted?: () => void }) {
  // DEBUG: Log trades received
  console.log('[DEBUG] DayDetailModal - trades received:', trades);
  console.log('[DEBUG] DayDetailModal - trades length:', trades?.length);
  console.log('[DEBUG] DayDetailModal - data.trades count from summary:', data?.trades);
  
  // Parse date parts directly to avoid UTC shift
  const [year, month, day] = date.split('-').map(Number);
  const dateObj = new Date(year, month - 1, day); // month is 0-indexed
  
  // Delete confirmation state
  const [tradeToDelete, setTradeToDelete] = useState<TOSTrade | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  
  // Handle individual trade delete
  const handleDeleteTrade = async (trade: TOSTrade) => {
    setIsDeleting(true);
    try {
      const response = await fetch(`/api/trades/${trade.id}?userId=default`, {
        method: 'DELETE'
      });
      
      if (response.ok) {
        // Notify parent to refresh data
        if (onTradeDeleted) {
          onTradeDeleted();
        }
        // Dispatch global event for other components
        window.dispatchEvent(new CustomEvent('juno:trades-updated'));
      } else {
        console.error('Failed to delete trade');
        alert('Failed to delete trade. Please try again.');
      }
    } catch (error) {
      console.error('Error deleting trade:', error);
      alert('Error deleting trade. Please try again.');
    } finally {
      setIsDeleting(false);
      setTradeToDelete(null);
    }
  };
  
  // Group trades by symbol for display
  const tradesBySymbol = useMemo(() => {
    const grouped: Record<string, TOSTrade[]> = {};
    trades.forEach(trade => {
      if (!grouped[trade.symbol]) grouped[trade.symbol] = [];
      grouped[trade.symbol].push(trade);
    });
    return grouped;
  }, [trades]);

  // Calculate per-symbol PnL
  const symbolPnLs = useMemo(() => {
    return Object.entries(tradesBySymbol).map(([symbol, symbolTrades]) => {
      const longs = symbolTrades.filter(t => t.side === 'LONG');
      const shorts = symbolTrades.filter(t => t.side === 'SHORT');
      
      let pnl = 0;
      if (longs.length > 0 && shorts.length > 0) {
        const longValue = longs.reduce((sum, t) => sum + t.entryPrice * t.shares, 0);
        const longQty = longs.reduce((sum, t) => sum + t.shares, 0);
        const avgLong = longQty > 0 ? longValue / longQty : 0;
        
        const shortValue = shorts.reduce((sum, t) => sum + t.entryPrice * t.shares, 0);
        const shortQty = shorts.reduce((sum, t) => sum + t.shares, 0);
        const avgShort = shortQty > 0 ? shortValue / shortQty : 0;
        
        // For shorts: profit when sell price > buy price (cover)
        pnl = (avgShort - avgLong) * Math.min(longQty, shortQty);
      }
      
      return { symbol, trades: symbolTrades, pnl, isWin: pnl > 0 };
    });
  }, [tradesBySymbol]);
  
  // Redirect to Journal tab - check if entry exists first
  const openJournal = async () => {
    try {
      const response = await fetch(`/api/trades/journal?date=${date}&_t=${Date.now()}`);
      const data = await response.json();
      
      if (data.success && data.notes) {
        // Entry exists - open in edit mode
        window.location.href = `/?tab=trading&subtab=journal&date=${date}&action=edit`;
      } else {
        // No entry exists - open create modal
        window.location.href = `/?tab=trading&subtab=journal&date=${date}&action=create`;
      }
    } catch (error) {
      console.error('Error checking journal entry:', error);
      // Default to create if API fails
      window.location.href = `/?tab=trading&subtab=journal&date=${date}&action=create`;
    }
  };
  
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-[#161b22] border border-[#30363d] rounded-xl w-full max-w-lg max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[#30363d] flex-shrink-0">
          <div>
            <h3 className="text-lg font-bold text-white">
              {dateObj.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </h3>
            <div className="flex items-center gap-3 mt-1">
              <span className={`text-sm font-semibold ${data.pnl >= 0 ? 'text-[#3fb950]' : 'text-[#f85149]'}`}>
                {data.pnl >= 0 ? '+' : ''}${data.pnl.toFixed(2)} PnL
              </span>
              <span className="text-[#8b949e] text-sm">{data.trades} trades</span>
              {data.winRate && (
                <span className="text-sm text-[#8b949e]">Win Rate: <span className={data.winRate >= 50 ? 'text-[#3fb950]' : 'text-[#f85149]'}>{data.winRate}%</span></span>
              )}
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-[#262626] rounded-lg">
            <span className="text-[#8b949e]">✕</span>
          </button>
        </div>
        
        {/* Stats Row */}
        <div className="grid grid-cols-3 gap-4 p-4 bg-[#0d1117] border-b border-[#30363d] flex-shrink-0">
          <div className="text-center">
            <div className="text-[10px] text-[#8b949e] uppercase tracking-wide mb-1">Symbols</div>
            <div className="text-white font-semibold">{Object.keys(tradesBySymbol).length}</div>
          </div>
          <div className="text-center">
            <div className="text-[10px] text-[#8b949e] uppercase tracking-wide mb-1">Winning Trades</div>
            <div className="text-[#3fb950] font-semibold">{symbolPnLs.filter(s => s.isWin).length}</div>
          </div>
          <div className="text-center">
            <div className="text-[10px] text-[#8b949e] uppercase tracking-wide mb-1">Losing Trades</div>
            <div className="text-[#f85149] font-semibold">{symbolPnLs.filter(s => !s.isWin && s.pnl !== 0).length}</div>
          </div>
        </div>
        
        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
          {/* Trades List with Details */}
          <div>
            <h4 className="text-sm font-medium text-[#8b949e] mb-2">Trades ({trades.length})</h4>
            <div className="space-y-2">
              {trades.length === 0 ? (
                <div className="text-[#8b949e] text-sm">No trade details available</div>
              ) : (
                symbolPnLs.map(({ symbol, trades: symbolTrades, pnl }) => {
                  const isWin = pnl > 0;
                  const long = symbolTrades.find(t => t.side === 'LONG');
                  const short = symbolTrades.find(t => t.side === 'SHORT');
                  
                  return (
                    <div key={symbol} className="p-3 bg-[#0d1117] rounded-lg border border-[#30363d] group">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-white font-medium">{symbol}</span>
                          <span className="text-xs px-2 py-0.5 bg-[#21262d] rounded text-[#8b949e]">
                            {symbolTrades.length} fills
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={isWin ? 'text-[#3fb950] font-semibold' : pnl < 0 ? 'text-[#f85149] font-semibold' : 'text-[#8b949e] font-semibold'}>
                            {pnl > 0 ? '+' : ''}${pnl.toFixed(2)}
                          </span>
                          {/* Individual Trade Delete Button */}
                          {symbolTrades.map((trade) => (
                            <button
                              key={trade.id}
                              onClick={() => setTradeToDelete(trade)}
                              className="p-1.5 hover:bg-[#da3633]/20 text-[#8b949e] hover:text-[#f85149] rounded transition-colors opacity-0 group-hover:opacity-100"
                              title={`Delete trade ${trade.id.slice(0, 8)}`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="grid grid-cols-4 gap-2 text-xs">
                        {long && (
                          <div>
                            <span className="text-[#8b949e]">Long: </span>
                            <span className="text-[#3fb950]">${long.entryPrice.toFixed(2)}</span>
                          </div>
                        )}
                        {short && (
                          <div>
                            <span className="text-[#8b949e]">Short: </span>
                            <span className="text-[#f85149]">${short.entryPrice.toFixed(2)}</span>
                          </div>
                        )}
                        <div>
                          <span className="text-[#8b949e]">Shares: </span>
                          <span className="text-white">{symbolTrades[0]?.shares}</span>
                        </div>
                        <div>
                          <span className="text-[#8b949e]">Time: </span>
                          <span className="text-white">{symbolTrades[0]?.entryDate?.split('T')[1]?.substring(0, 5)}</span>
                        </div>
                      </div>
                      <div className="mt-2 pt-2 border-t border-[#21262d]">
                        <span className="text-xs text-[#8b949e]">
                          {symbolTrades.map(t => `${t.side} ${t.shares} @ $${t.entryPrice.toFixed(2)}`).join(' → ')}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
          
          {/* Daily Journal - Removed */}
        </div>
        
        {/* Footer - Always visible */}
        <div className="flex justify-between items-center gap-3 p-4 border-t border-[#30363d] flex-shrink-0">
          <button 
            onClick={openJournal}
            className="px-4 py-2 bg-[#F97316]/10 hover:bg-[#F97316]/20 text-[#F97316] rounded-lg transition-colors flex items-center gap-2 text-sm"
          >
            <span>📓</span>
            Open Journal
          </button>
          <button onClick={onClose} className="px-4 py-2 text-[#8b949e] hover:text-white">
            Close
          </button>
        </div>
        
        {/* Delete Confirmation Modal */}
        {tradeToDelete && (
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-[#161b22] border border-[#30363d] rounded-xl w-full max-w-sm p-5 shadow-2xl">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-[#da3633]/20 rounded-full">
                  <Trash2 className="w-5 h-5 text-[#f85149]" />
                </div>
                <div>
                  <p className="text-white font-medium">Delete Trade?</p>
                  <p className="text-sm text-[#8b949e]">This action cannot be undone.</p>
                </div>
              </div>
              
              <div className="bg-[#0d1117] rounded-lg p-3 mb-4 text-sm">
                <div className="flex justify-between mb-1">
                  <span className="text-[#8b949e]">Symbol:</span>
                  <span className="text-white font-medium">{tradeToDelete.symbol}</span>
                </div>
                <div className="flex justify-between mb-1">
                  <span className="text-[#8b949e]">Side:</span>
                  <span className={tradeToDelete.side === 'LONG' ? 'text-[#3fb950]' : 'text-[#f85149]'} >
                    {tradeToDelete.side}
                  </span>
                </div>
                <div className="flex justify-between mb-1">
                  <span className="text-[#8b949e]">Shares:</span>
                  <span className="text-white">{tradeToDelete.shares}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#8b949e]">Entry Price:</span>
                  <span className="text-white">${tradeToDelete.entryPrice.toFixed(2)}</span>
                </div>
              </div>
              
              <div className="flex gap-3">
                <button
                  onClick={() => setTradeToDelete(null)}
                  disabled={isDeleting}
                  className="flex-1 px-4 py-2 bg-[#30363d] hover:bg-[#3d444d] text-white rounded-lg transition-colors font-medium disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleDeleteTrade(tradeToDelete)}
                  disabled={isDeleting}
                  className="flex-1 px-4 py-2 bg-[#da3633] hover:bg-[#f85149] text-white rounded-lg transition-colors font-medium disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isDeleting ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Deleting...
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4" />
                      Delete
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ImportModal({ onClose, onSuccess }: { onClose: () => void; onSuccess?: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{ success: boolean; message: string; count?: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (selectedFile: File) => {
    if (selectedFile.name.endsWith('.csv') || selectedFile.name.endsWith('.xlsx') || selectedFile.name.endsWith('.xls')) {
      setFile(selectedFile);
      setUploadResult(null);
    } else {
      setUploadResult({ success: false, message: 'Please select a CSV or Excel file' });
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    
    setIsUploading(true);
    
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await fetch('/api/trades/import', {
        method: 'POST',
        body: formData,
      });
      
      const result = await response.json();
      
      if (result.success) {
        setUploadResult({ 
          success: true, 
          message: `Successfully imported ${result.count || 0} trades`,
          count: result.count 
        });
        setTimeout(() => {
          onClose();
          if (onSuccess) {
            onSuccess();
          } else {
            window.location.reload();
          }
        }, 1500);
      } else {
        setUploadResult({ success: false, message: result.error || 'Import failed' });
      }
    } catch (error) {
      setUploadResult({ success: false, message: 'Upload failed. Please try again.' });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-[#161b22] border border-[#30363d] rounded-xl w-full max-w-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-white">Import Trades</h3>
          <button onClick={onClose} className="text-[#8b949e] hover:text-white">✕</button>
        </div>
        
        <div 
          className={`border-2 border-dashed rounded-xl p-8 text-center mb-4 transition-colors ${
            isDragging ? 'border-[#F97316] bg-[#F97316]/10' : 'border-[#30363d]'
          }`}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
        >
          <input
            type="file"
            ref={fileInputRef}
            accept=".csv,.xlsx,.xls"
            onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
            className="hidden"
          />
          
          <Upload className="w-12 h-12 text-[#8b949e] mx-auto mb-4" />
          
          {file ? (
            <div className="space-y-2">
              <p className="text-[#3fb950] font-medium">{file.name}</p>
              <p className="text-sm text-[#8b949e]">{(file.size / 1024).toFixed(1)} KB</p>
            </div>
          ) : (
            <>
              <p className="text-white font-medium mb-2">Drop CSV or Excel file here</p>
              <p className="text-sm text-[#8b949e] mb-4">Supports ThinkOrSwim, Interactive Brokers, and generic formats</p>
            </>
          )}
          
          <button 
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="px-4 py-2 bg-[#30363d] hover:bg-[#3d444d] text-white rounded-lg transition-colors disabled:opacity-50"
          >
            {file ? 'Change File' : 'Select File'}
          </button>
        </div>
        
        {uploadResult && (
          <div className={`p-3 rounded-lg mb-4 ${uploadResult.success ? 'bg-[#238636]/20 text-[#3fb950]' : 'bg-[#da3633]/20 text-[#f85149]'}`}>
            {uploadResult.message}
          </div>
        )}
        
        <div className="flex items-center gap-2 text-sm text-[#8b949e] mb-6">
          <span>Need a template?</span>
          <a href="/templates/trades_import_template.csv" download className="text-[#F97316] hover:underline">
            Download CSV
          </a>
        </div>
        
        <div className="flex justify-end gap-3">
          <button 
            onClick={onClose} 
            disabled={isUploading}
            className="px-4 py-2 text-[#8b949e] hover:text-white disabled:opacity-50"
          >
            Cancel
          </button>
          <button 
            onClick={handleUpload}
            disabled={!file || isUploading}
            className="px-4 py-2 bg-[#238636] hover:bg-[#2ea043] text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isUploading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Importing...
              </>
            ) : (
              'Import Trades'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
