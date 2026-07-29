import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { getRedisClient } from '@/lib/redis';
import { requireOwner } from '@/lib/auth-session';
import { getTodayInEST } from '@/lib/date-utils';
import {
  CreditAccount,
  BalanceSnapshot,
  CREDIT_ACCOUNTS_KEY,
  CREDIT_HISTORY_KEY,
  SEED_ACCOUNTS,
} from '@/lib/finances/credit-cards';

// Credit Card Balance tracker — owner-only CRUD over a JSON array of accounts,
// plus a per-day balance history that records itself on every mutation.

async function readAccounts(userId: string): Promise<CreditAccount[] | null> {
  const redis = await getRedisClient();
  const raw = await redis.get(CREDIT_ACCOUNTS_KEY(userId));
  return raw ? (JSON.parse(raw) as CreditAccount[]) : null;
}

async function writeAccounts(userId: string, accounts: CreditAccount[]) {
  const redis = await getRedisClient();
  await redis.set(CREDIT_ACCOUNTS_KEY(userId), JSON.stringify(accounts));
}

async function readHistory(userId: string): Promise<BalanceSnapshot[]> {
  const redis = await getRedisClient();
  const raw = await redis.get(CREDIT_HISTORY_KEY(userId));
  return raw ? (JSON.parse(raw) as BalanceSnapshot[]) : [];
}

// Upsert today's snapshot (one per EST day) so intraday edits don't spam the chart.
async function recordSnapshot(userId: string, accounts: CreditAccount[]): Promise<BalanceSnapshot[]> {
  const redis = await getRedisClient();
  const history = await readHistory(userId);
  const today = getTodayInEST();
  const snapshot: BalanceSnapshot = {
    date: today,
    total: accounts.reduce((s, a) => s + a.balance, 0),
    balances: Object.fromEntries(accounts.map((a) => [a.id, a.balance])),
  };
  const idx = history.findIndex((h) => h.date === today);
  if (idx >= 0) history[idx] = snapshot;
  else history.push(snapshot);
  history.sort((a, b) => a.date.localeCompare(b.date));
  await redis.set(CREDIT_HISTORY_KEY(userId), JSON.stringify(history));
  return history;
}

function parseAccountFields(body: Record<string, unknown>): { name: string; balance: number; apr: number; monthlyPayment: number } | NextResponse {
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const balance = Number(body.balance);
  const apr = Number(body.apr);
  const monthlyPayment = Number(body.monthlyPayment ?? 0);
  if (!name) {
    return NextResponse.json({ success: false, error: 'Name is required' }, { status: 400 });
  }
  if (!Number.isFinite(balance) || balance < 0 || !Number.isFinite(apr) || apr < 0 || apr > 100 || !Number.isFinite(monthlyPayment) || monthlyPayment < 0) {
    return NextResponse.json({ success: false, error: 'Invalid balance, APR, or payment' }, { status: 400 });
  }
  return { name, balance, apr, monthlyPayment };
}

// GET — list accounts + history; seeds the owner's initial accounts on first run.
export async function GET() {
  const { userId, error: authError } = await requireOwner();
  if (authError) return authError;

  try {
    let accounts = await readAccounts(userId);
    let history: BalanceSnapshot[];
    if (accounts === null) {
      const now = new Date().toISOString();
      accounts = SEED_ACCOUNTS.map((s) => ({ ...s, id: randomUUID(), monthlyPayment: 0, createdAt: now, updatedAt: now }));
      await writeAccounts(userId, accounts);
      history = await recordSnapshot(userId, accounts);
    } else {
      history = await readHistory(userId);
    }
    return NextResponse.json({ success: true, accounts, history });
  } catch (error) {
    console.error('Error fetching credit accounts:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to fetch accounts' },
      { status: 500 },
    );
  }
}

// POST — add an account. Body: { name, balance, apr, monthlyPayment? }
export async function POST(request: NextRequest) {
  const { userId, error: authError } = await requireOwner();
  if (authError) return authError;

  try {
    const parsed = parseAccountFields(await request.json());
    if (parsed instanceof NextResponse) return parsed;

    const accounts = (await readAccounts(userId)) ?? [];
    const now = new Date().toISOString();
    accounts.push({ ...parsed, id: randomUUID(), createdAt: now, updatedAt: now });
    await writeAccounts(userId, accounts);
    const history = await recordSnapshot(userId, accounts);
    return NextResponse.json({ success: true, accounts, history });
  } catch (error) {
    console.error('Error adding credit account:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to add account' },
      { status: 500 },
    );
  }
}

// PUT — update an account. Body: { id, name, balance, apr, monthlyPayment }
export async function PUT(request: NextRequest) {
  const { userId, error: authError } = await requireOwner();
  if (authError) return authError;

  try {
    const body = await request.json();
    const id = typeof body.id === 'string' ? body.id : '';
    const parsed = parseAccountFields(body);
    if (parsed instanceof NextResponse) return parsed;

    const accounts = (await readAccounts(userId)) ?? [];
    const idx = accounts.findIndex((a) => a.id === id);
    if (idx < 0) {
      return NextResponse.json({ success: false, error: 'Account not found' }, { status: 404 });
    }
    accounts[idx] = { ...accounts[idx], ...parsed, updatedAt: new Date().toISOString() };
    await writeAccounts(userId, accounts);
    const history = await recordSnapshot(userId, accounts);
    return NextResponse.json({ success: true, accounts, history });
  } catch (error) {
    console.error('Error updating credit account:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to update account' },
      { status: 500 },
    );
  }
}

// DELETE — remove an account. Query: ?id=<accountId>
export async function DELETE(request: NextRequest) {
  const { userId, error: authError } = await requireOwner();
  if (authError) return authError;

  try {
    const id = request.nextUrl.searchParams.get('id') ?? '';
    const accounts = (await readAccounts(userId)) ?? [];
    const remaining = accounts.filter((a) => a.id !== id);
    if (remaining.length === accounts.length) {
      return NextResponse.json({ success: false, error: 'Account not found' }, { status: 404 });
    }
    await writeAccounts(userId, remaining);
    const history = await recordSnapshot(userId, remaining);
    return NextResponse.json({ success: true, accounts: remaining, history });
  } catch (error) {
    console.error('Error deleting credit account:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to delete account' },
      { status: 500 },
    );
  }
}
