import { auth } from '@/auth';
import { NextResponse } from 'next/server';
import { isOwnerEmail } from '@/lib/owner';
import { type Features } from '@/lib/entitlements';
import { getEntitlements } from '@/lib/db/entitlements';
import { getUserById, isEmailVerified } from '@/lib/db/users';

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
  // Sessions are JWTs and outlive the account: a deleted user's token stays
  // cryptographically valid until it expires. Verify the account still exists
  // so deletion actually revokes access (one cheap Redis GET).
  if (!(await getUserById(userId))) {
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
 * Require the authenticated user's plan to include a feature. Returns
 * { userId, email } like requireOwner(), so call sites are a one-word swap.
 *
 * 401 for "not signed in"; 403 with code UPGRADE_REQUIRED for "signed in but
 * plan doesn't include this", so clients can distinguish an upsell from a
 * real authorization error. The owner resolves to Platinum unconditionally
 * inside getEntitlements().
 */
export async function requireFeature(feature: keyof Features): Promise<
  | { userId: string; email: string; error?: never }
  | { userId?: never; email?: never; error: NextResponse }
> {
  const session = await auth();
  const userId = session?.user?.id;
  const email = session?.user?.email;
  if (!userId) {
    return {
      error: NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 }),
    };
  }
  // Same deleted-account guard as requireUserId — JWTs outlive the account.
  if (!(await getUserById(userId))) {
    return {
      error: NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 }),
    };
  }
  const entitlements = await getEntitlements(userId, email);
  if (!entitlements.features[feature]) {
    return {
      error: NextResponse.json(
        {
          success: false,
          code: 'UPGRADE_REQUIRED',
          error: 'Your current plan does not include this feature.',
        },
        { status: 403 },
      ),
    };
  }
  return { userId, email: email ?? '' };
}

/**
 * Require a confirmed email address. Used on the routes that cost money or
 * grant paid access — starting a trial, checkout — so an unconfirmed address
 * can't farm free trials. Journaling and the rest of the free tier stay open,
 * because locking someone out of their own data over an unread email is worse
 * than the abuse it prevents.
 */
export async function requireVerifiedEmail(): Promise<
  { userId: string; error?: never } | { userId?: never; error: NextResponse }
> {
  const authResult = await requireUserId();
  if (authResult.error) return { error: authResult.error };
  const user = await getUserById(authResult.userId);
  if (!isEmailVerified(user)) {
    return {
      error: NextResponse.json(
        {
          success: false,
          code: 'EMAIL_UNVERIFIED',
          error: 'Confirm your email address first — check your inbox for the confirmation link.',
        },
        { status: 403 },
      ),
    };
  }
  return { userId: authResult.userId };
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
