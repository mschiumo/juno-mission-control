/**
 * ConfluenceTrading screening universe (owner-only).
 *
 * GET  — current config + the cached Massive-built universe (if any).
 * POST — rebuild the universe from Massive now (same job the weekly cron runs).
 *
 * Read/refresh of a symbol WATCHLIST only — no proposals, no orders.
 */

import { NextResponse } from 'next/server';
import { requireOwner } from '@/lib/auth-session';
import { readUniverseCache, refreshMassiveUniverse } from '@/lib/confluence/universe';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  const { error } = await requireOwner();
  if (error) return error;

  const cache = await readUniverseCache();
  return NextResponse.json({
    success: true,
    source: (process.env.CONFLUENCE_UNIVERSE_SOURCE || 'env').toLowerCase(),
    massiveConfigured: !!process.env.MASSIVE_API_KEY,
    cache,
  });
}

export async function POST(): Promise<NextResponse> {
  const { error } = await requireOwner();
  if (error) return error;

  try {
    const cache = await refreshMassiveUniverse();
    return NextResponse.json({ success: true, cache });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Universe refresh failed';
    return NextResponse.json({ success: false, error: message }, { status: 502 });
  }
}
