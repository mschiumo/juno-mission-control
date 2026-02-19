'use client';

import { useState, useMemo } from 'react';
import { Calendar, ChevronLeft, ChevronRight, Plus, Upload, TrendingUp, TrendingDown } from 'lucide-react';

interface DayData {
  date: string;
  pnl: number;
  trades: number;
  hasJournal: boolean;
}

// Generate dummy data for demo
const generateDummyData = (): DayData[] => {
  const data: DayData[] = [];
  const startDate = new Date(2024, 0, 1); // Jan 1, 2024
  
  for (let i = 0; i < 365; i++) {
    const date = new Date(startDate);
    date.setDate(date.getDate() + i);
    
    // Random trading days (skip weekends mostly)
    const dayOfWeek = date.getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) continue; // Skip weekends
    
    // 70% chance of trading on a weekday
    if (Math.random() > 0.3) {
      const trades = Math.floor(Math.random() * 5) + 1; // 1-5 trades
      const pnl = (Math.random() - 0.35) * 2000; // -$700 to +$1300 (slightly positive bias)
      
      data.push({
        date: date.toISOString().split('T')[0],
        pnl: Math.round(pnl * 100) / 100,
        trades,
        hasJournal: Math.random() > 0.5,
      });
    }
  }
  
  return data;
};

const DUMMY_DATA = generateDummyData();

