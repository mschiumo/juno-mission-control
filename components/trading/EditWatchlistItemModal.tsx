'use client';

import { useState, useEffect } from 'react';
import { X, Trash2, Calculator } from 'lucide-react';
import type { WatchlistItem } from '@/types/watchlist';

interface EditWatchlistItemModalProps {
  item: WatchlistItem | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (item: WatchlistItem) => void;
  onDelete: (id: string) => void;
}

interface FormErrors {
  ticker?: string;
  entryPrice?: string;
  stopPrice?: string;
  targetPrice?: string;
  riskAmount?: string;
}

export default function EditWatchlistItemModal({
  item,
  isOpen,
  onClose,
  onSave,
  onDelete,
}: EditWatchlistItemModalProps) {
  const [formData, setFormData] = useState({
    ticker: '',
    entryPrice: '',
    stopPrice: '',
    targetPrice: '',
    riskAmount: '',
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [calculatedValues, setCalculatedValues] = useState<{
    riskRatio: number;
    stopSize: number;
    shareSize: number;
    positionValue: number;
    potentialReward: number;
  } | null>(null);

  // Populate form when item changes
  useEffect(() => {
    if (item) {
      // Calculate risk amount from existing data
      const entryPrice = item.entryPrice;
      const stopPrice = item.stopPrice;
      const stopSize = Math.abs(entryPrice - stopPrice);
      const riskAmount = stopSize * item.shareSize;

      setFormData({
        ticker: item.ticker,
        entryPrice: item.entryPrice.toString(),
        stopPrice: item.stopPrice.toString(),
        targetPrice: item.targetPrice.toString(),
        riskAmount: riskAmount.toFixed(2),
      });
      calculateValues(item.ticker, item.entryPrice, item.stopPrice, item.targetPrice, riskAmount);
    }
  }, [item]);

  const calculateValues = (
    ticker: string,
    entryPrice: number,
    stopPrice: number,
    targetPrice: number,
    riskAmount: number
  ) => {
    const stopSize = Math.abs(entryPrice - stopPrice);
    const targetSize = Math.abs(targetPrice - entryPrice);
    
    if (stopSize === 0) return;

    const riskRatio = targetSize / stopSize;
    const shareSize = Math.floor(riskAmount / stopSize);
    const positionValue = entryPrice * shareSize;
    const potentialReward = targetSize * shareSize;

    setCalculatedValues({
      riskRatio,
      stopSize,
      shareSize,
      positionValue,
      potentialReward,
    });
  };

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    if (!formData.ticker.trim()) {
      newErrors.ticker = 'Ticker is required';
    }

    const entryPrice = parseFloat(formData.entryPrice);
    if (isNaN(entryPrice) || entryPrice <= 0) {
      newErrors.entryPrice = 'Valid entry price required';
    }

    const stopPrice = parseFloat(formData.stopPrice);
    if (isNaN(stopPrice) || stopPrice <= 0) {
      newErrors.stopPrice = 'Valid stop price required';
    }

    const targetPrice = parseFloat(formData.targetPrice);
    if (isNaN(targetPrice) || targetPrice <= 0) {
      newErrors.targetPrice = 'Valid target price required';
    }

    const riskAmount = parseFloat(formData.riskAmount);
    if (isNaN(riskAmount) || riskAmount <= 0) {
      newErrors.riskAmount = 'Valid risk amount required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleInputChange = (field: keyof typeof formData, value: string) => {
    const newFormData = { ...formData, [field]: value };
    setFormData(newFormData);

    // Clear error for this field
    if (errors[field]) {
      setErrors({ ...errors, [field]: undefined });
    }

    // Recalculate if all values are valid
    const entryPrice = parseFloat(newFormData.entryPrice);
    const stopPrice = parseFloat(newFormData.stopPrice);
    const targetPrice = parseFloat(newFormData.targetPrice);
    const riskAmount = parseFloat(newFormData.riskAmount);

    if (
      !isNaN(entryPrice) && entryPrice > 0 &&
      !isNaN(stopPrice) && stopPrice > 0 &&
      !isNaN(targetPrice) && targetPrice > 0 &&
      !isNaN(riskAmount) && riskAmount > 0
    ) {
      calculateValues(
        newFormData.ticker,
        entryPrice,
        stopPrice,
        targetPrice,
        riskAmount
      );
    }
  };

  const handleSave = () => {
    if (!validateForm() || !item || !calculatedValues) return;

    const updatedItem: WatchlistItem = {
      ...item,
      ticker: formData.ticker.toUpperCase().trim(),
      entryPrice: parseFloat(formData.entryPrice),
      stopPrice: parseFloat(formData.stopPrice),
      targetPrice: parseFloat(formData.targetPrice),
      riskRatio: calculatedValues.riskRatio,
      stopSize: calculatedValues.stopSize,
      shareSize: calculatedValues.shareSize,
      positionValue: calculatedValues.positionValue,
      potentialReward: calculatedValues.potentialReward,
    };

    onSave(updatedItem);
  };

  const handleDelete = () => {
    if (item && confirm('Are you sure you want to delete this trade?')) {
      onDelete(item.id);
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

  if (!isOpen || !item) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-[#0F0F0F] border border-[#262626] rounded-2xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#262626]">
          <div>
            <h2 className="text-lg font-semibold text-white">Edit Trade</h2>
            <p className="text-sm text-[#F97316] font-medium">
              {item.ticker}
            </p>
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
          {/* Form */}
          <div className="space-y-4">
            {/* Ticker */}
            <div>
              <label className="block text-sm font-medium text-[#8b949e] mb-2">
                Ticker Symbol
              </label>
              <input
                type="text"
                value={formData.ticker}
                onChange={(e) => handleInputChange('ticker', e.target.value)}
                className="w-full px-3 py-2 bg-[#161b22] border border-[#30363d] rounded-lg text-white placeholder-[#8b949e] focus:outline-none focus:border-[#F97316] focus:ring-1 focus:ring-[#F97316] transition-colors uppercase"
                placeholder="e.g. AAPL"
              />
              {errors.ticker && (
                <p className="mt-1 text-xs text-red-400">{errors.ticker}</p>
              )}
            </div>

            {/* Prices Grid */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-sm font-medium text-[#8b949e] mb-2">
                  Entry Price
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.entryPrice}
                  onChange={(e) => handleInputChange('entryPrice', e.target.value)}
                  className="w-full px-3 py-2 bg-[#161b22] border border-[#30363d] rounded-lg text-white placeholder-[#8b949e] focus:outline-none focus:border-[#F97316] focus:ring-1 focus:ring-[#F97316] transition-colors"
                  placeholder="0.00"
                />
                {errors.entryPrice && (
                  <p className="mt-1 text-xs text-red-400">{errors.entryPrice}</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-[#8b949e] mb-2">
                  Stop Price
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.stopPrice}
                  onChange={(e) => handleInputChange('stopPrice', e.target.value)}
                  className="w-full px-3 py-2 bg-[#161b22] border border-[#30363d] rounded-lg text-white placeholder-[#8b949e] focus:outline-none focus:border-[#F97316] focus:ring-1 focus:ring-[#F97316] transition-colors"
                  placeholder="0.00"
                />
                {errors.stopPrice && (
                  <p className="mt-1 text-xs text-red-400">{errors.stopPrice}</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-[#8b949e] mb-2">
                  Target Price
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.targetPrice}
                  onChange={(e) => handleInputChange('targetPrice', e.target.value)}
                  className="w-full px-3 py-2 bg-[#161b22] border border-[#30363d] rounded-lg text-white placeholder-[#8b949e] focus:outline-none focus:border-[#F97316] focus:ring-1 focus:ring-[#F97316] transition-colors"
                  placeholder="0.00"
                />
                {errors.targetPrice && (
                  <p className="mt-1 text-xs text-red-400">{errors.targetPrice}</p>
                )}
              </div>
            </div>

            {/* Risk Amount */}
            <div>
              <label className="block text-sm font-medium text-[#8b949e] mb-2">
                Risk Amount ($)
              </label>
              <input
                type="number"
                step="1"
                value={formData.riskAmount}
                onChange={(e) => handleInputChange('riskAmount', e.target.value)}
                className="w-full px-3 py-2 bg-[#161b22] border border-[#30363d] rounded-lg text-white placeholder-[#8b949e] focus:outline-none focus:border-[#F97316] focus:ring-1 focus:ring-[#F97316] transition-colors"
                placeholder="e.g. 100"
              />
              {errors.riskAmount && (
                <p className="mt-1 text-xs text-red-400">{errors.riskAmount}</p>
              )}
            </div>

            {/* Calculated Values Preview */}
            {calculatedValues && (
              <div className="bg-[#161b22] border border-[#262626] rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Calculator className="w-4 h-4 text-[#F97316]" />
                  <span className="text-sm font-medium text-white">Calculated Values</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className="text-xs text-[#8b949e]">Risk:Reward</span>
                    <p className={`text-sm font-semibold ${
                      calculatedValues.riskRatio >= 2 ? 'text-green-400' : 'text-yellow-400'
                    }`}>
                      {calculatedValues.riskRatio.toFixed(2)}:1
                    </p>
                  </div>
                  <div>
                    <span className="text-xs text-[#8b949e]">Stop Size</span>
                    <p className="text-sm font-semibold text-white">
                      {formatCurrency(calculatedValues.stopSize)}
                    </p>
                  </div>
                  <div>
                    <span className="text-xs text-[#8b949e]">Shares</span>
                    <p className="text-sm font-semibold text-white">
                      {formatNumber(calculatedValues.shareSize)}
                    </p>
                  </div>
                  <div>
                    <span className="text-xs text-[#8b949e]">Position Value</span>
                    <p className="text-sm font-semibold text-white">
                      {formatCurrency(calculatedValues.positionValue)}
                    </p>
                  </div>
                  <div className="col-span-2">
                    <span className="text-xs text-[#8b949e]">Expected Profit</span>
                    <p className="text-base font-bold text-green-400">
                      {formatCurrency(calculatedValues.potentialReward)}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-[#262626] bg-[#161b22]">
          <button
            onClick={handleDelete}
            className="flex items-center gap-2 px-4 py-2 text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            <span className="text-sm font-medium">Delete</span>
          </button>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-[#8b949e] hover:text-white hover:bg-[#262626] rounded-lg transition-colors text-sm font-medium"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 bg-[#F97316] hover:bg-[#ea580c] text-white rounded-lg transition-colors text-sm font-medium"
            >
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
