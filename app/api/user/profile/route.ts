import { NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth-session';
import { getUserById } from '@/lib/db/users';

export async function GET() {
  const authResult = await requireUserId();
  if (authResult.error) return authResult.error;

  const user = await getUserById(authResult.userId);
  if (!user) {
    return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
  }

  return NextResponse.json({
    success: true,
    profile: {
      id: user.id,
      email: user.email,
      name: user.name,
      createdAt: user.createdAt,
    },
  });
}
