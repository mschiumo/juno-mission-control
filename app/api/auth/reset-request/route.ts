/**
 * POST /api/auth/reset-request  { email }
 *
 * Always answers success so responses can't be used to enumerate accounts.
 * If the email matches a user, a one-hour single-use token is created and
 * mailed. Rate-limited per email address to blunt abuse of our send quota.
 */

import { NextResponse } from 'next/server';
import { getRedisClient } from '@/lib/redis';
import { getUserByEmail } from '@/lib/db/users';
import { createResetToken } from '@/lib/db/password-reset';
import { sendEmail } from '@/lib/email';
import { PasswordResetEmail } from '@/lib/emails/PasswordResetEmail';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://confluencetrading.app';

// A NextResponse body is a one-shot stream, so this must mint a fresh
// response per request — sharing one object would return an empty body from
// the second call onward (and that difference would leak which branch ran).
const ok = () =>
  NextResponse.json({
    success: true,
    message: 'If that email has an account, a reset link is on its way.',
  });

export async function POST(request: Request): Promise<NextResponse> {
  let email = '';
  try {
    const body = await request.json();
    email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  } catch {
    // fall through
  }
  if (!email) {
    return NextResponse.json({ success: false, error: 'Email is required' }, { status: 400 });
  }

  try {
    // Max 3 requests per address per hour — protects the Resend quota, and the
    // constant-success response below keeps this from leaking anything.
    const redis = await getRedisClient();
    const rlKey = `auth:reset-rl:${email}`;
    const count = await redis.incr(rlKey);
    if (count === 1) await redis.expire(rlKey, 60 * 60);
    if (count > 3) return ok();

    const user = await getUserByEmail(email);
    if (!user?.id) return ok();

    const token = await createResetToken(user.id);
    await sendEmail({
      to: email,
      subject: 'Reset your ConfluenceTrading password',
      react: PasswordResetEmail({
        name: user.name,
        resetUrl: `${APP_URL}/reset-password?token=${token}`,
      }),
      replyTo: 'confluencetradingsupport@gmail.com',
    });
  } catch (error) {
    // Still answer OK — an infra hiccup shouldn't reveal which emails exist.
    console.error('Password reset request failed:', error);
  }
  return ok();
}
