'use client';

import { useState, useEffect } from 'react';
import { X, Edit3, DollarSign, Layers, FileText, Calendar } from 'lucide-react';
import type { ClosedPosition } from './WatchlistView';

interface EditClosedPositionModalProps {
  position: ClosedPosition | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updatedPosition: ClosedPosition) => void;
}

interface FormErrors {
  actualEntry?: string;
  plannedStop?: string;
  plannedTarget?: string;
  actualShares?: string;
  exitPrice?: string;
}

export default function EditClosedPositionModal({
  position,
  isOpen,
  onClose,
  onSave,
}: EditClosedPositionModalProps) {
  const [formData, setFormData] = useState({
    actualEntry: '',
    plannedStop: '',
    plannedTarget: '',
    actualShares: '',
    exitPrice: '',
    notes: '',
  });
  const [errors, setErrors] = useState<FormErrors>({});

  // Populate form when position changes
  useEffect(() => {
    if (position) {
      setFormData({
        actualEntry: position.actualEntry.toString(),
        plannedStop: position.plannedStop.toString(),
        plannedTarget: position.plannedTarget.toString(),
        actualShares: position.actualShares.toString(),
        exitPrice: position.exitPrice?.toString() || '',
        notes: position.notes || '',
      });
    }
  }, [position]);

  // Reset form when modal closes
  useEffect(() => {
    if (!isOpen) {
      setFormData({
        actualEntry: '',
        plannedStop: '',
        plannedTarget: '',
        actualShares: '',
        exitPrice: '',
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

    const plannedStop = parseFloat(formData.plannedStop);
    if (isNaN(plannedStop) || plannedStop <= 0) {
      newErrors.plannedStop = 'Valid stop price required';
    }

    const plannedTarget = parseFloat(formData.plannedTarget);
    if (isNaN(plannedTarget) || plannedTarget <= 0) {
      newErrors.plannedTarget = 'Valid target price required';
    }

    const actualShares = parseInt(formData.actualShares, 10);
    if (isNaN(actualShares) || actualShares <= 0) {
      newErrors.actualShares = 'Valid number of shares required';
    }

    if (formData.exitPrice) {
      const exitPrice = parseFloat(formData.exitPrice);
      if (isNaN(exitPrice) || exitPrice <= 0) {
        newErrors.exitPrice = 'Valid exit price required';
      }
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
    if (!validateForm() || !position) return;

    const actualEntry = parseFloat(formData.actualEntry);
    const plannedStop = parseFloat(formData.plannedStop);
    const plannedTarget = parseFloat(formData.plannedTarget);
    const actualShares = parseInt(formData.actualShares, 10);
    const exitPrice = formData.exitPrice ? parseFloat(formData.exitPrice) : undefined;

    const updatedPosition: ClosedPosition = {
      ...position,
      actualEntry,
      plannedStop,
      plannedTarget,
      actualShares,
      exitPrice,
      notes: formData.notes.trim() || undefined,
    };

    onSave(updatedPosition);
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

  if (!isOpen || !position) return null;

  const isLong = position.plannedTarget > position.plannedEntry;

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
              <h2 className="text-lg font-semibold text-white">Edit Closed Position</h2>
              <p className="text-sm text-blue-400 font-medium">
                {position.ticker} {isLong ? '📈 LONG' : '📉 SHORT'}
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
          {/* Form */}
          <div className="space-y-4">
            {/* Entry Price */}
            <div>
              <label className="block text-sm font-medium text-[#8b949e] mb-2">
                <div className="flex items-center gap-2">
                  <DollarSign className="w-4 h-4" />
                  Entry Price
                </div>
              </label>
              <input
                type="number"
                step="0.01"
                value={formData.actualEntry}
                onChange={(e) => handleInputChange('actualEntry', e.target.value)}
                className="w-full px-3 py-2 bg-[#161b22] border border-[#30363d] rounded-lg text-white placeholder-[#8b949e] focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                placeholder="Enter entry price"
              />
              {errors.actualEntry && (
                <p className="mt-1 text-xs text-red-400">{errors.actualEntry}</p>
              )}
            </div>

            {/* Stop Loss & Target - Side by Side */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-red-400 mb-2">
                  Stop Loss
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.plannedStop}
                  onChange={(e) => handleInputChange('plannedStop', e.target.value)}
                  className="w-full px-3 py-2 bg-[#161b22] border border-[#30363d] rounded-lg text-white placeholder-[#8b949e] focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 transition-colors"
                  placeholder="Stop price"
                />
                {errors.plannedStop && (
                  <p className="mt-1 text-xs text-red-400">{errors.plannedStop}</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-green-400 mb-2">
                  Target
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.plannedTarget}
                  onChange={(e) => handleInputChange('plannedTarget', e.target.value)}
                  className="w-full px-3 py-2 bg-[#161b22] border border-[#30363d] rounded-lg text-white placeholder-[#8b949e] focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500 transition-colors"
                  placeholder="Target price"
                />
                {errors.plannedTarget && (
                  <p className="mt-1 text-xs text-red-400">{errors.plannedTarget}</p>
                )}
              </div>
            </div>

            {/* Shares */}
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

            {/* Exit Price */}
            <div>
              <label className="block text-sm font-medium text-blue-400 mb-2">
                <div className="flex items-center gap-2">
                  <DollarSign className="w-4 h-4" />
                  Exit Price (Optional)
                </div>
              </label>
              <input
                type="number"
                step="0.01"
                value={formData.exitPrice}
                onChange={(e) => handleInputChange('exitPrice', e.target.value)}
                className="w-full px-3 py-2 bg-[#161b22] border border-[#30363d] rounded-lg text-white placeholder-[#8b949e] focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                placeholder="Enter exit price if available"
              />
              {errors.exitPrice && (
                <p className="mt-1 text-xs text-red-400">{errors.exitPrice}</p>
              )}
            </div>

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
                placeholder="e.g., Trade notes, lessons learned, adjustments..."
              />
            </div>

            {/* Timestamp */}
            <div className="flex items-center gap-2 text-xs text-[#8b949e]">
              <Calendar className="w-3.5 h-3.5" />
              <span>Closed: {new Date(position.closedAt).toLocaleString()}</span>
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
