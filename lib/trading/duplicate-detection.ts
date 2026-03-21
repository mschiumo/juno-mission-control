/**
 * Duplicate Trade Detection
 * 
 * Detects potential duplicate trades between dashboard entries and CSV imports
 * using symbol, date, and PnL matching with configurable tolerance.
 */

import { Trade, PotentialDuplicate, MergedTrade } from '@/types/trading';

export interface DuplicateDetectionConfig {
  pnlTolerance: number; // Dollar amount tolerance for PnL matching (default: $2.00)
  dateToleranceHours: number; // Hours tolerance for date matching (default: 24)
}

export const DEFAULT_CONFIG: DuplicateDetectionConfig = {
  pnlTolerance: 2.0,
  dateToleranceHours: 24,
};

/**
 * Extract date string (YYYY-MM-DD) from ISO date
 */
function extractDate(dateStr: string): string {
  return dateStr.split('T')[0];
}

/**
 * Check if two dates are within tolerance hours of each other
 */
function datesMatch(date1: string, date2: string, toleranceHours: number): boolean {
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  const diffMs = Math.abs(d1.getTime() - d2.getTime());
  const diffHours = diffMs / (1000 * 60 * 60);
  return diffHours <= toleranceHours;
}

/**
 * Check if two PnL values are within tolerance
 */
function pnlMatches(pnl1: number | undefined, pnl2: number | undefined, tolerance: number): boolean {
  // If both are undefined/null, they match
  if ((pnl1 === undefined || pnl1 === null) && (pnl2 === undefined || pnl2 === null)) {
    return true;
  }
  // If only one is undefined, they don't match
  if (pnl1 === undefined || pnl1 === null || pnl2 === undefined || pnl2 === null) {
    return false;
  }
  return Math.abs(pnl1 - pnl2) <= tolerance;
}

/**
 * Calculate confidence level based on match quality
 */
function calculateConfidence(
  dashboardTrade: Trade,
  csvTrade: Trade,
  config: DuplicateDetectionConfig
): { level: 'high' | 'medium' | 'low'; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;

  // Symbol match (required)
  if (dashboardTrade.symbol.toUpperCase() === csvTrade.symbol.toUpperCase()) {
    reasons.push('Same symbol: ' + dashboardTrade.symbol);
    score += 3;
  }

  // Date match
  const entryDateMatch = datesMatch(dashboardTrade.entryDate, csvTrade.entryDate, config.dateToleranceHours);
  if (entryDateMatch) {
    reasons.push('Same entry date');
    score += 2;
  }

  // PnL match (strong indicator)
  const pnlDiff = Math.abs((dashboardTrade.netPnL || 0) - (csvTrade.netPnL || 0));
  if (pnlDiff <= 0.5) {
    reasons.push(`Identical P\u0026L: ${dashboardTrade.netPnL?.toFixed(2)}`);
    score += 4;
  } else if (pnlDiff <= config.pnlTolerance) {
    reasons.push(`Similar P\u0026L: ${dashboardTrade.netPnL?.toFixed(2)} vs ${csvTrade.netPnL?.toFixed(2)} (diff: ${pnlDiff.toFixed(2)})`);
    score += 3;
  }

  // Side match
  if (dashboardTrade.side === csvTrade.side) {
    reasons.push(`Same side: ${dashboardTrade.side}`);
    score += 1;
  }

  // Shares match (within 10%)
  if (dashboardTrade.shares && csvTrade.shares) {
    const sharesDiff = Math.abs(dashboardTrade.shares - csvTrade.shares);
    const sharesDiffPercent = sharesDiff / Math.max(dashboardTrade.shares, csvTrade.shares);
    if (sharesDiffPercent <= 0.1) {
      reasons.push(`Similar shares: ${dashboardTrade.shares} vs ${csvTrade.shares}`);
      score += 1;
    }
  }

  // Determine confidence
  let level: 'high' | 'medium' | 'low';
  if (score >= 7) {
    level = 'high';
  } else if (score >= 5) {
    level = 'medium';
  } else {
    level = 'low';
  }

  return { level, reasons };
}

/**
 * Check if a specific dashboard trade matches a CSV trade
 */
