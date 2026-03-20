'use client';

import { useState, useEffect } from 'react';
import { 
  X, 
  Merge, 
  Copy, 
  SkipForward, 
  AlertTriangle, 
  CheckCircle2, 
  ChevronRight,
  ChevronLeft,
  Database,
  FileSpreadsheet,
  Scale,
  Calendar,
  DollarSign,
  TrendingUp,
  TrendingDown,
  FileText,
  AlertCircle,
  CheckSquare,
  Square
} from 'lucide-react';
import type { Trade, PotentialDuplicate } from '@/types/trading';
import { TradeSide, TradeStatus } from '@/types/trading';

interface DuplicateReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  duplicates: PotentialDuplicate[];
  onMerge: (dashboardTrade: Trade, csvTrade: Trade) => Promise<void>;
  onKeepBoth: (csvTrade: Trade) => Promise<void>;
  onSkip: (csvTrade: Trade) => Promise<void>;
  onMergeAll: (duplicates: PotentialDuplicate[]) => Promise<void>;
  onKeepAll: (duplicates: PotentialDuplicate[]) => Promise<void>;
  newTradesCount: number;
}

type ActionType = 'merge' | 'keep_both' | 'skip' | null;

interface DuplicateDecision {
  duplicateId: string;
  action: ActionType;
}

