'use client';

import { useState } from 'react';
import { X, Plus } from 'lucide-react';

interface TradeEntryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function TradeEntryModal({ isOpen, onClose, onSuccess }: TradeEntryModalProps) {
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-[#161b22] border border-[#30363d] rounded-xl w-full max-w-2xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#1a1f2e] to-[#161b22] border-b border-[#30363d] p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-[#F97316]/10 rounded-xl">
                <Plus className="w-6 h-6 text-[#F97316]" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">Add New Trade</h2>
                <p className="text-sm text-[#8b949e]">Record your trade details</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-[#30363d] rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-[#8b949e]" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          <p className="text-[#8b949e] text-center py-8">
            Trade entry form coming soon...
          </p>
        </div>
      </div>
    </div>
  );
}
