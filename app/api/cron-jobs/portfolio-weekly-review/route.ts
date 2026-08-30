/**
 * Weekly Portfolio Review (Vercel cron) — owner-only.
 *
 * Runs Saturday 13:30 UTC (Saturday morning ET), after the 13:00 UTC
 * SnapTrade sync window, so Friday's close data has propagated. Re-syncs the
 * portfolio first (best-effort), generates the weekly positions review —
 * persisted to the same Redis key the Portfolio tab's review section reads —
 * and emails the rundown to the owner.
 *
 * Gated by CRON_SECRET in middleware.ts (Authorization: Bearer <CRON_SECRET>),
 * same as the other /api/cron-jobs/* routes.
 */

import { NextResponse } from 'next/server';
import { OWNER_EMAIL } from '@/lib/owner';
import { getUserByEmail } from '@/lib/db/users';
import { isSnapTradeConfigured } from '@/lib/snaptrade';
import {
  getPortfolioConnection,
  getPortfolioSnapshot,
  getPortfolioActivities,
} from '@/lib/db/portfolio-connection';
import { syncPortfolio } from '@/lib/portfolio-sync';
import { generatePortfolioReview } from '@/lib/portfolio-review';
import { summarizeIncome, positionWeights } from '@/lib/portfolio-insights';
import { getTodayInEST } from '@/lib/date-utils';
import { sendEmail } from '@/lib/email';
import { postToCronResults, logToActivityLog } from '@/lib/cron-helpers';
import { WeeklyPortfolioReviewEmail } from '@/lib/emails/WeeklyPortfolioReviewEmail';

export async function POST() {
  const startTime = Date.now();

  try {
    const owner = await getUserByEmail(OWNER_EMAIL);
    if (!owner) {
      return NextResponse.json({ success: true, skipped: true, reason: 'Owner account not found' });
    }

    const connection = await getPortfolioConnection(owner.id);
    if (!connection || connection.accounts.length === 0) {
      return NextResponse.json({ success: true, skipped: true, reason: 'No portfolio connected' });
    }

    // Freshen the snapshot first; a sync failure shouldn't kill the review —
    // the stored snapshot from the 6-hourly sync is at most hours old.
    if (isSnapTradeConfigured()) {
      try {
        await syncPortfolio(connection);
      } catch (error) {
        console.error('[PortfolioWeeklyReview] pre-review sync failed:', error);
      }
    }

    const generated = await generatePortfolioReview(owner.id);
    if (!generated) {
      await postToCronResults(
        'portfolio-weekly-review',
        'No portfolio positions to review — skipped email.',
        'review',
      );
      return NextResponse.json({ success: true, skipped: true, reason: 'No positions' });
    }

    const { review, structured } = generated;
    const [snapshot, activities] = await Promise.all([
      getPortfolioSnapshot(owner.id),
      getPortfolioActivities(owner.id),
    ]);
    const income = summarizeIncome(activities, getTodayInEST());
    const weights = snapshot ? positionWeights(snapshot.positions) : [];
    const topHoldings = weights.slice(0, 5).map(w => ({
      symbol: w.symbol,
      weight: w.weight,
      marketValue: w.marketValue,
      openPnl:
        snapshot?.positions.find(p => p.symbol === w.symbol)?.openPnl ?? null,
    }));

    const emailResult = await sendEmail({
      to: OWNER_EMAIL,
      subject: `Weekly Portfolio Review — ${review.periodLabel}`,
      react: WeeklyPortfolioReviewEmail({
        periodLabel: review.periodLabel,
        stats: {
          totalValue: review.totalValue,
          weekChange: review.weekChange,
          openPnl: snapshot?.openPnl ?? 0,
          cash: snapshot?.cash ?? null,
          positionsCount: review.positionsCount,
          dividends30d: income.dividends30d,
        },
        topHoldings,
        structured,
        rawAnalysis: review.analysis,
      }),
    });

    await Promise.all([
      postToCronResults(
        'portfolio-weekly-review',
        `${review.periodLabel}: ${review.positionsCount} positions, value ${
          review.totalValue != null ? `$${review.totalValue.toFixed(2)}` : 'n/a'
        }. Email ${emailResult.success ? 'sent' : `failed: ${emailResult.error}`}.`,
        'review',
      ),
      logToActivityLog(
        'Weekly portfolio review',
        `Generated ${review.periodLabel} review (${review.positionsCount} positions)` +
          `${emailResult.success ? ' and emailed the owner' : ` — email failed: ${emailResult.error}`}`,
        'cron',
      ),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        periodKey: review.periodKey,
        positionsCount: review.positionsCount,
        emailSent: emailResult.success,
        emailError: emailResult.error,
        durationMs: Date.now() - startTime,
      },
    });
  } catch (error) {
    console.error('[PortfolioWeeklyReview] failed:', error);
    await postToCronResults(
      'portfolio-weekly-review',
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
