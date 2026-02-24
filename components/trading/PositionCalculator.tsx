'use client';

import { useState, useMemo } from 'react';
import { Calculator, RotateCcw, CheckCircle, AlertCircle, XCircle, BookmarkPlus, Info } from 'lucide-react';
import type { WatchlistItem } from '@/types/watchlist';

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

const STORAGE_KEY = 'juno:trade-watchlist';

export default function PositionCalculator() {
  const [inputs, setInputs] = useState<CalculatorInputs>(DEFAULT_VALUES);
  const [showTooltips, setShowTooltips] = useState(false);
  const [addSuccess, setAddSuccess] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'duplicate' | 'success'>('idle');

  const handleInputChange = (field: keyof CalculatorInputs, value: string) => {
    // Allow empty string or valid numbers for numeric fields
    if (field === 'ticker') {
      // Convert ticker to uppercase
      setInputs(prev => ({ ...prev, [field]: value.toUpperCase() }));
    } else if (value === '' || /^\d*\.?\d*$/.test(value)) {
      setInputs(prev => ({ ...prev, [field]: value }));
    }
  };

  const handleReset = () => {
    setInputs(DEFAULT_VALUES);
    setAddSuccess(false);
    setSaveStatus('idle');
  };

  const handleAddToWatchlist = () => {
    if (calculations.status !== 'valid' || !inputs.ticker.trim()) return;

    try {
      // Get existing watchlist
      const stored = localStorage.getItem(STORAGE_KEY);
      const existing: WatchlistItem[] = stored ? JSON.parse(stored) : [];
      
      // Check for duplicate ticker
      const isDuplicate = existing.some((item: WatchlistItem) =>
        item.ticker.toUpperCase() === inputs.ticker.trim().toUpperCase()
      );
      
      if (isDuplicate) {
        setSaveStatus('duplicate');
        setTimeout(() => setSaveStatus('idle'), 3000);
        return;
      }

      const newItem: WatchlistItem = {
        id: Date.now().toString(),
        ticker: inputs.ticker.trim().toUpperCase(),
        entryPrice: calculations.entry,
        stopPrice: calculations.stop,
        targetPrice: calculations.target,
        riskRatio: calculations.actualRR,
        stopSize: calculations.stopSize,
        shareSize: calculations.shareSize,
        potentialReward: calculations.potentialReward,
        positionValue: calculations.positionValue,
        createdAt: new Date().toISOString(),
      };
      
      // Add new item to the beginning
      const updated = [newItem, ...existing];
      
      // Save to localStorage
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      
      // Dispatch custom event to notify WatchlistView in same tab
      window.dispatchEvent(new CustomEvent('juno:watchlist-updated'));
      
      // Show success feedback
      setSaveStatus('success');
      setAddSuccess(true);
      setTimeout(() => {
        setSaveStatus('idle');
        setAddSuccess(false);
      }, 2000);
    } catch (error) {
      console.error('Error saving to watchlist:', error);
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

    if (actualRR >= desiredRatio) {
      status = 'valid';
      statusMessage = `✅ Valid Trade - ${actualRR.toFixed(2)}:1 meets minimum ${desiredRatio}:1 requirement`;
    } else if (actualRR >= desiredRatio * 0.75) {
      status = 'marginal';
      statusMessage = `⚠️ Marginal Trade - ${actualRR.toFixed(2)}:1 is below ${desiredRatio}:1 minimum`;
    } else if (actualRR > 0) {
      status = 'invalid';
      statusMessage = `❌ Invalid Trade - ${actualRR.toFixed(2)}:1 is below ${(desiredRatio * 0.75).toFixed(2)}:1 threshold`;
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

  // Check if add to watchlist button should be enabled
  const canAddToWatchlist = calculations.status === 'valid' && inputs.ticker.trim().length > 0;

  return (
    <div className="w-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-[#F97316]/10 rounded-lg">
            <Calculator className="w-5 h-5 text-[#F97316]" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white">Position Sizing Calculator</h3>
            <p className="text-sm text-[#8b949e]">Calculate shares and validate risk/reward</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowTooltips(!showTooltips)}
            className="p-2 text-[#8b949e] hover:text-white hover:bg-[#262626] rounded-lg transition-colors"
            title="Toggle formula explanations"
          >
            <Info className="w-4 h-4" />
          </button>
          <button
            onClick={handleReset}
            className="flex items-center gap-2 px-3 py-2 text-sm text-[#8b949e] hover:text-white hover:bg-[#262626] rounded-lg transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            Reset
          </button>
        </div>
      </div>

      {/* Vertical Stack Layout: Results → Add Button → Inputs */}
      <div className="space-y-6">
        {/* Section 1: Calculated Results (TOP) */}
        <div className="space-y-4">
          <h4 className="text-sm font-medium text-[#8b949e] uppercase tracking-wide">Calculated Results</h4>

          {/* Status Indicator */}
          <div className={`p-4 rounded-lg border ${statusColors.bg} ${statusColors.border}`}>
            <div className="flex items-center gap-3">
              {statusColors.icon}
              <p className={`text-sm font-medium ${statusColors.text}`}>
                {calculations.statusMessage}
              </p>
            </div>
          </div>

          {/* Results Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {/* Stop Size */}
            <div className="bg-[#0F0F0F] border border-[#262626] rounded-lg p-4">
              <p className="text-xs text-[#8b949e] uppercase tracking-wide mb-1">Stop Size</p>
              <p className="text-lg font-bold text-white">
                {calculations.stopSize > 0 ? formatCurrency(calculations.stopSize) : '—'}
              </p>
              {showTooltips && calculations.stopSize > 0 && (
                <p className="text-xs text-[#8b949e] mt-1">
                  ${calculations.entry.toFixed(2)} - ${calculations.stop.toFixed(2)}
                </p>
              )}
            </div>

            {/* Share Size */}
            <div className="bg-[#0F0F0F] border border-[#262626] rounded-lg p-4">
              <p className="text-xs text-[#8b949e] uppercase tracking-wide mb-1">Share Size</p>
              <p className="text-lg font-bold text-white">
                {calculations.shareSize > 0 ? formatNumber(calculations.shareSize) : '—'}
                {calculations.shareSize > 0 && <span className="text-xs font-normal text-[#8b949e] ml-1">shrs</span>}
              </p>
              {showTooltips && calculations.shareSize > 0 && (
                <p className="text-xs text-[#8b949e] mt-1">
                  ${calculations.risk} / {formatCurrency(calculations.stopSize)}
                </p>
              )}
            </div>

            {/* Expected Profit */}
            <div className="bg-[#0F0F0F] border border-[#262626] rounded-lg p-4">
              <p className="text-xs text-[#8b949e] uppercase tracking-wide mb-1">Expected Profit</p>
              <p className="text-lg font-bold text-green-400">
                {calculations.potentialReward > 0 ? formatCurrency(calculations.potentialReward) : '—'}
              </p>
              {showTooltips && calculations.potentialReward > 0 && (
                <p className="text-xs text-[#8b949e] mt-1">
                  Δ${(calculations.target - calculations.entry).toFixed(2)} × {formatNumber(calculations.shareSize)}
                </p>
              )}
            </div>

            {/* Actual R:R */}
            <div className="bg-[#0F0F0F] border border-[#262626] rounded-lg p-4">
              <p className="text-xs text-[#8b949e] uppercase tracking-wide mb-1">Actual R:R</p>
              <p className={`text-lg font-bold ${
                calculations.actualRR >= calculations.ratio ? 'text-green-400' :
                calculations.actualRR >= calculations.ratio * 0.75 ? 'text-yellow-400' :
                calculations.actualRR > 0 ? 'text-red-400' : 'text-white'
              }`}>
                {calculations.actualRR > 0 ? `${calculations.actualRR.toFixed(2)}:1` : '—'}
              </p>
              {showTooltips && calculations.actualRR > 0 && (
                <p className="text-xs text-[#8b949e] mt-1">
                  vs {calculations.ratio}:1 target
                </p>
              )}
            </div>

            {/* Position Value */}
            <div className="bg-[#0F0F0F] border border-[#262626] rounded-lg p-4">
              <p className="text-xs text-[#8b949e] uppercase tracking-wide mb-1">Position Value</p>
              <p className="text-lg font-bold text-white">
                {calculations.positionValue > 0 ? formatCurrency(calculations.positionValue) : '—'}
              </p>
              {showTooltips && calculations.positionValue > 0 && (
                <p className="text-xs text-[#8b949e] mt-1">
                  {formatNumber(calculations.shareSize)} × ${calculations.entry.toFixed(2)}
                </p>
              )}
            </div>
          </div>

          {/* Quick Reference */}
          <div className="flex flex-wrap items-center gap-4 text-xs">
            <span className="text-[#8b949e]">Risk thresholds ({parseFloat(inputs.riskRatio) || 2}:1):</span>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-green-500" />
              <span className="text-[#8b949e]">≥ {parseFloat(inputs.riskRatio) || 2}:1 valid</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-yellow-500" />
              <span className="text-[#8b949e]">{(parseFloat(inputs.riskRatio) || 2) * 0.75}:1 to {parseFloat(inputs.riskRatio) || 2}:1 marginal</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-red-500" />
              <span className="text-[#8b949e]">&lt; {(parseFloat(inputs.riskRatio) || 2) * 0.75}:1 skip</span>
            </div>
          </div>
        </div>

        {/* Section 2: Add to Watchlist Button (MIDDLE) */}
        {calculations.status === 'valid' && (
          <button
            onClick={handleAddToWatchlist}
            disabled={!canAddToWatchlist || saveStatus === 'duplicate'}
            className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-medium transition-all ${
              saveStatus === 'duplicate'
                ? 'bg-red-500/20 border border-red-500/50 text-red-400'
                : addSuccess || saveStatus === 'success'
                  ? 'bg-green-500 text-white'
                  : canAddToWatchlist
                    ? 'bg-[#F97316] hover:bg-[#F97316]/90 text-white'
                    : 'bg-[#262626] text-[#8b949e] cursor-not-allowed'
            }`}
          >
            {saveStatus === 'duplicate' ? (
              <>
                <AlertCircle className="w-5 h-5" />
                {inputs.ticker.trim().toUpperCase()} is already in your watchlist
              </>
            ) : addSuccess || saveStatus === 'success' ? (
              <>
                <CheckCircle className="w-5 h-5" />
                Added to Watchlist!
              </>
            ) : (
              <>
                <BookmarkPlus className="w-5 h-5" />
                {inputs.ticker.trim() ? '📝 Add to Watchlist' : 'Enter Ticker to Save'}
              </>
            )}
          </button>
        )}

        {/* Section 3: Trade Parameters - Input Fields (BOTTOM) */}
        <div className="space-y-4 pt-4 border-t border-[#262626]">
          <h4 className="text-sm font-medium text-[#8b949e] uppercase tracking-wide">Trade Parameters</h4>
          
          {/* Input Grid - 2 columns on larger screens */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Ticker Symbol */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm text-white">
                Stock Ticker
                {showTooltips && (
                  <span className="text-xs text-[#8b949e] font-normal">
                    — Symbol for the stock
                  </span>
                )}
              </label>
              <input
                type="text"
                value={inputs.ticker}
                onChange={(e) => handleInputChange('ticker', e.target.value)}
                placeholder="e.g. AAPL"
                className="w-full bg-[#0F0F0F] border border-[#30363d] rounded-lg px-4 py-2.5 text-white placeholder-[#8b949e] focus:outline-none focus:border-[#F97316] transition-colors uppercase"
              />
            </div>

            {/* Risk Amount */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm text-white">
                Risk Amount
                {showTooltips && (
                  <span className="text-xs text-[#8b949e] font-normal">
                    — Amount willing to lose
                  </span>
                )}
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8b949e]">$</span>
                <input
                  type="text"
                  value={inputs.riskAmount}
                  onChange={(e) => handleInputChange('riskAmount', e.target.value)}
                  placeholder="20"
                  className="w-full bg-[#0F0F0F] border border-[#30363d] rounded-lg pl-7 pr-4 py-2.5 text-white placeholder-[#8b949e] focus:outline-none focus:border-[#F97316] transition-colors"
                />
              </div>
            </div>

            {/* Entry Price */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm text-white">
                Entry Price
                {showTooltips && (
                  <span className="text-xs text-[#8b949e] font-normal">
                    — Planned entry point
                  </span>
                )}
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8b949e]">$</span>
                <input
                  type="text"
                  value={inputs.entryPrice}
                  onChange={(e) => handleInputChange('entryPrice', e.target.value)}
                  placeholder="0.00"
                  className="w-full bg-[#0F0F0F] border border-[#30363d] rounded-lg pl-7 pr-4 py-2.5 text-white placeholder-[#8b949e] focus:outline-none focus:border-[#F97316] transition-colors"
                />
              </div>
            </div>

            {/* Stop Price */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm text-white">
                Stop Loss Price
                {showTooltips && (
                  <span className="text-xs text-[#8b949e] font-normal">
                    — Exit if price hits this
                  </span>
                )}
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8b949e]">$</span>
                <input
                  type="text"
                  value={inputs.stopPrice}
                  onChange={(e) => handleInputChange('stopPrice', e.target.value)}
                  placeholder="0.00"
                  className="w-full bg-[#0F0F0F] border border-[#30363d] rounded-lg pl-7 pr-4 py-2.5 text-white placeholder-[#8b949e] focus:outline-none focus:border-[#F97316] transition-colors"
                />
              </div>
            </div>

            {/* Target Price */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm text-white">
                Target Price
                {showTooltips && (
                  <span className="text-xs text-[#8b949e] font-normal">
                    — Profit target level
                  </span>
                )}
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8b949e]">$</span>
                <input
                  type="text"
                  value={inputs.targetPrice}
                  onChange={(e) => handleInputChange('targetPrice', e.target.value)}
                  placeholder="0.00"
                  className="w-full bg-[#0F0F0F] border border-[#30363d] rounded-lg pl-7 pr-4 py-2.5 text-white placeholder-[#8b949e] focus:outline-none focus:border-[#F97316] transition-colors"
                />
              </div>
            </div>

            {/* Risk Ratio */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm text-white">
                Desired Risk Ratio
                {showTooltips && (
                  <span className="text-xs text-[#8b949e] font-normal">
                    — Minimum R:R ratio
                  </span>
                )}
              </label>
              <select
                value={inputs.riskRatio}
                onChange={(e) => handleInputChange('riskRatio', e.target.value)}
                className="w-full bg-[#0F0F0F] border border-[#30363d] rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-[#F97316] transition-colors appearance-none cursor-pointer"
                style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12' fill='none'%3E%3Cpath d='M2.5 4.5L6 8L9.5 4.5' stroke='%238b949e' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center' }}
              >
                {RISK_RATIO_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
