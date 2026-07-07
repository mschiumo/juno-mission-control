/**
 * Finance — transaction import + spending summary. Owner-only.
 *
 * POST → import a statement CSV (Apple Card export or similar) for one
 *        account: { accountId, csv }. Dedupes on re-import, optionally
 *        updates the account balance when { newBalance } is provided (the
 *        statement shows it; CSV alone can't derive it).
 * GET  → ?months=6 returns per-month spending rollups across all accounts,
 *        or ?accountId=… for one account.
 *
 * Storage: `finance:{userId}:txns:{accountId}` — JSON array, newest first,
 * capped to keep the key bounded.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getRedisClient } from '@/lib/redis';
import { requireOwner } from '@/lib/auth-session';
import { getNowInEST } from '@/lib/date-utils';
import { parseStatementCsv } from '@/lib/finance/apple-card-csv';
import { DebtAccount, FinanceTransaction, MonthlySpendSummary } from '@/lib/finance/types';

const txnsKey = (userId: string, accountId: string) => `finance:${userId}:txns:${accountId}`;
const accountsKey = (userId: string) => `finance:${userId}:accounts`;
const MAX_TXNS_PER_ACCOUNT = 5000;

async function loadAccounts(userId: string): Promise<DebtAccount[]> {
  const redis = await getRedisClient();
  const raw = await redis.get(accountsKey(userId));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function loadTxns(userId: string, accountId: string): Promise<FinanceTransaction[]> {
  const redis = await getRedisClient();
  const raw = await redis.get(txnsKey(userId, accountId));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// POST — import CSV text for an account
export async function POST(request: NextRequest) {
  const { userId, error } = await requireOwner();
  if (error) return error;

  try {
    const body = await request.json();
    const accountId = typeof body.accountId === 'string' ? body.accountId : '';
    const csv = typeof body.csv === 'string' ? body.csv : '';
    if (!accountId || !csv) {
      return NextResponse.json(
        { success: false, error: 'accountId and csv are required' },
        { status: 400 },
      );
    }

    const accounts = await loadAccounts(userId);
    const account = accounts.find((a) => a.id === accountId);
    if (!account) {
      return NextResponse.json({ success: false, error: 'Account not found' }, { status: 404 });
    }

    const parsed = parseStatementCsv(csv);
    if (typeof parsed === 'string') {
      return NextResponse.json({ success: false, error: parsed }, { status: 400 });
    }

    const now = getNowInEST();
    const existing = await loadTxns(userId, accountId);
    const seen = new Set(existing.map((t) => t.id));
    const fresh: FinanceTransaction[] = parsed.transactions
      .filter((t) => !seen.has(t.id))
      .map((t) => ({ ...t, accountId, importedAt: now }));

    const merged = [...fresh, ...existing]
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, MAX_TXNS_PER_ACCOUNT);

    const redis = await getRedisClient();
    await redis.set(txnsKey(userId, accountId), JSON.stringify(merged));

    // Statement CSVs list transactions, not the running balance — accept the
    // statement's "new balance" figure when the user provides it.
    let balanceUpdated = false;
    const newBalance = Number(body.newBalance);
    if (body.newBalance !== undefined && body.newBalance !== '' && Number.isFinite(newBalance) && newBalance >= 0) {
      const idx = accounts.findIndex((a) => a.id === accountId);
      accounts[idx] = { ...accounts[idx], balance: Math.round(newBalance * 100) / 100, updatedAt: now };
      await redis.set(accountsKey(userId), JSON.stringify(accounts));
      balanceUpdated = true;
    }

    return NextResponse.json({
      success: true,
      imported: fresh.length,
      duplicatesSkipped: parsed.transactions.length - fresh.length,
      badRowsSkipped: parsed.skippedRows,
      dateRange: parsed.dateRange,
      balanceUpdated,
      totalStored: merged.length,
    });
  } catch (e) {
    console.error('[finance/transactions] POST failed:', e);
    return NextResponse.json({ success: false, error: 'Failed to import CSV' }, { status: 500 });
  }
}

// GET — monthly spending summaries (?months=6, optional ?accountId=)
export async function GET(request: NextRequest) {
  const { userId, error } = await requireOwner();
  if (error) return error;

  try {
    const { searchParams } = new URL(request.url);
    const monthsWanted = Math.min(Math.max(parseInt(searchParams.get('months') ?? '6', 10) || 6, 1), 36);
    const accountFilter = searchParams.get('accountId');

    const accounts = await loadAccounts(userId);
    const ids = accountFilter ? [accountFilter] : accounts.map((a) => a.id);
    const all = (await Promise.all(ids.map((id) => loadTxns(userId, id)))).flat();

    const byMonth = new Map<string, MonthlySpendSummary>();
    for (const t of all) {
      const month = t.date.slice(0, 7);
      let s = byMonth.get(month);
      if (!s) {
        s = { month, charges: 0, payments: 0, byCategory: {}, count: 0 };
        byMonth.set(month, s);
      }
      s.count++;
      if (t.amount >= 0) {
        s.charges = Math.round((s.charges + t.amount) * 100) / 100;
        s.byCategory[t.category] = Math.round(((s.byCategory[t.category] ?? 0) + t.amount) * 100) / 100;
      } else {
        s.payments = Math.round((s.payments - t.amount) * 100) / 100;
      }
    }

    const summaries = [...byMonth.values()]
      .sort((a, b) => b.month.localeCompare(a.month))
      .slice(0, monthsWanted);

    return NextResponse.json({ success: true, summaries, totalTransactions: all.length });
  } catch (e) {
    console.error('[finance/transactions] GET failed:', e);
    return NextResponse.json({ success: false, error: 'Failed to load transactions' }, { status: 500 });
  }
}
