import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { requireOwner } from '@/lib/auth-session';
import { applyManualEdit, SEED_ACCOUNTS, type ManualEdit } from '@/lib/finances/credit-cards';
import { readAccounts, readHistory, recordSnapshot, writeAccounts } from '@/lib/finances/store';

// Credit Card Balance tracker — owner-only CRUD over a JSON array of accounts,
// plus a per-day balance history that records itself on every mutation.

function parseAccountFields(body: Record<string, unknown>): ManualEdit | NextResponse {
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const balance = Number(body.balance);
  const apr = Number(body.apr);
  const monthlyPayment = Number(body.monthlyPayment ?? 0);
  if (!name) {
    return NextResponse.json({ success: false, error: 'Name is required' }, { status: 400 });
  }
  if (
    !Number.isFinite(balance) ||
    balance < 0 ||
    !Number.isFinite(apr) ||
    apr < 0 ||
    apr > 100 ||
    !Number.isFinite(monthlyPayment) ||
    monthlyPayment < 0
  ) {
    return NextResponse.json({ success: false, error: 'Invalid balance, APR, or payment' }, { status: 400 });
  }

  // Due day: absent = leave as is; null/'' = clear; otherwise a whole day 1–31.
  let dueDay: number | null | undefined;
  if (body.dueDay === null || body.dueDay === '') {
    dueDay = null;
  } else if (body.dueDay !== undefined) {
    const n = Number(body.dueDay);
    if (!Number.isInteger(n) || n < 1 || n > 31) {
      return NextResponse.json(
        { success: false, error: 'Due day must be a day of the month (1–31)' },
        { status: 400 },
      );
    }
    dueDay = n;
  }

  return { name: name.slice(0, 80), balance, apr, monthlyPayment, dueDay };
}

// GET — list accounts + history; seeds the owner's initial accounts on first run.
export async function GET() {
  const { userId, error: authError } = await requireOwner();
  if (authError) return authError;

  try {
    let accounts = await readAccounts(userId);
    let history;
    if (accounts === null) {
      const now = new Date().toISOString();
      accounts = SEED_ACCOUNTS.map((s) => ({
        ...s,
        id: randomUUID(),
        monthlyPayment: 0,
        createdAt: now,
        updatedAt: now,
      }));
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

// POST — add an account. Body: { name, balance, apr, monthlyPayment?, dueDay? }
export async function POST(request: NextRequest) {
  const { userId, error: authError } = await requireOwner();
  if (authError) return authError;

  try {
    const parsed = parseAccountFields(await request.json());
    if (parsed instanceof NextResponse) return parsed;

    const accounts = (await readAccounts(userId)) ?? [];
    const now = new Date().toISOString();
    const { dueDay, ...fields } = parsed;
    accounts.push({
      ...fields,
      ...(typeof dueDay === 'number' ? { dueDay } : {}),
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
    });
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

// PUT — update an account. Body: { id, name, balance, apr, monthlyPayment, dueDay? }
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

    accounts[idx] = applyManualEdit(accounts[idx], parsed, new Date().toISOString());
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
