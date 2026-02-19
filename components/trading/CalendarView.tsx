'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { Calendar, ChevronLeft, ChevronRight, Plus, Upload, TrendingUp, TrendingDown } from 'lucide-react';

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
  id?: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  quantity: number;
  price: number;
  date: string;
  time: string;
  execTime: string;
  posEffect?: string;
  orderType?: string;
  pnl?: number;
}

export default function CalendarView() {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [dailyStats, setDailyStats] = useState<DayData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedDateTrades, setSelectedDateTrades] = useState<TOSTrade[]>([]);

  // Fetch real data from API
  useEffect(() => {
    fetchDailyStats();
  }, []);

  const fetchDailyStats = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/trades');
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

  const fetchTradesForDate = async (date: string) => {
    try {
      const [tradesRes, journalRes] = await Promise.all([
        fetch(`/api/trades?date=${date}`),
        fetch(`/api/trades/journal?date=${date}`)
      ]);
      
      const tradesData = await tradesRes.json();
      const journalData = await journalRes.json();
      
      if (tradesData.success && tradesData.trades) {
        setSelectedDateTrades(tradesData.trades);
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
    setSelectedDate(date);
    fetchTradesForDate(date);
  };

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
      const dayData = dailyStats.find(d => d.date === dateStr);
      days.push(dayData || { date: dateStr, pnl: 0, trades: 0, hasJournal: false });
    }
    
    return days;
  }, [currentMonth, dailyStats]);

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
    fetchDailyStats(); // Refresh data after import
  };

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
          {/* Month Stats with Labels */}
          <div className="hidden md:flex items-center gap-4 text-sm bg-[#161b22] border border-[#30363d] rounded-lg px-4 py-2">
            <div className="flex flex-col items-center">
              <span className="text-[10px] text-[#8b949e] uppercase tracking-wide">PnL</span>
              <span className={monthStats.totalPnl >= 0 ? 'text-[#3fb950] font-semibold' : 'text-[#f85149] font-semibold'}>
                {monthStats.totalPnl >= 0 ? '+' : ''}{formatCurrency(monthStats.totalPnl)}
              </span>
            </div>
            
            <div className="w-px h-8 bg-[#30363d]" />
            
            <div className="flex flex-col items-center">
              <span className="text-[10px] text-[#8b949e] uppercase tracking-wide">W/L</span>
              <div className="flex items-center gap-1">
                <span className="text-[#3fb950] font-semibold">{monthStats.winDays}W</span>
                <span className="text-[#8b949e]">/</span>
                <span className="text-[#f85149] font-semibold">{monthStats.lossDays}L</span>
              </div>
            </div>
            
            <div className="w-px h-8 bg-[#30363d]" />
            
            <div className="flex flex-col items-center">
              <span className="text-[10px] text-[#8b949e] uppercase tracking-wide">Sharpe</span>
              <span className={monthStats.avgSharpe >= 1 ? 'text-[#3fb950] font-semibold' : 'text-[#8b949e] font-semibold'}>
                {monthStats.avgSharpe.toFixed(2)}
              </span>
            </div>
            
            <div className="w-px h-8 bg-[#30363d]" />
            
            <div className="flex flex-col items-center">
              <span className="text-[10px] text-[#8b949e] uppercase tracking-wide">Trades</span>
              <span className="text-white font-semibold">{monthStats.totalTrades}</span>
            </div>
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
                onClick={() => hasData && handleDateClick(dayData.date)}
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
          data={dailyStats.find(d => d.date === selectedDate) || { date: selectedDate, pnl: 0, trades: 0, hasJournal: false }} 
          trades={selectedDateTrades}
          onClose={() => {
            setSelectedDate(null);
            setSelectedDateTrades([]);
          }}
          onSave={() => fetchDailyStats()}
        />
      )}

      {/* Import Modal */}
      {showImportModal && (
        <ImportModal onClose={() => setShowImportModal(false)} onSuccess={handleImportSuccess} />
      )}
    </div>
  );
}

