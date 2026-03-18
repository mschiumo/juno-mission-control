'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import { Eraser, CheckCircle, AlertCircle, XCircle, BookmarkPlus, Info, Loader2 } from 'lucide-react';
import type { WatchlistItem } from '@/types/watchlist';
import type { ActiveTradeWithPnL } from '@/types/active-trade';

interface CalculatorInputs {
  ticker: string;
  riskAmount: string;
  entryPrice: string;
  stopPrice: string;
  targetPrice: string;
  riskRatio: string;
}

const DEFAULT_VALUES: CalculatorInputs = {
  ticker: '',
  riskAmount: '20',
  entryPrice: '',
  stopPrice: '',
  targetPrice: '',
  riskRatio: '2',
};

const RISK_RATIO_OPTIONS = [
  { value: '1.5', label: '1.5:1' },
  { value: '2', label: '2:1' },
  { value: '2.5', label: '2.5:1' },
  { value: '3', label: '3:1' },
  { value: '4', label: '4:1' },
];

// Default user ID (can be made dynamic with auth later)
const DEFAULT_USER_ID = 'default';

interface PositionCalculatorProps {
  initialTicker?: string;
  onTickerChange?: (ticker: string) => void;
}

export default function PositionCalculator({ initialTicker, onTickerChange }: PositionCalculatorProps) {
  const [inputs, setInputs] = useState<CalculatorInputs>({
    ...DEFAULT_VALUES,
    ticker: initialTicker || '',
  });
  const [showTooltips, setShowTooltips] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [addSuccess, setAddSuccess] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'duplicate' | 'success'>('idle');
  const [isLoading, setIsLoading] = useState(false);

  // Update ticker when initialTicker prop changes
  useEffect(() => {
    if (initialTicker !== undefined) {
      setInputs(prev => ({ ...prev, ticker: initialTicker }));
    }
  }, [initialTicker]);

  const handleInputChange = (field: keyof CalculatorInputs, value: string) => {
    // Allow empty string or valid numbers for numeric fields
    if (field === 'ticker') {
      // Convert ticker to uppercase
      setInputs(prev => ({ ...prev, [field]: value.toUpperCase() }));
      onTickerChange?.(value.toUpperCase());
    } else if (value === '' || /^\d*\.?\d*$/.test(value)) {
      setInputs(prev => ({ ...prev, [field]: value }));
    }
  };

  const handleClear = () => {
    setInputs({
      ticker: '',
      riskAmount: '',
      entryPrice: '',
      stopPrice: '',
      targetPrice: '',
      riskRatio: '2',
    });
    setAddSuccess(false);
    setSaveStatus('idle');
  };

  // Fetch watchlist from API
  const fetchWatchlist = useCallback(async (): Promise<WatchlistItem[]> => {
    try {
      const response = await fetch(`/api/watchlist?userId=${DEFAULT_USER_ID}`);
      if (!response.ok) throw new Error('Failed to fetch watchlist');
      const result = await response.json();
      return result.data || [];
    } catch (error) {
      console.error('Error fetching watchlist:', error);
      return [];
    }
  }, []);

  // Fetch active trades from API
  const fetchActiveTrades = useCallback(async (): Promise<ActiveTradeWithPnL[]> => {
    try {
      const response = await fetch(`/api/active-trades?userId=${DEFAULT_USER_ID}`);
      if (!response.ok) throw new Error('Failed to fetch active trades');
      const result = await response.json();
      return result.data || [];
    } catch (error) {
      console.error('Error fetching active trades:', error);
      return [];
    }
  }, []);

  const handleAddToWatchlist = async () => {
    if (!isFormValid() || calculations.status !== 'valid') return;

    setIsLoading(true);

    try {
      // Fetch existing watchlist and active trades from API
      const [existingWatchlist, activeTrades] = await Promise.all([
        fetchWatchlist(),
        fetchActiveTrades(),
      ]);
      
      const tickerInput = inputs.ticker.trim().toUpperCase();
      
      // Check for duplicate ticker in Potential Trades (complete trades with prices > 0)
      // Exclude Daily Favorites (ticker-only entries with 0 prices)
      const isDuplicateInPotentialTrades = existingWatchlist.some((item: WatchlistItem) =>
        item.ticker.toUpperCase() === tickerInput &&
        item.entryPrice > 0 &&
        item.stopPrice > 0 &&
        item.targetPrice > 0
      );
      
      // Check for duplicate ticker in active trades
      const isDuplicateInActive = activeTrades.some((trade: ActiveTradeWithPnL) =>
        trade.ticker?.toUpperCase() === tickerInput
      );
      
      // Block if in Potential Trades or Active Trades
      // Note: Daily Favorites (ticker-only) does NOT block - you can have same ticker in Daily Favorites and Potential Trades
      if (isDuplicateInPotentialTrades) {
        setSaveStatus('duplicate');
        setTimeout(() => setSaveStatus('idle'), 3000);
        setIsLoading(false);
        return;
      }
      
      if (isDuplicateInActive) {
        setSaveStatus('duplicate');
        setTimeout(() => setSaveStatus('idle'), 3000);
        setIsLoading(false);
        return;
      }

      const newItem: Omit<WatchlistItem, 'id' | 'createdAt'> = {
        ticker: inputs.ticker.trim().toUpperCase(),
        entryPrice: calculations.entry,
        stopPrice: calculations.stop,
        targetPrice: calculations.target,
        riskRatio: calculations.actualRR,
        stopSize: calculations.stopSize,
        shareSize: calculations.shareSize,
        potentialReward: calculations.potentialReward,
        positionValue: calculations.positionValue,
      };

      // Save to API (Redis)
      const response = await fetch(`/api/watchlist?userId=${DEFAULT_USER_ID}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newItem),
      });

      if (!response.ok) {
        throw new Error('Failed to save to watchlist');
      }

      // Dispatch custom event to notify WatchlistView in same tab
      const tickerToRemove = inputs.ticker.trim().toUpperCase();
      window.dispatchEvent(new CustomEvent('juno:watchlist-updated'));
      window.dispatchEvent(new CustomEvent('juno:ticker-moved-to-potential', { detail: tickerToRemove }));

      // Clear inputs after successful save
      handleClear();

      // Show success feedback briefly
      setSaveStatus('success');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (error) {
      console.error('Error saving to watchlist:', error);
      setSaveStatus('duplicate'); // Show error state
      setTimeout(() => setSaveStatus('idle'), 3000);
    } finally {
      setIsLoading(false);
    }
  };

  // Calculate all values
  const calculations = useMemo(() => {
    const risk = parseFloat(inputs.riskAmount) || 0;
    const entry = parseFloat(inputs.entryPrice) || 0;
    const stop = parseFloat(inputs.stopPrice) || 0;
    const target = parseFloat(inputs.targetPrice) || 0;
    const ratio = parseFloat(inputs.riskRatio) || 2;

    // Stop Size = Entry - Stop (for long positions)
    const stopSize = entry > 0 && stop > 0 ? Math.abs(entry - stop) : 0;

    // Share Size = Risk / Stop Size
    const shareSize = stopSize > 0 ? Math.floor(risk / stopSize) : 0;

    // Expected Profit = (Target - Entry) * Share Size
    const potentialReward = entry > 0 && target > 0 && shareSize > 0 ? (target - entry) * shareSize : 0;

    // Actual Risk:Reward = (Target - Entry) / Stop Size
    const actualRR = stopSize > 0 && target > 0 && entry > 0
      ? Math.abs(target - entry) / stopSize
      : 0;

    // Total Position Value = Share Size * Entry Price
    const positionValue = shareSize * entry;

    // Validation status - use selected riskRatio from inputs
    const desiredRatio = parseFloat(inputs.riskRatio) || 2;
    let status: 'valid' | 'marginal' | 'invalid' = 'invalid';
    let statusMessage = 'Enter all values to check trade validity';

    // BUG FIX #1: Add epsilon tolerance to avoid floating point precision issues
    // e.g., 1.9999999 should count as valid when desiredRatio is 2.0
    const EPSILON = 0.001;
    const roundedActualRR = Math.round(actualRR * 100) / 100;

    if (roundedActualRR >= desiredRatio - EPSILON) {
      status = 'valid';
      statusMessage = `✅ Valid Trade - ${roundedActualRR.toFixed(2)}:1 meets minimum ${desiredRatio}:1 requirement`;
    } else if (roundedActualRR >= desiredRatio * 0.75) {
      status = 'marginal';
      statusMessage = `⚠️ Marginal Trade - ${roundedActualRR.toFixed(2)}:1 is below ${desiredRatio}:1 minimum`;
    } else if (roundedActualRR > 0) {
      status = 'invalid';
      statusMessage = `❌ Invalid Trade - ${roundedActualRR.toFixed(2)}:1 is below ${(desiredRatio * 0.75).toFixed(2)}:1 threshold`;
    }

    return {
      stopSize,
      shareSize,
      potentialReward,
      actualRR,
      positionValue,
      status,
      statusMessage,
      risk,
      entry,
      stop,
      target,
      ratio,
    };
  }, [inputs]);

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

  const getStatusColors = () => {
    switch (calculations.status) {
      case 'valid':
        return {
          bg: 'bg-green-500/10',
          border: 'border-green-500/30',
          text: 'text-green-400',
          icon: <CheckCircle className="w-5 h-5 text-green-400" />,
        };
      case 'marginal':
        return {
          bg: 'bg-yellow-500/10',
          border: 'border-yellow-500/30',
          text: 'text-yellow-400',
          icon: <AlertCircle className="w-5 h-5 text-yellow-400" />,
        };
      case 'invalid':
      default:
        return {
          bg: calculations.actualRR > 0 ? 'bg-red-500/10' : 'bg-[#262626]',
          border: calculations.actualRR > 0 ? 'border-red-500/30' : 'border-[#30363d]',
          text: calculations.actualRR > 0 ? 'text-red-400' : 'text-[#8b949e]',
          icon: calculations.actualRR > 0 ? <XCircle className="w-5 h-5 text-red-400" /> : <Info className="w-5 h-5 text-[#8b949e]" />,
        };
    }
  };

  const statusColors = getStatusColors();

  // Check if all required form fields are filled for watchlist
  const isFormValid = () => {
    return (
      inputs.ticker.trim() !== '' &&
      inputs.riskAmount !== '' && parseFloat(inputs.riskAmount) > 0 &&
      inputs.entryPrice !== '' && parseFloat(inputs.entryPrice) > 0 &&
      inputs.stopPrice !== '' && parseFloat(inputs.stopPrice) > 0 &&
      inputs.targetPrice !== '' && parseFloat(inputs.targetPrice) > 0
    );
  };

  return (
    <div className="w-full">
      {/* Controls row */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium border ${statusColors.bg} ${statusColors.border} ${statusColors.text}`}>
            {calculations.status === 'valid' ? '✓ Valid' : calculations.status === 'marginal' ? '⚠ Marginal' : calculations.actualRR > 0 ? '✗ Invalid' : 'Awaiting input'}
          </span>
          {calculations.actualRR > 0 && (
            <span className="text-xs text-[#8b949e] font-mono">{calculations.actualRR.toFixed(2)}:1</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowTooltips(!showTooltips)}
            className={`p-1.5 rounded transition-colors ${showTooltips ? 'text-[#F97316] bg-[#F97316]/10' : 'text-[#8b949e] hover:text-white hover:bg-[#1a1a1a]'}`}
            title="Toggle formulas"
          >
            <Info className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleClear}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-[#8b949e] border border-[#30363d] hover:text-white hover:bg-[#1a1a1a] rounded transition-colors"
          >
            <Eraser className="w-3 h-3" />
            Clear
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Left: Inputs */}
        <div className="space-y-2.5">
          {/* Ticker + Risk */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] font-medium text-[#6e7681] uppercase tracking-wide mb-1 block">Ticker</label>
              <input
                type="text"
                value={inputs.ticker}
                onChange={(e) => handleInputChange('ticker', e.target.value)}
                placeholder="AAPL"
                className="w-full bg-[#0d1117] border border-[#30363d] rounded px-3 py-2 text-white text-sm placeholder-[#484f58] focus:outline-none focus:border-[#F97316] uppercase font-mono transition-colors"
              />
            </div>
            <div>
              <label className="text-[10px] font-medium text-[#6e7681] uppercase tracking-wide mb-1 block">Risk ($)</label>
              <div className="relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#6e7681] text-xs">$</span>
                <input
                  type="text"
                  value={inputs.riskAmount}
                  onChange={(e) => handleInputChange('riskAmount', e.target.value)}
                  placeholder="20"
                  className="w-full bg-[#0d1117] border border-[#30363d] rounded pl-5 pr-3 py-2 text-white text-sm placeholder-[#484f58] focus:outline-none focus:border-[#F97316] font-mono transition-colors"
                />
              </div>
            </div>
          </div>

          {/* Entry + Stop */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] font-medium text-[#6e7681] uppercase tracking-wide mb-1 block">Entry</label>
              <div className="relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#6e7681] text-xs">$</span>
                <input
                  type="text"
                  value={inputs.entryPrice}
                  onChange={(e) => handleInputChange('entryPrice', e.target.value)}
                  placeholder="6.00"
                  className="w-full bg-[#0d1117] border border-[#30363d] rounded pl-5 pr-3 py-2 text-white text-sm placeholder-[#484f58] focus:outline-none focus:border-[#F97316] font-mono transition-colors"
                />
              </div>
            </div>
            <div>
              <label className="text-[10px] font-medium text-[#6e7681] uppercase tracking-wide mb-1 block">Stop</label>
              <div className="relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#6e7681] text-xs">$</span>
                <input
                  type="text"
                  value={inputs.stopPrice}
                  onChange={(e) => handleInputChange('stopPrice', e.target.value)}
                  placeholder="5.50"
                  className="w-full bg-[#0d1117] border border-[#30363d] rounded pl-5 pr-3 py-2 text-white text-sm placeholder-[#484f58] focus:outline-none focus:border-[#F97316] font-mono transition-colors"
                />
              </div>
            </div>
          </div>

          {/* Target + R:R */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] font-medium text-[#6e7681] uppercase tracking-wide mb-1 block">Target</label>
              <div className="relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#6e7681] text-xs">$</span>
                <input
                  type="text"
                  value={inputs.targetPrice}
                  onChange={(e) => handleInputChange('targetPrice', e.target.value)}
                  placeholder="7.00"
                  className="w-full bg-[#0d1117] border border-[#30363d] rounded pl-5 pr-3 py-2 text-white text-sm placeholder-[#484f58] focus:outline-none focus:border-[#F97316] font-mono transition-colors"
                />
              </div>
            </div>
            <div>
              <label className="text-[10px] font-medium text-[#6e7681] uppercase tracking-wide mb-1 block">Min R:R</label>
              <select
                value={inputs.riskRatio}
                onChange={(e) => handleInputChange('riskRatio', e.target.value)}
                className="w-full bg-[#0d1117] border border-[#30363d] rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-[#F97316] font-mono transition-colors appearance-none cursor-pointer"
                style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 12 12' fill='none'%3E%3Cpath d='M2.5 4.5L6 8L9.5 4.5' stroke='%238b949e' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center' }}
              >
                {RISK_RATIO_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* R:R progress bar */}
          {calculations.actualRR > 0 && (
            <div className="pt-1 space-y-1">
              <div className="flex justify-between text-[10px] text-[#484f58]">
                <span>0:1</span>
                <span className={`font-mono font-medium ${statusColors.text}`}>{calculations.actualRR.toFixed(2)}:1</span>
                <span>{(calculations.ratio * 1.5).toFixed(1)}:1</span>
              </div>
              <div className="h-1 bg-[#30363d] rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    calculations.status === 'valid' ? 'bg-green-500' :
                    calculations.status === 'marginal' ? 'bg-yellow-500' : 'bg-red-500'
                  }`}
                  style={{ width: `${Math.min(100, (calculations.actualRR / (calculations.ratio * 1.5)) * 100)}%` }}
                />
              </div>
            </div>
          )}

          {/* Formula hints */}
          {showTooltips && (
            <div className="p-2.5 bg-[#0d1117] border border-[#30363d] rounded text-[10px] text-[#6e7681] space-y-0.5">
              <p>Shares = Risk ÷ |Entry − Stop|</p>
              <p>R:R = |Target − Entry| ÷ |Entry − Stop|</p>
              <p>Position = Shares × Entry</p>
            </div>
          )}
        </div>

        {/* Right: Results */}
        <div className="space-y-2.5">
          {/* 2×2 metrics */}
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-[#0d1117] border border-[#30363d] rounded-lg p-3">
              <p className="text-[10px] text-[#6e7681] uppercase tracking-wide mb-1.5">Stop Size</p>
              <p className="text-xl font-bold text-white font-mono leading-none">
                {calculations.stopSize > 0 ? formatCurrency(calculations.stopSize) : '—'}
              </p>
              {showTooltips && calculations.stopSize > 0 && (
                <p className="text-[10px] text-[#484f58] mt-1">Entry − Stop</p>
              )}
            </div>
            <div className="bg-[#0d1117] border border-[#30363d] rounded-lg p-3">
              <p className="text-[10px] text-[#6e7681] uppercase tracking-wide mb-1.5">Shares</p>
              <p className="text-xl font-bold text-white font-mono leading-none">
                {calculations.shareSize > 0 ? formatNumber(calculations.shareSize) : '—'}
              </p>
              {showTooltips && calculations.shareSize > 0 && (
                <p className="text-[10px] text-[#484f58] mt-1">Risk ÷ Stop Size</p>
              )}
            </div>
            <div className="bg-[#0d1117] border border-[#30363d] rounded-lg p-3">
              <p className="text-[10px] text-[#6e7681] uppercase tracking-wide mb-1.5">Exp. Profit</p>
              <p className="text-xl font-bold text-green-400 font-mono leading-none">
                {calculations.potentialReward > 0 ? formatCurrency(calculations.potentialReward) : '—'}
              </p>
              {showTooltips && calculations.potentialReward > 0 && (
                <p className="text-[10px] text-[#484f58] mt-1">ΔPrice × Shares</p>
              )}
            </div>
            <div className="bg-[#0d1117] border border-[#30363d] rounded-lg p-3">
              <p className="text-[10px] text-[#6e7681] uppercase tracking-wide mb-1.5">Actual R:R</p>
              <p className={`text-xl font-bold font-mono leading-none ${
                calculations.actualRR >= calculations.ratio ? 'text-green-400' :
                calculations.actualRR >= calculations.ratio * 0.75 ? 'text-yellow-400' :
                calculations.actualRR > 0 ? 'text-red-400' : 'text-white'
              }`}>
                {calculations.actualRR > 0 ? `${calculations.actualRR.toFixed(2)}:1` : '—'}
              </p>
              {showTooltips && calculations.actualRR > 0 && (
                <p className="text-[10px] text-[#484f58] mt-1">ΔPrice ÷ Stop</p>
              )}
            </div>
          </div>

          {/* Position value — full width */}
          <div className="bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2.5 flex items-center justify-between">
            <p className="text-[10px] text-[#6e7681] uppercase tracking-wide">Position Value</p>
            <p className="text-lg font-bold text-white font-mono">
              {calculations.positionValue > 0 ? formatCurrency(calculations.positionValue) : '—'}
            </p>
          </div>

          {/* Add to watchlist */}
          <button
            onClick={handleAddToWatchlist}
            disabled={calculations.status !== 'valid' || !isFormValid() || saveStatus === 'duplicate' || isLoading}
            className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded text-sm font-medium transition-all ${
              saveStatus === 'duplicate'
                ? 'bg-red-500/20 border border-red-500/50 text-red-400'
                : addSuccess || saveStatus === 'success'
                  ? 'bg-green-500 text-white'
                  : calculations.status === 'valid' && isFormValid() && !isLoading
                    ? 'bg-[#F97316] hover:bg-[#ea580c] text-white'
                    : 'bg-[#161b22] border border-[#30363d] text-[#484f58] cursor-not-allowed'
            }`}
          >
            {isLoading ? (
              <><Loader2 className="w-4 h-4 animate-spin" />Saving...</>
            ) : saveStatus === 'duplicate' ? (
              <><AlertCircle className="w-4 h-4" />{inputs.ticker.trim().toUpperCase()} already in watchlist</>
            ) : addSuccess || saveStatus === 'success' ? (
              <><CheckCircle className="w-4 h-4" />Added!</>
            ) : (
              <><BookmarkPlus className="w-4 h-4" />Add to Watchlist</>
            )}
          </button>

          {/* Status detail */}
          {calculations.actualRR > 0 && (
            <p className={`text-xs text-center ${statusColors.text}`}>
              {calculations.actualRR.toFixed(2)}:1 · min {calculations.ratio}:1 · threshold {(calculations.ratio * 0.75).toFixed(2)}:1
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
