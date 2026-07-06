import { NextRequest, NextResponse } from 'next/server';
import { requireOwner } from '@/lib/auth-session';
import { listPositions } from '@/lib/db/crypto/collections';
import { executeSell } from '@/lib/crypto/execution';
import { getSystemState } from '@/lib/db/crypto/system-state';
import { getTokenSnapshot } from '@/lib/crypto/providers/dexscreener';

export const dynamic = 'force-dynamic';
export const maxDuration = 90;

type RouteParams = { params: Promise<{ id: string }> };

/** Manually close an open position at market. */
export async function POST(_request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { userId, email, error } = await requireOwner();
  if (error) return error;
  const { id } = await params;

  const positions = await listPositions(userId);
  const position = positions.find((p) => p.id === id);
  if (!position || position.status !== 'open') {
    return NextResponse.json({ success: false, error: 'Open position not found' }, { status: 404 });
  }

  const snapshot = await getTokenSnapshot(position.chainId, position.tokenAddress);
  if (!snapshot) {
    return NextResponse.json({ success: false, error: 'No current price available' }, { status: 503 });
  }

  const state = await getSystemState(userId);
  const result = await executeSell(
    userId,
    position,
    position.qtyTokens,
    'manual_close',
    state,
    snapshot.priceUsd,
    snapshot.liquidityUsd,
    email,
  );
  if (!result.ok) {
    return NextResponse.json({ success: false, error: result.error }, { status: 422 });
  }
  return NextResponse.json({ success: true, position: result.position, order: result.order });
}
