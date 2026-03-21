/**
 * Duplicate Trade Detection
 *
 * Matches trades between dashboard (manual entry) and CSV imports (brokerage).
 * Strategy: anchor on concrete, reliable facts (symbol, date, side) and use
 * financial metrics (shares, entry price, PnL) as supporting evidence.
 *
 * PnL is intentionally a weak signal — it's the field most likely to differ
 * between user-entered approximations and brokerage-reported values.
 */

import { Trade, PotentialDuplicate, MergedTrade } from '@/types/trading';

export interface DuplicateDetectionConfig {
  /** Minimum confidence score to flag as a potential duplicate (default: 5) */
  minScore: number;
}

export const DEFAULT_CONFIG: DuplicateDetectionConfig = {
  minScore: 5,
};

/**
 * Extract calendar date (YYYY-MM-DD) in EST from an ISO date string.
 * Day trades open and close on the same calendar date, making this the
 * tightest reliable anchor.
 */
function extractTradingDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  // en-CA gives YYYY-MM-DD format
}

/**
 * Minutes between two ISO date strings (absolute difference).
 */
function minutesBetween(a: string, b: string): number {
  return Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 60000;
}

/**
 * Percentage difference between two numbers, relative to the larger value.
 */
function pctDiff(a: number, b: number): number {
  const max = Math.max(Math.abs(a), Math.abs(b));
  if (max === 0) return 0;
  return Math.abs(a - b) / max;
}

/**
 * Hard gates: all must pass for a pair to be considered a candidate.
 * These fields are concrete, rarely mis-entered, and together uniquely
 * identify a trade within a user's account on a given day.
 */
function passesGates(dashboard: Trade, csv: Trade): boolean {
  // Same ticker symbol
  if (dashboard.symbol.toUpperCase() !== csv.symbol.toUpperCase()) return false;

  // Same trading day (EST calendar date)
  if (extractTradingDate(dashboard.entryDate) !== extractTradingDate(csv.entryDate)) return false;

  // Same direction — a user always knows if they went long or short
  if (dashboard.side !== csv.side) return false;

  return true;
}

/**
 * Score the quality of a match for display and confidence classification.
 * Higher = more evidence they are the same trade.
 *
 * Scoring philosophy:
 * - Concrete brokerage facts (shares, price) score higher
 * - PnL scores lower — it's derived and often differs between sources
 * - Timestamp proximity is a bonus, not a requirement
 */
