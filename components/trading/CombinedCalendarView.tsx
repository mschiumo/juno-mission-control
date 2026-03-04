'use client';

import { useState, useMemo, useEffect } from 'react';
import { 
  ChevronLeft, 
  ChevronRight, 
  TrendingUp, 
  TrendingDown, 
  BookOpen, 
  BarChart3,
  X,
  Calendar,
  Clock,
  Save,
  CheckCircle,
  Edit2,
  Trash2,
  AlertTriangle,
  Plus,
  Filter,
  ArrowUpDown,
  RefreshCw,
  Info,
  Download,
  CheckSquare,
  Square
} from 'lucide-react';
import { getTodayInEST, getESTDateFromTimestamp } from '@/lib/date-utils';

// ============================================================================
// Types
// ============================================================================

interface DayData {
  date: string;
  pnl: number;
  trades: number;
  hasJournal: boolean;
  winRate?: number;
}

interface JournalPrompt {
  id: string;
  question: string;
  answer: string;
}

interface JournalEntry {
  id: string;
  date: string;
  prompts: JournalPrompt[];
  createdAt: string;
  updatedAt: string;
}

interface Trade {
  id: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  shares: number;
  entryPrice: number;
  entryDate: string;
  exitPrice?: number;
  exitDate?: string;
  netPnL?: number;
  status: 'OPEN' | 'CLOSED';
  entryNotes?: string;
  exitNotes?: string;
}

type SortField = 'date' | 'symbol' | 'side' | 'entryPrice' | 'shares';
type SortDirection = 'asc' | 'desc';

const DEFAULT_PROMPTS = [
  { id: 'went-well', question: 'What went well today?', answer: '' },
  { id: 'improve', question: 'What could you improve?', answer: '' },
  { id: 'followed-plan', question: 'Did you follow your trading plan?', answer: '' }
];

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ============================================================================
// Helper Functions
// ============================================================================

const parseDateAsEST = (dateStr: string): Date => {
  return new Date(`${dateStr}T00:00:00-05:00`);
};

const formatDateEST = (dateStr: string): string => {
  return parseDateAsEST(dateStr).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'America/New_York'
  });
};

const formatTimeEST = (isoString: string): string => {
  return new Date(isoString).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/New_York'
  });
};

const formatCurrency = (value: number) => {
  const absValue = Math.abs(value);
  if (absValue >= 1000) return `$${(value / 1000).toFixed(1)}k`;
  return `$${value.toFixed(0)}`;
};

// ============================================================================
// Main Component
// ============================================================================

