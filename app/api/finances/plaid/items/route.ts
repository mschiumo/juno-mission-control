import { NextRequest, NextResponse } from 'next/server';
import { getRedisClient } from '@/lib/redis';
import { requireOwner } from '@/lib/auth-session';
import { plaidConfigured, removeRemoteItem } from '@/lib/finances/plaid';
import { accessTokenOf, readItems, removeItem, toPublicItem } from '@/lib/finances/plaid-items';
import { unlinkAccount } from '@/lib/finances/merge';
import { CREDIT_ACCOUNTS_KEY, type CreditAccount } from '@/lib/finances/credit-cards';

/** GET — list connected institutions (never their tokens). */
export async function GET() {
  const { userId, error: authError } = await requireOwner();
  if (authError) return authError;

  try {
    const items = (await readItems(userId)).map(toPublicItem);
    return NextResponse.json({ success: true, items, configured: plaidConfigured() });
  } catch (error) {
    console.error('Failed to list Plaid items:', error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: 'Failed to list connections' }, { status: 500 });
  }
}

/**
 * DELETE ?itemId=… — disconnect a bank.
 *
 * Revokes the token at Plaid first (leaving the Item alive would keep billing a
 * monthly subscription for a connection we no longer read), then converts its
 * accounts back to manual rows. The accounts are deliberately kept: the balances
 * and history the owner has accumulated matter more than the live link.
 */
export async function DELETE(request: NextRequest) {
  const { userId, error: authError } = await requireOwner();
  if (authError) return authError;

  try {
    const itemId = request.nextUrl.searchParams.get('itemId') ?? '';
    if (!itemId) {
      return NextResponse.json({ success: false, error: 'Missing itemId' }, { status: 400 });
    }

    const item = (await readItems(userId)).find((i) => i.itemId === itemId);
    if (!item) {
      return NextResponse.json({ success: false, error: 'Connection not found' }, { status: 404 });
    }

    // Best-effort revoke. If Plaid rejects it (already removed, network blip) we
    // still drop our copy — otherwise a broken connection could never be cleared.
    let revoked = true;
    try {
      await removeRemoteItem(accessTokenOf(item));
    } catch (error) {
      revoked = false;
      console.error('Plaid item removal failed (dropping local copy anyway):', error instanceof Error ? error.message : error);
    }

    await removeItem(userId, itemId);

    const redis = await getRedisClient();
    const raw = await redis.get(CREDIT_ACCOUNTS_KEY(userId));
    const accounts = raw ? (JSON.parse(raw) as CreditAccount[]) : [];
    const now = new Date().toISOString();
    const next = accounts.map((a) => (a.plaidItemId === itemId ? unlinkAccount(a, now) : a));
    await redis.set(CREDIT_ACCOUNTS_KEY(userId), JSON.stringify(next));

    const items = (await readItems(userId)).map(toPublicItem);
    return NextResponse.json({
      success: true,
      accounts: next,
      items,
      revoked,
      warning: revoked
        ? undefined
        : 'Disconnected here, but the provider may still list this connection — remove it from the provider dashboard to be sure billing stops.',
    });
  } catch (error) {
    console.error('Failed to disconnect Plaid item:', error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: 'Failed to disconnect' }, { status: 500 });
  }
}
