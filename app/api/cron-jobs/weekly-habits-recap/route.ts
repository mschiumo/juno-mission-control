/**
 * Weekly Habits Recap Email (Vercel cron) — owner-only.
 *
 * Runs Monday 10:00 UTC (early Monday morning ET, after the Mon–Sun habit week
 * has fully closed in ET). Rolls up the finished week's habit completions
 * against each habit's frequency goal, pulls the same week's Dashboard journal
 * entries, has Claude connect the two, and emails the rundown to the owner.
 *
 * The habits themselves are per-user, but this recap is deliberately wired to
 * the app owner only — the sibling of the owner-only weekly-journal-insights
 * cron for the Trading journal.
 *
 * Gated by CRON_SECRET in middleware.ts (Authorization: Bearer <CRON_SECRET>),
 * same as the other /api/cron-jobs/* routes.
 */

import { NextResponse } from 'next/server';
import { OWNER_EMAIL } from '@/lib/owner';
import { getUserByEmail } from '@/lib/db/users';
import { sendEmail } from '@/lib/email';
import { postToCronResults, logToActivityLog } from '@/lib/cron-helpers';
import { shiftDate, weekStartFor } from '@/lib/habit-frequency';
import { analyzeHabitWeek, buildHabitWeek } from '@/lib/habits-weekly';
import { fetchPersonalJournalEntries } from '@/lib/personal-journal';
import { WeeklyHabitsRecapEmail } from '@/lib/emails/WeeklyHabitsRecapEmail';

/** Today's date in ET — habit days are stored on ET dates. */
function todayET(): string {
  const dateStr = new Date().toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const [month, day, year] = dateStr.split('/');
  return `${year}-${month}-${day}`;
}

export async function POST() {
  const startTime = Date.now();

  try {
    const owner = await getUserByEmail(OWNER_EMAIL);
    if (!owner) {
      return NextResponse.json({ success: true, skipped: true, reason: 'Owner account not found' });
    }

    // Always report the most recent *completed* Mon–Sun week: the one before
    // the week containing today (ET). The scheduled Monday run therefore covers
    // the week that just closed, and a manual re-run any other day covers the
    // same week rather than the in-progress one.
    const weekStart = shiftDate(weekStartFor(todayET()), -7);

    const week = await buildHabitWeek(owner.id, weekStart);
    if (!week || (week.rows.length === 0 && week.monthlyRows.length === 0)) {
      await postToCronResults('weekly-habits-recap', 'No habits configured — skipped email.', 'review');
      return NextResponse.json({ success: true, skipped: true, reason: 'No habits configured' });
    }

    const entries = await fetchPersonalJournalEntries(owner.id, week.weekStart, week.weekEnd);

    // Best-effort analysis — a missing key or model hiccup shouldn't kill the
    // recap; the numbers still go out.
    let analysis = null;
    let rawAnalysis = '';
    try {
      ({ analysis, raw: rawAnalysis } = await analyzeHabitWeek(week, entries));
    } catch (err) {
      console.error('[WeeklyHabitsRecap] analysis failed:', err);
    }

    const emailResult = await sendEmail({
      to: OWNER_EMAIL,
      subject: `Weekly Habits Recap — ${week.rangeLabel}`,
      react: WeeklyHabitsRecapEmail({
        week,
        journalEntriesCount: entries.length,
        analysis,
        rawAnalysis,
      }),
    });

    await Promise.all([
      postToCronResults(
        'weekly-habits-recap',
        `${week.rangeLabel}: ${week.completionRate}% of goals met ` +
          `(${week.completed} complete / ${week.partial} partial / ${week.missed} missed), ` +
          `${entries.length} journal entries. Email ${emailResult.success ? 'sent' : `failed: ${emailResult.error}`}.`,
        'review',
      ),
      logToActivityLog(
        'Weekly habits recap',
        `Recapped ${week.rangeLabel} (${week.completionRate}% of goals, ${entries.length} journal entries)` +
          `${emailResult.success ? ' and emailed the owner' : ` — email failed: ${emailResult.error}`}`,
        'cron',
      ),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        weekStart: week.weekStart,
        weekEnd: week.weekEnd,
        completionRate: week.completionRate,
        habits: week.rows.length + week.monthlyRows.length,
        journalEntries: entries.length,
        analyzed: !!analysis,
        emailSent: emailResult.success,
        emailError: emailResult.error,
        durationMs: Date.now() - startTime,
      },
    });
  } catch (error) {
    console.error('[WeeklyHabitsRecap] failed:', error);
    await postToCronResults(
      'weekly-habits-recap',
      `Failed: ${error instanceof Error ? error.message : String(error)}`,
      'error',
    );
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}

export async function GET() {
  return POST();
}
