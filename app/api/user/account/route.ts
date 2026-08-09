/**
 * DELETE /api/user/account — permanent account deletion.
 *
 * Order matters: the SnapTrade teardown runs FIRST, because a deleted local
 * account with a live SnapTrade registration would bill us forever with no
 * record left to find it by. If deregistration fails, the id is queued in
 * the orphan set and retried by the nightly sweep — deletion still proceeds.
 *
 * The owner account cannot be deleted through this route.
 */

import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { requireUserId } from '@/lib/auth-session';
import { isOwnerEmail } from '@/lib/owner';
import { deleteUserAccount } from '@/lib/db/users';
import { disconnectBrokerage } from '@/lib/brokerage-access';
import { recordPlanEvent } from '@/lib/db/plan-events';

export async function DELETE(): Promise<NextResponse> {
  const authResult = await requireUserId();
  if (authResult.error) return authResult.error;
  const { userId } = authResult;

  const session = await auth();
  if (isOwnerEmail(session?.user?.email)) {
    return NextResponse.json(
      { success: false, error: 'The owner account cannot be deleted from the app.' },
      { status: 403 },
    );
  }

  try {
    const teardown = await disconnectBrokerage(userId);
    await deleteUserAccount(userId);
    await recordPlanEvent({
      type: 'account_deleted',
      userId,
      email: session?.user?.email ?? undefined,
      detail: `Brokerage ${teardown.hadConnection ? (teardown.deregistered ? 'disconnected' : 'queued for retry') : 'not connected'}`,
    });
    return NextResponse.json({ success: true, teardown });
  } catch (error) {
    console.error('Account deletion failed:', error);
    return NextResponse.json(
      { success: false, error: 'Could not delete the account. Please contact support.' },
      { status: 500 },
    );
  }
}
