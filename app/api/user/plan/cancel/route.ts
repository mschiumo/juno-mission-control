/**
 * POST /api/user/plan/cancel
 *
 * Downgrade to the free Silver tier, effective immediately. The critical
 * side effect is the SnapTrade teardown: a cancelled user with a live
 * brokerage connection would keep billing us monthly, so disconnection is
 * part of cancellation itself — not deferred to the nightly sweep.
 *
 * When Stripe lands, this route additionally cancels the Stripe
 * subscription before clearing the record.
 */

import { NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth-session';
import { clearEntitlement, clearPlanIndex } from '@/lib/db/entitlements';
import { disconnectBrokerage } from '@/lib/brokerage-access';
import { recordPlanEvent } from '@/lib/db/plan-events';
import { getEntitlementRecord } from '@/lib/db/entitlements';
import { auth } from '@/auth';

export async function POST(): Promise<NextResponse> {
  const authResult = await requireUserId();
  if (authResult.error) return authResult.error;
  const { userId } = authResult;

  try {
    const record = await getEntitlementRecord(userId);
    const session = await auth();
    const teardown = await disconnectBrokerage(userId);
    await clearEntitlement(userId);
    await clearPlanIndex(userId);
    await recordPlanEvent({
      type: 'plan_cancelled',
      userId,
      email: session?.user?.email ?? undefined,
      detail: `Was ${record?.tier ?? 'silver'} (${record?.source ?? 'none'}); brokerage ${teardown.hadConnection ? (teardown.deregistered ? 'disconnected' : 'queued for retry') : 'not connected'}`,
    });
    return NextResponse.json({ success: true, teardown });
  } catch (error) {
    console.error('Plan cancellation failed:', error);
    return NextResponse.json(
      { success: false, error: 'Could not cancel the plan. Please try again.' },
      { status: 500 },
    );
  }
}
