/**
 * DELETE /api/portfolio/disconnect
 *
 * Tears down the caller's portfolio connection end to end via
 * lib/portfolio-access.ts. Deliberately gated by requireUserId, NOT
 * requireFeature('portfolio'): a user whose Platinum lapsed must still be
 * able to remove their own connection — it costs SnapTrade money and holds
 * their brokerage secret, so disconnecting is always allowed.
 */

import { NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth-session';
import { disconnectPortfolio } from '@/lib/portfolio-access';

export async function DELETE(): Promise<NextResponse> {
  const { userId, error: authError } = await requireUserId();
  if (authError) return authError;

  const result = await disconnectPortfolio(userId);
  return NextResponse.json({ success: true, data: result });
}
