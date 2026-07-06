/**
 * Performance Review weekly cron — Saturday-morning reviewer.
 *
 * Syncs agentic fills (read-only over the order log), then runs the weekly
 * review agent for the just-completed week. The agent is tool-less and
 * read-only; it narrates numbers the metrics engine already computed. It
 * PLACES NO ORDERS and mutates nothing but weekly_reviews.
 *
 * Auth: /api/cron-jobs/* is gated by CRON_SECRET in middleware.ts; Vercel
 * sends "Authorization: Bearer <CRON_SECRET>" automatically.
 */

import { NextResponse } from 'next/server';
import { getUserByEmail } from '@/lib/db/users';
import { OWNER_EMAIL } from '@/lib/owner';
import { postToCronResults } from '@/lib/cron-helpers';
import { syncAgenticFills } from '@/lib/confluence/review/ingest';
import { ReviewNotConfigured, runWeeklyReview } from '@/lib/confluence/review/weekly-review';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const owner = await getUserByEmail(OWNER_EMAIL);
    if (!owner) {
      return NextResponse.json({ success: false, error: 'Owner account not found' }, { status: 404 });
    }

    await syncAgenticFills(owner.id);
    const review = await runWeeklyReview(owner.id);

    const summary = `ConfluenceTrading weekly review for week of ${review.weekStart}: ${
      review.metrics.manual?.trades ?? 0
    } manual + ${review.metrics.agentic?.trades ?? 0} agentic round trips, ${review.metrics.violationsThisWeek} violation(s).`;
    await postToCronResults('confluence-weekly-review', summary, 'review');

    return NextResponse.json({ success: true, weekStart: review.weekStart });
  } catch (e) {
    if (e instanceof ReviewNotConfigured) {
      // Not an error state — the narrative simply can't run without a key.
      await postToCronResults('confluence-weekly-review', `Weekly review skipped: ${e.message}`, 'error');
      return NextResponse.json({ success: false, skipped: true, error: e.message });
    }
    console.error('ConfluenceTrading weekly review cron failed:', e);
    return NextResponse.json({ success: false, error: 'Weekly review cron failed' }, { status: 500 });
  }
}
