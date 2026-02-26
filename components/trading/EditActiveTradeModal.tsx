'use client';

import { useState, useEffect } from 'react';
import { X, Edit3, DollarSign, Layers, FileText, Calendar } from 'lucide-react';
import type { ActiveTrade } from '@/types/active-trade';

interface EditActiveTradeModalProps {
  trade: ActiveTrade | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updatedTrade: ActiveTrade) => void;
}

interface FormErrors {
  actualEntry?: string;
  actualShares?: string;
  plannedStop?: string;
  plannedTarget?: string;
}

export default function EditActiveTradeModal({
  trade,
  isOpen,
  onClose,
  onSave,
}: EditActiveTradeModalProps) {
  const [formData, setFormData] = useState({
    actualEntry: '',
    actualShares: '',
    plannedStop: '',
    plannedTarget: '',
    notes: '',
  });
  const [errors, setErrors] = useState<FormErrors>({});

  // Populate form when trade changes
  useEffect(() => {
    if (trade) {
      setFormData({
        actualEntry: trade.actualEntry.toString(),
        actualShares: trade.actualShares.toString(),
        plannedStop: trade.plannedStop.toString(),
        plannedTarget: trade.plannedTarget.toString(),
        notes: trade.notes || '',
      });
    }
  }, [trade]);

  // Reset form when modal closes
  useEffect(() => {
    if (!isOpen) {
      setFormData({
        actualEntry: '',
        actualShares: '',
        plannedStop: '',
        plannedTarget: '',
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

    const plannedStop = parseFloat(formData.plannedStop);
    if (isNaN(plannedStop) || plannedStop <= 0) {
      newErrors.plannedStop = 'Valid stop price required';
    }

    const plannedTarget = parseFloat(formData.plannedTarget);
    if (isNaN(plannedTarget) || plannedTarget <= 0) {
      newErrors.plannedTarget = 'Valid target price required';
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

  const handleSave = () => {
    if (!validateForm() || !trade) return;

    const actualEntry = parseFloat(formData.actualEntry);
    const actualShares = parseInt(formData.actualShares, 10);
    const plannedStop = parseFloat(formData.plannedStop);
    const plannedTarget = parseFloat(formData.plannedTarget);
    const positionValue = actualEntry * actualShares;

    const updatedTrade: ActiveTrade = {
      ...trade,
      actualEntry,
      actualShares,
      plannedStop,
      plannedTarget,
      positionValue,
      notes: formData.notes.trim() || undefined,
    };

    onSave(updatedTrade);
    onClose();
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

  if (!isOpen || !trade) return null;

  const currentPositionValue = 
    parseFloat(formData.actualEntry || '0') * parseInt(formData.actualShares || '0');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-[#0F0F0F] border border-[#262626] rounded-2xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#262626]">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500/10 rounded-lg">
              <Edit3 className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Edit Active Trade</h2>
              <p className="text-sm text-green-400 font-medium">
                {trade.ticker}
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
                  {formatCurrency(trade.plannedEntry)}
                </p>
              </div>
              <div>
                <span className="text-xs text-[#8b949e]">Stop</span>
                <p className="text-sm font-semibold text-red-400">
                  {formatCurrency(trade.plannedStop)}
                </p>
              </div>
              <div>
                <span className="text-xs text-[#8b949e]">Target</span>
                <p className="text-sm font-semibold text-green-400">
                  {formatCurrency(trade.plannedTarget)}
                </p>
              </div>
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
                className="w-full px-3 py-2 bg-[#161b22] border border-[#30363d] rounded-lg text-white placeholder-[#8b949e] focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                placeholder="Enter actual entry price"
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
                  Shares
                </div>
              </label>
              <input
                type="number"
                step="1"
                value={formData.actualShares}
                onChange={(e) => handleInputChange('actualShares', e.target.value)}
                className="w-full px-3 py-2 bg-[#161b22] border border-[#30363d] rounded-lg text-white placeholder-[#8b949e] focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                placeholder="Enter number of shares"
              />
              {errors.actualShares && (
                <p className="mt-1 text-xs text-red-400">{errors.actualShares}</p>
              )}
            </div>

            {/* Stop Price */}
            <div>
              <label className="block text-sm font-medium text-[#8b949e] mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded-full bg-red-500/20 flex items-center justify-center">
                    <span className="text-[10px] text-red-400 font-bold">S</span>
                  </div>
                  Stop Price
                </div>
              </label>
              <input
                type="number"
                step="0.01"
                value={formData.plannedStop}
                onChange={(e) => handleInputChange('plannedStop', e.target.value)}
                className="w-full px-3 py-2 bg-[#161b22] border border-[#30363d] rounded-lg text-white placeholder-[#8b949e] focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                placeholder="Enter stop price"
              />
              {errors.plannedStop && (
                <p className="mt-1 text-xs text-red-400">{errors.plannedStop}</p>
              )}
            </div>

            {/* Target Price */}
            <div>
              <label className="block text-sm font-medium text-[#8b949e] mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded-full bg-green-500/20 flex items-center justify-center">
                    <span className="text-[10px] text-green-400 font-bold">T</span>
                  </div>
                  Target Price
                </div>
              </label>
              <input
                type="number"
                step="0.01"
                value={formData.plannedTarget}
                onChange={(e) => handleInputChange('plannedTarget', e.target.value)}
                className="w-full px-3 py-2 bg-[#161b22] border border-[#30363d] rounded-lg text-white placeholder-[#8b949e] focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                placeholder="Enter target price"
              />
              {errors.plannedTarget && (
                <p className="mt-1 text-xs text-red-400">{errors.plannedTarget}</p>
              )}
            </div>

            {/* Position Value Preview */}
            {currentPositionValue > 0 && (
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-[#8b949e]">Position Value</span>
                  <span className="text-lg font-bold text-blue-400">
                    {formatCurrency(currentPositionValue)}
                  </span>
                </div>
                {/* Risk Amount */}
                {(() => {
                  const entry = parseFloat(formData.actualEntry || '0');
                  const stop = parseFloat(formData.plannedStop || '0');
                  const shares = parseInt(formData.actualShares || '0', 10);
                  if (entry > 0 && stop > 0 && shares > 0) {
                    const riskAmount = Math.abs(entry - stop) * shares;
                    return (
                      <div className="flex items-center justify-between pt-2 border-t border-blue-500/20">
                        <span className="text-sm text-[#8b949e]">Risk Amount</span>
                        <span className="text-lg font-bold text-red-400">
                          -{formatCurrency(riskAmount)}
                        </span>
                      </div>
                    );
                  }
                  return null;
                })()}
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
                className="w-full px-3 py-2 bg-[#161b22] border border-[#30363d] rounded-lg text-white placeholder-[#8b949e] focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors resize-none"
                rows={3}
                placeholder="e.g., Entry reason, setup type, adjustments made..."
              />
            </div>

            {/* Timestamp */}
            <div className="flex items-center gap-2 text-xs text-[#8b949e]">
              <Calendar className="w-3.5 h-3.5" />
              <span>Opened: {new Date(trade.openedAt).toLocaleString()}</span>
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
            onClick={handleSave}
            className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors text-sm font-medium"
          >
            <Edit3 className="w-4 h-4" />
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}
