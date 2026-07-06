/**
 * Performance Review storage (Milestone R) — the Redis translation of the
 * canonical Postgres additions: executions, trades, symbol_pl_summary,
 * risk_config, rule_violations, weekly_reviews, import_batches.
 *
 * Same conventions as the other lib/db/confluence modules: one JSON blob per
 * user per entity, reads fail soft, writes stamp timestamps. Invariants the
 * DDL would enforce with constraints are enforced in code by the callers
 * (lib/confluence/review/ingest.ts):
 *   - import_batches.file_hash is unique per user (idempotent re-import);
 *   - risk_config is append-only — new rows, never updates;
 *   - executions are deduped on their natural key.
 */

import { getRedisClient } from '@/lib/redis';
import {
  DEFAULT_RISK_CONFIG,
  type ImportBatch,
  type ReviewExecution,
  type ReviewSource,
  type RiskConfig,
  type RiskConfigEntry,
  type RoundTrip,
  type RuleViolation,
  type SymbolPlSummary,
  type WeeklyReview,
} from '@/types/confluence-review';

const key = (entity: string, userId: string) => `confluence:review:${entity}:${userId}`;

async function readList<T>(entity: string, userId: string): Promise<T[]> {
  try {
    const redis = await getRedisClient();
    const data = await redis.get(key(entity, userId));
    if (!data) return [];
    return (JSON.parse(data).items as T[]) || [];
  } catch (error) {
    console.error(`Error reading confluence review ${entity} from Redis:`, error);
    return [];
  }
}

async function writeList<T>(entity: string, userId: string, items: T[]): Promise<void> {
  const redis = await getRedisClient();
  await redis.set(key(entity, userId), JSON.stringify({ items }));
}

// ---- executions -----------------------------------------------------------

export async function getExecutions(userId: string, source?: ReviewSource): Promise<ReviewExecution[]> {
  const all = await readList<ReviewExecution>('executions', userId);
  return source ? all.filter((e) => e.source === source) : all;
}

/** Insert-only merge on execution id (ids are deterministic natural-key
 * hashes, so overlapping statements converge). Returns how many were new. */
export async function addExecutions(userId: string, executions: ReviewExecution[]): Promise<number> {
  const existing = await readList<ReviewExecution>('executions', userId);
  const seen = new Set(existing.map((e) => e.id));
  const fresh = executions.filter((e) => !seen.has(e.id));
  if (fresh.length > 0) {
    await writeList('executions', userId, [...existing, ...fresh]);
  }
  return fresh.length;
}

/** Replace all executions for one source (used by the agentic sync, whose
 * rows are fully derivable from the execution-service order log). */
export async function replaceExecutions(
  userId: string,
  source: ReviewSource,
  executions: ReviewExecution[],
): Promise<void> {
  const others = (await readList<ReviewExecution>('executions', userId)).filter((e) => e.source !== source);
  await writeList('executions', userId, [...others, ...executions]);
}

// ---- trades (paired round trips) -------------------------------------------

export async function getRoundTrips(userId: string, source?: ReviewSource): Promise<RoundTrip[]> {
  const all = await readList<RoundTrip>('trades', userId);
  return source ? all.filter((t) => t.source === source) : all;
}

/** Replace all round trips for one source (pairing is a deterministic
 * function of that source's executions, so wholesale recompute is safe). */
export async function replaceRoundTrips(userId: string, source: ReviewSource, trades: RoundTrip[]): Promise<void> {
  const others = (await readList<RoundTrip>('trades', userId)).filter((t) => t.source !== source);
  await writeList('trades', userId, [...others, ...trades]);
}

// ---- symbol_pl_summary ------------------------------------------------------

export async function getSymbolPlSummaries(userId: string): Promise<SymbolPlSummary[]> {
  return readList<SymbolPlSummary>('symbol-pl', userId);
}

/** Upsert on (symbol, asOfDate) — re-importing a statement refreshes its own
 * as-of snapshot without touching other dates. */
