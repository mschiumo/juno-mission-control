'use client';

import { useState, useEffect } from 'react';
import { 
  Activity, 
  TrendingUp, 
  DollarSign, 
  Target, 
  Shield,
  Calendar,
  Layers,
  CheckCircle,
  FileText,
  BarChart3,
  X
} from 'lucide-react';
import type { ActiveTrade, ActiveTradeWithPnL } from '@/types/active-trade';

const STORAGE_KEY = 'juno:active-trades';

interface ActiveTradesViewProps {
  onTradeClosed?: () => void;
}

export default function ActiveTradesView({ onTradeClosed }: ActiveTradesViewProps) {
  const [activeTrades, setActiveTrades] = useState<ActiveTradeWithPnL[]>([]);
  const [mounted, setMounted] = useState(false);
  const [closingTradeId, setClosingTradeId] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
    loadActiveTrades();
  }, []);

  // Listen for storage changes (for multi-tab support)
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) {
        loadActiveTrades();
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  // Listen for same-tab updates
  useEffect(() => {
    const handleActiveTradesUpdate = () => {
      loadActiveTrades();
    };

    window.addEventListener('juno:active-trades-updated', handleActiveTradesUpdate);
    return () => window.removeEventListener('juno:active-trades-updated', handleActiveTradesUpdate);
  }, []);

  const loadActiveTrades = () => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setActiveTrades(JSON.parse(stored));
      } else {
        setActiveTrades([]);
      }
    } catch (error) {
      console.error('Error loading active trades:', error);
      setActiveTrades([]);
    }
  };

  const handleClosePosition = (tradeId: string) => {
    const trade = activeTrades.find(t => t.id === tradeId);
    if (!trade) return;

    // TODO: Move to trade history (implement when history view is created)
    // For now, just remove from active trades
    const updated = activeTrades.filter(t => t.id !== tradeId);
    setActiveTrades(updated);
    
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      window.dispatchEvent(new Event('juno:active-trades-updated'));
    } catch (error) {
      console.error('Error saving active trades:', error);
    }

    setClosingTradeId(null);
    
    if (onTradeClosed) {
      onTradeClosed();
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  const formatNumber = (value: number) => {
    return new Intl.NumberFormat('en-US').format(value);
  };

  const formatDate = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Don't render until mounted to avoid hydration mismatch
  if (!mounted) {
    return (
      <div className="w-full">
        <div className="text-center py-12">
          <div className="animate-pulse">
            <div className="w-12 h-12 bg-[#262626] rounded-lg mx-auto mb-4" />
            <div className="h-6 bg-[#262626] rounded w-48 mx-auto mb-2" />
            <div className="h-4 bg-[#262626] rounded w-64 mx-auto" />
          </div>
        </div>
      </div>
    );
  }

  if (activeTrades.length === 0) {
    return (
      <div className="w-full">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-500/10 rounded-lg">
              <Activity className="w-5 h-5 text-green-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">Active Trades</h3>
              <p className="text-sm text-[#8b949e]">Stocks you currently have positions in</p>
            </div>
          </div>
        </div>

        {/* Empty State */}
        <div className="text-center py-12 border border-dashed border-[#30363d] rounded-xl">
          <Activity className="w-12 h-12 text-[#30363d] mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-white mb-2">No Active Positions</h3>
          <p className="text-[#8b949e] max-w-md mx-auto mb-4">
            When you're ready to enter a position, move a trade from your watchlist here.
          </p>
          <div className="flex items-center justify-center gap-2 text-sm text-[#8b949e]">
            <TrendingUp className="w-4 h-4 text-green-500" />
            <span>Go to Watchlist to start a trade</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-green-500/10 rounded-lg">
            <Activity className="w-5 h-5 text-green-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white">Active Trades</h3>
            <p className="text-sm text-[#8b949e]">{activeTrades.length} active position{activeTrades.length !== 1 ? 's' : ''}</p>
          </div>
        </div>
      </div>

      {/* Active Trades Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {activeTrades.map((trade) => (
          <div
            key={trade.id}
            className="bg-[#0F0F0F] border border-green-500/30 rounded-xl overflow-hidden hover:border-green-500/50 transition-all"
          >
            {/* Card Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#262626] bg-green-500/5">
              <div className="flex items-center gap-3">
                <div className="px-3 py-1 bg-green-500/10 rounded-lg">
                  <span className="text-lg font-bold text-green-400">{trade.ticker}</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-[#8b949e]">
                  <Calendar className="w-3.5 h-3.5" />
                  {formatDate(trade.openedAt)}
                </div>
              </div>
              <button
                onClick={() => setClosingTradeId(trade.id)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-green-400 hover:text-white hover:bg-green-500 rounded-lg transition-colors"
                title="Close position"
              >
                <CheckCircle className="w-4 h-4" />
                Close Position
              </button>
            </div>

            {/* Card Body */}
            <div className="p-4 space-y-3">
              {/* Planned vs Actual Row */}
              <div className="grid grid-cols-2 gap-4">
                {/* Planned */}
                <div className="bg-[#161b22] rounded-lg p-3">
                  <div className="text-xs text-[#8b949e] uppercase tracking-wide mb-2">Planned</div>
                  <div className="space-y-1.5">
                    <div className="flex justify-between">
                      <span className="text-xs text-[#8b949e]">Entry</span>
                      <span className="text-xs font-medium text-white">{formatCurrency(trade.plannedEntry)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-xs text-red-400">Stop</span>
                      <span className="text-xs font-medium text-white">{formatCurrency(trade.plannedStop)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-xs text-green-400">Target</span>
                      <span className="text-xs font-medium text-white">{formatCurrency(trade.plannedTarget)}</span>
                    </div>
                  </div>
                </div>

                {/* Actual */}
                <div className="bg-green-500/5 border border-green-500/20 rounded-lg p-3">
                  <div className="text-xs text-green-400 uppercase tracking-wide mb-2">Actual Position</div>
                  <div className="space-y-1.5">
                    <div className="flex justify-between">
                      <span className="text-xs text-[#8b949e]">Entry</span>
                      <span className="text-xs font-medium text-white">{formatCurrency(trade.actualEntry)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-xs text-[#8b949e]">Shares</span>
                      <span className="text-xs font-medium text-white">{formatNumber(trade.actualShares)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-xs text-[#8b949e]">Value</span>
                      <span className="text-xs font-bold text-green-400">{formatCurrency(trade.positionValue)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Notes */}
              {trade.notes && (
                <div className="bg-[#161b22] rounded-lg p-3">
                  <div className="flex items-center gap-1.5 text-xs text-[#8b949e] mb-1">
                    <FileText className="w-3.5 h-3.5" />
                    Notes
                  </div>
                  <p className="text-sm text-white">{trade.notes}</p>
                </div>
              )}

              {/* Stats Row */}
              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center justify-between bg-[#161b22] rounded-lg px-3 py-2">
                  <span className="text-xs text-[#8b949e]">Stop Distance</span>
                  <span className="text-sm font-medium text-white">
                    {formatCurrency(Math.abs(trade.actualEntry - trade.plannedStop))}
                  </span>
                </div>
                <div className="flex items-center justify-between bg-[#161b22] rounded-lg px-3 py-2">
                  <span className="text-xs text-[#8b949e]">Target Distance</span>
                  <span className="text-sm font-medium text-white">
                    {formatCurrency(Math.abs(trade.plannedTarget - trade.actualEntry))}
                  </span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Close Position Confirmation Modal */}
      {closingTradeId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-[#0F0F0F] border border-[#262626] rounded-2xl w-full max-w-sm p-6">
            <div className="text-center">
              <div className="w-12 h-12 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-6 h-6 text-green-400" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">Close Position?</h3>
              <p className="text-sm text-[#8b949e] mb-6">
                This will move the trade to your trade history. This action cannot be undone.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setClosingTradeId(null)}
                  className="flex-1 px-4 py-2 text-[#8b949e] hover:text-white hover:bg-[#262626] rounded-lg transition-colors text-sm font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={() => closingTradeId && handleClosePosition(closingTradeId)}
                  className="flex-1 px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg transition-colors text-sm font-medium"
                >
                  Close Position
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
