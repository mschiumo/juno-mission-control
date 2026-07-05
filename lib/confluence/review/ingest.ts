/**
 * Ingestion for the Performance Review module — the impure shell around the
 * pure parser/pairing/metrics/rules functions.
 *
 *   manual_tos  — importStatement(): parse an uploaded ThinkOrSwim Account
 *                 Statement, dedupe by file hash (idempotent re-import),
 *                 reject atomically on parse failure (no partial imports),
 *                 then recompute round trips + violations for the source.
 *   agentic_rh  — syncAgenticFills(): map fills already recorded by the
 *                 execution service (lib/db/confluence/orders) into the same
 *                 normalized schema. No new Robinhood calls.
 *
 * This module is READ-ONLY over trade history — it writes only the review
 * module's own entities.
 */

import { createHash } from 'crypto';
import { getAllOrders } from '@/lib/db/confluence/orders';
import {
  addExecutions,
  findBatchByHash,
  getExecutions,
  getRiskConfig,
  replaceExecutions,
  replaceRoundTrips,
  replaceViolations,
  saveImportBatch,
  upsertSymbolPlSummaries,
} from '@/lib/db/confluence/review';
import type {
  ImportBatch,
  ReviewExecution,
  ReviewSource,
  RiskConfig,
  RoundTrip,
} from '@/types/confluence-review';
import { parseAccountStatement, StatementParseError, type ParsedFill } from './parser';
import { applyRiskUnit, pairExecutions } from './pairing';
import { evaluateTradeRules } from './rules';

/** Deterministic execution id from the natural key, so overlapping
 * statements (or re-synced orders) converge on the same rows. */
function executionId(source: ReviewSource, seed: string): string {
  return `ex_${createHash('sha256').update(`${source}|${seed}`).digest('hex').slice(0, 16)}`;
}

function fillToExecution(fill: ParsedFill, batchId: string): ReviewExecution {
  return {
    id: executionId('manual_tos', `${fill.symbol}|${fill.side}|${fill.qty}|${fill.price}|${fill.executedAt}`),
    source: 'manual_tos',
    symbol: fill.symbol,
    side: fill.side,
    qty: fill.qty,
    price: fill.price,
    fees: fill.fees,
    executedAt: fill.executedAt,
    etDate: fill.etDate,
    orderType: fill.orderType,
    posEffect: fill.posEffect,
    importBatchId: batchId,
  };
}

/** Re-pair one source's executions, apply the current risk unit, persist the
 * round trips, and refresh that source's observed violations. */
export async function recomputeSource(
  userId: string,
  source: ReviewSource,
  config?: RiskConfig,
): Promise<{ roundTrips: RoundTrip[]; violations: number }> {
  const cfg = config ?? (await getRiskConfig(userId));
  const executions = await getExecutions(userId, source);
  const { roundTrips } = pairExecutions(executions);
  const withR = applyRiskUnit(roundTrips, cfg.riskUnitUsd);
  await replaceRoundTrips(userId, source, withR);
  const violations = evaluateTradeRules(withR, cfg, source, new Date().toISOString());
  await replaceViolations(userId, source, violations);
  return { roundTrips: withR, violations: violations.length };
}

export interface ImportResult {
  ok: boolean;
  duplicate?: boolean;
  batch: ImportBatch;
  roundTrips?: number;
  violations?: number;
}

/**
 * Import one statement export. Idempotent (file-hash dedupe); parse failures
 * reject the batch atomically — nothing but the rejected batch record is
 * written.
 */
export async function importStatement(userId: string, csvText: string, fileName?: string): Promise<ImportResult> {
  const fileHash = createHash('sha256').update(csvText).digest('hex');
  const now = new Date().toISOString();

  const existing = await findBatchByHash(userId, fileHash);
  if (existing) {
    return { ok: false, duplicate: true, batch: existing };
  }

  const batchId = crypto.randomUUID();
  let parsed;
  try {
    parsed = parseAccountStatement(csvText);
  } catch (err) {
    const message = err instanceof StatementParseError ? err.message : `Unexpected parse failure: ${String(err)}`;
    const rejected: ImportBatch = {
      id: batchId,
      source: 'manual_tos',
      fileName,
      fileHash,
      status: 'rejected',
      rowCounts: { fills: 0, duplicates: 0, orderHistoryRows: 0, cashRows: 0, plRows: 0 },
      warnings: [],
      error: message,
      sessionDates: [],
      createdAt: now,
    };
    await saveImportBatch(userId, rejected);
    return { ok: false, batch: rejected };
  }

  const executions = parsed.fills.map((f) => fillToExecution(f, batchId));
  const added = await addExecutions(userId, executions);

  if (parsed.symbolPl.length > 0 && parsed.asOfDate) {
    await upsertSymbolPlSummaries(
      userId,
      parsed.symbolPl.map((r) => ({
        symbol: r.symbol,
        description: r.description,
        plYtd: r.plYtd,
        plDay: r.plDay,
        asOfDate: parsed.asOfDate!,
        importBatchId: batchId,
      })),
    );
  }

  const { roundTrips, violations } = await recomputeSource(userId, 'manual_tos');

  const batch: ImportBatch = {
    id: batchId,
    source: 'manual_tos',
    fileName,
    fileHash,
    status: 'imported',
    rowCounts: {
      fills: parsed.fills.length,
      duplicates: parsed.fills.length - added,
      orderHistoryRows: parsed.rowCounts.orderHistoryRows,
      cashRows: parsed.rowCounts.cashRows,
      plRows: parsed.rowCounts.plRows,
    },
    warnings: parsed.warnings,
    sessionDates: [...new Set(parsed.fills.map((f) => f.etDate))].sort(),
    createdAt: now,
  };
  await saveImportBatch(userId, batch);

  return { ok: true, batch, roundTrips: roundTrips.length, violations };
}

/**
 * Map fills already recorded by the execution service into the normalized
 * executions schema (source: agentic_rh). The whole source is replaced on
 * every sync — it is fully derivable from the order log, and replacement
 * means a partial fill that later grows never double-counts.
 */
export async function syncAgenticFills(userId: string): Promise<{ added: number; roundTrips: number; violations: number }> {
  const orders = await getAllOrders(userId);
  const executions: ReviewExecution[] = [];

  for (const order of orders) {
    const qty = order.filledQuantity;
    const price = order.avgFillPrice;
    if (!(qty > 0) || price === undefined || !(price > 0)) continue;
    if (order.status !== 'filled' && order.status !== 'partially_filled' && order.status !== 'cancelled') continue;

    const executedAt = order.filledAt ?? order.updatedAt;
    const etDate = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(executedAt));

    executions.push({
      id: executionId('agentic_rh', order.id),
      source: 'agentic_rh',
      symbol: order.symbol,
      side: order.side,
      qty,
      price,
      fees: 0, // Robinhood equities: no per-fill commissions recorded
      executedAt,
      etDate,
      orderType: order.type,
    });
  }

  await replaceExecutions(userId, 'agentic_rh', executions);
  const { roundTrips, violations } = await recomputeSource(userId, 'agentic_rh');
  return { added: executions.length, roundTrips: roundTrips.length, violations };
}