export async function upsertSymbolPlSummaries(userId: string, rows: SymbolPlSummary[]): Promise<void> {
  const existing = await readList<SymbolPlSummary>('symbol-pl', userId);
  const incoming = new Set(rows.map((r) => `${r.symbol}|${r.asOfDate}`));
  const kept = existing.filter((r) => !incoming.has(`${r.symbol}|${r.asOfDate}`));
  await writeList('symbol-pl', userId, [...kept, ...rows]);
}

// ---- risk_config (append-only history) ---------------------------------------

export async function getRiskConfigEntries(userId: string): Promise<RiskConfigEntry[]> {
  return readList<RiskConfigEntry>('risk-config', userId);
}

/** Current config = defaults folded with the append-only history in order. */
export async function getRiskConfig(userId: string): Promise<RiskConfig> {
  const entries = await getRiskConfigEntries(userId);
  const config = { ...DEFAULT_RISK_CONFIG };
  for (const e of entries) {
    if (e.key in config && Number.isFinite(e.value) && e.value > 0) {
      config[e.key] = e.value;
    }
  }
  return config;
}

/** Append new rows for the keys that changed — never update in place. */
export async function appendRiskConfig(
  userId: string,
  updates: Partial<RiskConfig>,
  createdBy?: string,
): Promise<RiskConfig> {
  const current = await getRiskConfig(userId);
  const entries = await getRiskConfigEntries(userId);
  const now = new Date().toISOString();
  for (const k of Object.keys(DEFAULT_RISK_CONFIG) as (keyof RiskConfig)[]) {
    const value = updates[k];
    if (value === undefined) continue;
    if (!Number.isFinite(value) || value <= 0) continue;
    if (value === current[k]) continue;
    entries.push({ id: crypto.randomUUID(), key: k, value, createdAt: now, createdBy });
  }
  await writeList('risk-config', userId, entries);
  return getRiskConfig(userId);
}

// ---- rule_violations ----------------------------------------------------------

export async function getViolations(userId: string, source?: ReviewSource): Promise<RuleViolation[]> {
  const all = await readList<RuleViolation>('violations', userId);
  return source ? all.filter((v) => v.source === source) : all;
}

/** Replace one source's violations with a fresh evaluation, preserving the
 * original detectedAt for violations that already existed (ids are
 * deterministic, so identity survives recomputes). */
export async function replaceViolations(
  userId: string,
  source: ReviewSource,
  violations: RuleViolation[],
): Promise<void> {
  const all = await readList<RuleViolation>('violations', userId);
  const prior = new Map(all.filter((v) => v.source === source).map((v) => [v.id, v]));
  const merged = violations.map((v) => {
    const p = prior.get(v.id);
    return p ? { ...v, detectedAt: p.detectedAt } : v;
  });
  const others = all.filter((v) => v.source !== source);
  await writeList('violations', userId, [...others, ...merged]);
}

// ---- weekly_reviews --------------------------------------------------------------

export async function getWeeklyReviews(userId: string): Promise<WeeklyReview[]> {
  const all = await readList<WeeklyReview>('weekly-reviews', userId);
  return all.sort((a, b) => b.weekStart.localeCompare(a.weekStart));
}

/** Upsert on weekStart — re-running a week's review replaces its narrative. */
export async function saveWeeklyReview(userId: string, review: WeeklyReview): Promise<void> {
  const all = await readList<WeeklyReview>('weekly-reviews', userId);
  const kept = all.filter((r) => r.weekStart !== review.weekStart);
  await writeList('weekly-reviews', userId, [...kept, review]);
}

// ---- import_batches ----------------------------------------------------------------

export async function getImportBatches(userId: string): Promise<ImportBatch[]> {
  const all = await readList<ImportBatch>('import-batches', userId);
  return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function findBatchByHash(userId: string, fileHash: string): Promise<ImportBatch | null> {
  const all = await readList<ImportBatch>('import-batches', userId);
  return all.find((b) => b.fileHash === fileHash && b.status === 'imported') || null;
}

export async function saveImportBatch(userId: string, batch: ImportBatch): Promise<void> {
  const all = await readList<ImportBatch>('import-batches', userId);
  await writeList('import-batches', userId, [...all, batch]);
}
