/**
 * Finance — asset-side account CRUD (investments, savings, checking).
 * Owner-only. Mirrors the debt accounts route; every balance change also
 * records a history snapshot so the Investing/Savings charts accrue points.
 *
 * Storage: `finance:{userId}:balance-accounts` (JSON array).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getRedisClient } from '@/lib/redis';
import { requireOwner } from '@/lib/auth-session';
import { getNowInEST } from '@/lib/date-utils';
import { recordSnapshots } from '@/lib/finance/history';
import { BalanceAccount, BalanceKind } from '@/lib/finance/types';

const balanceAccountsKey = (userId: string) => `finance:${userId}:balance-accounts`;

const BALANCE_KINDS: BalanceKind[] = ['investment', 'savings', 'checking', 'other'];

async function loadAccounts(userId: string): Promise<BalanceAccount[]> {
  const redis = await getRedisClient();
  const raw = await redis.get(balanceAccountsKey(userId));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function saveAccounts(userId: string, accounts: BalanceAccount[]): Promise<void> {
  const redis = await getRedisClient();
  await redis.set(balanceAccountsKey(userId), JSON.stringify(accounts));
}

// GET — list all asset accounts (optionally ?kind=investment)
export async function GET(request: NextRequest) {
  const { userId, error } = await requireOwner();
  if (error) return error;

  try {
    const kind = new URL(request.url).searchParams.get('kind');
    let accounts = await loadAccounts(userId);
    if (kind) accounts = accounts.filter((a) => a.kind === kind);
    return NextResponse.json({ success: true, accounts });
  } catch (e) {
    console.error('[finance/balance-accounts] GET failed:', e);
    return NextResponse.json({ success: false, error: 'Failed to load accounts' }, { status: 500 });
  }
}

// POST — create (no id) or update (id present)
export async function POST(request: NextRequest) {
  const { userId, error } = await requireOwner();
  if (error) return error;

  try {
    const body = await request.json();

    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) {
      return NextResponse.json({ success: false, error: 'Account name is required' }, { status: 400 });
    }
    const kind: BalanceKind = BALANCE_KINDS.includes(body.kind) ? body.kind : 'other';
    const balance = Number(body.balance);
    if (!Number.isFinite(balance) || balance < 0) {
      return NextResponse.json({ success: false, error: 'Balance must be a non-negative number' }, { status: 400 });
    }
    const institution = typeof body.institution === 'string' ? body.institution.trim() : '';

    const accounts = await loadAccounts(userId);
    const now = getNowInEST();
    const id = typeof body.id === 'string' ? body.id : '';
    const fields = { name, kind, balance: Math.round(balance * 100) / 100, institution };

    let account: BalanceAccount;
    if (id) {
      const idx = accounts.findIndex((a) => a.id === id);
      if (idx === -1) {
        return NextResponse.json({ success: false, error: 'Account not found' }, { status: 404 });
      }
      accounts[idx] = { ...accounts[idx], ...fields, updatedAt: now };
      account = accounts[idx];
    } else {
      account = {
        id: `bal_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        ...fields,
        source: 'manual',
        createdAt: now,
        updatedAt: now,
      };
      accounts.push(account);
    }

    await saveAccounts(userId, accounts);
    await recordSnapshots(userId);
    return NextResponse.json({ success: true, account });
  } catch (e) {
    console.error('[finance/balance-accounts] POST failed:', e);
    return NextResponse.json({ success: false, error: 'Failed to save account' }, { status: 500 });
  }
}

// DELETE — remove by ?id=
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
    await recordSnapshots(userId);
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('[finance/balance-accounts] DELETE failed:', e);
    return NextResponse.json({ success: false, error: 'Failed to delete account' }, { status: 500 });
  }
}
