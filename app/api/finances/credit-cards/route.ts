import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { requireOwner } from '@/lib/auth-session';
import {
  applyManualEdit,
  clearOverrides,
  SEED_ACCOUNTS,
  type SeenValues,
} from '@/lib/finances/credit-cards';
import { readAccounts, readHistory, recordSnapshot, writeAccounts } from '@/lib/finances/store';
import { isProductionEnvironment, plaidConfigured } from '@/lib/finances/plaid';
import { readItems, toPublicItem } from '@/lib/finances/plaid-items';

// Credit Card Balance tracker — owner-only CRUD over a JSON array of accounts,
// plus a per-day balance history that records itself on every mutation. Accounts
// linked to a bank through Plaid stay editable: a manual edit pins that field so
// the next sync leaves it alone (see lib/finances/credit-cards.ts).

/** Sync state the client needs to render badges and the connect button. */
async function plaidState(userId: string) {
  const configured = plaidConfigured();
  if (!configured) return { configured: false, sandbox: false, items: [] };
  return {
    configured: true,
    sandbox: !isProductionEnvironment(),
    items: (await readItems(userId)).map(toPublicItem),
  };
}

function parseAccountFields(
  body: Record<string, unknown>,
): { name: string; balance: number; apr: number; monthlyPayment: number } | NextResponse {
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
  return { name: name.slice(0, 80), balance, apr, monthlyPayment };
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
    return NextResponse.json({ success: true, accounts, history, plaid: await plaidState(userId) });
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
    accounts.push({ ...parsed, id: randomUUID(), source: 'manual', createdAt: now, updatedAt: now });
    await writeAccounts(userId, accounts);
    const history = await recordSnapshot(userId, accounts);
    return NextResponse.json({ success: true, accounts, history, plaid: await plaidState(userId) });
  } catch (error) {
    console.error('Error adding credit account:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to add account' },
      { status: 500 },
    );
  }
}

/**
 * PUT — update an account. Body: { id, name, balance, apr, monthlyPayment }
 *
 * On a Plaid-linked account, any balance/APR the user actually changes gets
 * pinned so the nightly sync won't quietly revert the correction. Editing only
 * the planned payment pins nothing.
 */
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

    // What the edit form was showing, so we can tell a deliberate override from
    // a stale value the user never touched.
    const seen: SeenValues = {
      balance: Number.isFinite(Number(body.seenBalance)) ? Number(body.seenBalance) : undefined,
      apr: Number.isFinite(Number(body.seenApr)) ? Number(body.seenApr) : undefined,
    };

    accounts[idx] = applyManualEdit(accounts[idx], parsed, seen, new Date().toISOString());
    await writeAccounts(userId, accounts);
    const history = await recordSnapshot(userId, accounts);
    return NextResponse.json({ success: true, accounts, history, plaid: await plaidState(userId) });
  } catch (error) {
    console.error('Error updating credit account:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to update account' },
      { status: 500 },
    );
  }
}

/**
 * PATCH — un-pin a linked account's manual edits and restore the last values
 * Plaid reported. Body: { id, action: 'resume-sync' }
 */
export async function PATCH(request: NextRequest) {
  const { userId, error: authError } = await requireOwner();
  if (authError) return authError;

  try {
    const body = await request.json();
    const id = typeof body.id === 'string' ? body.id : '';
    if (body.action !== 'resume-sync') {
      return NextResponse.json({ success: false, error: 'Unsupported action' }, { status: 400 });
    }

    const accounts = (await readAccounts(userId)) ?? [];
    const idx = accounts.findIndex((a) => a.id === id);
    if (idx < 0) {
      return NextResponse.json({ success: false, error: 'Account not found' }, { status: 404 });
    }

    accounts[idx] = clearOverrides(accounts[idx], new Date().toISOString());
    await writeAccounts(userId, accounts);
    const history = await recordSnapshot(userId, accounts);
    return NextResponse.json({ success: true, accounts, history, plaid: await plaidState(userId) });
  } catch (error) {
    console.error('Error clearing overrides:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to resume sync' },
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
    return NextResponse.json({
      success: true,
      accounts: remaining,
      history,
      plaid: await plaidState(userId),
    });
  } catch (error) {
    console.error('Error deleting credit account:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to delete account' },
      { status: 500 },
    );
  }
}
