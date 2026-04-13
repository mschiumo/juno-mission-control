'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import { Eraser, CheckCircle, AlertCircle, XCircle, BookmarkPlus, Info, Loader2, Wand2 } from 'lucide-react';
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
  const [inputs, setInputs] = useState<CalculatorInputs>(() => {
    const savedRisk = typeof window !== 'undefined' ? localStorage.getItem('ct:risk-amount') : null;
    return {
      ...DEFAULT_VALUES,
      riskAmount: savedRisk || DEFAULT_VALUES.riskAmount,
      ticker: initialTicker || '',
    };
  });
  const [showTooltips, setShowTooltips] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'duplicate' | 'success'>('idle');
  const [isLoading, setIsLoading] = useState(false);
  const [optimizeMode, setOptimizeMode] = useState(false);

  // Update ticker when initialTicker prop changes
  useEffect(() => {
    if (initialTicker !== undefined) {
      setInputs(prev => ({ ...prev, ticker: initialTicker }));
    }
  }, [initialTicker]);

  // Auto-calculate target when optimize mode is enabled
  useEffect(() => {
    if (!optimizeMode) return;
    const entry = parseFloat(inputs.entryPrice);
    const stop = parseFloat(inputs.stopPrice);
    const ratio = parseFloat(inputs.riskRatio);
    if (entry > 0 && stop > 0 && ratio > 0) {
      const stopSize = Math.abs(entry - stop);
      const isLong = entry > stop;
      const target = isLong ? entry + stopSize * ratio : entry - stopSize * ratio;
      setInputs(prev => ({ ...prev, targetPrice: target.toFixed(2) }));
    } else {
      setInputs(prev => ({ ...prev, targetPrice: '' }));
    }
  }, [optimizeMode, inputs.entryPrice, inputs.stopPrice, inputs.riskRatio]);

  const handleInputChange = (field: keyof CalculatorInputs, value: string) => {
    // Block manual target edits when optimize mode is on
    if (field === 'targetPrice' && optimizeMode) return;
    // Allow empty string or valid numbers for numeric fields
    if (field === 'ticker') {
      // Convert ticker to uppercase
      setInputs(prev => ({ ...prev, [field]: value.toUpperCase() }));
      onTickerChange?.(value.toUpperCase());
    } else if (value === '' || /^\d*\.?\d*$/.test(value)) {
      setInputs(prev => ({ ...prev, [field]: value }));
      if (field === 'riskAmount' && value) {
        try { localStorage.setItem('ct:risk-amount', value); } catch { /* ignore */ }
      }
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
    if (!isFormValid()) return;

    setIsLoading(true);

    try {
      // Fetch existing watchlist and active trades from API
      const [existingWatchlist, activeTrades] = await Promise.all([
        fetchWatchlist(),
        fetchActiveTrades(),
      ]);

      const tickerInput = inputs.ticker.trim().toUpperCase();

      // Check for duplicate ticker in watchlist (any entry, ticker-only or complete)
      const isDuplicateInWatchlist = existingWatchlist.some((item: WatchlistItem) =>
        item.ticker.toUpperCase() === tickerInput
      );

      // Check for duplicate ticker in active trades
      const isDuplicateInActive = activeTrades.some((trade: ActiveTradeWithPnL) =>
        trade.ticker?.toUpperCase() === tickerInput
      );

      if (isDuplicateInWatchlist) {
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
      window.dispatchEvent(new CustomEvent('ct:watchlist-updated'));
      window.dispatchEvent(new CustomEvent('ct:ticker-moved-to-potential', { detail: tickerToRemove }));

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

  // Only ticker is required to add to Potential Trades
  const isFormValid = () => {
    return inputs.ticker.trim() !== '';
  };

  return (
    <div className="w-full space-y-5">
      {/* Top controls */}
      <div className="flex items-center justify-end gap-2">
        <button
          onClick={() => setShowTooltips(!showTooltips)}
          className={`p-1.5 rounded-lg transition-colors ${showTooltips ? 'text-[#F97316] bg-[#F97316]/10' : 'text-[#8b949e] hover:text-white hover:bg-[#262626]'}`}
          title="Toggle formula explanations"
        >
          <Info className="w-4 h-4" />
        </button>
        <button
          onClick={handleClear}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-[#8b949e] border border-[#30363d] hover:text-white hover:bg-[#262626] hover:border-[#8b949e] rounded-lg transition-colors"
        >
          <Eraser className="w-3.5 h-3.5" />
          Clear
        </button>
      </div>

      {/* Input grid — 2 columns */}
      <div className="grid grid-cols-2 gap-3">
        {/* Ticker — full width */}
        <div className="col-span-2 space-y-1.5">
          <label className="text-xs font-medium text-[#8b949e] uppercase tracking-wide">Ticker</label>
          <input
            type="text"
            value={inputs.ticker}
            onChange={(e) => handleInputChange('ticker', e.target.value)}
            placeholder="AAPL"
            className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-sm text-white placeholder-[#8b949e] focus:outline-none focus:border-[#F97316] transition-colors uppercase"
          />
        </div>

        {/* Risk Amount */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-[#8b949e] uppercase tracking-wide">Risk ($)</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-[#8b949e]">$</span>
            <input
              type="text"
              value={inputs.riskAmount}
              onChange={(e) => handleInputChange('riskAmount', e.target.value)}
              placeholder="20"
              className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg pl-6 pr-3 py-2 text-sm text-white placeholder-[#8b949e] focus:outline-none focus:border-[#F97316] transition-colors"
            />
          </div>
        </div>

        {/* Min R:R */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-[#8b949e] uppercase tracking-wide">Min R:R</label>
          <select
            value={inputs.riskRatio}
            onChange={(e) => handleInputChange('riskRatio', e.target.value)}
            className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#F97316] transition-colors appearance-none cursor-pointer"
            style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12' fill='none'%3E%3Cpath d='M2.5 4.5L6 8L9.5 4.5' stroke='%238b949e' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center' }}
          >
            {RISK_RATIO_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>

        {/* Entry */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-[#8b949e] uppercase tracking-wide">Entry</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-[#8b949e]">$</span>
            <input
              type="text"
              value={inputs.entryPrice}
              onChange={(e) => handleInputChange('entryPrice', e.target.value)}
              placeholder="6.00"
              className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg pl-6 pr-3 py-2 text-sm text-white placeholder-[#8b949e] focus:outline-none focus:border-[#F97316] transition-colors"
            />
          </div>
        </div>

        {/* Stop */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-[#8b949e] uppercase tracking-wide">Stop</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-[#8b949e]">$</span>
            <input
              type="text"
              value={inputs.stopPrice}
              onChange={(e) => handleInputChange('stopPrice', e.target.value)}
              placeholder="5.50"
              className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg pl-6 pr-3 py-2 text-sm text-white placeholder-[#8b949e] focus:outline-none focus:border-[#F97316] transition-colors"
            />
          </div>
        </div>

        {/* Target — full width */}
        <div className="col-span-2 space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-[#8b949e] uppercase tracking-wide">Target</label>
            {/* Optimize toggle */}
            <button
              type="button"
              onClick={() => setOptimizeMode(prev => !prev)}
              className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold transition-colors ${
                optimizeMode
                  ? 'bg-[#F97316]/15 text-[#F97316] border border-[#F97316]/30'
                  : 'text-[#8b949e] hover:text-white border border-transparent hover:border-[#30363d]'
              }`}
              title="Auto-calculate target from Entry + (Stop Size × R:R)"
            >
              <Wand2 className="w-3 h-3" />
              Optimize
            </button>
          </div>
          <div className="relative">
            <span className={`absolute left-3 top-1/2 -translate-y-1/2 text-xs ${optimizeMode ? 'text-[#F97316]/60' : 'text-[#8b949e]'}`}>$</span>
            <input
              type="text"
              value={inputs.targetPrice}
              onChange={(e) => handleInputChange('targetPrice', e.target.value)}
              readOnly={optimizeMode}
              placeholder="7.00"
              className={`w-full rounded-lg pl-6 py-2 text-sm placeholder-[#8b949e] focus:outline-none transition-colors ${
                optimizeMode
                  ? 'bg-[#F97316]/5 border border-[#F97316]/30 pr-12 cursor-not-allowed text-[#F97316]'
                  : 'bg-[#0d1117] border border-[#30363d] pr-3 text-white focus:border-[#F97316]'
              }`}
            />
            {optimizeMode && (
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] font-bold text-[#F97316] bg-[#F97316]/10 px-1 py-0.5 rounded">
                AUTO
              </span>
            )}
          </div>
          {optimizeMode && (
            <p className="text-[10px] text-[#F97316]/60">Entry + (Stop Size × R:R)</p>
          )}
        </div>
      </div>

      {/* Status badge */}
      <div className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg border ${statusColors.bg} ${statusColors.border}`}>
        {statusColors.icon}
        <p className={`text-xs font-medium ${statusColors.text}`}>{calculations.statusMessage}</p>
      </div>

      {/* Metrics strip */}
      <div className="grid grid-cols-5 gap-2">
        {[
          { label: 'Stop Size', value: calculations.stopSize > 0 ? formatCurrency(calculations.stopSize) : '—', color: 'text-white', tooltip: showTooltips && calculations.stopSize > 0 ? `${formatCurrency(calculations.entry)} − ${formatCurrency(calculations.stop)}` : null },
          { label: 'Shares', value: calculations.shareSize > 0 ? formatNumber(calculations.shareSize) : '—', color: 'text-white', tooltip: showTooltips && calculations.shareSize > 0 ? `$${calculations.risk} ÷ ${formatCurrency(calculations.stopSize)}` : null },
          { label: 'R:R', value: calculations.actualRR > 0 ? `${calculations.actualRR.toFixed(2)}:1` : '—', color: calculations.actualRR >= calculations.ratio ? 'text-[#3fb950]' : calculations.actualRR >= calculations.ratio * 0.75 ? 'text-yellow-400' : calculations.actualRR > 0 ? 'text-[#f85149]' : 'text-white', tooltip: null },
          { label: 'Profit', value: calculations.potentialReward > 0 ? formatCurrency(calculations.potentialReward) : '—', color: 'text-[#3fb950]', tooltip: null },
          { label: 'Position', value: calculations.positionValue > 0 ? formatCurrency(calculations.positionValue) : '—', color: 'text-white', tooltip: null },
        ].map(({ label, value, color, tooltip }) => (
          <div key={label} className="bg-[#0d1117] border border-[#30363d] rounded-lg p-2.5 text-center">
            <p className="text-[9px] text-[#8b949e] uppercase tracking-wide mb-1">{label}</p>
            <p className={`text-xs font-bold ${color} tabular-nums`}>{value}</p>
            {tooltip && <p className="text-[9px] text-[#8b949e] mt-0.5 leading-tight">{tooltip}</p>}
          </div>
        ))}
      </div>

      {/* Add to Potential Trades Button - shown whenever ticker is entered */}
      {inputs.ticker.trim() !== '' && (
        <button
          onClick={handleAddToWatchlist}
          disabled={saveStatus === 'duplicate' || isLoading}
          className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
            saveStatus === 'duplicate'
              ? 'bg-red-500/20 border border-red-500/50 text-red-400'
              : saveStatus === 'success'
                ? 'bg-[#3fb950]/20 border border-[#3fb950]/50 text-[#3fb950]'
                : !isLoading
                  ? 'bg-[#F97316] hover:bg-[#F97316]/90 text-white'
                  : 'bg-[#262626] text-[#8b949e] cursor-not-allowed'
          }`}
        >
          {isLoading ? <><Loader2 className="w-4 h-4 animate-spin" />Saving...</>
            : saveStatus === 'duplicate' ? <><AlertCircle className="w-4 h-4" />{inputs.ticker.trim().toUpperCase()} already in Potential Trades</>
            : saveStatus === 'success' ? <><CheckCircle className="w-4 h-4" />Added to Potential Trades!</>
            : <><BookmarkPlus className="w-4 h-4" />Add to Potential Trades</>}
        </button>
      )}
    </div>
  );
}
