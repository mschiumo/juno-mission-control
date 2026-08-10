import { NextResponse } from 'next/server';
import { createUser } from '@/lib/db/users';
import { recordPlanEvent } from '@/lib/db/plan-events';
import { sendEmail } from '@/lib/email';
import { WelcomeEmail } from '@/lib/emails/WelcomeEmail';
import { markLifecycleEmailSent } from '@/lib/db/lifecycle-emails';
import { createVerificationToken } from '@/lib/db/email-verification';
import { VerifyEmail } from '@/lib/emails/VerifyEmail';
import { getClientIp, enforceRateLimit } from '@/lib/rate-limit';

export async function POST(request: Request) {
  try {
    // Signup abuse controls. Registration is public and each success fires two
    // Resend emails (verification + welcome) — without a limit, one IP could
    // mass-create accounts to run up email/compute cost or squat addresses. Two
    // windows: a short anti-burst window and an hourly cap. Fails open if Redis
    // is down.
    const ip = getClientIp(request);
    const burst = await enforceRateLimit(
      { key: `signup:burst:${ip}`, limit: 3, windowSec: 60 },
      'Too many signup attempts. Please wait a minute and try again.',
    );
    if (burst) return burst;
    const hourly = await enforceRateLimit(
      { key: `signup:hourly:${ip}`, limit: 10, windowSec: 3600 },
      'Too many accounts created from this network. Please try again later.',
    );
    if (hourly) return hourly;

    const { email, name, password } = await request.json();

    if (!email || !password || !name) {
      return NextResponse.json({ error: 'Email, name, and password are required' }, { status: 400 });
    }

    if (password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
    }

    if (!/[^A-Za-z0-9]/.test(password)) {
      return NextResponse.json({ error: 'Password must contain at least one special character' }, { status: 400 });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json({ error: 'Invalid email address' }, { status: 400 });
    }

    const user = await createUser(email, name, password);
    await recordPlanEvent({ type: 'signup', userId: user.id, email });

    // Confirmation link first — it gates the trial and paid checkout, so it
    // matters more than the welcome note. Both are best-effort: a mail outage
    // must never block signup, and the banner offers a resend.
    try {
      const token = await createVerificationToken(user.id);
      await sendEmail({
        to: email,
        subject: 'Confirm your ConfluenceTrading email',
        react: VerifyEmail({
          name,
          verifyUrl: `${process.env.NEXT_PUBLIC_APP_URL || 'https://confluencetrading.app'}/verify-email?token=${token}`,
        }),
        replyTo: 'confluencetradingsupport@gmail.com',
      });
    } catch (err) {
      console.error('Verification email failed (non-fatal):', err);
    }

    // Welcome email — best-effort; a mail outage must never block signup.
    try {
      const sent = await sendEmail({
        to: email,
        subject: 'Welcome to ConfluenceTrading — your journal is ready',
        react: WelcomeEmail({ name }),
        replyTo: 'confluencetradingsupport@gmail.com',
      });
      if (sent.success) await markLifecycleEmailSent(user.id, 'welcome');
    } catch (err) {
      console.error('Welcome email failed (non-fatal):', err);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Registration failed';
    if (message === 'Email already registered') {
      // Return the same response as success to prevent email enumeration.
      return NextResponse.json({ success: true });
    }
    return NextResponse.json({ error: 'Registration failed' }, { status: 500 });
  }
}
