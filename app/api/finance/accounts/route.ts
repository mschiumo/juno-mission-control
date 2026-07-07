/**
 * Finance — debt account CRUD. Owner-only (requireOwner, same billing-style
 * gate as SnapTrade): this feature is personal to the app owner.
 *
 * Storage: single JSON array at `finance:{userId}:accounts` (goals_data
 * pattern — the list is small and always read/written whole).
 *
 * NEXT STEPS (API side) — see lib/finance/types.ts for the full plan:
 * - app/api/finance/teller/* — Teller Connect enrollment + nightly balance
 *   sync (upsert accounts with source:'teller', keep apr/minPayment/dueDay
 *   user-editable since Teller doesn't return card terms).
 * - app/api/finance/plaid/* — Plaid Link + Liabilities (returns APR/min
 *   payment/due date, replacing manual entry for supported cards).
 * - Encrypt aggregator access tokens at rest before storing in Redis.
 * - Webhook or cron (app/api/run-cron pattern) to refresh balances daily.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getRedisClient } from '@/lib/redis';
import { requireOwner } from '@/lib/auth-session';
import { getNowInEST } from '@/lib/date-utils';
import { DebtAccount, DebtType } from '@/lib/finance/types';

const accountsKey = (userId: string) => `finance:${userId}:accounts`;

const DEBT_TYPES: DebtType[] = [
  'credit-card',
  'auto-loan',
  'student-loan',
  'personal-loan',
  'mortgage',
  'other',
];

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

async function saveAccounts(userId: string, accounts: DebtAccount[]): Promise<void> {
  const redis = await getRedisClient();
  await redis.set(accountsKey(userId), JSON.stringify(accounts));
}

function parseAccountInput(body: Record<string, unknown>): Omit<DebtAccount, 'id' | 'createdAt' | 'updatedAt' | 'source'> | string {
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) return 'Account name is required';

  const type = DEBT_TYPES.includes(body.type as DebtType) ? (body.type as DebtType) : 'other';

  const balance = Number(body.balance);
  const apr = Number(body.apr);
  const minPayment = Number(body.minPayment);
  const dueDay = Number(body.dueDay);

  if (!Number.isFinite(balance) || balance < 0) return 'Balance must be a non-negative number';
  if (!Number.isFinite(apr) || apr < 0 || apr > 100) return 'APR must be between 0 and 100';
  if (!Number.isFinite(minPayment) || minPayment < 0) return 'Minimum payment must be a non-negative number';
  if (!Number.isFinite(dueDay) || dueDay < 1 || dueDay > 28) return 'Due day must be between 1 and 28';

  return {
    name,
    type,
    balance: Math.round(balance * 100) / 100,
    apr: Math.round(apr * 100) / 100,
    minPayment: Math.round(minPayment * 100) / 100,
    dueDay: Math.round(dueDay),
  };
}

// GET — list all debt accounts
export async function GET() {
  const { userId, error } = await requireOwner();
  if (error) return error;

  try {
    const accounts = await loadAccounts(userId);
    return NextResponse.json({ success: true, accounts });
  } catch (e) {
    console.error('[finance/accounts] GET failed:', e);
    return NextResponse.json({ success: false, error: 'Failed to load accounts' }, { status: 500 });
  }
}

// POST — create (no id) or update (id present) an account
export async function POST(request: NextRequest) {
  const { userId, error } = await requireOwner();
  if (error) return error;

  try {
    const body = await request.json();
    const parsed = parseAccountInput(body);
    if (typeof parsed === 'string') {
      return NextResponse.json({ success: false, error: parsed }, { status: 400 });
    }

    const accounts = await loadAccounts(userId);
    const now = getNowInEST();
    const id = typeof body.id === 'string' ? body.id : '';

    if (id) {
      const idx = accounts.findIndex((a) => a.id === id);
      if (idx === -1) {
        return NextResponse.json({ success: false, error: 'Account not found' }, { status: 404 });
      }
      accounts[idx] = { ...accounts[idx], ...parsed, updatedAt: now };
      await saveAccounts(userId, accounts);
      return NextResponse.json({ success: true, account: accounts[idx] });
    }

    const account: DebtAccount = {
      id: `debt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      ...parsed,
      source: 'manual',
      createdAt: now,
      updatedAt: now,
    };
    accounts.push(account);
    await saveAccounts(userId, accounts);
    return NextResponse.json({ success: true, account });
  } catch (e) {
    console.error('[finance/accounts] POST failed:', e);
    return NextResponse.json({ success: false, error: 'Failed to save account' }, { status: 500 });
  }
}

// DELETE — remove an account by ?id=
export async function DELETE(request: NextRequest) {
  const { userId, error } = await requireOwner();
  if (error) return error;

  try {
    const id = new URL(request.url).searchParams.get('id');
    if (!id) {
      return NextResponse.json({ success: false, error: 'Account id required' }, { status: 400 });
    }

    const accounts = await loadAccounts(userId);
    const next = accounts.filter((a) => a.id !== id);
    if (next.length === accounts.length) {
      return NextResponse.json({ success: false, error: 'Account not found' }, { status: 404 });
    }
    await saveAccounts(userId, next);
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('[finance/accounts] DELETE failed:', e);
    return NextResponse.json({ success: false, error: 'Failed to delete account' }, { status: 500 });
  }
}
