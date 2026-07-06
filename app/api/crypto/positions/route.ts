import { NextResponse } from 'next/server';
import { requireOwner } from '@/lib/auth-session';
import { listPositions } from '@/lib/db/crypto/collections';
import { getTokenSnapshot } from '@/lib/crypto/providers/dexscreener';

export const dynamic = 'force-dynamic';

/** Positions with live marks and unrealized P&L for the open ones. */
export async function GET() {
  const { userId, error } = await requireOwner();
  if (error) return error;

  const positions = await listPositions(userId);
  const open = positions.filter((p) => p.status === 'open');

  const marks = await Promise.all(
    open.map(async (p) => {
      const snapshot = await getTokenSnapshot(p.chainId, p.tokenAddress);
      return { id: p.id, priceUsd: snapshot?.priceUsd ?? null };
    }),
  );
  const markById = new Map(marks.map((m) => [m.id, m.priceUsd]));

  const enriched = positions.slice(0, 100).map((p) => {
    const mark = p.status === 'open' ? markById.get(p.id) ?? null : null;
    const unrealizedPnlUsd =
      mark !== null && mark !== undefined ? p.qtyTokens * mark - p.qtyTokens * p.avgEntryPriceUsd : null;
    return { ...p, markPriceUsd: mark, unrealizedPnlUsd };
  });

  return NextResponse.json({ success: true, positions: enriched });
}
