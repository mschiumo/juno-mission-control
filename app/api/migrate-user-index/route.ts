/**
 * One-time migration: backfill the user:index Redis set
 * for users created before the index existed.
 *
 * GET /api/migrate-user-index
 */

import { NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth-session';
import { backfillUserIndex } from '@/lib/db/users';

export async function GET() {
  const authResult = await requireUserId();
  if (authResult.error) return authResult.error;

  const added = await backfillUserIndex();
  return NextResponse.json({ success: true, usersIndexed: added });
}
