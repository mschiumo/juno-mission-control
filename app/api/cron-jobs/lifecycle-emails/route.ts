/**
 * GET /api/cron-jobs/lifecycle-emails — daily onboarding drip.
 *
 * Two sends, both idempotent via per-user flags (a flag is only written
 * after a successful send, so failures retry the next day):
 *
 *  1. Day-3 check-in — users who signed up 3+ days ago (capped at 14 so we
 *     never blast the back catalog if this cron was ever paused), haven't
 *     received it, and haven't opted out.
 *  2. Trial-ending reminder — active trial records expiring within the next
 *     36 hours. The window is wider than the daily cadence so a run can't
 *     fall between the cracks; the flag keeps it to one send.
 *
 * The welcome email is NOT sent here — it goes out synchronously at signup;
 * this cron backfills it only if that send failed.
 */

import { NextResponse } from 'next/server';
import { requireCronSecret } from '@/lib/auth-session';
import { getAllUserIds, getUserById } from '@/lib/db/users';
import { getEntitlementRecord } from '@/lib/db/entitlements';
import { isRecordActive } from '@/lib/entitlements';
import { isOwnerEmail } from '@/lib/owner';
import {
  getLifecycleFlags,
  markLifecycleEmailSent,
} from '@/lib/db/lifecycle-emails';
import { sendEmail } from '@/lib/email';
import { WelcomeEmail } from '@/lib/emails/WelcomeEmail';
import { CheckinEmail } from '@/lib/emails/CheckinEmail';
import { TrialEndingEmail } from '@/lib/emails/TrialEndingEmail';

const DAY_MS = 24 * 60 * 60 * 1000;
const CHECKIN_AFTER_MS = 3 * DAY_MS;
const CHECKIN_CUTOFF_MS = 14 * DAY_MS;
const TRIAL_REMINDER_WINDOW_MS = 36 * 60 * 60 * 1000;

export async function GET(request: Request): Promise<NextResponse> {
  const authError = requireCronSecret(request);
  if (authError) return authError;

  const now = Date.now();
  const results = { welcomeBackfilled: 0, checkins: 0, trialReminders: 0, errors: 0 };
  const attempted: { email: string; kind: string; ok: boolean }[] = [];

  const userIds = await getAllUserIds();
  for (const userId of userIds) {
    try {
      const user = await getUserById(userId);
      if (!user?.email || isOwnerEmail(user.email)) continue;

      const flags = await getLifecycleFlags(userId);
      if (flags.optOut) continue;

      const signedUpMs = Date.parse(user.createdAt);
      const accountAge = Number.isFinite(signedUpMs) ? now - signedUpMs : null;

      // 1) Welcome backfill — only for accounts young enough that a late
      // welcome still makes sense.
      if (!flags.welcome && accountAge !== null && accountAge < 2 * DAY_MS) {
        const sent = await sendEmail({
          to: user.email,
          subject: 'Welcome to ConfluenceTrading — your journal is ready',
          react: WelcomeEmail({ name: user.name }),
          replyTo: 'confluencetradingsupport@gmail.com',
        });
        attempted.push({ email: user.email, kind: 'welcome', ok: sent.success });
        if (sent.success) {
          await markLifecycleEmailSent(userId, 'welcome');
          results.welcomeBackfilled++;
        } else results.errors++;
      }

      // 2) Day-3 check-in.
      if (
        !flags.checkin &&
        accountAge !== null &&
        accountAge >= CHECKIN_AFTER_MS &&
        accountAge < CHECKIN_CUTOFF_MS
      ) {
        const sent = await sendEmail({
          to: user.email,
          subject: 'How is ConfluenceTrading working for you?',
          react: CheckinEmail({ name: user.name }),
          replyTo: 'confluencetradingsupport@gmail.com',
        });
        attempted.push({ email: user.email, kind: 'checkin', ok: sent.success });
        if (sent.success) {
          await markLifecycleEmailSent(userId, 'checkin');
          results.checkins++;
        } else results.errors++;
      }

      // 3) Trial-ending reminder.
      if (!flags.trialReminder) {
        const record = await getEntitlementRecord(userId);
        if (
          record?.source === 'trial' &&
          record.expiresAt &&
          isRecordActive(record) &&
          Date.parse(record.expiresAt) - now < TRIAL_REMINDER_WINDOW_MS
        ) {
          const sent = await sendEmail({
            to: user.email,
            subject: 'Your free Gold week ends tomorrow',
            react: TrialEndingEmail({ name: user.name, expiresAt: record.expiresAt }),
            replyTo: 'confluencetradingsupport@gmail.com',
          });
          attempted.push({ email: user.email, kind: 'trialReminder', ok: sent.success });
          if (sent.success) {
            await markLifecycleEmailSent(userId, 'trialReminder');
            results.trialReminders++;
          } else results.errors++;
        }
      }
    } catch (error) {
      results.errors++;
      console.error(`Lifecycle emails failed for ${userId}:`, error);
    }
  }

  return NextResponse.json({ success: true, ...results, attempted });
}
