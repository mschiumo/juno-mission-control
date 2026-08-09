/**
 * GET /api/admin/metrics — owner-only account metrics for the Accounts tab.
 * Same computation as the daily digest email, so the numbers always agree.
 */

import { NextResponse } from 'next/server';
import { requireOwner } from '@/lib/auth-session';
import { computeAccountMetrics } from '@/lib/admin-metrics';

export async function GET(): Promise<NextResponse> {
  const { error: ownerError } = await requireOwner();
  if (ownerError) return ownerError;

  try {
    const metrics = await computeAccountMetrics();
    return NextResponse.json({ success: true, metrics });
  } catch (error) {
    console.error('Failed to compute account metrics:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to compute metrics' },
      { status: 500 },
    );
  }
}
