import { auth } from '@/auth';
import { NextResponse } from 'next/server';
import { isOwnerEmail } from '@/lib/owner';
import { getEntitlements } from '@/lib/db/entitlements';

/**
 * Get the authenticated user's ID from the session.
 * Returns { userId } on success, or { error: NextResponse } if unauthenticated.
 */
export async function requireUserId(): Promise<{ userId: string; error?: never } | { userId?: never; error: NextResponse }> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return {
      error: NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 }),
    };
  }
  return { userId };
}

/**
 * Require the authenticated user to be the app owner (root user).
 * Returns { userId, email } on success, or { error: NextResponse } with a 403.
 * Mirrors requireUserId() but additionally validates the session email against
 * the shared OWNER_EMAIL — use this for owner-only endpoints (e.g. Goals).
 * The returned userId comes straight from the validated session, so callers can
 * keep keying Redis by `{userId}` without an extra lookup.
 */
export async function requireOwner(): Promise<
  | { userId: string; email: string; error?: never }
  | { userId?: never; email?: never; error: NextResponse }
> {
  const session = await auth();
  const userId = session?.user?.id;
  const email = session?.user?.email;
  if (!userId || !isOwnerEmail(email)) {
    // 403 for both "not logged in" and "logged in but not owner" so we don't
    // leak which case applies.
    return {
      error: NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 }),
    };
  }
  return { userId, email: email! };
}

/**
 * Require the authenticated user to be entitled to live brokerage sync.
 *
 * This is the paid-feature gate: the owner always passes, and everyone else
 * needs an active 'pro' entitlement. Use it instead of requireOwner() on every
 * route that can cause SnapTrade activity — SnapTrade bills per connected
 * user, so an ungated route is a route that can spend money.
 *
 * Returns 403 for unauthenticated and unentitled alike so we don't leak which
 * case applies, but includes a machine-readable code so the client can tell an
 * upgrade prompt from a hard error.
 */
export async function requireBrokerageAccess(): Promise<
  | { userId: string; email: string; error?: never }
  | { userId?: never; email?: never; error: NextResponse }
> {
  const session = await auth();
  const userId = session?.user?.id;
  const email = session?.user?.email;
  if (!userId) {
    return { error: NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 }) };
  }
  const entitlements = await getEntitlements(userId, email);
  if (!entitlements.brokerageAccess) {
    return {
      error: NextResponse.json(
        {
          success: false,
          code: 'UPGRADE_REQUIRED',
          error: 'Live brokerage sync is available on the paid plan.',
        },
        { status: 403 },
      ),
    };
  }
  return { userId, email: email ?? '' };
}

/**
 * Verify that the request carries a valid CRON_SECRET in the Authorization header.
 * Vercel sends "Authorization: Bearer <VERCEL_CRON_SECRET>" with scheduled cron calls.
 * Returns null on success, or a 401 NextResponse on failure.
 */
export function requireCronSecret(request: Request): NextResponse | null {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    // If CRON_SECRET is not configured, block all cron calls so operators notice.
    return NextResponse.json({ error: 'Cron not configured' }, { status: 503 });
  }
  const authHeader = request.headers.get('authorization') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (token !== cronSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}

/**
 * Verify the request carries a valid AGENT_SECRET bearer token. Used by the
 * headless-agent endpoints (e.g. a scheduled Claude agent reporting proposals)
 * that authenticate without a browser session. Mirrors the goals/agent pattern
 * and is also enforced in middleware.ts. Returns null on success, or a 503/401
 * NextResponse on failure.
 */
export function requireAgentSecret(request: Request): NextResponse | null {
  const secret = process.env.AGENT_SECRET;
  if (!secret) {
    return NextResponse.json(
      { success: false, error: 'Agent API not configured (set AGENT_SECRET)' },
      { status: 503 },
    );
  }
  const authHeader = request.headers.get('authorization') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (token !== secret) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}