export default function CalendarView() {
  const [currentMonth, setCurrentMonth] = useState(new Date(2024, 0, 1)); // Jan 2024
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);

  const monthData = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    
    const firstDay = new Date(year, month, 1);
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
      const dayData = DUMMY_DATA.find(d => d.date === dateStr);
      days.push(dayData || { date: dateStr, pnl: 0, trades: 0, hasJournal: false });
    }
    
    return days;
  }, [currentMonth]);

  const monthStats = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const monthDays = DUMMY_DATA.filter(d => {
      const date = new Date(d.date);
      return date.getFullYear() === year && date.getMonth() === month;
    });
    
    const totalPnl = monthDays.reduce((sum, d) => sum + d.pnl, 0);
    const totalTrades = monthDays.reduce((sum, d) => sum + d.trades, 0);
    const winDays = monthDays.filter(d => d.pnl > 0).length;
    const lossDays = monthDays.filter(d => d.pnl < 0).length;
    
    return { totalPnl, totalTrades, winDays, lossDays };
  }, [currentMonth]);

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

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigateMonth('prev')}
            className="p-2 hover:bg-[#262626] rounded-lg transition-colors"
          >
            <ChevronLeft className="w-5 h-5 text-[#8b949e]" />
          </button>
          <h2 className="text-xl font-bold text-white min-w-[150px] text-center">
            {currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </h2>
          <button
            onClick={() => navigateMonth('next')}
            className="p-2 hover:bg-[#262626] rounded-lg transition-colors"
          >
            <ChevronRight className="w-5 h-5 text-[#8b949e]" />
          </button>
        </div>
        
        <div className="flex items-center gap-3">
          {/* Month Stats */}
          <div className="hidden md:flex items-center gap-4 text-sm">
            <span className={monthStats.totalPnl >= 0 ? 'text-[#3fb950]' : 'text-[#f85149]'}>
              {monthStats.totalPnl >= 0 ? '+' : ''}{formatCurrency(monthStats.totalPnl)}
            </span>
            <span className="text-[#8b949e]">{monthStats.totalTrades} trades</span>
            <span className="text-[#3fb950]">{monthStats.winDays}W</span>
            <span className="text-[#f85149]">{monthStats.lossDays}L</span>
          </div>
          
          <button
            onClick={() => setShowImportModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-[#238636] hover:bg-[#2ea043] text-white rounded-lg transition-colors font-medium text-sm"
          >
            <Upload className="w-4 h-4" />
            Import
          </button>
          
          <button className="flex items-center gap-2 px-4 py-2 bg-[#F97316] hover:bg-[#ea580c] text-white rounded-lg transition-colors font-medium text-sm">
            <Plus className="w-4 h-4" />
            Add Trade
          </button>
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden">
        {/* Day Headers */}
        <div className="grid grid-cols-7 border-b border-[#30363d]">
          {['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].map(day => (
            <div key={day} className="p-3 text-center text-xs font-medium text-[#8b949e] bg-[#0d1117]">
              {day}
            </div>
          ))}
        </div>
        
        {/* Calendar Days */}
        <div className="grid grid-cols-7">
          {monthData.map((dayData, index) => {
            if (!dayData) {
              return (
                <div key={`empty-${index}`} className="aspect-square border-r border-b border-[#21262d] bg-[#0d1117]/50" />
              );
            }
            
            const dayNumber = new Date(dayData.date).getDate();
            const hasData = dayData.trades > 0;
            
            return (
              <div
                key={dayData.date}
                onClick={() => hasData && setSelectedDate(dayData.date)}
                className={`
                  aspect-square border-r border-b border-[#21262d] p-2 cursor-pointer
                  transition-all hover:brightness-110 relative
                  ${getDayColor(dayData)}
                  ${hasData ? 'hover:ring-2 hover:ring-[#F97316]' : ''}
                `}
              >
                <div className="flex flex-col h-full justify-between">
                  <span className="text-sm font-medium opacity-70">{dayNumber}</span>
                  
                  {hasData && (
                    <div className="text-right">
                      <div className="font-bold text-sm">
                        {dayData.pnl >= 0 ? '+' : ''}{formatCurrency(dayData.pnl)}
                      </div>
                      <div className="text-xs opacity-70">
                        {dayData.trades} trade{dayData.trades !== 1 ? 's' : ''}
                      </div>
                    </div>
                  )}
                </div>
                
                {/* Journal indicator */}
                {dayData.hasJournal && (
                  <div className="absolute top-2 right-2 w-2 h-2 bg-[#a371f7] rounded-full" />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-6 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-[#238636]/20 border border-[#238636]/50 rounded" />
          <span className="text-[#8b949e]">Winning Day</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-[#da3633]/20 border border-[#da3633]/50 rounded" />
          <span className="text-[#8b949e]">Losing Day</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-[#21262d] rounded" />
          <span className="text-[#8b949e]">No Trades</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-[#a371f7] rounded-full" />
          <span className="text-[#8b949e]">Has Journal</span>
        </div>
      </div>

      {/* Day Detail Modal */}
      {selectedDate && (
        <DayDetailModal 
          date={selectedDate} 
          data={DUMMY_DATA.find(d => d.date === selectedDate)!}
          onClose={() => setSelectedDate(null)} 
        />
      )}

      {/* Import Modal */}
      {showImportModal && (
        <ImportModal onClose={() => setShowImportModal(false)} />
      )}
    </div>
  );
}

function DayDetailModal({ date, data, onClose }: { date: string; data: DayData; onClose: () => void }) {
  const dateObj = new Date(date);
  
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-[#161b22] border border-[#30363d] rounded-xl w-full max-w-lg max-h-[80vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[#30363d]">
          <div>
            <h3 className="text-lg font-bold text-white">
              {dateObj.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </h3>
            <p className={`text-sm ${data.pnl >= 0 ? 'text-[#3fb950]' : 'text-[#f85149]'}`}>
              {data.pnl >= 0 ? '+' : ''}${data.pnl.toFixed(2)} · {data.trades} trades
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-[#262626] rounded-lg">
            <span className="text-[#8b949e]">✕</span>
          </button>
        </div>
        
        {/* Content */}
        <div className="p-4 space-y-4 overflow-y-auto max-h-[60vh]">
          {/* Trades List Placeholder */}
          <div>
            <h4 className="text-sm font-medium text-[#8b949e] mb-2">Trades</h4>
            <div className="space-y-2">
              {Array.from({ length: data.trades }).map((_, i) => (
                <div key={i} className="p-3 bg-[#0d1117] rounded-lg border border-[#30363d]">
                  <div className="flex items-center justify-between">
                    <span className="text-white font-medium">AAPL</span>
                    <span className={i % 2 === 0 ? 'text-[#3fb950]' : 'text-[#f85149]'}>
                      {i % 2 === 0 ? '+$' : '-$'}{Math.floor(Math.random() * 500 + 100)}
                    </span>
                  </div>
                  <p className="text-xs text-[#8b949e] mt-1">Long · Breakout setup</p>
                </div>
              ))}
            </div>
          </div>
          
          {/* Daily Journal */}
          <div>
            <h4 className="text-sm font-medium text-[#8b949e] mb-2">Daily Journal</h4>
            <textarea
              placeholder="How did today go? What did you learn?"
              className="w-full p-3 bg-[#0d1117] border border-[#30363d] rounded-lg text-white placeholder-[#8b949e] resize-none h-24 focus:outline-none focus:border-[#F97316]"
              defaultValue={data.hasJournal ? "Followed my plan well today. Avoided FOMO on the midday chop." : ""}
            />
          </div>
        </div>
        
        {/* Footer */}
        <div className="flex justify-end gap-3 p-4 border-t border-[#30363d]">
          <button onClick={onClose} className="px-4 py-2 text-[#8b949e] hover:text-white">
            Close
          </button>
          <button className="px-4 py-2 bg-[#F97316] hover:bg-[#ea580c] text-white rounded-lg">
            Save Journal
          </button>
        </div>
      </div>
    </div>
  );
}

function ImportModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-[#161b22] border border-[#30363d] rounded-xl w-full max-w-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-white">Import Trades</h3>
          <button onClick={onClose} className="text-[#8b949e] hover:text-white">✕</button>
        </div>
        
        <div className="border-2 border-dashed border-[#30363d] rounded-xl p-8 text-center mb-4">
          <Upload className="w-12 h-12 text-[#8b949e] mx-auto mb-4" />
          <p className="text-white font-medium mb-2">Drop CSV or Excel file here</p>
          <p className="text-sm text-[#8b949e] mb-4">Supports ThinkOrSwim, Interactive Brokers, and generic formats</p>
          <button className="px-4 py-2 bg-[#30363d] hover:bg-[#3d444d] text-white rounded-lg transition-colors">
            Select File
          </button>
        </div>
        
        <div className="flex items-center gap-2 text-sm text-[#8b949e]">
          <span>Need a template?</span>
          <a href="/templates/trades_import_template.xlsx" download className="text-[#F97316] hover:underline">
            Download XLSX
          </a>
        </div>
        
        <div className="flex justify-end gap-3 mt-6">
          <button onClick={onClose} className="px-4 py-2 text-[#8b949e] hover:text-white">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