function isPotentialDuplicate(
  dashboardTrade: Trade,
  csvTrade: Trade,
  config: DuplicateDetectionConfig
): boolean {
  // Must have same symbol
  if (dashboardTrade.symbol.toUpperCase() !== csvTrade.symbol.toUpperCase()) {
    return false;
  }

  // Must have same date (within tolerance)
  if (!datesMatch(dashboardTrade.entryDate, csvTrade.entryDate, config.dateToleranceHours)) {
    return false;
  }

  // Must have matching PnL (within tolerance) - for closed trades
  if (dashboardTrade.status === 'CLOSED' && csvTrade.status === 'CLOSED') {
    if (!pnlMatches(dashboardTrade.netPnL, csvTrade.netPnL, config.pnlTolerance)) {
      return false;
    }
  }

  return true;
}

/**
 * Find potential duplicate trades between dashboard trades and CSV trades
 * 
 * @param dashboardTrades - Existing trades from dashboard (with potential user notes)
 * @param csvTrades - New trades from CSV import
 * @param config - Optional configuration for detection
 * @returns Array of potential duplicates
 */
export function findPotentialDuplicates(
  dashboardTrades: Trade[],
  csvTrades: Trade[],
  config: DuplicateDetectionConfig = DEFAULT_CONFIG
): PotentialDuplicate[] {
  const duplicates: PotentialDuplicate[] = [];
  const matchedCsvTradeIds = new Set<string>();

  for (const csvTrade of csvTrades) {
    // Skip if this CSV trade has already been matched
    if (matchedCsvTradeIds.has(csvTrade.id)) continue;

    for (const dashboardTrade of dashboardTrades) {
      // Skip already-merged trades to prevent re-merging
      if (dashboardTrade.isMerged) continue;
      // Skip if dashboard trade was already imported from CSV (has import marker)
      if (dashboardTrade.entryNotes?.includes('Imported from TOS')) continue;

      if (isPotentialDuplicate(dashboardTrade, csvTrade, config)) {
        const { level, reasons } = calculateConfidence(dashboardTrade, csvTrade, config);

        duplicates.push({
          id: `${dashboardTrade.id}_${csvTrade.id}`,
          dashboardTrade,
          csvTrade,
          confidence: level,
          matchReasons: reasons,
        });

        matchedCsvTradeIds.add(csvTrade.id);
        break; // One CSV trade matches one dashboard trade
      }
    }
  }

  // Sort by confidence (high first)
  const confidenceOrder: Record<'high' | 'medium' | 'low', number> = { high: 0, medium: 1, low: 2 };
  return duplicates.sort((a, b) => confidenceOrder[a.confidence] - confidenceOrder[b.confidence]);
}

/**
 * Get CSV trades that don't have duplicates
 */
export function getNonDuplicateTrades(
  csvTrades: Trade[],
  duplicates: PotentialDuplicate[]
): Trade[] {
  const duplicateIds = new Set(duplicates.map(d => d.csvTrade.id));
  return csvTrades.filter(trade => !duplicateIds.has(trade.id));
}

/**
 * Merge two trades, keeping CSV data as primary but preserving dashboard notes
 */
export function mergeTrades(dashboardTrade: Trade, csvTrade: Trade): MergedTrade {
  const now = new Date().toISOString();
  
  // Combine notes
  const combinedNotes = [
    dashboardTrade.entryNotes,
    csvTrade.entryNotes,
    '[Merged: Combined dashboard notes with CSV data]'
  ].filter(Boolean).join('\n\n');

  return {
    // Use CSV data as primary
    ...csvTrade,
    // Preserve important dashboard fields
    id: csvTrade.id, // Keep CSV ID
    entryNotes: combinedNotes,
    exitNotes: dashboardTrade.exitNotes || csvTrade.exitNotes,
    // Preserve journal-related fields from dashboard
    emotion: dashboardTrade.emotion || csvTrade.emotion,
    setupQuality: dashboardTrade.setupQuality || csvTrade.setupQuality,
    mistakes: [...(dashboardTrade.mistakes || []), ...(csvTrade.mistakes || [])],
    lessons: [...(dashboardTrade.lessons || []), ...(csvTrade.lessons || [])],
    tags: [...new Set([...(dashboardTrade.tags || []), ...(csvTrade.tags || [])])],
    // Mark as merged
    isMerged: true,
    mergedFrom: [dashboardTrade.id, csvTrade.id],
    mergedAt: now,
    updatedAt: now,
  };
}

/**
 * Get summary stats for duplicates
 */
export function getDuplicateStats(duplicates: PotentialDuplicate[]) {
  const byConfidence = {
    high: duplicates.filter(d => d.confidence === 'high').length,
    medium: duplicates.filter(d => d.confidence === 'medium').length,
    low: duplicates.filter(d => d.confidence === 'low').length,
  };

  return {
    total: duplicates.length,
    ...byConfidence,
  };
}
