import { NextRequest, NextResponse } from 'next/server';
import { requireOwner } from '@/lib/auth-session';
import { plaidConfigured } from '@/lib/finances/plaid';
import { readItems, toPublicItem } from '@/lib/finances/plaid-items';
import { syncAllItems } from '@/lib/finances/sync';

/**
 * Refresh balances from every linked bank — what the Refresh button calls.
 *
 * Plaid bills Liabilities as a monthly per-Item subscription rather than
 * per-request, so refreshing often costs nothing extra; the throttle below
 * exists only to keep a stuck client from tripping Plaid's rate limits.
 */
export const maxDuration = 60;

const MIN_SECONDS_BETWEEN_SYNCS = 10;

export async function POST(request: NextRequest) {
  const { userId, error: authError } = await requireOwner();
  if (authError) return authError;

  if (!plaidConfigured()) {
    return NextResponse.json(
      { success: false, error: 'Bank sync is not configured on this deployment.' },
      { status: 503 },
    );
  }

  try {
    const body = await request.json().catch(() => ({}));
    const itemId = typeof body?.itemId === 'string' ? body.itemId : undefined;

    const items = await readItems(userId);
    if (!items.length) {
      return NextResponse.json(
        { success: false, error: 'No banks connected yet.' },
        { status: 400 },
      );
    }

    const lastSync = items
      .map((i) => (i.lastSyncedAt ? Date.parse(i.lastSyncedAt) : 0))
      .reduce((max, ts) => (Number.isFinite(ts) && ts > max ? ts : max), 0);
    const secondsSince = (Date.now() - lastSync) / 1000;
    if (lastSync && secondsSince < MIN_SECONDS_BETWEEN_SYNCS) {
      return NextResponse.json(
        { success: false, error: 'Just refreshed — give it a few seconds.' },
        { status: 429 },
      );
    }

    const { summary, accounts, history } = await syncAllItems(userId, { onlyItemId: itemId });
    const refreshedItems = (await readItems(userId)).map(toPublicItem);

    return NextResponse.json({ success: true, accounts, history, summary, items: refreshedItems });
  } catch (error) {
    console.error('Plaid sync failed:', error instanceof Error ? error.message : error);
    return NextResponse.json(
      { success: false, error: 'Refresh failed — try again in a moment.' },
      { status: 500 },
    );
  }
}
