import { auth } from '@/auth';
import { NextResponse } from 'next/server';
import { isOwnerEmail } from '@/lib/owner';

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