export default function DuplicateReviewModal({
  isOpen,
  onClose,
  duplicates,
  onMerge,
  onKeepBoth,
  onSkip,
  onMergeAll,
  onKeepAll,
  newTradesCount,
}: DuplicateReviewModalProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [decisions, setDecisions] = useState<DuplicateDecision[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showBulkConfirm, setShowBulkConfirm] = useState<'merge' | 'keep_both' | null>(null);
  const [completed, setCompleted] = useState(false);
  const [selectedDuplicates, setSelectedDuplicates] = useState<Set<string>>(new Set());

  // Initialize decisions when duplicates change
  useEffect(() => {
    if (duplicates.length > 0) {
      setDecisions(duplicates.map(d => ({ duplicateId: d.id, action: null })));
      setSelectedDuplicates(new Set(duplicates.map(d => d.id)));
    }
  }, [duplicates]);

  if (!isOpen || duplicates.length === 0) return null;

  const currentDuplicate = duplicates[currentIndex];
  const currentDecision = decisions.find(d => d.duplicateId === currentDuplicate?.id);
  const progress = decisions.filter(d => d.action !== null).length;
  const total = duplicates.length;

  const handleAction = async (action: ActionType) => {
    if (!currentDuplicate || isProcessing) return;

    // Update decision
    setDecisions(prev => 
      prev.map(d => 
        d.duplicateId === currentDuplicate.id ? { ...d, action } : d
      )
    );

    // Execute action
    setIsProcessing(true);
    try {
      switch (action) {
        case 'merge':
          await onMerge(currentDuplicate.dashboardTrade, currentDuplicate.csvTrade);
          break;
        case 'keep_both':
          await onKeepBoth(currentDuplicate.csvTrade);
          break;
        case 'skip':
          await onSkip(currentDuplicate.csvTrade);
          break;
      }

      // Move to next
      if (currentIndex < duplicates.length - 1) {
        setCurrentIndex(prev => prev + 1);
      } else {
        setCompleted(true);
      }
    } catch (error) {
      console.error('Error processing duplicate:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleBulkAction = async (action: 'merge' | 'keep_both') => {
    setIsProcessing(true);
    setShowBulkConfirm(null);
    
    try {
      const selectedItems = duplicates.filter(d => selectedDuplicates.has(d.id));
      
      if (action === 'merge') {
        await onMergeAll(selectedItems);
      } else {
        await onKeepAll(selectedItems);
      }
      
      setCompleted(true);
    } catch (error) {
      console.error('Error processing bulk action:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
    }
  };

  const toggleSelection = (id: string) => {
    setSelectedDuplicates(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const formatCurrency = (value: number | undefined) => {
    if (value === undefined) return '-';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(value);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const getConfidenceColor = (confidence: string) => {
    switch (confidence) {
      case 'high':
        return 'bg-green-500/20 text-green-400 border-green-500/30';
      case 'medium':
        return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
      case 'low':
        return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
      default:
        return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
    }
  };

  const getConfidenceIcon = (confidence: string) => {
    switch (confidence) {
      case 'high':
        return <CheckCircle2 className="w-4 h-4" />;
      case 'medium':
        return <AlertTriangle className="w-4 h-4" />;
      case 'low':
        return <AlertCircle className="w-4 h-4" />;
      default:
        return null;
    }
  };

  // Completed state
  if (completed) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
        <div className="bg-[#0F0F0F] border border-[#262626] rounded-2xl w-full max-w-md p-8 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-500/20 flex items-center justify-center">
            <CheckCircle2 className="w-8 h-8 text-green-400" />
          </div>
          <h2 className="text-xl font-semibold text-white mb-2">Review Complete!</h2>
          <p className="text-[#8b949e] mb-6">
            Processed {total} potential duplicate{total !== 1 ? 's' : ''}.
            <br />
            {newTradesCount} new trade{newTradesCount !== 1 ? 's' : ''} imported.
          </p>
          <button
            onClick={onClose}
            className="px-6 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors font-medium"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  // Bulk confirmation modal
  if (showBulkConfirm) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
        <div className="bg-[#0F0F0F] border border-[#262626] rounded-2xl w-full max-w-md p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-yellow-500/10 rounded-lg">
              <AlertTriangle className="w-5 h-5 text-yellow-400" />
            </div>
            <h2 className="text-lg font-semibold text-white">
              Confirm {showBulkConfirm === 'merge' ? 'Merge All' : 'Keep All'}
            </h2>
          </div>
          
          <p className="text-[#8b949e] mb-6">
            This will {showBulkConfirm === 'merge' ? 'merge' : 'import'} {selectedDuplicates.size} selected trade{selectedDuplicates.size !== 1 ? 's' : ''}.
            {showBulkConfirm === 'merge' ?
              ' Dashboard notes will be preserved in the merged trades.'
              : ' Both dashboard and CSV versions will be kept separate.'}
          </p>

          <div className="flex justify-end gap-3">
            <button
              onClick={() => setShowBulkConfirm(null)}
              className="px-4 py-2 text-[#8b949e] hover:text-white hover:bg-[#262626] rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => handleBulkAction(showBulkConfirm)}
              disabled={isProcessing}
              className="px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white rounded-lg transition-colors"
            >
              {isProcessing ? 'Processing...' : 'Confirm'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-[#0F0F0F] border border-[#262626] rounded-2xl w-full max-w-5xl max-h-[95vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#262626]">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500/10 rounded-lg">
              <Scale className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Review Potential Duplicates</h2>
              <p className="text-sm text-[#8b949e]">
                {newTradesCount} new trade{newTradesCount !== 1 ? 's' : ''} ready to import • {total} potential duplicate{total !== 1 ? 's' : ''} to review
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            {/* Progress */}
            <div className="flex items-center gap-2 px-3 py-1.5 bg-[#161b22] rounded-lg">
              <span className="text-sm text-[#8b949e]">
                {progress} / {total} reviewed
              </span>
              <div className="w-24 h-2 bg-[#262626] rounded-full overflow-hidden">
                <div 
                  className="h-full bg-blue-500 transition-all duration-300"
                  style={{ width: `${(progress / total) * 100}%` }}
                />
              </div>
            </div>
            
            <button
              onClick={onClose}
              className="p-2 text-[#8b949e] hover:text-white hover:bg-[#262626] rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Bulk Actions Bar */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-[#262626] bg-[#161b22]/50">
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                const allIds = new Set(duplicates.map(d => d.id));
                setSelectedDuplicates(allIds);
              }}
              className="text-xs text-[#8b949e] hover:text-white transition-colors"
            >
              Select All
            </button>
            <span className="text-[#30363d]">|</span>
            <button
              onClick={() => setSelectedDuplicates(new Set())}
              className="text-xs text-[#8b949e] hover:text-white transition-colors"
            >
              Deselect All
            </button>
            <span className="text-[#8b949e] text-xs ml-2">
              ({selectedDuplicates.size} selected)
            </span>
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowBulkConfirm('merge')}
              disabled={selectedDuplicates.size === 0 || isProcessing}
              className="flex items-center gap-2 px-3 py-1.5 bg-green-500/10 hover:bg-green-500/20 text-green-400 rounded-lg transition-colors text-sm disabled:opacity-50"
            >
              <Merge className="w-4 h-4" />
              Merge All
            </button>
            <button
              onClick={() => setShowBulkConfirm('keep_both')}
              disabled={selectedDuplicates.size === 0 || isProcessing}
              className="flex items-center gap-2 px-3 py-1.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 rounded-lg transition-colors text-sm disabled:opacity-50"
            >
              <Copy className="w-4 h-4" />
              Keep All
            </button>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Duplicate Thumbnails */}
          <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
            {duplicates.map((dup, idx) => {
              const decision = decisions.find(d => d.duplicateId === dup.id);
              const isSelected = selectedDuplicates.has(dup.id);
              
              return (
                <button
                  key={dup.id}
                  onClick={() => setCurrentIndex(idx)}
                  className={`flex-shrink-0 flex items-center gap-2 px-3 py-2 rounded-lg border transition-all ${
                    idx === currentIndex
                      ? 'bg-blue-500/20 border-blue-500/50'
                      : 'bg-[#161b22] border-[#262626] hover:border-[#30363d]'
                  }`}
                >
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleSelection(dup.id);
                    }}
                    className="text-[#8b949e] hover:text-white"
                  >
                    {isSelected ? (
                      <CheckSquare className="w-4 h-4 text-blue-400" />
                    ) : (
                      <Square className="w-4 h-4" />
                    )}
                  </button>
                  
                  <div className="text-left">
                    <div className="text-sm font-medium text-white">{dup.dashboardTrade.symbol}</div>
                    <div className="text-xs text-[#8b949e]">
                      {decision?.action === 'merge' ? '🟢 Merge'
                        : decision?.action === 'keep_both' ? '🔵 Keep Both'
                        : decision?.action === 'skip'
                        ? '⚪ Skip'
                        : '⏳ Pending'}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Side-by-side Comparison */}
          <div className="grid grid-cols-2 gap-6">
            {/* Dashboard Trade (Left) */}
            <div className="bg-[#161b22] border border-[#262626] rounded-xl overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-[#262626] bg-[#0F0F0F]">
                <Database className="w-4 h-4 text-blue-400" />
                <span className="text-sm font-medium text-white">Dashboard Trade</span>
                <span className="ml-auto text-xs text-[#8b949e]">(Your Entry)</span>
              </div>
              
              <div className="p-4 space-y-4">
                {/* Symbol & Side */}
                <div className="flex items-center justify-between">
                  <div className="text-2xl font-bold text-white">{currentDuplicate.dashboardTrade.symbol}</div>
                  <div className={`px-3 py-1 rounded-full text-sm font-medium ${
                    currentDuplicate.dashboardTrade.side === TradeSide.LONG
                      ? 'bg-green-500/20 text-green-400'
                      : 'bg-red-500/20 text-red-400'
                  }`}>
                    {currentDuplicate.dashboardTrade.side === TradeSide.LONG ? (
                      <span className="flex items-center gap-1">
                        <TrendingUp className="w-4 h-4" /> LONG
                      </span>
                    ) : (
                      <span className="flex items-center gap-1">
                        <TrendingDown className="w-4 h-4" /> SHORT
                      </span>
                    )}
                  </div>
                </div>

                {/* Date & Time */}
                <div className="flex items-center gap-2 text-sm text-[#8b949e]">
                  <Calendar className="w-4 h-4" />
                  {formatDate(currentDuplicate.dashboardTrade.entryDate)} at {formatTime(currentDuplicate.dashboardTrade.entryDate)}
                </div>

                {/* Trade Details */}
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="bg-[#0F0F0F] rounded-lg p-3">
                    <div className="text-[#8b949e] text-xs mb-1">Entry Price</div>
                    <div className="text-white font-medium">{formatCurrency(currentDuplicate.dashboardTrade.entryPrice)}</div>
                  </div>
                  <div className="bg-[#0F0F0F] rounded-lg p-3">
                    <div className="text-[#8b949e] text-xs mb-1">Shares</div>
                    <div className="text-white font-medium">{currentDuplicate.dashboardTrade.shares}</div>
                  </div>
                  {currentDuplicate.dashboardTrade.exitPrice && (
                    <div className="bg-[#0F0F0F] rounded-lg p-3">
                      <div className="text-[#8b949e] text-xs mb-1">Exit Price</div>
                      <div className="text-white font-medium">{formatCurrency(currentDuplicate.dashboardTrade.exitPrice)}</div>
                    </div>
                  )}
                  {currentDuplicate.dashboardTrade.netPnL !== undefined && (
                    <div className={`rounded-lg p-3 ${
                      currentDuplicate.dashboardTrade.netPnL >= 0 ? 'bg-green-500/10' : 'bg-red-500/10'
                    }`}>
                      <div className="text-[#8b949e] text-xs mb-1">P&L</div>
                      <div className={`font-medium ${
                        currentDuplicate.dashboardTrade.netPnL >= 0 ? 'text-green-400' : 'text-red-400'
                      }`}>
                        {formatCurrency(currentDuplicate.dashboardTrade.netPnL)}
                      </div>
                    </div>
                  )}
                </div>

                {/* Notes Section - Highlighted */}
                {currentDuplicate.dashboardTrade.entryNotes && (
                  <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
                    <div className="flex items-center gap-2 text-blue-400 text-sm font-medium mb-2">
                      <FileText className="w-4 h-4" />
                      Your Notes (Will be preserved)
                    </div>
                    <div className="text-sm text-[#8b949e] whitespace-pre-wrap">
                      {currentDuplicate.dashboardTrade.entryNotes}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* CSV Trade (Right) */}
            <div className="bg-[#161b22] border border-[#262626] rounded-xl overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-[#262626] bg-[#0F0F0F]">
                <FileSpreadsheet className="w-4 h-4 text-green-400" />
                <span className="text-sm font-medium text-white">CSV Trade</span>
                <span className="ml-auto text-xs text-[#8b949e]">(TOS Import)</span>
              </div>
              
              <div className="p-4 space-y-4">
                {/* Symbol & Side */}
                <div className="flex items-center justify-between">
                  <div className="text-2xl font-bold text-white">{currentDuplicate.csvTrade.symbol}</div>
                  <div className={`px-3 py-1 rounded-full text-sm font-medium ${
                    currentDuplicate.csvTrade.side === TradeSide.LONG
                      ? 'bg-green-500/20 text-green-400'
                      : 'bg-red-500/20 text-red-400'
                  }`}>
                    {currentDuplicate.csvTrade.side === TradeSide.LONG ? (
                      <span className="flex items-center gap-1">
                        <TrendingUp className="w-4 h-4" /> LONG
                      </span>
                    ) : (
                      <span className="flex items-center gap-1">
                        <TrendingDown className="w-4 h-4" /> SHORT
                      </span>
                    )}
                  </div>
                </div>

                {/* Date & Time */}
                <div className="flex items-center gap-2 text-sm text-[#8b949e]">
                  <Calendar className="w-4 h-4" />
                  {formatDate(currentDuplicate.csvTrade.entryDate)} at {formatTime(currentDuplicate.csvTrade.entryDate)}
                </div>

                {/* Trade Details */}
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="bg-[#0F0F0F] rounded-lg p-3">
                    <div className="text-[#8b949e] text-xs mb-1">Entry Price</div>
                    <div className="text-white font-medium">{formatCurrency(currentDuplicate.csvTrade.entryPrice)}</div>
                  </div>
                  <div className="bg-[#0F0F0F] rounded-lg p-3">
                    <div className="text-[#8b949e] text-xs mb-1">Shares</div>
                    <div className="text-white font-medium">{currentDuplicate.csvTrade.shares}</div>
                  </div>
                  {currentDuplicate.csvTrade.exitPrice && (
                    <div className="bg-[#0F0F0F] rounded-lg p-3">
                      <div className="text-[#8b949e] text-xs mb-1">Exit Price</div>
                      <div className="text-white font-medium">{formatCurrency(currentDuplicate.csvTrade.exitPrice)}</div>
                    </div>
                  )}
                  {currentDuplicate.csvTrade.netPnL !== undefined && (
                    <div className={`rounded-lg p-3 ${
                      currentDuplicate.csvTrade.netPnL >= 0 ? 'bg-green-500/10' : 'bg-red-500/10'
                    }`}>
                      <div className="text-[#8b949e] text-xs mb-1">P&L</div>
                      <div className={`font-medium ${
                        currentDuplicate.csvTrade.netPnL >= 0 ? 'text-green-400' : 'text-red-400'
                      }`}>
                        {formatCurrency(currentDuplicate.csvTrade.netPnL)}
                      </div>
                    </div>
                  )}
                </div>

                {/* Match Confidence */}
                <div className={`border rounded-lg p-3 ${getConfidenceColor(currentDuplicate.confidence)}`}>
                  <div className="flex items-center gap-2 font-medium mb-2">
                    {getConfidenceIcon(currentDuplicate.confidence)}
                    <span className="capitalize">{currentDuplicate.confidence} Confidence Match</span>
                  </div>
                  <ul className="text-sm space-y-1">
                    {currentDuplicate.matchReasons.map((reason: string, idx: number) => (
                      <li key={idx} className="flex items-start gap-2">
                        <span className="text-[#8b949e]">•</span>
                        <span>{reason}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="mt-6 flex items-center justify-between">
            <button
              onClick={handlePrevious}
              disabled={currentIndex === 0 || isProcessing}
              className="flex items-center gap-2 px-4 py-2 text-[#8b949e] hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              Previous
            </button>

            <div className="flex items-center gap-3">
              <button
                onClick={() => handleAction('skip')}
                disabled={isProcessing}
                className="flex items-center gap-2 px-4 py-2 text-[#8b949e] hover:text-white hover:bg-[#262626] rounded-lg transition-colors"
              >
                <SkipForward className="w-4 h-4" />
                Review Later
              </button>

              <button
                onClick={() => handleAction('keep_both')}
                disabled={isProcessing}
                className="flex items-center gap-2 px-4 py-2 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 rounded-lg transition-colors"
              >
                <Copy className="w-4 h-4" />
                Keep Both
              </button>

              <button
                onClick={() => handleAction('merge')}
                disabled={isProcessing}
                className="flex items-center gap-2 px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg transition-colors font-medium"
              >
                <Merge className="w-4 h-4" />
                Merge Trades
              </button>
            </div>

            <button
              onClick={() => {
                if (currentIndex < duplicates.length - 1) {
                  setCurrentIndex(prev => prev + 1);
                } else {
                  setCompleted(true);
                }
              }}
              disabled={currentIndex === duplicates.length - 1}
              className="flex items-center gap-2 px-4 py-2 text-[#8b949e] hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Merge Preview */}
          {currentDecision?.action && (
            <div className="mt-6 p-4 bg-[#161b22] border border-[#262626] rounded-lg">
              <div className="text-sm font-medium text-white mb-2"></div>
              <div className="text-sm text-[#8b949e]">
                {currentDecision.action === 'merge' && (
                  <span className="text-green-400">
                    ✓ Will merge: Keeps CSV data as primary, preserves your dashboard notes, deletes dashboard entry
                  </span>
                )}
                {currentDecision.action === 'keep_both' && (
                  <span className="text-blue-400">
                    ✓ Will keep both: Saves CSV trade as separate entry (you&apos;ll have 2 trades)
                  </span>
                )}
                {currentDecision.action === 'skip' && (
                  <span className="text-[#8b949e]">
                    ⚪ Skipped: CSV trade will not be imported (can review later)
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
