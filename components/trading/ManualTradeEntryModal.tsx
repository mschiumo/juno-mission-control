'use client';

import { useState, useEffect } from 'react';
import { X, Plus, TrendingUp, TrendingDown, DollarSign, Calendar, AlignLeft, Hash } from 'lucide-react';
import { TradeSide } from '@/types/trading';

interface ManualTrade {
  id: string;
  ticker: string;
  entryPrice: number;
  exitPrice?: number;
  shares: number;
  side: 'LONG' | 'SHORT';
  pnl: number;
  date: string;
  notes?: string;
  source: 'manual';
}

interface ManualTradeEntryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  initialDate?: string;
}

export default function ManualTradeEntryModal({ 
  isOpen, 
  onClose, 
  onSuccess,
  initialDate 
}: ManualTradeEntryModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Form state
  const [ticker, setTicker] = useState('');
  const [entryPrice, setEntryPrice] = useState('');
  const [exitPrice, setExitPrice] = useState('');
  const [shares, setShares] = useState('');
  const [side, setSide] = useState<'LONG' | 'SHORT'>('LONG');
  const [pnl, setPnl] = useState('');
  const [date, setDate] = useState('');
  const [notes, setNotes] = useState('');
  const [autoCalculatePnL, setAutoCalculatePnL] = useState(true);

  // Set initial date when modal opens
  useEffect(() => {
    if (isOpen && initialDate) {
      setDate(initialDate);
    } else if (isOpen && !date) {
      // Default to today in YYYY-MM-DD format
      const today = new Date();
      const estDate = new Date(today.toLocaleString('en-US', { timeZone: 'America/New_York' }));
      const year = estDate.getFullYear();
      const month = String(estDate.getMonth() + 1).padStart(2, '0');
      const day = String(estDate.getDate()).padStart(2, '0');
      setDate(`${year}-${month}-${day}`);
    }
  }, [isOpen, initialDate]);

  // Auto-calculate P&L when exit price changes
  useEffect(() => {
    if (autoCalculatePnL && entryPrice && exitPrice && shares) {
      const entry = parseFloat(entryPrice);
      const exit = parseFloat(exitPrice);
      const numShares = parseInt(shares, 10);
      
      if (!isNaN(entry) && !isNaN(exit) && !isNaN(numShares) && numShares > 0) {
        let calculatedPnl = 0;
        if (side === 'LONG') {
          calculatedPnl = (exit - entry) * numShares;
        } else {
          calculatedPnl = (entry - exit) * numShares;
        }
        setPnl(calculatedPnl.toFixed(2));
      }
    }
  }, [entryPrice, exitPrice, shares, side, autoCalculatePnL]);

  const resetForm = () => {
    setTicker('');
    setEntryPrice('');
    setExitPrice('');
    setShares('');
    setSide('LONG');
    setPnl('');
    setNotes('');
    setError(null);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const validateForm = (): boolean => {
    if (!ticker.trim()) {
      setError('Ticker symbol is required');
      return false;
    }
    if (!entryPrice || parseFloat(entryPrice) <= 0) {
      setError('Entry price must be greater than 0');
      return false;
    }
    if (!shares || parseInt(shares, 10) <= 0) {
      setError('Number of shares must be greater than 0');
      return false;
    }
    if (!date) {
      setError('Date is required');
      return false;
    }
    if (!pnl || isNaN(parseFloat(pnl))) {
      setError('P&L is required');
      return false;
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const trade: ManualTrade = {
        id: crypto.randomUUID(),
        ticker: ticker.trim().toUpperCase(),
        entryPrice: parseFloat(entryPrice),
        exitPrice: exitPrice ? parseFloat(exitPrice) : undefined,
        shares: parseInt(shares, 10),
        side,
        pnl: parseFloat(pnl),
        date,
        notes: notes.trim() || undefined,
        source: 'manual'
      };
      
      const response = await fetch('/api/trades/manual-add', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(trade),
      });
      
      const result = await response.json();
      
      if (result.success) {
        resetForm();
        onSuccess?.();
        onClose();
      } else {
        setError(result.error || 'Failed to save trade');
      }
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-[#161b22] border border-[#30363d] rounded-xl w-full max-w-lg max-h-[90vh] overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#1a1f2e] to-[#161b22] border-b border-[#30363d] p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-[#F97316]/10 rounded-xl">
                <Plus className="w-6 h-6 text-[#F97316]" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">Add Manual Trade</h2>
                <p className="text-sm text-[#8b949e]">Record a trade for paper trading</p>
              </div>
            </div>
            <button
              onClick={handleClose}
              className="p-2 hover:bg-[#30363d] rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-[#8b949e]" />
            </button>
          </div>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto max-h-[calc(90vh-140px)]">
          {/* Error message */}
          {error && (
            <div className="p-3 bg-[#da3633]/20 border border-[#da3633]/50 rounded-lg text-[#f85149] text-sm">
              {error}
            </div>
          )}

          {/* Date Field */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-[#8b949e]">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                Trade Date
              </div>
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-3 py-2 bg-[#0d1117] border border-[#30363d] rounded-lg text-white text-sm focus:outline-none focus:border-[#F97316] focus:ring-1 focus:ring-[#F97316] transition-colors"
              required
            />
          </div>

          {/* Ticker and Side Row */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="block text-sm font-medium text-[#8b949e]">
                <div className="flex items-center gap-2">
                  <Hash className="w-4 h-4" />
                  Ticker Symbol
                </div>
              </label>
              <input
                type="text"
                value={ticker}
                onChange={(e) => setTicker(e.target.value.toUpperCase())}
                placeholder="AAPL"
                className="w-full px-3 py-2 bg-[#0d1117] border border-[#30363d] rounded-lg text-white text-sm focus:outline-none focus:border-[#F97316] focus:ring-1 focus:ring-[#F97316] transition-colors"
                required
              />
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-[#8b949e]">Side</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setSide('LONG')}
                  className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    side === 'LONG'
                      ? 'bg-[#238636]/20 text-[#3fb950] border border-[#238636]/50'
                      : 'bg-[#0d1117] text-[#8b949e] border border-[#30363d] hover:border-[#3fb950]/50'
                  }`}
                >
                  <TrendingUp className="w-4 h-4" />
                  Long
                </button>
                <button
                  type="button"
                  onClick={() => setSide('SHORT')}
                  className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    side === 'SHORT'
                      ? 'bg-[#da3633]/20 text-[#f85149] border border-[#da3633]/50'
                      : 'bg-[#0d1117] text-[#8b949e] border border-[#30363d] hover:border-[#f85149]/50'
                  }`}
                >
                  <TrendingDown className="w-4 h-4" />
                  Short
                </button>
              </div>
            </div>
          </div>

          {/* Prices Row */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <label className="block text-sm font-medium text-[#8b949e]">Entry Price</label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8b949e]" />
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={entryPrice}
                  onChange={(e) => setEntryPrice(e.target.value)}
                  placeholder="0.00"
                  className="w-full pl-9 pr-3 py-2 bg-[#0d1117] border border-[#30363d] rounded-lg text-white text-sm focus:outline-none focus:border-[#F97316] focus:ring-1 focus:ring-[#F97316] transition-colors"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-[#8b949e]">
                Exit Price
                <span className="text-[#8b949e]/60 ml-1">(opt)</span>
              </label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8b949e]" />
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={exitPrice}
                  onChange={(e) => setExitPrice(e.target.value)}
                  placeholder="0.00"
                  className="w-full pl-9 pr-3 py-2 bg-[#0d1117] border border-[#30363d] rounded-lg text-white text-sm focus:outline-none focus:border-[#F97316] focus:ring-1 focus:ring-[#F97316] transition-colors"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-[#8b949e]">Shares</label>
              <input
                type="number"
                min="1"
                step="1"
                value={shares}
                onChange={(e) => setShares(e.target.value)}
                placeholder="100"
                className="w-full px-3 py-2 bg-[#0d1117] border border-[#30363d] rounded-lg text-white text-sm focus:outline-none focus:border-[#F97316] focus:ring-1 focus:ring-[#F97316] transition-colors"
                required
              />
            </div>
          </div>

          {/* P&L Field */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-sm font-medium text-[#8b949e]">P&L Amount</label>
              <label className="flex items-center gap-2 text-xs text-[#8b949e] cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoCalculatePnL}
                  onChange={(e) => setAutoCalculatePnL(e.target.checked)}
                  className="rounded border-[#30363d] bg-[#0d1117] text-[#F97316] focus:ring-[#F97316]"
                />
                Auto-calculate
              </label>
            </div>
            <div className="relative">
              <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8b949e]" />
              <input
                type="number"
                step="0.01"
                value={pnl}
                onChange={(e) => {
                  setPnl(e.target.value);
                  if (e.target.value !== '') {
                    setAutoCalculatePnL(false);
                  }
                }}
                placeholder="0.00 (negative for loss)"
                className={`w-full pl-9 pr-3 py-2 bg-[#0d1117] border rounded-lg text-white text-sm focus:outline-none focus:ring-1 transition-colors ${
                  parseFloat(pnl) > 0
                    ? 'border-[#238636]/50 focus:border-[#238636] focus:ring-[#238636]'
                    : parseFloat(pnl) < 0
                    ? 'border-[#da3633]/50 focus:border-[#da3633] focus:ring-[#da3633]'
                    : 'border-[#30363d] focus:border-[#F97316] focus:ring-[#F97316]'
                }`}
                required
              />
            </div>
            {parseFloat(pnl) > 0 && (
              <p className="text-xs text-[#3fb950]">Profit: +${parseFloat(pnl).toFixed(2)}</p>
            )}
            {parseFloat(pnl) < 0 && (
              <p className="text-xs text-[#f85149]">Loss: ${parseFloat(pnl).toFixed(2)}</p>
            )}
          </div>

          {/* Notes Field */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-[#8b949e]">
              <div className="flex items-center gap-2">
                <AlignLeft className="w-4 h-4" />
                Notes <span className="text-[#8b949e]/60">(optional)</span>
              </div>
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add any notes about this trade..."
              rows={3}
              className="w-full px-3 py-2 bg-[#0d1117] border border-[#30363d] rounded-lg text-white text-sm focus:outline-none focus:border-[#F97316] focus:ring-1 focus:ring-[#F97316] transition-colors resize-none"
            />
          </div>

          {/* Submit Buttons */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={handleClose}
              className="flex-1 px-4 py-2.5 bg-[#30363d] hover:bg-[#3d444d] text-white rounded-lg transition-colors font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2.5 bg-[#F97316] hover:bg-[#F97316]/90 text-white rounded-lg transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  Add Trade
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
