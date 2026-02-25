'use client';

import { useState, useMemo } from 'react';
import { Calculator, Eraser, CheckCircle, AlertCircle, XCircle, BookmarkPlus, Info } from 'lucide-react';
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
  const [saveSuccess, setSaveSuccess] = useState(false);
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

  const handleAddToWatchlist = () => {
    if (!isFormValid() || calculations.status !== 'valid') return;

    try {
      // Get existing watchlist (Potential Trades)
      const stored = localStorage.getItem(STORAGE_KEY);
      const existing: WatchlistItem[] = stored ? JSON.parse(stored) : [];
      
      // Get active trades
      const activeTradesStored = localStorage.getItem('juno:active-trades');
      const activeTrades = activeTradesStored ? JSON.parse(activeTradesStored) : [];
      
      const tickerInput = inputs.ticker.trim().toUpperCase();
      
      // Check for duplicate ticker in watchlist (Potential Trades)
      const isDuplicateInWatchlist = existing.some((item: WatchlistItem) =>
        item.ticker.toUpperCase() === tickerInput
      );
      
      // Check for duplicate ticker in active trades
      const isDuplicateInActive = activeTrades.some((trade: any) =>
        trade.ticker?.toUpperCase() === tickerInput
      );
      
      // Block if in watchlist or active trades, but allow if only in closed positions
      if (isDuplicateInWatchlist) {
        setSaveStatus('duplicate');
        setTimeout(() => setSaveStatus('idle'), 3000);
        return;
      }
      
      if (isDuplicateInActive) {
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

      // Clear inputs after successful save
      handleClear();

      // Show success feedback briefly
      setSaveStatus('success');
      setTimeout(() => setSaveStatus('idle'), 2000);
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

  // Check if add to watchlist button should be enabled
  const canAddToWatchlist = calculations.status === 'valid' && isFormValid();

  return (
    <div className="w-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-[#F97316]/10 rounded-lg">
            <Calculator className="w-5 h-5 text-[#F97316]" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white">Trade Management</h3>
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
            onClick={handleClear}
            className="flex items-center gap-2 px-3 py-2 text-sm text-[#8b949e] border border-[#30363d] hover:text-white hover:bg-[#262626] hover:border-[#8b949e] rounded-lg transition-colors"
          >
            <Eraser className="w-4 h-4" />
            Clear
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column - Inputs */}
        <div className="space-y-4">
          <h4 className="text-sm font-medium text-[#8b949e] uppercase tracking-wide">Trade Parameters</h4>
          
          {/* Ticker Symbol */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm text-white">
              Stock Ticker
              {showTooltips && (
                <span className="text-xs text-[#8b949e] font-normal">
                  — Symbol for the stock you&apos;re trading
                </span>
              )}
            </label>
            <input
              type="text"
              value={inputs.ticker}
              onChange={(e) => handleInputChange('ticker', e.target.value)}
              placeholder="AAPL"
              className="w-full bg-[#0F0F0F] border border-[#30363d] rounded-lg px-4 py-2.5 text-white placeholder-[#8b949e] focus:outline-none focus:border-[#F97316] transition-colors uppercase"
            />
            <p className="text-xs text-[#8b949e]">Required to save to watchlist</p>
          </div>

          {/* Risk Amount */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm text-white">
              Risk Amount ($)
              {showTooltips && (
                <span className="text-xs text-[#8b949e] font-normal">
                  — Amount you&apos;re willing to lose
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
            <p className="text-xs text-[#8b949e]">Default: $20 for beginner phase</p>
          </div>

          {/* Entry Price */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm text-white">
              Entry Price
              {showTooltips && (
                <span className="text-xs text-[#8b949e] font-normal">
                  — Your planned entry point
                </span>
              )}
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8b949e]">$</span>
              <input
                type="text"
                value={inputs.entryPrice}
                onChange={(e) => handleInputChange('entryPrice', e.target.value)}
                placeholder="6.00"
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
                  — Exit if price hits this level
                </span>
              )}
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8b949e]">$</span>
              <input
                type="text"
                value={inputs.stopPrice}
                onChange={(e) => handleInputChange('stopPrice', e.target.value)}
                placeholder="5.50"
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
                  — Profit target / resistance level
                </span>
              )}
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8b949e]">$</span>
              <input
                type="text"
                value={inputs.targetPrice}
                onChange={(e) => handleInputChange('targetPrice', e.target.value)}
                placeholder="7.00"
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
                  — Minimum reward-to-risk ratio
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
            <p className="text-xs text-[#8b949e]">Minimum 2:1 recommended per strategy</p>
          </div>
        </div>

        {/* Right Column - Results */}
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

          {/* Add to Watchlist Button - Only show for valid trades */}
          {calculations.status === 'valid' && (
            <div className="space-y-2">
              <button
                onClick={handleAddToWatchlist}
                disabled={!isFormValid() || saveStatus === 'duplicate'}
                className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-medium transition-all ${
                  saveStatus === 'duplicate'
                    ? 'bg-red-500/20 border border-red-500/50 text-red-400'
                    : addSuccess || saveStatus === 'success'
                      ? 'bg-green-500 text-white'
                      : isFormValid()
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
                    Add to Watchlist
                  </>
                )}
              </button>
              {!isFormValid() && (
                <p className="text-xs text-[#8b949e] text-center">
                  Fill in all fields to save to watchlist
                </p>
              )}
            </div>
          )}

          {/* Results Grid */}
          <div className="grid grid-cols-1 gap-3">
            {/* Stop Size */}
            <div className="bg-[#0F0F0F] border border-[#262626] rounded-lg p-4">
              <p className="text-xs text-[#8b949e] uppercase tracking-wide mb-1">Stop Size</p>
              <p className="text-xl font-bold text-white">
                {calculations.stopSize > 0 ? formatCurrency(calculations.stopSize) : '—'}
              </p>
              {showTooltips && calculations.stopSize > 0 && (
                <p className="text-xs text-[#8b949e] mt-1">
                  ${calculations.entry.toFixed(2)} - ${calculations.stop.toFixed(2)} = {formatCurrency(calculations.stopSize)}
                </p>
              )}
            </div>

            {/* Share Size */}
            <div className="bg-[#0F0F0F] border border-[#262626] rounded-lg p-4">
              <p className="text-xs text-[#8b949e] uppercase tracking-wide mb-1">Share Size</p>
              <p className="text-xl font-bold text-white">
                {calculations.shareSize > 0 ? formatNumber(calculations.shareSize) : '—'}
                {calculations.shareSize > 0 && <span className="text-sm font-normal text-[#8b949e] ml-2">shares</span>}
              </p>
              {showTooltips && calculations.shareSize > 0 && (
                <p className="text-xs text-[#8b949e] mt-1">
                  ${calculations.risk} / {formatCurrency(calculations.stopSize)} = {formatNumber(calculations.shareSize)} shares
                </p>
              )}
            </div>

            {/* Expected Profit */}
            <div className="bg-[#0F0F0F] border border-[#262626] rounded-lg p-4">
              <p className="text-xs text-[#8b949e] uppercase tracking-wide mb-1">Expected Profit</p>
              <p className="text-xl font-bold text-green-400">
                {calculations.potentialReward > 0 ? formatCurrency(calculations.potentialReward) : '—'}
              </p>
              {showTooltips && calculations.potentialReward > 0 && (
                <p className="text-xs text-[#8b949e] mt-1">
                  (${calculations.target.toFixed(2)} - ${calculations.entry.toFixed(2)}) × {formatNumber(calculations.shareSize)} = {formatCurrency(calculations.potentialReward)}
                </p>
              )}
            </div>

            {/* Actual R:R */}
            <div className="bg-[#0F0F0F] border border-[#262626] rounded-lg p-4">
              <p className="text-xs text-[#8b949e] uppercase tracking-wide mb-1">Actual Risk:Reward</p>
              <p className={`text-xl font-bold ${
                calculations.actualRR >= calculations.ratio ? 'text-green-400' :
                calculations.actualRR >= calculations.ratio * 0.75 ? 'text-yellow-400' :
                calculations.actualRR > 0 ? 'text-red-400' : 'text-white'
              }`}>
                {calculations.actualRR > 0 ? `${calculations.actualRR.toFixed(2)}:1` : '—'}
              </p>
              {showTooltips && calculations.actualRR > 0 && (
                <p className="text-xs text-[#8b949e] mt-1">
                  (${calculations.target.toFixed(2)} - ${calculations.entry.toFixed(2)}) / {formatCurrency(calculations.stopSize)} = {calculations.actualRR.toFixed(2)}:1
                </p>
              )}
            </div>

            {/* Position Value */}
            <div className="bg-[#0F0F0F] border border-[#262626] rounded-lg p-4">
              <p className="text-xs text-[#8b949e] uppercase tracking-wide mb-1">Total Position Value</p>
              <p className="text-xl font-bold text-white">
                {calculations.positionValue > 0 ? formatCurrency(calculations.positionValue) : '—'}
              </p>
              {showTooltips && calculations.positionValue > 0 && (
                <p className="text-xs text-[#8b949e] mt-1">
                  {formatNumber(calculations.shareSize)} shares × ${calculations.entry.toFixed(2)} = {formatCurrency(calculations.positionValue)}
                </p>
              )}
            </div>
          </div>

          {/* Quick Reference */}
          <div className="mt-4 p-3 bg-[#1a1a1a] border border-[#262626] rounded-lg">
            <p className="text-xs font-medium text-[#8b949e] mb-2">Quick Reference (using {parseFloat(inputs.riskRatio) || 2}:1)</p>
            <div className="space-y-1 text-xs">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-500" />
                <span className="text-[#8b949e]">≥ {parseFloat(inputs.riskRatio) || 2}:1 R:R — Valid trade</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-yellow-500" />
                <span className="text-[#8b949e]">{(parseFloat(inputs.riskRatio) || 2) * 0.75}:1 to {parseFloat(inputs.riskRatio) || 2}:1 — Marginal</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-red-500" />
                <span className="text-[#8b949e]">&lt; {(parseFloat(inputs.riskRatio) || 2) * 0.75}:1 — Invalid, skip trade</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
