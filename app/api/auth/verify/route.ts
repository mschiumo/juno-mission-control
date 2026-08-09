/**
 * POST /api/auth/verify   { token }        — confirm an email address
 * POST /api/auth/verify   (no body/token)  — resend the confirmation link
 *
 * Confirming takes no session: people click the link in whatever browser
 * their mail app opens. Resending does require a session, so it can only ever
 * mail the signed-in user's own address.
 */

import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getRedisClient } from '@/lib/redis';
import { getUserById, markEmailVerified, isEmailVerified } from '@/lib/db/users';
import { createVerificationToken, consumeVerificationToken } from '@/lib/db/email-verification';
import { sendEmail } from '@/lib/email';
import { VerifyEmail } from '@/lib/emails/VerifyEmail';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://confluencetrading.app';
const SUPPORT_EMAIL = 'confluencetradingsupport@gmail.com';

export async function POST(request: Request): Promise<NextResponse> {
  let token = '';
  try {
    const body = await request.json();
    token = typeof body?.token === 'string' ? body.token : '';
  } catch {
    // no body → treat as a resend request
  }

  // ── Confirm ──
  if (token) {
    const userId = await consumeVerificationToken(token);
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'This confirmation link is invalid or has expired. Sign in and request a new one.' },
        { status: 400 },
      );
    }
    await markEmailVerified(userId);
    return NextResponse.json({ success: true });
  }

  // ── Resend ──
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  const user = await getUserById(userId);
  if (!user) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  if (isEmailVerified(user)) {
    return NextResponse.json({ success: true, alreadyVerified: true });
  }

  // Cheap throttle so the resend button can't be used to mail-bomb an address.
  const redis = await getRedisClient();
  const rlKey = `user:verify-rl:${userId}`;
  const count = await redis.incr(rlKey);
  if (count === 1) await redis.expire(rlKey, 60 * 60);
  if (count > 5) {
    return NextResponse.json(
      { success: false, error: `Too many requests. Write to ${SUPPORT_EMAIL} and we'll confirm it manually.` },
      { status: 429 },
    );
  }

  const newToken = await createVerificationToken(userId);
  const sent = await sendEmail({
    to: user.email,
    subject: 'Confirm your ConfluenceTrading email',
    react: VerifyEmail({ name: user.name, verifyUrl: `${APP_URL}/verify-email?token=${newToken}` }),
    replyTo: SUPPORT_EMAIL,
  });
  if (!sent.success) {
    return NextResponse.json(
      { success: false, error: 'Could not send the email right now — try again shortly.' },
      { status: 502 },
    );
  }
  return NextResponse.json({ success: true });
}