function score(
  dashboard: Trade,
  csv: Trade
): { total: number; reasons: string[] } {
  const reasons: string[] = [];
  let total = 0;

  // Symbol + date + side already passed gates — award base points
  reasons.push(`Same symbol: ${dashboard.symbol}`);
  total += 3;
  reasons.push(`Same trading day: ${extractTradingDate(dashboard.entryDate)}`);
  total += 3;
  reasons.push(`Same side: ${dashboard.side}`);
  total += 3;

  // Entry timestamp proximity (bonus — manual entry is often approximate)
  const entryMinDiff = minutesBetween(dashboard.entryDate, csv.entryDate);
  if (entryMinDiff <= 5) {
    reasons.push(`Entry time within 5 min (${entryMinDiff.toFixed(0)} min apart)`);
    total += 3;
  } else if (entryMinDiff <= 30) {
    reasons.push(`Entry time within 30 min (${entryMinDiff.toFixed(0)} min apart)`);
    total += 2;
  } else if (entryMinDiff <= 120) {
    reasons.push(`Entry time within 2 hr (${entryMinDiff.toFixed(0)} min apart)`);
    total += 1;
  }

  // Shares / quantity — strong concrete fact
  if (dashboard.shares && csv.shares) {
    const diff = pctDiff(dashboard.shares, csv.shares);
    if (diff === 0) {
      reasons.push(`Exact share count: ${dashboard.shares}`);
      total += 4;
    } else if (diff <= 0.05) {
      reasons.push(`Shares within 5%: ${dashboard.shares} vs ${csv.shares}`);
      total += 3;
    } else if (diff <= 0.20) {
      reasons.push(`Shares within 20%: ${dashboard.shares} vs ${csv.shares}`);
      total += 1;
    }
  }

  // Entry price — reliable brokerage fact; manual entry often approximates
  if (dashboard.entryPrice && csv.entryPrice) {
    const diff = pctDiff(dashboard.entryPrice, csv.entryPrice);
    if (diff <= 0.005) {
      reasons.push(`Entry price within 0.5%: $${dashboard.entryPrice.toFixed(2)} vs $${csv.entryPrice.toFixed(2)}`);
      total += 3;
    } else if (diff <= 0.02) {
      reasons.push(`Entry price within 2%: $${dashboard.entryPrice.toFixed(2)} vs $${csv.entryPrice.toFixed(2)}`);
      total += 2;
    } else if (diff <= 0.05) {
      reasons.push(`Entry price within 5%: $${dashboard.entryPrice.toFixed(2)} vs $${csv.entryPrice.toFixed(2)}`);
      total += 1;
    }
  }

  // Exit timestamp proximity (for closed trades)
  if (dashboard.exitDate && csv.exitDate) {
    const exitMinDiff = minutesBetween(dashboard.exitDate, csv.exitDate);
    if (exitMinDiff <= 5) {
      reasons.push(`Exit time within 5 min (${exitMinDiff.toFixed(0)} min apart)`);
      total += 2;
    } else if (exitMinDiff <= 30) {
      reasons.push(`Exit time within 30 min (${exitMinDiff.toFixed(0)} min apart)`);
      total += 1;
    }
  }

  // PnL — supporting evidence only; expected to differ between sources
  const dashPnl = dashboard.netPnL ?? dashboard.grossPnL;
  const csvPnl = csv.netPnL ?? csv.grossPnL;
  if (dashPnl !== undefined && csvPnl !== undefined) {
    const pnlDiff = Math.abs(dashPnl - csvPnl);
    if (pnlDiff <= 1) {
      reasons.push(`P&L nearly identical: $${dashPnl.toFixed(2)} vs $${csvPnl.toFixed(2)}`);
      total += 2;
    } else if (pnlDiff <= 10) {
      reasons.push(`P&L within $10: $${dashPnl.toFixed(2)} vs $${csvPnl.toFixed(2)} (Δ$${pnlDiff.toFixed(2)})`);
      total += 1;
    } else {
      reasons.push(`P&L differs: $${dashPnl.toFixed(2)} vs $${csvPnl.toFixed(2)} (Δ$${pnlDiff.toFixed(2)})`);
      // No points — but we still flag and let the user decide
    }
  }

  return { total, reasons };
}

/**
 * Classify a score into a confidence level.
 *
 * Base gates (symbol + date + side) = 9 pts → always "low" minimum.
 * Add shares or entry price match → "medium".
 * Add both + timestamp proximity → "high".
 */
function confidenceLevel(total: number): 'high' | 'medium' | 'low' {
  if (total >= 16) return 'high';
  if (total >= 12) return 'medium';
  return 'low';
}

/**
 * Find potential duplicate trades between dashboard trades and CSV imports.
 *
 * Enforces strict 1:1 matching — each dashboard trade and each CSV trade can
 * only be paired once. This correctly handles multiple trades in the same
 * ticker on the same day (e.g. two AAPL LONG trades). The highest-scoring
 * pair wins when there is ambiguity.
 */
