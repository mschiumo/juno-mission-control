import { NextRequest, NextResponse } from 'next/server';
import { requireOwner } from '@/lib/auth-session';
import { getUsageSummary } from '@/lib/db/usage-analytics';

/**
 * Owner-only usage analytics summary.
 *
 * ?days=       window length (default 14)
 * ?includeOwner=1  count the owner's own visits and clicks too; omitted, the
 *                  summary describes everyone but the owner.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { error: ownerError } = await requireOwner();
  if (ownerError) return ownerError;

  const days = parseInt(request.nextUrl.searchParams.get('days') ?? '14', 10) || 14;
  const includeOwner = request.nextUrl.searchParams.get('includeOwner') === '1';

  try {
    const summary = await getUsageSummary(days, includeOwner);
    return NextResponse.json({ success: true, summary });
  } catch (error) {
    console.error('Failed to compute usage summary:', error);
    return NextResponse.json({ success: false, error: 'Failed to load analytics' }, { status: 500 });
  }
}
