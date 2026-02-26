'use client';

import { useState, useEffect } from 'react';
import { X, Play, DollarSign, Layers, Calendar, FileText, ArrowRight } from 'lucide-react';
import type { WatchlistItem } from '@/types/watchlist';
import type { ActiveTrade } from '@/types/active-trade';

interface EnterPositionModalProps {
  item: WatchlistItem | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (trade: ActiveTrade) => void;
}

interface FormErrors {
  actualEntry?: string;
  actualShares?: string;
}

export default function EnterPositionModal({
  item,
  isOpen,
  onClose,
  onConfirm,
}: EnterPositionModalProps) {
  const [formData, setFormData] = useState({
    actualEntry: '',
    actualShares: '',
    notes: '',
  });
  const [errors, setErrors] = useState<FormErrors>({});

  // Populate form when item changes
  useEffect(() => {
    if (item) {
      // Pre-fill with planned values as suggestions
      setFormData({
        actualEntry: item.entryPrice.toString(),
        actualShares: item.shareSize.toString(),
        notes: '',
      });
    }
  }, [item]);

  // Reset form when modal closes
  useEffect(() => {
    if (!isOpen) {
      setFormData({
        actualEntry: '',
        actualShares: '',
        notes: '',
      });
      setErrors({});
    }
  }, [isOpen]);

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    const actualEntry = parseFloat(formData.actualEntry);
    if (isNaN(actualEntry) || actualEntry <= 0) {
      newErrors.actualEntry = 'Valid entry price required';
    }

    const actualShares = parseInt(formData.actualShares, 10);
    if (isNaN(actualShares) || actualShares <= 0) {
      newErrors.actualShares = 'Valid number of shares required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleInputChange = (field: keyof typeof formData, value: string) => {
    setFormData({ ...formData, [field]: value });

    // Clear error for this field
    if (errors[field as keyof FormErrors]) {
      setErrors({ ...errors, [field]: undefined });
    }
  };

  const handleConfirm = () => {
    if (!validateForm() || !item) return;

    const actualEntry = parseFloat(formData.actualEntry);
    const actualShares = parseInt(formData.actualShares, 10);
    const positionValue = actualEntry * actualShares;

    console.log('[DEBUG EnterPositionModal] Creating activeTrade with item.id:', item.id);

    const activeTrade: ActiveTrade = {
      id: `active-${Date.now()}`,
      watchlistId: item.id,
      ticker: item.ticker,
      plannedEntry: item.entryPrice,
      plannedStop: item.stopPrice,
      plannedTarget: item.targetPrice,
      actualEntry,
      actualShares,
      positionValue,
      openedAt: new Date().toISOString(),
      notes: formData.notes.trim() || undefined,
    };

    console.log('[DEBUG EnterPositionModal] activeTrade object:', activeTrade);

    onConfirm(activeTrade);
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

  if (!isOpen || !item) return null;

  const currentPositionValue = 
    parseFloat(formData.actualEntry || '0') * parseInt(formData.actualShares || '0');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-[#0F0F0F] border border-[#262626] rounded-2xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#262626]">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-500/10 rounded-lg">
              <Play className="w-5 h-5 text-green-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Enter Position</h2>
              <p className="text-sm text-[#F97316] font-medium">
                {item.ticker}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-[#8b949e] hover:text-white hover:bg-[#262626] rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto">
          {/* Planned Values Reference */}
          <div className="bg-[#161b22] border border-[#262626] rounded-xl p-4 mb-6">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xs font-medium text-[#8b949e] uppercase tracking-wide">
                Planned Trade
              </span>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <span className="text-xs text-[#8b949e]">Entry</span>
                <p className="text-sm font-semibold text-white">
                  {formatCurrency(item.entryPrice)}
                </p>
              </div>
              <div>
                <span className="text-xs text-[#8b949e]">Stop</span>
                <p className="text-sm font-semibold text-red-400">
                  {formatCurrency(item.stopPrice)}
                </p>
              </div>
              <div>
                <span className="text-xs text-[#8b949e]">Target</span>
                <p className="text-sm font-semibold text-green-400">
                  {formatCurrency(item.targetPrice)}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-3 pt-3 border-t border-[#262626]">
              <div>
                <span className="text-xs text-[#8b949e]">Planned Shares</span>
                <p className="text-sm font-semibold text-white">
                  {formatNumber(item.shareSize)}
                </p>
              </div>
              <div>
                <span className="text-xs text-[#8b949e]">Risk Ratio</span>
                <p className="text-sm font-semibold text-green-400">
                  {item.riskRatio.toFixed(2)}:1
                </p>
              </div>
            </div>
          </div>

          {/* Arrow */}
          <div className="flex justify-center mb-6">
            <div className="flex items-center gap-2 text-green-400">
              <ArrowRight className="w-5 h-5" />
              <span className="text-sm font-medium">Moving to Active Trades</span>
            </div>
          </div>

          {/* Form */}
          <div className="space-y-4">
            {/* Actual Entry Price */}
            <div>
              <label className="block text-sm font-medium text-[#8b949e] mb-2">
                <div className="flex items-center gap-2">
                  <DollarSign className="w-4 h-4" />
                  Actual Entry Price
                </div>
              </label>
              <input
                type="number"
                step="0.01"
                value={formData.actualEntry}
                onChange={(e) => handleInputChange('actualEntry', e.target.value)}
                className="w-full px-3 py-2 bg-[#161b22] border border-[#30363d] rounded-lg text-white placeholder-[#8b949e] focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500 transition-colors"
                placeholder={item.entryPrice.toString()}
              />
              {errors.actualEntry && (
                <p className="mt-1 text-xs text-red-400">{errors.actualEntry}</p>
              )}
            </div>

            {/* Actual Shares */}
            <div>
              <label className="block text-sm font-medium text-[#8b949e] mb-2">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4" />
                  Shares Bought
                </div>
              </label>
              <input
                type="number"
                step="1"
                value={formData.actualShares}
                onChange={(e) => handleInputChange('actualShares', e.target.value)}
                className="w-full px-3 py-2 bg-[#161b22] border border-[#30363d] rounded-lg text-white placeholder-[#8b949e] focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500 transition-colors"
                placeholder={item.shareSize.toString()}
              />
              {errors.actualShares && (
                <p className="mt-1 text-xs text-red-400">{errors.actualShares}</p>
              )}
            </div>

            {/* Position Value Preview */}
            {currentPositionValue > 0 && (
              <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-[#8b949e]">Position Value</span>
                  <span className="text-lg font-bold text-green-400">
                    {formatCurrency(currentPositionValue)}
                  </span>
                </div>
              </div>
            )}

            {/* Notes */}
            <div>
              <label className="block text-sm font-medium text-[#8b949e] mb-2">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  Notes (Optional)
                </div>
              </label>
              <textarea
                value={formData.notes}
                onChange={(e) => handleInputChange('notes', e.target.value)}
                className="w-full px-3 py-2 bg-[#161b22] border border-[#30363d] rounded-lg text-white placeholder-[#8b949e] focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500 transition-colors resize-none"
                rows={3}
                placeholder="e.g., Entry reason, setup type, etc."
              />
            </div>

            {/* Timestamp */}
            <div className="flex items-center gap-2 text-xs text-[#8b949e]">
              <Calendar className="w-3.5 h-3.5" />
              <span>Position will be opened at: {new Date().toLocaleString()}</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-[#262626] bg-[#161b22]">
          <button
            onClick={onClose}
            className="px-4 py-2 text-[#8b949e] hover:text-white hover:bg-[#262626] rounded-lg transition-colors text-sm font-medium"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            className="flex items-center gap-2 px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg transition-colors text-sm font-medium"
          >
            <Play className="w-4 h-4" />
            Start Trade
          </button>
        </div>
      </div>
    </div>
  );
}
