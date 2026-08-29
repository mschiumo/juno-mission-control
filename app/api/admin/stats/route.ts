/**
 * Admin Stats API
 *
 * GET /api/admin/stats
 *
 * Owner-gated lightweight stats for the app (currently: unique signed-up user
 * count). Gate logic mirrors the OWNER_EMAIL check in app/page.tsx so only the
 * project owner can call this. Keep responses cheap — no per-user iteration.
 */

import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getAllUserIds } from '@/lib/db/users';

const OWNER_EMAIL = 'mschiumo18@gmail.com';

export async function GET() {
  const session = await auth();
  const email = session?.user?.email;

  if (!email) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  if (email !== OWNER_EMAIL) {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
  }

  try {
    const userIds = await getAllUserIds();
    return NextResponse.json({
      success: true,
      stats: {
        users: userIds.length,
      },
    });
  } catch (err) {
    console.error('Error fetching admin stats:', err);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch stats' },
      { status: 500 },
    );
  }
}
