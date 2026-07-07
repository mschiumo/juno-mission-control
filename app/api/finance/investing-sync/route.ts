/**
 * Finance — live brokerage sync for the Investing section. Owner-only.
 *
 * GET  → availability: whether the ConfluenceTrading Robinhood connection
 *        can provide a live account value (and why not, if not).
 * POST → sync now: fetch the account value and upsert the
 *        "Robinhood — brokerage" investment account + history snapshot.
 *
 * Implementation: lib/finance/investing-sync.ts (reuses the existing
 * ConfluenceTrading live adapter — no new aggregator or credentials).
 */

import { NextResponse } from 'next/server';
import { requireOwner } from '@/lib/auth-session';
import { brokerageSyncStatus, syncBrokerageInvesting } from '@/lib/finance/investing-sync';

export async function GET() {
  const { userId, error } = await requireOwner();
  if (error) return error;

  try {
    const status = await brokerageSyncStatus(userId);
    return NextResponse.json({ success: true, ...status });
  } catch (e) {
    console.error('[finance/investing-sync] GET failed:', e);
    return NextResponse.json({ success: false, error: 'Failed to check brokerage status' }, { status: 500 });
  }
}

export async function POST() {
  const { userId, error } = await requireOwner();
  if (error) return error;

  try {
    const result = await syncBrokerageInvesting(userId);
    if ('error' in result) {
      return NextResponse.json({ success: false, error: result.error }, { status: 422 });
    }
    return NextResponse.json({ success: true, accountValue: result.accountValue });
  } catch (e) {
    console.error('[finance/investing-sync] POST failed:', e);
    return NextResponse.json({ success: false, error: 'Brokerage sync failed' }, { status: 500 });
  }
}
