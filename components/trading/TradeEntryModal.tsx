'use client';

import { useState, useEffect } from 'react';
import { X, Plus, DollarSign, TrendingUp, TrendingDown, Calendar, FileText, Hash, CheckCircle } from 'lucide-react';

interface TradeEntryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  prefillDate?: string | null;
}

interface FormData {
  symbol: string;
  side: 'LONG' | 'SHORT';
  entryPrice: string;
  exitPrice: string;
  shares: string;
  entryDate: string;
  exitDate: string;
  notes: string;
}

interface FormErrors {
  symbol?: string;
  entryPrice?: string;
  exitPrice?: string;
  shares?: string;
  entryDate?: string;
  exitDate?: string;
  notes?: string;
}

export default function TradeEntryModal({ isOpen, onClose, onSuccess, prefillDate }: TradeEntryModalProps) {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [tradeType, setTradeType] = useState<'open' | 'closed'>('closed');
  
  const [formData, setFormData] = useState<FormData>({
    symbol: '',
    side: 'LONG',
    entryPrice: '',
    exitPrice: '',
    shares: '',
    entryDate: '',
    exitDate: '',
    notes: '',
  });

  // Set default dates when modal opens
  useEffect(() => {
    if (isOpen) {
      const today = prefillDate || new Date().toISOString().split('T')[0];
      setFormData(prev => ({
        ...prev,
        entryDate: today,
        exitDate: today,
      }));
      setSuccess(false);
      setErrors({});
    }
  }, [isOpen, prefillDate]);

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    if (!formData.symbol.trim()) {
      newErrors.symbol = 'Symbol is required';
    } else if (formData.symbol.length > 20) {
      newErrors.symbol = 'Symbol is too long';
    }

    const entryPrice = parseFloat(formData.entryPrice);
    if (isNaN(entryPrice) || entryPrice <= 0) {
      newErrors.entryPrice = 'Valid entry price required';
    }

    const shares = parseInt(formData.shares, 10);
    if (isNaN(shares) || shares <= 0) {
      newErrors.shares = 'Valid number of shares required';
    }

    if (!formData.entryDate) {
      newErrors.entryDate = 'Entry date is required';
    }

    if (tradeType === 'closed') {
      const exitPrice = parseFloat(formData.exitPrice);
      if (isNaN(exitPrice) || exitPrice <= 0) {
        newErrors.exitPrice = 'Valid exit price required';
      }

      if (!formData.exitDate) {
        newErrors.exitDate = 'Exit date is required for closed trades';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleInputChange = (field: keyof FormData, value: string) => {
    setFormData({ ...formData, [field]: value });
    if (errors[field as keyof FormErrors]) {
      setErrors({ ...errors, [field]: undefined });
    }
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;

    setLoading(true);
    
    try {
      const payload: any = {
        symbol: formData.symbol.toUpperCase(),
        side: formData.side,
        entryPrice: parseFloat(formData.entryPrice),
        shares: parseInt(formData.shares, 10),
        entryDate: formData.entryDate,
        notes: formData.notes.trim() || undefined,
      };

      // Only add exit data for closed trades
      if (tradeType === 'closed') {
        payload.exitPrice = parseFloat(formData.exitPrice);
        payload.exitDate = formData.exitDate;
      }

      const response = await fetch('/api/trades/import-manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (result.success) {
        setSuccess(true);
        setTimeout(() => {
          onClose();
          if (onSuccess) {
            onSuccess();
          }
        }, 1200);
      } else {
        setErrors({ symbol: result.error || 'Failed to create trade' });
      }
    } catch (error) {
      console.error('Error creating trade:', error);
      setErrors({ symbol: 'Failed to create trade. Please try again.' });
    } finally {
      setLoading(false);
    }
  };

  const calculatePnL = (): { pnl: number; percent: number } | null => {
    const entryPrice = parseFloat(formData.entryPrice);
    const exitPrice = parseFloat(formData.exitPrice);
    const shares = parseInt(formData.shares, 10);

    if (isNaN(entryPrice) || isNaN(exitPrice) || isNaN(shares) || entryPrice <= 0 || exitPrice <= 0 || shares <= 0) {
      return null;
    }

    const priceDiff = formData.side === 'LONG' 
      ? exitPrice - entryPrice 
      : entryPrice - exitPrice;
    
    const pnl = priceDiff * shares;
    const percent = (pnl / (entryPrice * shares)) * 100;

    return { pnl, percent };
  };

  const pnlPreview = tradeType === 'closed' ? calculatePnL() : null;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-[#161b22] border border-[#30363d] rounded-xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#1a1f2e] to-[#161b22] border-b border-[#30363d] p-5 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-[#F97316]/10 rounded-xl">
                <Plus className="w-5 h-5 text-[#F97316]" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">Add New Trade</h2>
                <p className="text-sm text-[#8b949e]">Record your trade details</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-[#30363d] rounded-lg transition-colors"
              disabled={loading}
            >
              <X className="w-5 h-5 text-[#8b949e]" />
            </button>
          </div>
        </div>

        {/* Success State */}
        {success ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8">
            <div className="p-4 bg-[#238636]/20 rounded-full mb-4">
              <CheckCircle className="w-12 h-12 text-[#3fb950]" />
            </div>
            <h3 className="text-xl font-semibold text-white mb-2">Trade Added!</h3>
            <p className="text-[#8b949e] text-center">Your trade has been successfully recorded.</p>
          </div>
        ) : (
          <>
            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {/* Trade Type Toggle */}
              <div className="flex bg-[#0d1117] border border-[#30363d] rounded-lg p-1">
                <button
                  onClick={() => setTradeType('closed')}
                  className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
                    tradeType === 'closed'
                      ? 'bg-[#F97316]/20 text-[#F97316]'
                      : 'text-[#8b949e] hover:text-white'
                  }`}
                >
                  Closed Trade
                </button>
                <button
                  onClick={() => setTradeType('open')}
                  className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
                    tradeType === 'open'
                      ? 'bg-[#d29922]/20 text-[#d29922]'
                      : 'text-[#8b949e] hover:text-white'
                  }`}
                >
                  Open Position
                </button>
              </div>

              {/* Symbol & Side */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-[#8b949e] mb-2">
                    <div className="flex items-center gap-2">
                      <Hash className="w-4 h-4" />
                      Symbol
                    </div>
                  </label>
                  <input
                    type="text"
                    value={formData.symbol}
                    onChange={(e) => handleInputChange('symbol', e.target.value.toUpperCase())}
                    className="w-full px-3 py-2 bg-[#0d1117] border border-[#30363d] rounded-lg text-white placeholder-[#8b949e] focus:outline-none focus:border-[#F97316] focus:ring-1 focus:ring-[#F97316] transition-colors"
                    placeholder="AAPL"
                    disabled={loading}
                  />
                  {errors.symbol && (
                    <p className="mt-1 text-xs text-[#f85149]">{errors.symbol}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-[#8b949e] mb-2">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="w-4 h-4" />
                      Side
                    </div>
                  </label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleInputChange('side', 'LONG')}
                      className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                        formData.side === 'LONG'
                          ? 'bg-[#238636]/20 text-[#3fb950] border border-[#238636]/50'
                          : 'bg-[#0d1117] border border-[#30363d] text-[#8b949e] hover:text-white'
                      }`}
                      disabled={loading}
                    >
                      <TrendingUp className="w-4 h-4" />
                      LONG
                    </button>
                    <button
                      onClick={() => handleInputChange('side', 'SHORT')}
                      className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                        formData.side === 'SHORT'
                          ? 'bg-[#da3633]/20 text-[#f85149] border border-[#da3633]/50'
                          : 'bg-[#0d1117] border border-[#30363d] text-[#8b949e] hover:text-white'
                      }`}
                      disabled={loading}
                    >
                      <TrendingDown className="w-4 h-4" />
                      SHORT
                    </button>
                  </div>
                </div>
              </div>

              {/* Entry Price & Shares */}
              <div className="grid grid-cols-2 gap-4">
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
                    value={formData.entryPrice}
                    onChange={(e) => handleInputChange('entryPrice', e.target.value)}
                    className="w-full px-3 py-2 bg-[#0d1117] border border-[#30363d] rounded-lg text-white placeholder-[#8b949e] focus:outline-none focus:border-[#F97316] focus:ring-1 focus:ring-[#F97316] transition-colors"
                    placeholder="150.00"
                    disabled={loading}
                  />
                  {errors.entryPrice && (
                    <p className="mt-1 text-xs text-[#f85149]">{errors.entryPrice}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-[#8b949e] mb-2">
                    <div className="flex items-center gap-2">
                      <Hash className="w-4 h-4" />
                      Shares
                    </div>
                  </label>
                  <input
                    type="number"
                    step="1"
                    value={formData.shares}
                    onChange={(e) => handleInputChange('shares', e.target.value)}
                    className="w-full px-3 py-2 bg-[#0d1117] border border-[#30363d] rounded-lg text-white placeholder-[#8b949e] focus:outline-none focus:border-[#F97316] focus:ring-1 focus:ring-[#F97316] transition-colors"
                    placeholder="100"
                    disabled={loading}
                  />
                  {errors.shares && (
                    <p className="mt-1 text-xs text-[#f85149]">{errors.shares}</p>
                  )}
                </div>
              </div>

              {/* Exit Price & Dates - Only show for closed trades */}
              {tradeType === 'closed' && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-[#8b949e] mb-2">
                        <div className="flex items-center gap-2">
                          <DollarSign className="w-4 h-4" />
                          Exit Price
                        </div>
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={formData.exitPrice}
                        onChange={(e) => handleInputChange('exitPrice', e.target.value)}
                        className="w-full px-3 py-2 bg-[#0d1117] border border-[#30363d] rounded-lg text-white placeholder-[#8b949e] focus:outline-none focus:border-[#F97316] focus:ring-1 focus:ring-[#F97316] transition-colors"
                        placeholder="155.00"
                        disabled={loading}
                      />
                      {errors.exitPrice && (
                        <p className="mt-1 text-xs text-[#f85149]">{errors.exitPrice}</p>
                      )}
                    </div>
                  </div>

                  {/* Dates */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-[#8b949e] mb-2">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4" />
                          Entry Date
                        </div>
                      </label>
                      <input
                        type="date"
                        value={formData.entryDate}
                        onChange={(e) => handleInputChange('entryDate', e.target.value)}
                        className="w-full px-3 py-2 bg-[#0d1117] border border-[#30363d] rounded-lg text-white placeholder-[#8b949e] focus:outline-none focus:border-[#F97316] focus:ring-1 focus:ring-[#F97316] transition-colors"
                        disabled={loading}
                      />
                      {errors.entryDate && (
                        <p className="mt-1 text-xs text-[#f85149]">{errors.entryDate}</p>
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-[#8b949e] mb-2">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4" />
                          Exit Date
                        </div>
                      </label>
                      <input
                        type="date"
                        value={formData.exitDate}
                        onChange={(e) => handleInputChange('exitDate', e.target.value)}
                        className="w-full px-3 py-2 bg-[#0d1117] border border-[#30363d] rounded-lg text-white placeholder-[#8b949e] focus:outline-none focus:border-[#F97316] focus:ring-1 focus:ring-[#F97316] transition-colors"
                        disabled={loading}
                      />
                      {errors.exitDate && (
                        <p className="mt-1 text-xs text-[#f85149]">{errors.exitDate}</p>
                      )}
                    </div>
                  </div>

                  {/* P&L Preview */}
                  {pnlPreview && (
                    <div className={`p-4 rounded-xl border ${
                      pnlPreview.pnl >= 0 
                        ? 'bg-[#238636]/10 border-[#238636]/30' 
                        : 'bg-[#da3633]/10 border-[#da3633]/30'
                    }`}>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-[#8b949e]">Estimated P&L</span>
                        <div className="text-right">
                          <span className={`text-xl font-bold ${
                            pnlPreview.pnl >= 0 ? 'text-[#3fb950]' : 'text-[#f85149]'
                          }`}>
                            {pnlPreview.pnl >= 0 ? '+' : ''}${pnlPreview.pnl.toFixed(2)}
                          </span>
                          <span className={`text-sm ml-2 ${
                            pnlPreview.percent >= 0 ? 'text-[#3fb950]' : 'text-[#f85149]'
                          }`}>
                            ({pnlPreview.percent >= 0 ? '+' : ''}{pnlPreview.percent.toFixed(2)}%)
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Open trade - just show entry date */}
              {tradeType === 'open' && (
                <div>
                  <label className="block text-sm font-medium text-[#8b949e] mb-2">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4" />
                      Entry Date
                    </div>
                  </label>
                  <input
                    type="date"
                    value={formData.entryDate}
                    onChange={(e) => handleInputChange('entryDate', e.target.value)}
                    className="w-full px-3 py-2 bg-[#0d1117] border border-[#30363d] rounded-lg text-white placeholder-[#8b949e] focus:outline-none focus:border-[#F97316] focus:ring-1 focus:ring-[#F97316] transition-colors"
                    disabled={loading}
                  />
                  {errors.entryDate && (
                    <p className="mt-1 text-xs text-[#f85149]">{errors.entryDate}</p>
                  )}
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
                  className="w-full px-3 py-2 bg-[#0d1117] border border-[#30363d] rounded-lg text-white placeholder-[#8b949e] focus:outline-none focus:border-[#F97316] focus:ring-1 focus:ring-[#F97316] transition-colors resize-none"
                  rows={3}
                  placeholder="Trade setup, strategy, emotions, etc."
                  disabled={loading}
                />
              </div>
            </div>

            {/* Footer */}
            <div className="p-5 border-t border-[#30363d] bg-[#161b22] flex-shrink-0">
              <div className="flex gap-3">
                <button
                  onClick={onClose}
                  disabled={loading}
                  className="flex-1 px-4 py-2.5 bg-[#30363d] hover:bg-[#3d444d] text-white rounded-lg transition-colors font-medium disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={loading}
                  className="flex-1 px-4 py-2.5 bg-[#F97316] hover:bg-[#F97316]/90 text-white rounded-lg transition-colors font-medium disabled:opacity-50 flex items-center justify-center gap-2"
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
            </div>
          </>
        )}
      </div>
    </div>
  );
}
