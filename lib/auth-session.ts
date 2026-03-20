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