export function findPotentialDuplicates(
  dashboardTrades: Trade[],
  csvTrades: Trade[],
  config: DuplicateDetectionConfig = DEFAULT_CONFIG
): PotentialDuplicate[] {
  const duplicates: PotentialDuplicate[] = [];
  const matchedCsvTradeIds = new Set<string>();
  const matchedDashboardTradeIds = new Set<string>();

  for (const csvTrade of csvTrades) {
    if (matchedCsvTradeIds.has(csvTrade.id)) continue;

    let bestMatch: { dashboard: Trade; total: number; reasons: string[] } | null = null;

    for (const dashboardTrade of dashboardTrades) {
      // Skip already-merged trades — they've been reconciled
      if (dashboardTrade.isMerged) continue;
      // Skip trades that were themselves imported from a brokerage CSV
      if (dashboardTrade.entryNotes?.includes('Imported from TOS')) continue;
      // Enforce 1:1 — each dashboard trade can only be paired once
      if (matchedDashboardTradeIds.has(dashboardTrade.id)) continue;

      if (!passesGates(dashboardTrade, csvTrade)) continue;

      const { total, reasons } = score(dashboardTrade, csvTrade);
      if (total < config.minScore) continue;

      if (!bestMatch || total > bestMatch.total) {
        bestMatch = { dashboard: dashboardTrade, total, reasons };
      }
    }

    if (bestMatch) {
      duplicates.push({
        id: `${bestMatch.dashboard.id}_${csvTrade.id}`,
        dashboardTrade: bestMatch.dashboard,
        csvTrade,
        confidence: confidenceLevel(bestMatch.total),
        matchReasons: bestMatch.reasons,
      });
      matchedCsvTradeIds.add(csvTrade.id);
      matchedDashboardTradeIds.add(bestMatch.dashboard.id);
    }
  }

  // Sort by confidence (high first), then score descending within each tier
  const order: Record<'high' | 'medium' | 'low', number> = { high: 0, medium: 1, low: 2 };
  return duplicates.sort((a, b) => order[a.confidence] - order[b.confidence]);
}

/**
 * Get CSV trades that had no duplicate match.
 */
export function getNonDuplicateTrades(
  csvTrades: Trade[],
  duplicates: PotentialDuplicate[]
): Trade[] {
  const duplicateIds = new Set(duplicates.map(d => d.csvTrade.id));
  return csvTrades.filter(t => !duplicateIds.has(t.id));
}

/**
 * Merge two trades.
 * CSV data (brokerage) is the authoritative source for financial figures.
 * Dashboard data is the authoritative source for notes, emotion, and journal fields.
 */
export function mergeTrades(dashboardTrade: Trade, csvTrade: Trade): MergedTrade {
  const now = new Date().toISOString();

  const combinedNotes = [
    dashboardTrade.entryNotes,
    csvTrade.entryNotes,
    '[Merged: brokerage data with dashboard notes]',
  ].filter(Boolean).join('\n\n');

  return {
    // Brokerage CSV is authoritative for all financial fields
    ...csvTrade,
    // Dashboard is authoritative for notes and journal fields
    id: csvTrade.id,
    entryNotes: combinedNotes,
    exitNotes: dashboardTrade.exitNotes || csvTrade.exitNotes,
    emotion: dashboardTrade.emotion || csvTrade.emotion,
    setupQuality: dashboardTrade.setupQuality || csvTrade.setupQuality,
    mistakes: [...(dashboardTrade.mistakes || []), ...(csvTrade.mistakes || [])],
    lessons: [...(dashboardTrade.lessons || []), ...(csvTrade.lessons || [])],
    tags: [...new Set([...(dashboardTrade.tags || []), ...(csvTrade.tags || [])])],
    // Merge metadata
    isMerged: true,
    mergedFrom: [dashboardTrade.id, csvTrade.id],
    mergedAt: now,
    updatedAt: now,
  };
}

/**
 * Summary stats for the duplicate review UI.
 */
export function getDuplicateStats(duplicates: PotentialDuplicate[]) {
  return {
    total: duplicates.length,
    high: duplicates.filter(d => d.confidence === 'high').length,
    medium: duplicates.filter(d => d.confidence === 'medium').length,
    low: duplicates.filter(d => d.confidence === 'low').length,
  };
}
