import { NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth-session';
import { getUserById, updateUser } from '@/lib/db/users';

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

export async function PATCH(request: Request) {
  const authResult = await requireUserId();
  if (authResult.error) return authResult.error;

  let body: { name?: string; email?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 });
  }

  // Validate name
  if (body.name !== undefined) {
    const trimmed = body.name.trim();
    if (!trimmed || trimmed.length > 100) {
      return NextResponse.json({ success: false, error: 'Name must be 1-100 characters' }, { status: 400 });
    }
    body.name = trimmed;
  }

  // Validate email
  if (body.email !== undefined) {
    const trimmed = body.email.trim().toLowerCase();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      return NextResponse.json({ success: false, error: 'Invalid email address' }, { status: 400 });
    }
    body.email = trimmed;
  }

  try {
    const user = await updateUser(authResult.userId, body);
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
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Update failed';
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
