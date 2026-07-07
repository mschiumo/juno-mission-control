/**
 * Balance-history snapshots — the data behind the Finances progress charts.
 *
 * Every mutation that changes a balance (manual edit, CSV statement import,
 * Google Sheet sync) calls recordSnapshots(), which recomputes the day's
 * totals for the three tracked series (debt, investment, savings/cash) and
 * upserts today's point. One point per day per series: repeated updates the
 * same day just move that day's value, so the series stays clean.
 *
 * Keys: finance:{userId}:history:{debt|investment|savings}
 *
 * NEXT STEP: once aggregator sync (Teller/Plaid) or the sheet-sync cron
 * lands, snapshots accrue daily without the user opening the tab — that's
 * when these charts get properly dense. A backfill from imported statement
 * transactions (balance walked backwards from payments/charges) could also
 * seed debt history retroactively.
 */

import { getRedisClient } from '@/lib/redis';
import { getTodayInEST } from '@/lib/date-utils';
import { DebtAccount, BalanceAccount, HistoryPoint, FinanceHistory } from './types';

const MAX_POINTS = 1100; // ~3 years of daily points

const historyKey = (userId: string, series: string) => `finance:${userId}:history:${series}`;
const debtAccountsKey = (userId: string) => `finance:${userId}:accounts`;
const balanceAccountsKey = (userId: string) => `finance:${userId}:balance-accounts`;

async function loadJsonArray<T>(key: string): Promise<T[]> {
  const redis = await getRedisClient();
  const raw = await redis.get(key);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function upsertPoint(userId: string, series: string, value: number): Promise<void> {
  const key = historyKey(userId, series);
  const points = await loadJsonArray<HistoryPoint>(key);
  const today = getTodayInEST();
  const rounded = Math.round(value * 100) / 100;

  const idx = points.findIndex((p) => p.date === today);
  if (idx !== -1) {
    points[idx] = { date: today, value: rounded };
  } else {
    points.push({ date: today, value: rounded });
  }
  points.sort((a, b) => a.date.localeCompare(b.date));

  const redis = await getRedisClient();
  await redis.set(key, JSON.stringify(points.slice(-MAX_POINTS)));
}

/** Recompute today's totals from both account stores and upsert all series. */
export async function recordSnapshots(userId: string): Promise<void> {
  const [debts, balances] = await Promise.all([
    loadJsonArray<DebtAccount>(debtAccountsKey(userId)),
    loadJsonArray<BalanceAccount>(balanceAccountsKey(userId)),
  ]);

  const debtTotal = debts.reduce((s, a) => s + a.balance, 0);
  const investTotal = balances.filter((a) => a.kind === 'investment').reduce((s, a) => s + a.balance, 0);
  const savingsTotal = balances.filter((a) => a.kind !== 'investment').reduce((s, a) => s + a.balance, 0);

  await Promise.all([
    upsertPoint(userId, 'debt', debtTotal),
    upsertPoint(userId, 'investment', investTotal),
    upsertPoint(userId, 'savings', savingsTotal),
  ]);
}

export async function loadHistory(userId: string): Promise<FinanceHistory> {
  const [debt, investment, savings] = await Promise.all([
    loadJsonArray<HistoryPoint>(historyKey(userId, 'debt')),
    loadJsonArray<HistoryPoint>(historyKey(userId, 'investment')),
    loadJsonArray<HistoryPoint>(historyKey(userId, 'savings')),
  ]);
  return { debt, investment, savings };
}