function DayDetailModal({ date, data, trades, onClose, onSave }: { date: string; data: DayData; trades: TOSTrade[]; onClose: () => void; onSave?: (date: string, notes: string) => void }) {
  const dateObj = new Date(date);
  const [journalText, setJournalText] = useState(data.hasJournal ? "Followed my plan well today. Avoided FOMO on the midday chop." : "");
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<{ success: boolean; message: string } | null>(null);
  
  const handleSave = async () => {
    setIsSaving(true);
    setSaveStatus(null);
    
    try {
      const response = await fetch('/api/trades/journal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, notes: journalText })
      });
      
      const result = await response.json();
      
      if (result.success) {
        setSaveStatus({ success: true, message: 'Journal saved!' });
        if (onSave) onSave(date, journalText);
        
        // Close modal after short delay
        setTimeout(() => {
          onClose();
        }, 1000);
      } else {
        setSaveStatus({ success: false, message: result.error || 'Failed to save' });
      }
    } catch (error) {
      setSaveStatus({ success: false, message: 'Error saving journal' });
    } finally {
      setIsSaving(false);
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
      const buys = symbolTrades.filter(t => t.side === 'BUY');
      const sells = symbolTrades.filter(t => t.side === 'SELL');
      
      let pnl = 0;
      if (buys.length > 0 && sells.length > 0) {
        const buyValue = buys.reduce((sum, t) => sum + t.price * t.quantity, 0);
        const buyQty = buys.reduce((sum, t) => sum + t.quantity, 0);
        const avgBuy = buyQty > 0 ? buyValue / buyQty : 0;
        
        const sellValue = sells.reduce((sum, t) => sum + t.price * t.quantity, 0);
        const sellQty = sells.reduce((sum, t) => sum + t.quantity, 0);
        const avgSell = sellQty > 0 ? sellValue / sellQty : 0;
        
        pnl = (avgSell - avgBuy) * Math.min(buyQty, sellQty);
      }
      
      return { symbol, trades: symbolTrades, pnl, isWin: pnl > 0 };
    });
  }, [tradesBySymbol]);
  
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-[#161b22] border border-[#30363d] rounded-xl w-full max-w-lg max-h-[80vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[#30363d]">
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
        <div className="grid grid-cols-3 gap-4 p-4 bg-[#0d1117] border-b border-[#30363d]">
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
        
        {/* Content */}
        <div className="p-4 space-y-4 overflow-y-auto max-h-[60vh]">
          {/* Trades List with Details */}
          <div>
            <h4 className="text-sm font-medium text-[#8b949e] mb-2">Trades ({trades.length})</h4>
            <div className="space-y-2">
              {trades.length === 0 ? (
                <div className="text-[#8b949e] text-sm">No trade details available</div>
              ) : (
                symbolPnLs.map(({ symbol, trades: symbolTrades, pnl }) => {
                  const isWin = pnl > 0;
                  const buy = symbolTrades.find(t => t.side === 'BUY');
                  const sell = symbolTrades.find(t => t.side === 'SELL');
                  
                  return (
                    <div key={symbol} className="p-3 bg-[#0d1117] rounded-lg border border-[#30363d]">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-white font-medium">{symbol}</span>
                          <span className="text-xs px-2 py-0.5 bg-[#21262d] rounded text-[#8b949e]">
                            {symbolTrades.length} fills
                          </span>
                        </div>
                        <span className={isWin ? 'text-[#3fb950] font-semibold' : pnl < 0 ? 'text-[#f85149] font-semibold' : 'text-[#8b949e] font-semibold'}>
                          {pnl > 0 ? '+' : ''}${pnl.toFixed(2)}
                        </span>
                      </div>
                      <div className="grid grid-cols-4 gap-2 text-xs">
                        {buy && (
                          <div>
                            <span className="text-[#8b949e]">Buy: </span>
                            <span className="text-[#3fb950]">${buy.price.toFixed(2)}</span>
                          </div>
                        )}
                        {sell && (
                          <div>
                            <span className="text-[#8b949e]">Sell: </span>
                            <span className="text-[#f85149]">${sell.price.toFixed(2)}</span>
                          </div>
                        )}
                        <div>
                          <span className="text-[#8b949e]">Qty: </span>
                          <span className="text-white">{symbolTrades[0]?.quantity}</span>
                        </div>
                        <div>
                          <span className="text-[#8b949e]">Time: </span>
                          <span className="text-white">{symbolTrades[0]?.time.slice(0, 5)}</span>
                        </div>
                      </div>
                      <div className="mt-2 pt-2 border-t border-[#21262d]">
                        <span className="text-xs text-[#8b949e]">
                          {symbolTrades.map(t => `${t.side} ${t.quantity} @ $${t.price.toFixed(2)}`).join(' → ')}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
          
          {/* Daily Journal */}
          <div>
            <h4 className="text-sm font-medium text-[#8b949e] mb-2">Daily Journal</h4>
            <textarea
              placeholder="How did today go? What did you learn?"
              className="w-full p-3 bg-[#0d1117] border border-[#30363d] rounded-lg text-white placeholder-[#8b949e] resize-none h-24 focus:outline-none focus:border-[#F97316]"
              value={journalText}
              onChange={(e) => setJournalText(e.target.value)}
            />
            {saveStatus && (
              <p className={`text-xs mt-1 ${saveStatus.success ? 'text-[#3fb950]' : 'text-[#f85149]'}`}>{saveStatus.message}</p>
            )}
          </div>
        </div>
        
        {/* Footer */}
        <div className="flex justify-end gap-3 p-4 border-t border-[#30363d]">
          <button onClick={onClose} className="px-4 py-2 text-[#8b949e] hover:text-white">
            Close
          </button>
          <button 
            onClick={handleSave}
            disabled={isSaving}
            className="px-4 py-2 bg-[#F97316] hover:bg-[#ea580c] text-white rounded-lg disabled:opacity-50 flex items-center gap-2"
          >
            {isSaving ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Saving...
              </>
            ) : (
              'Save Journal'
            )}
          </button>
        </div>
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
