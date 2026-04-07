import { auth } from '@/auth';
import { NextResponse } from 'next/server';

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
