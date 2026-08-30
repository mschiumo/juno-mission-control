/**
 * Weekly Portfolio Review generation (Vercel cron).
 *
 * Runs Saturday 13:30 UTC (after the 13:00 UTC SnapTrade sync window, so
 * Friday's close data has propagated). For every user with a connected
 * long-term portfolio: re-syncs best-effort, then generates and stores the
 * weekly review that the Portfolio tab's Weekly Review modal reads.
 *
 * This cron no longer sends its own email — the review's stats and pressing
 * action items ride along in the owner's Weekly Journal Insights recap
 * (Saturday 21:00 UTC), which reads the review stored here.
 *
 * Gated by CRON_SECRET in middleware.ts (Authorization: Bearer <CRON_SECRET>),
 * same as the other /api/cron-jobs/* routes.
 */

import { NextResponse } from 'next/server';
import { isSnapTradeConfigured } from '@/lib/snaptrade';
import { getAllPortfolioConnections } from '@/lib/db/portfolio-connection';
import { syncPortfolio } from '@/lib/portfolio-sync';
import { generatePortfolioReview } from '@/lib/portfolio-review';
import { postToCronResults } from '@/lib/cron-helpers';

export async function POST() {
  const startTime = Date.now();

  try {
    const connections = (await getAllPortfolioConnections()).filter(
      (c) => c.accounts.length > 0
    );
    if (connections.length === 0) {
      return NextResponse.json({ success: true, skipped: true, reason: 'No portfolios connected' });
    }

    const results: Array<Record<string, unknown>> = [];
    let generated = 0;
    for (const connection of connections) {
      // Freshen the snapshot first; a sync failure shouldn't kill the review —
      // the stored snapshot from the 6-hourly sync is at most hours old.
      if (isSnapTradeConfigured()) {
        try {
          await syncPortfolio(connection);
        } catch (error) {
          console.error(
            `[PortfolioWeeklyReview] pre-review sync failed for ${connection.userId}:`,
            error
          );
        }
      }

      try {
        const result = await generatePortfolioReview(connection.userId);
        if (result) {
          generated += 1;
          results.push({
            userId: connection.userId,
            periodKey: result.review.periodKey,
            positions: result.review.positionsCount,
          });
        } else {
          results.push({ userId: connection.userId, skipped: 'no positions' });
        }
      } catch (error) {
        console.error(`[PortfolioWeeklyReview] failed for ${connection.userId}:`, error);
        results.push({
          userId: connection.userId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    await postToCronResults(
      'portfolio-weekly-review',
      `Generated ${generated}/${connections.length} weekly portfolio reviews.`,
      'review',
    );

    return NextResponse.json({
      success: true,
      data: { portfolios: connections.length, generated, results, durationMs: Date.now() - startTime },
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
