/**
 * POST /api/auth/reset-complete  { token, password }
 *
 * Consumes a valid reset token and sets the new password (same rules as
 * signup: 8+ chars, at least one special character).
 */

import { NextResponse } from 'next/server';
import { consumeResetToken } from '@/lib/db/password-reset';
import { updatePassword } from '@/lib/db/users';

export async function POST(request: Request): Promise<NextResponse> {
  let token = '';
  let password = '';
  try {
    const body = await request.json();
    token = typeof body?.token === 'string' ? body.token : '';
    password = typeof body?.password === 'string' ? body.password : '';
  } catch {
    // fall through to validation
  }

  if (password.length < 8 || !/[^A-Za-z0-9]/.test(password)) {
    return NextResponse.json(
      { success: false, error: 'Password must be at least 8 characters with a special character' },
      { status: 400 },
    );
  }

  const userId = token ? await consumeResetToken(token) : null;
  if (!userId) {
    return NextResponse.json(
      { success: false, error: 'This reset link is invalid or has expired. Request a new one.' },
      { status: 400 },
    );
  }

  const updated = await updatePassword(userId, password);
  if (!updated) {
    return NextResponse.json(
      { success: false, error: 'Could not update the password. Please request a new link.' },
      { status: 500 },
    );
  }
  return NextResponse.json({ success: true });
}