export default function CombinedCalendarView() {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [dailyStats, setDailyStats] = useState<DayData[]>([]);
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([]);
  const [allTrades, setAllTrades] = useState<Trade[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Modal states
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [showTradeModal, setShowTradeModal] = useState(false);
  const [showJournalModal, setShowJournalModal] = useState(false);
  const [selectedDateTrades, setSelectedDateTrades] = useState<Trade[]>([]);
  const [selectedDateJournal, setSelectedDateJournal] = useState<JournalEntry | null>(null);

  // Trades list state (below calendar)
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [filterSymbol, setFilterSymbol] = useState('');
  const [filterSide, setFilterSide] = useState<'' | 'LONG' | 'SHORT'>('');
  const [selectedTrades, setSelectedTrades] = useState<Set<string>>(new Set());
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Fetch data on mount
  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [statsRes, journalRes, tradesRes] = await Promise.all([
        fetch(`/api/trades/daily-stats?_t=${Date.now()}`),
        fetch(`/api/daily-journal?_t=${Date.now()}`),
        fetch('/api/trades?userId=default&perPage=1000')
      ]);

      const [statsData, journalData, tradesData] = await Promise.all([
        statsRes.json(),
        journalRes.json(),
        tradesRes.json()
      ]);

      if (statsData.success) setDailyStats(statsData.dailyStats || []);
      if (journalData.success) setJournalEntries(journalData.entries || []);
      if (tradesData.success && tradesData.data) setAllTrades(tradesData.data.trades || []);
    } catch (error) {
      console.error('Error fetching calendar data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Create a map of date -> data for quick lookup
  const dateDataMap = useMemo(() => {
    const map: Record<string, { trades: DayData | undefined; journal: JournalEntry | undefined }> = {};
    
    // Initialize with daily stats (trades)
    dailyStats.forEach(day => {
      map[day.date] = { trades: day, journal: undefined };
    });
    
    // Add journal entries
    journalEntries.forEach(entry => {
      if (!map[entry.date]) {
        map[entry.date] = { trades: undefined, journal: undefined };
      }
      map[entry.date].journal = entry;
    });
    
    return map;
  }, [dailyStats, journalEntries]);

  // Generate calendar days
  const calendarDays = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    
    const firstDay = new Date(`${year}-${String(month + 1).padStart(2, '0')}-01T12:00:00-05:00`);
    const lastDay = new Date(year, month + 1, 0);
    const startPadding = firstDay.getDay();
    
    const days: ({
      date: string;
      dayNumber: number;
      isCurrentMonth: boolean;
      trades?: DayData;
      journal?: JournalEntry;
    } | null)[] = [];
    
    // Padding days
    for (let i = 0; i < startPadding; i++) {
      days.push(null);
    }
    
    // Actual days
    for (let day = 1; day <= lastDay.getDate(); day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const data = dateDataMap[dateStr];
      
      days.push({
        date: dateStr,
        dayNumber: day,
        isCurrentMonth: true,
        trades: data?.trades,
        journal: data?.journal
      });
    }
    
    return days;
  }, [currentMonth, dateDataMap]);

  // Calculate month stats
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
    const journalDays = journalEntries.filter(e => {
      const date = new Date(e.date);
      return date.getFullYear() === year && date.getMonth() === month;
    }).length;
    
    return { totalPnl, totalTrades, winDays, lossDays, journalDays };
  }, [currentMonth, dailyStats, journalEntries]);

  const navigateMonth = (direction: 'prev' | 'next') => {
    setCurrentMonth(prev => {
      const newDate = new Date(prev);
      if (direction === 'prev') newDate.setMonth(newDate.getMonth() - 1);
      else newDate.setMonth(newDate.getMonth() + 1);
      return newDate;
    });
  };

  const handleTradeIconClick = async (date: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedDate(date);
    
    // Fetch trades for this date
    try {
      const res = await fetch(`/api/trades?userId=default&startDate=${date}&endDate=${date}&perPage=100`);
      const data = await res.json();
      setSelectedDateTrades(data.success && data.data ? data.data.trades : []);
      setShowTradeModal(true);
    } catch (error) {
      console.error('Error fetching trades:', error);
    }
  };

  const handleJournalIconClick = async (date: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedDate(date);
    
    // Find journal entry for this date
    const entry = journalEntries.find(e => e.date === date);
    setSelectedDateJournal(entry || null);
    setShowJournalModal(true);
  };

  const isToday = (dateStr: string) => {
    return dateStr === getTodayInEST();
  };

  // Trades list helpers
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
      await fetchData();
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
      t.netPnL?.toFixed(2) || '',
      t.status
    ]);
    
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trades_${new Date().toISOString().split('T')[0]}.csv`;
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
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 sm:gap-4">
          <button
            onClick={() => navigateMonth('prev')}
            className="p-2 hover:bg-[#262626] rounded-lg transition-colors"
          >
            <ChevronLeft className="w-5 h-5 text-[#8b949e]" />
          </button>
          <h2 className="text-lg sm:text-xl font-bold text-white min-w-[140px] sm:min-w-[180px] text-center">
            {currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </h2>
          <button
            onClick={() => navigateMonth('next')}
            className="p-2 hover:bg-[#262626] rounded-lg transition-colors"
          >
            <ChevronRight className="w-5 h-5 text-[#8b949e]" />
          </button>
        </div>
        
        <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
          {/* Month Stats */}
          <div className="hidden sm:flex items-center gap-3 text-sm bg-[#161b22] border border-[#30363d] rounded-lg px-3 py-2">
            <div className="flex flex-col items-center">
              <span className="text-[10px] text-[#8b949e] uppercase tracking-wide">Monthly PnL</span>
              <span className={`font-semibold ${monthStats.totalPnl >= 0 ? 'text-[#3fb950]' : 'text-[#f85149]'}`}>
                {monthStats.totalPnl >= 0 ? '+' : ''}{formatCurrency(monthStats.totalPnl)}
              </span>
            </div>
            <div className="w-px h-6 bg-[#30363d]" />
            <div className="flex flex-col items-center">
              <span className="text-[10px] text-[#8b949e] uppercase tracking-wide">Trading Days</span>
              <span className="text-white font-semibold">{monthStats.winDays + monthStats.lossDays}</span>
            </div>
            <div className="w-px h-6 bg-[#30363d]" />
            <div className="flex flex-col items-center">
              <span className="text-[10px] text-[#8b949e] uppercase tracking-wide">Win/Loss</span>
              <div className="flex items-center gap-1 text-xs">
                <span className="text-[#3fb950] font-semibold">{monthStats.winDays}W</span>
                <span className="text-[#8b949e]">/</span>
                <span className="text-[#f85149] font-semibold">{monthStats.lossDays}L</span>
              </div>
            </div>
            <div className="w-px h-6 bg-[#30363d]" />
            <div className="flex flex-col items-center">
              <span className="text-[10px] text-[#8b949e] uppercase tracking-wide">Journal</span>
              <span className="text-[#58a6ff] font-semibold">{monthStats.journalDays}</span>
            </div>
          </div>
          
          <button
            onClick={fetchData}
            disabled={isLoading}
            className="p-2 bg-[#30363d] hover:bg-[#3d444d] text-white rounded-lg transition-colors disabled:opacity-50"
            title="Refresh data"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Mobile Month Stats */}
      <div className="sm:hidden bg-[#161b22] border border-[#30363d] rounded-xl p-3">
        <div className="flex items-center justify-center gap-3 pt-1">
          <div className="flex flex-col items-center">
            <span className="text-[10px] text-[#8b949e] uppercase tracking-wide">Monthly PnL</span>
            <span className={`font-semibold ${monthStats.totalPnl >= 0 ? 'text-[#3fb950]' : 'text-[#f85149]'}`}>
              {monthStats.totalPnl >= 0 ? '+' : ''}{formatCurrency(monthStats.totalPnl)}
            </span>
          </div>
          <div className="w-px h-8 bg-[#30363d]" />
          <div className="flex flex-col items-center">
            <span className="text-[10px] text-[#8b949e] uppercase tracking-wide">Days</span>
            <span className="text-white font-semibold">{monthStats.winDays + monthStats.lossDays}</span>
          </div>
          <div className="w-px h-8 bg-[#30363d]" />
          <div className="flex flex-col items-center">
            <span className="text-[10px] text-[#8b949e] uppercase tracking-wide">Win/Loss</span>
            <div className="flex items-center gap-1 text-sm">
              <span className="text-[#3fb950] font-semibold">{monthStats.winDays}W</span>
              <span className="text-[#8b949e]">/</span>
              <span className="text-[#f85149] font-semibold">{monthStats.lossDays}L</span>
            </div>
          </div>
          <div className="w-px h-8 bg-[#30363d]" />
          <div className="flex flex-col items-center">
            <span className="text-[10px] text-[#8b949e] uppercase tracking-wide">Journal</span>
            <span className="text-[#58a6ff] font-semibold">{monthStats.journalDays}</span>
          </div>
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden">
        {/* Day Headers */}
        <div className="grid grid-cols-7 border-b border-[#30363d]">
          {DAY_NAMES.map(day => (
            <div key={day} className="p-2 text-center text-[10px] font-medium text-[#8b949e] bg-[#0d1117]">
              {day}
            </div>
          ))}
        </div>
        
        {/* Calendar Days */}
        <div className="grid grid-cols-7">
          {calendarDays.map((dayData, index) => {
            if (!dayData) {
              return (
                <div 
                  key={`empty-${index}`} 
                  className="aspect-square border-r border-b border-[#21262d] bg-[#0d1117]/30"
                />
              );
            }

            const hasTrades = dayData.trades && dayData.trades.trades > 0;
            const hasJournal = !!dayData.journal;
            const isProfitable = hasTrades && (dayData.trades?.pnl || 0) > 0;
            const isLoss = hasTrades && (dayData.trades?.pnl || 0) < 0;
            const today = isToday(dayData.date);

            return (
              <div
                key={dayData.date}
                className={`
                  aspect-square border-r border-b border-[#21262d] p-1.5 sm:p-2
                  relative flex flex-col
                  ${hasTrades ? 'bg-[#21262d]' : 'bg-[#161b22]'}
                  ${today ? 'ring-2 ring-inset ring-[#F97316]' : ''}
                  transition-all hover:bg-[#1f242b]
                `}
              >
                {/* Day Number - Top Left, P&L - Top Right */}
                <div className="flex justify-between items-start shrink-0">
                  <span className={`text-xs sm:text-sm font-medium ${today ? 'text-[#F97316]' : 'text-white'}`}>
                    {dayData.dayNumber}
                  </span>
                  {hasTrades && (
                    <span className={`text-[10px] sm:text-xs font-bold ${isProfitable ? 'text-[#3fb950]' : isLoss ? 'text-[#f85149]' : 'text-[#8b949e]'}`}>
                      {dayData.trades?.pnl && dayData.trades.pnl > 0 ? '+' : ''}{formatCurrency(dayData.trades?.pnl || 0)}
                    </span>
                  )}
                </div>

                {/* Icons - Perfectly Centered */}
                <div className="flex-1 flex flex-col items-center justify-center gap-2 min-h-0">
                  {/* Trade Icon */}
                  {hasTrades && (
                    <button
                      onClick={(e) => handleTradeIconClick(dayData.date, e)}
                      className={`
                        relative flex items-center justify-center shrink-0
                        w-9 h-9 sm:w-10 sm:h-10 rounded-xl transition-all duration-200
                        hover:scale-110 hover:shadow-xl
                        ${isProfitable
                          ? 'bg-gradient-to-br from-[#3fb950]/30 to-[#238636]/20 text-[#3fb950] hover:from-[#3fb950]/40 hover:to-[#238636]/30 ring-1 ring-[#3fb950]/50 shadow-[0_2px_8px_-2px_rgba(63,185,80,0.3)]'
                          : isLoss
                            ? 'bg-gradient-to-br from-[#f85149]/30 to-[#da3633]/20 text-[#f85149] hover:from-[#f85149]/40 hover:to-[#da3633]/30 ring-1 ring-[#f85149]/50 shadow-[0_2px_8px_-2px_rgba(248,81,73,0.3)]'
                            : 'bg-[#30363d] text-[#8b949e] hover:bg-[#3d444d] ring-1 ring-[#8b949e]/20'
                        }
                      `}
                      title={`${dayData.trades?.trades} trade(s) - Click to view`}
                    >
                      <BarChart3 className="w-5 h-5 sm:w-5 sm:h-5" strokeWidth={2} />
                      {/* Trade count badge */}
                      {dayData.trades && dayData.trades.trades > 1 && (
                        <span className={`
                          absolute -top-1 -right-1
                          w-4 h-4 sm:w-4.5 sm:h-4.5
                          flex items-center justify-center
                          text-[8px] font-bold
                          rounded-full border-2 border-[#161b22]
                          ${isProfitable
                            ? 'bg-[#3fb950] text-[#0d1117]'
                            : isLoss
                              ? 'bg-[#f85149] text-[#0d1117]'
                              : 'bg-[#8b949e] text-[#0d1117]'
                          }
                        `}>
                          {dayData.trades.trades}
                        </span>
                      )}
                    </button>
                  )}

                  {/* Journal Icon */}
                  {hasJournal && (
                    <button
                      onClick={(e) => handleJournalIconClick(dayData.date, e)}
                      className="
                        relative flex items-center justify-center shrink-0
                        w-9 h-9 sm:w-10 sm:h-10 rounded-xl
                        bg-gradient-to-br from-[#58a6ff]/30 to-[#1f6feb]/20
                        text-[#58a6ff]
                        hover:from-[#58a6ff]/40 hover:to-[#1f6feb]/30 hover:scale-110 hover:shadow-xl
                        ring-1 ring-[#58a6ff]/50 shadow-[0_2px_8px_-2px_rgba(88,166,255,0.3)]
                        transition-all duration-200
                      "
                      title="Journal entry - Click to view/edit"
                    >
                      <BookOpen className="w-5 h-5 sm:w-5 sm:h-5" strokeWidth={2} />
                    </button>
                  )}
                </div>

                {/* Bottom spacer for visual balance */}
                <div className="h-2 shrink-0" />
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6 text-xs sm:text-sm">
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center w-8 h-8 bg-[#238636]/25 text-[#3fb950] rounded-xl ring-1 ring-[#3fb950]/30">
            <BarChart3 className="w-5 h-5" strokeWidth={2.5} />
          </div>
          <span className="text-[#8b949e]">Profitable Day</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center w-8 h-8 bg-[#da3633]/25 text-[#f85149] rounded-xl ring-1 ring-[#f85149]/30">
            <BarChart3 className="w-5 h-5" strokeWidth={2.5} />
          </div>
          <span className="text-[#8b949e]">Loss Day</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center w-8 h-8 bg-[#1f6feb]/25 text-[#58a6ff] rounded-xl ring-1 ring-[#58a6ff]/30 relative">
            <BookOpen className="w-5 h-5" strokeWidth={2.5} />
            <span className="absolute -top-1 -right-1 w-4 h-4 flex items-center justify-center bg-[#58a6ff] text-[#0d1117] rounded-full">
              <CheckCircle className="w-2.5 h-2.5" strokeWidth={3} />
            </span>
          </div>
          <span className="text-[#8b949e]">Journal Entry</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 ring-2 ring-[#F97316] rounded-xl" />
          <span className="text-[#8b949e]">Today</span>
        </div>
      </div>

      {/* Trades List Section */}
      <div className="mt-8">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-[#F97316]" />
          All Trades
        </h3>
        
        {isLoading ? (
          <div className="p-8 bg-[#161b22] border border-[#30363d] rounded-xl text-center">
            <div className="w-8 h-8 border-2 border-[#F97316]/30 border-t-[#F97316] rounded-full animate-spin mx-auto mb-4" />
            <p className="text-[#8b949e]">Loading trades...</p>
          </div>
        ) : allTrades.length === 0 ? (
          <div className="p-8 bg-[#161b22] border border-[#30363d] rounded-xl text-center">
            <TrendingUp className="w-12 h-12 text-[#8b949e] mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-white mb-2">No Trades Yet</h3>
            <p className="text-[#8b949e] mb-4">Import your trades from ThinkOrSwim to see them here.</p>
          </div>
        ) : (
          <div className="bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden">
            {/* Header */}
            <div className="p-4 border-b border-[#30363d] flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Filter className="w-4 h-4 text-[#8b949e]" />
                  <input
                    type="text"
                    placeholder="Filter by symbol..."
                    value={filterSymbol}
                    onChange={(e) => setFilterSymbol(e.target.value)}
                    className="px-3 py-1.5 bg-[#0d1117] border border-[#30363d] rounded-lg text-white text-sm focus:outline-none focus:border-[#F97316]"
                  />
                </div>
                
                <select
                  value={filterSide}
                  onChange={(e) => setFilterSide(e.target.value as '' | 'LONG' | 'SHORT')}
                  className="px-3 py-1.5 bg-[#0d1117] border border-[#30363d] rounded-lg text-white text-sm focus:outline-none focus:border-[#F97316]"
                >
                  <option value="">All Sides</option>
                  <option value="LONG">Long</option>
                  <option value="SHORT">Short</option>
                </select>
                
                <button
                  onClick={fetchData}
                  disabled={isLoading}
                  className="p-2 bg-[#30363d] hover:bg-[#3d444d] text-white rounded-lg transition-colors disabled:opacity-50"
                  title="Refresh"
                >
                  <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
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
            <div className="overflow-x-auto">
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
                    <th className="text-right py-3 px-4 text-[#8b949e] font-medium">PnL</th>
                    <th className="text-left py-3 px-4 text-[#8b949e] font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedTrades.map((trade) => (
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
                      <td className={`py-3 px-4 text-right ${trade.netPnL && trade.netPnL >= 0 ? 'text-[#3fb950]' : trade.netPnL && trade.netPnL < 0 ? 'text-[#f85149]' : 'text-[#8b949e]'}`}>
                        {trade.netPnL ? `${trade.netPnL >= 0 ? '+' : ''}$${trade.netPnL.toFixed(2)}` : '-'}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`text-xs px-2 py-1 rounded-full ${trade.status === 'CLOSED' ? 'bg-[#238636]/20 text-[#3fb950]' : 'bg-[#d29922]/20 text-[#d29922]'}`}>
                          {trade.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            {/* Footer */}
            <div className="p-4 border-t border-[#30363d] text-sm text-[#8b949e] flex items-center justify-between">
              <span>Showing {sortedTrades.length} of {allTrades.length} trades</span>
              {selectedTrades.size > 0 && (
                <span className="text-[#F97316]">{selectedTrades.size} selected</span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Trade Modal */}
      {showTradeModal && selectedDate && (
        <TradeModal
          date={selectedDate}
          trades={selectedDateTrades}
          onClose={() => {
            setShowTradeModal(false);
            setSelectedDate(null);
          }}
        />
      )}

      {/* Journal Modal */}
      {showJournalModal && selectedDate && (
        <JournalModal
          date={selectedDate}
          entry={selectedDateJournal}
          onClose={() => {
            setShowJournalModal(false);
            setSelectedDate(null);
            setSelectedDateJournal(null);
          }}
          onSave={fetchData}
        />
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

// ============================================================================
// Trade Modal Component
// ============================================================================

function TradeModal({ date, trades, onClose }: { date: string; trades: Trade[]; onClose: () => void }) {
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [filterSymbol, setFilterSymbol] = useState('');
  const [filterSide, setFilterSide] = useState<'' | 'LONG' | 'SHORT'>('');

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const filteredTrades = trades.filter(trade => {
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

  const totalPnL = trades.reduce((sum, t) => sum + (t.netPnL || 0), 0);

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-[#161b22] border border-[#30363d] rounded-xl w-full max-w-4xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[#30363d] bg-[#0d1117]">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[#F97316]/10 rounded-lg">
              <BarChart3 className="w-5 h-5 text-[#F97316]" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">Trades for {formatDateEST(date)}</h3>
              <p className="text-sm text-[#8b949e]">{trades.length} trade(s) • Total P&L: 
                <span className={totalPnL >= 0 ? 'text-[#3fb950]' : 'text-[#f85149]'}>
                  {totalPnL >= 0 ? '+' : ''}{formatCurrency(totalPnL)}
                </span>
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-[#30363d] rounded-lg transition-colors">
            <X className="w-5 h-5 text-[#8b949e]" />
          </button>
        </div>

        {/* Filters */}
        <div className="p-4 border-b border-[#30363d] flex flex-col sm:flex-row gap-3">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-[#8b949e]" />
            <input
              type="text"
              placeholder="Filter by symbol..."
              value={filterSymbol}
              onChange={(e) => setFilterSymbol(e.target.value)}
              className="px-3 py-1.5 bg-[#0d1117] border border-[#30363d] rounded-lg text-white text-sm focus:outline-none focus:border-[#F97316]"
            />
          </div>
          <select
            value={filterSide}
            onChange={(e) => setFilterSide(e.target.value as '' | 'LONG' | 'SHORT')}
            className="px-3 py-1.5 bg-[#0d1117] border border-[#30363d] rounded-lg text-white text-sm focus:outline-none focus:border-[#F97316]"
          >
            <option value="">All Sides</option>
            <option value="LONG">Long</option>
            <option value="SHORT">Short</option>
          </select>
        </div>

        {/* Trades Table */}
        <div className="flex-1 overflow-auto">
          {sortedTrades.length === 0 ? (
            <div className="p-8 text-center text-[#8b949e]">
              <BarChart3 className="w-12 h-12 mx-auto mb-3 text-[#30363d]" />
              <p>No trades found for this date</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-[#0d1117] sticky top-0">
                <tr className="border-b border-[#30363d]">
                  <th 
                    className="text-left py-3 px-4 text-[#8b949e] font-medium cursor-pointer hover:text-white"
                    onClick={() => handleSort('symbol')}
                  >
                    <div className="flex items-center gap-1">
                      Symbol
                      {sortField === 'symbol' && <ArrowUpDown className={`w-3 h-3 ${sortDirection === 'desc' ? 'rotate-180' : ''}`} />}
                    </div>
                  </th>
                  <th 
                    className="text-left py-3 px-4 text-[#8b949e] font-medium cursor-pointer hover:text-white"
                    onClick={() => handleSort('side')}
                  >
                    <div className="flex items-center gap-1">
                      Side
                      {sortField === 'side' && <ArrowUpDown className={`w-3 h-3 ${sortDirection === 'desc' ? 'rotate-180' : ''}`} />}
                    </div>
                  </th>
                  <th className="text-right py-3 px-4 text-[#8b949e] font-medium">Shares</th>
                  <th className="text-right py-3 px-4 text-[#8b949e] font-medium">Entry</th>
                  <th className="text-right py-3 px-4 text-[#8b949e] font-medium">Exit</th>
                  <th className="text-right py-3 px-4 text-[#8b949e] font-medium">P&L</th>
                  <th className="text-center py-3 px-4 text-[#8b949e] font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {sortedTrades.map((trade) => (
                  <tr key={trade.id} className="border-b border-[#21262d] hover:bg-[#21262d]/50">
                    <td className="py-3 px-4 font-medium text-white">{trade.symbol}</td>
                    <td className="py-3 px-4">
                      <span className={`flex items-center gap-1 ${trade.side === 'LONG' ? 'text-[#3fb950]' : 'text-[#f85149]'}`}>
                        {trade.side === 'LONG' ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                        {trade.side}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right text-white">{trade.shares}</td>
                    <td className="py-3 px-4 text-right text-white">${trade.entryPrice.toFixed(2)}</td>
                    <td className="py-3 px-4 text-right text-white">
                      {trade.exitPrice ? `$${trade.exitPrice.toFixed(2)}` : '-'}
                    </td>
                    <td className={`py-3 px-4 text-right ${trade.netPnL && trade.netPnL >= 0 ? 'text-[#3fb950]' : trade.netPnL && trade.netPnL < 0 ? 'text-[#f85149]' : 'text-[#8b949e]'}`}>
                      {trade.netPnL ? `${trade.netPnL >= 0 ? '+' : ''}$${trade.netPnL.toFixed(2)}` : '-'}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className={`text-xs px-2 py-1 rounded-full ${trade.status === 'CLOSED' ? 'bg-[#238636]/20 text-[#3fb950]' : 'bg-[#d29922]/20 text-[#d29922]'}`}>
                        {trade.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[#30363d] bg-[#0d1117]">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-[#30363d] hover:bg-[#3d444d] text-white rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Journal Modal Component
// ============================================================================

function JournalModal({ 
  date, 
  entry, 
  onClose, 
  onSave 
}: { 
  date: string; 
  entry: JournalEntry | null; 
  onClose: () => void;
  onSave: () => void;
}) {
  const [prompts, setPrompts] = useState<JournalPrompt[]>(
    entry?.prompts?.length ? entry.prompts : DEFAULT_PROMPTS.map(p => ({ ...p }))
  );
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const updatePromptAnswer = (id: string, answer: string) => {
    setPrompts(prev => prev.map(p => p.id === id ? { ...p, answer } : p));
  };

  const handleSave = async () => {
    setSaveStatus('idle');
    
    // Validate
    const errors: Record<string, string> = {};
    prompts.forEach((prompt) => {
      if (!prompt.answer || prompt.answer.trim() === '') {
        errors[prompt.id] = 'This field is required';
      }
    });
    
    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      return;
    }
    
    setValidationErrors({});
    setIsSaving(true);
    
    try {
      const response = await fetch('/api/daily-journal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, prompts })
      });
      
      const result = await response.json();
      
      if (result.success) {
        setSaveStatus('success');
        setTimeout(() => {
          onSave();
          onClose();
        }, 1000);
      } else {
        setSaveStatus('error');
      }
    } catch (error) {
      console.error('Error saving journal:', error);
      setSaveStatus('error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const response = await fetch(`/api/daily-journal?date=${date}`, { method: 'DELETE' });
      const result = await response.json();
      
      if (result.success) {
        onSave();
        onClose();
      }
    } catch (error) {
      console.error('Error deleting journal:', error);
    } finally {
      setIsDeleting(false);
    }
  };

  const isEditMode = !!entry;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-[#161b22] border border-[#30363d] rounded-xl w-full max-w-3xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[#30363d] bg-[#0d1117]">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[#1f6feb]/10 rounded-lg">
              <BookOpen className="w-5 h-5 text-[#58a6ff]" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">
                {isEditMode ? 'Edit Journal Entry' : 'New Journal Entry'}
              </h3>
              <p className="text-sm text-[#8b949e]">{formatDateEST(date)}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isEditMode && (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="p-2 hover:bg-[#da3633]/20 text-[#f85149] rounded-lg transition-colors"
                title="Delete entry"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            )}
            <button onClick={onClose} className="p-2 hover:bg-[#30363d] rounded-lg transition-colors">
              <X className="w-5 h-5 text-[#8b949e]" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4 space-y-4">
          {prompts.map((prompt) => (
            <div key={prompt.id}>
              <label className="block text-sm font-medium text-[#F97316] mb-2">
                {prompt.question}
              </label>
              <textarea
                value={prompt.answer}
                onChange={(e) => updatePromptAnswer(prompt.id, e.target.value)}
                placeholder="Type your answer here..."
                className={`w-full h-40 px-3 py-2 bg-[#0d1117] border rounded-lg text-white placeholder-[#8b949e] resize-none focus:outline-none focus:border-[#F97316] ${
                  validationErrors[prompt.id] ? 'border-[#f85149]' : 'border-[#30363d]'
                }`}
              />
              {validationErrors[prompt.id] && (
                <p className="text-xs text-[#f85149] mt-1">{validationErrors[prompt.id]}</p>
              )}
            </div>
          ))}

          {saveStatus === 'success' && (
            <div className="flex items-center gap-2 text-[#3fb950]">
              <CheckCircle className="w-5 h-5" />
              <span>Journal saved successfully!</span>
            </div>
          )}

          {saveStatus === 'error' && (
            <div className="text-[#f85149]">Failed to save journal. Please try again.</div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[#30363d] bg-[#0d1117] flex justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 text-[#8b949e] hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-2 px-4 py-2 bg-[#F97316] hover:bg-[#ea580c] text-white rounded-lg transition-colors disabled:opacity-50"
          >
            {isSaving ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                {isEditMode ? 'Update Entry' : 'Save Entry'}
              </>
            )}
          </button>
        </div>
      </div>

      {/* Delete Confirmation */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[60] p-4">
          <div className="bg-[#161b22] border border-[#30363d] rounded-xl w-full max-w-md p-6">
            <div className="flex items-center gap-3 mb-4">
              <AlertTriangle className="w-8 h-8 text-[#f85149]" />
              <h3 className="text-lg font-bold text-white">Delete Journal Entry?</h3>
            </div>
            <p className="text-[#8b949e] mb-6">
              Are you sure you want to delete the journal entry for{' '}
              <span className="text-white font-medium">{formatDateEST(date)}</span>
              ? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={isDeleting}
                className="px-4 py-2 text-[#8b949e] hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="flex items-center gap-2 px-4 py-2 bg-[#f85149] hover:bg-[#da3633] text-white rounded-lg disabled:opacity-50"
              >
                {isDeleting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    Delete Entry
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
