/**
 * Hook for managing CSV import with duplicate detection
 */

import { useState, useCallback } from 'react';
import type { Trade, PotentialDuplicate, CSVImportWithDuplicatesResult } from '@/types/trading';

interface UseDuplicateReviewOptions {
  onImportComplete?: () => void;
  onError?: (error: Error) => void;
}

interface UseDuplicateReviewReturn {
  // State
  isImporting: boolean;
  showDuplicateModal: boolean;
  potentialDuplicates: PotentialDuplicate[];
  newTrades: Trade[];
  importStats: {
    totalInCSV: number;
    imported: number;
    potentialDuplicates: number;
  } | null;
  
  // Actions
  importCSV: (csvContent: string, options?: { detectDuplicates?: boolean; pnlTolerance?: number }) => Promise<void>;
  handleMerge: (dashboardTrade: Trade, csvTrade: Trade) => Promise<void>;
  handleKeepBoth: (csvTrade: Trade) => Promise<void>;
  handleSkip: (csvTrade: Trade) => Promise<void>;
  handleMergeAll: (duplicates: PotentialDuplicate[]) => Promise<void>;
  handleKeepAll: (duplicates: PotentialDuplicate[]) => Promise<void>;
  closeDuplicateModal: () => void;
  resetImport: () => void;
}

export function useDuplicateReview(options: UseDuplicateReviewOptions = {}): UseDuplicateReviewReturn {
  const [isImporting, setIsImporting] = useState(false);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [potentialDuplicates, setPotentialDuplicates] = useState<PotentialDuplicate[]>([]);
  const [newTrades, setNewTrades] = useState<Trade[]>([]);
  const [importStats, setImportStats] = useState<{
    totalInCSV: number;
    imported: number;
    potentialDuplicates: number;
  } | null>(null);

  const importCSV = useCallback(async (
    csvContent: string, 
    importOptions: { detectDuplicates?: boolean; pnlTolerance?: number } = {}
  ) => {
    setIsImporting(true);
    
    try {
      const response = await fetch('/api/trades/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          csv: csvContent,
          detectDuplicates: importOptions.detectDuplicates !== false,
          pnlTolerance: importOptions.pnlTolerance ?? 2.0,
          skipImport: true, // First pass: just detect duplicates
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to import trades');
      }

      const result = await response.json();
      const data: CSVImportWithDuplicatesResult = result.data;

      setPotentialDuplicates(data.potentialDuplicates);
      setNewTrades(data.newTrades);
      setImportStats({
        totalInCSV: data.stats?.totalInCSV || 0,
        imported: data.newTrades?.length || 0,
        potentialDuplicates: data.potentialDuplicates?.length || 0,
      });

      // If there are potential duplicates, show the review modal
      if (data.potentialDuplicates.length > 0) {
        setShowDuplicateModal(true);
      } else {
        // No duplicates, import directly
        await finalizeImport(data.newTrades);
      }
    } catch (error) {
      console.error('Import error:', error);
      options.onError?.(error as Error);
    } finally {
      setIsImporting(false);
    }
  }, [options]);

  const finalizeImport = useCallback(async (tradesToImport: Trade[]) => {
    try {
      const response = await fetch('/api/trades/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          csv: '', // CSV already parsed, just need to save
          trades: tradesToImport, // Send pre-parsed trades
          skipImport: false,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to finalize import');
      }

      options.onImportComplete?.();
    } catch (error) {
      console.error('Finalize import error:', error);
      options.onError?.(error as Error);
    }
  }, [options]);

  const handleMerge = useCallback(async (dashboardTrade: Trade, csvTrade: Trade) => {
    try {
      const response = await fetch('/api/trades/import/merge', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'merge',
          dashboardTradeId: dashboardTrade.id,
          csvTradeData: csvTrade,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to merge trades');
      }

      // Remove from pending duplicates
      setPotentialDuplicates(prev => 
        prev.filter(d => d.csvTrade.id !== csvTrade.id)
      );
    } catch (error) {
      console.error('Merge error:', error);
      options.onError?.(error as Error);
      throw error;
    }
  }, [options]);

  const handleKeepBoth = useCallback(async (csvTrade: Trade) => {
    try {
      const response = await fetch('/api/trades/import/merge', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'keep_both',
          dashboardTradeId: '', // Not needed for keep_both
          csvTradeData: csvTrade,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to save trade');
      }

      // Remove from pending duplicates
      setPotentialDuplicates(prev => 
        prev.filter(d => d.csvTrade.id !== csvTrade.id)
      );
    } catch (error) {
      console.error('Keep both error:', error);
      options.onError?.(error as Error);
      throw error;
    }
  }, [options]);

  const handleSkip = useCallback(async (csvTrade: Trade) => {
    // Just remove from pending - don't save
    setPotentialDuplicates(prev => 
      prev.filter(d => d.csvTrade.id !== csvTrade.id)
    );
  }, []);

  const handleMergeAll = useCallback(async (duplicates: PotentialDuplicate[]) => {
    try {
      const promises = duplicates.map(d => 
        handleMerge(d.dashboardTrade, d.csvTrade)
      );
      await Promise.all(promises);
    } catch (error) {
      console.error('Merge all error:', error);
      options.onError?.(error as Error);
      throw error;
    }
  }, [handleMerge, options]);

  const handleKeepAll = useCallback(async (duplicates: PotentialDuplicate[]) => {
    try {
      const promises = duplicates.map(d => 
        handleKeepBoth(d.csvTrade)
      );
      await Promise.all(promises);
    } catch (error) {
      console.error('Keep all error:', error);
      options.onError?.(error as Error);
      throw error;
    }
  }, [handleKeepBoth, options]);

  const closeDuplicateModal = useCallback(() => {
    setShowDuplicateModal(false);
    // If there are new trades that weren't duplicates, import them
    if (newTrades.length > 0) {
      finalizeImport(newTrades);
    }
    options.onImportComplete?.();
  }, [newTrades, finalizeImport, options]);

  const resetImport = useCallback(() => {
    setIsImporting(false);
    setShowDuplicateModal(false);
    setPotentialDuplicates([]);
    setNewTrades([]);
    setImportStats(null);
  }, []);

  return {
    isImporting,
    showDuplicateModal,
    potentialDuplicates,
    newTrades,
    importStats,
    importCSV,
    handleMerge,
    handleKeepBoth,
    handleSkip,
    handleMergeAll,
    handleKeepAll,
    closeDuplicateModal,
    resetImport,
  };
}
