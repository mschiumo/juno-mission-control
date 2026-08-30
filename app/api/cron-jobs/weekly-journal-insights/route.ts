/**
 * Weekly Journal Insights Email (Vercel cron) — owner-only.
 *
 * Runs Saturday 21:00 UTC (Saturday afternoon ET). SnapTrade can take until
 * the next morning to propagate Friday's activity, so the old Saturday 02:00
 * UTC run often missed Friday; by Saturday afternoon the 6-hourly SnapTrade
 * sync (01/07/13/19 UTC) has picked Friday up. The report window is the
 * Monday of the current week through the run time, so all of Mon–Fri is
 * covered. Generates the weekly journal-insights report for the app owner —
 * persisted to the same Redis keys the Journal Insights tab reads, so it also
 * appears in the archive — and emails the rundown to the owner's inbox.
 *
 * Gated by CRON_SECRET in middleware.ts (Authorization: Bearer <CRON_SECRET>),
 * same as the other /api/cron-jobs/* routes.
 */

import { NextResponse } from 'next/server';
import type { Trade } from '@/types/trading';
import { OWNER_EMAIL } from '@/lib/owner';
import { getUserByEmail } from '@/lib/db/users';
import {
  generateJournalInsightsReport,
  parseAnalysis,
  getDateRange,
  getPeriodKey,
  getPeriodLabel,
} from '@/lib/journal-insights';
import { sendEmail } from '@/lib/email';
import { postToCronResults, logToActivityLog } from '@/lib/cron-helpers';
import {
  WeeklyJournalInsightsEmail,
  type WeeklyStats,
  type PortfolioRecap,
} from '@/lib/emails/WeeklyJournalInsightsEmail';
import {
  getPortfolioConnection,
  getPortfolioSnapshot,
  getPortfolioActivities,
  getPortfolioReviews,
} from '@/lib/db/portfolio-connection';
import { generatePortfolioReview, parseReview, currentWeekKey } from '@/lib/portfolio-review';
import { summarizeIncome } from '@/lib/portfolio-insights';
import { getTodayInEST } from '@/lib/date-utils';

/**
 * Long-term portfolio recap for the email — stats plus the pressing action
 * items from this week's portfolio review (generated Saturday 13:30 UTC by
 * /api/cron-jobs/portfolio-weekly-review; regenerated here as a fallback if
 * that run failed). Never throws: a portfolio failure must not block the
 * trading recap.
 */
async function buildPortfolioRecap(userId: string): Promise<PortfolioRecap | null> {
  try {
    const connection = await getPortfolioConnection(userId);
    if (!connection || connection.accounts.length === 0) return null;

    const weekKey = currentWeekKey();
    let review =
      (await getPortfolioReviews(userId)).find((r) => r.periodKey === weekKey) ?? null;
    if (!review) {
      try {
        review = (await generatePortfolioReview(userId))?.review ?? null;
      } catch (error) {
        console.error('[WeeklyJournalInsights] portfolio review fallback failed:', error);
      }
    }

    const [snapshot, activities] = await Promise.all([
      getPortfolioSnapshot(userId),
      getPortfolioActivities(userId),
    ]);
    if (!snapshot && !review) return null;

    const income = summarizeIncome(activities, getTodayInEST());
    const structured = review ? parseReview(review.analysis) : null;
    return {
      totalValue: snapshot?.totalValue ?? review?.totalValue ?? null,
      weekChange: review?.weekChange ?? null,
      openPnl: snapshot?.openPnl ?? 0,
      positionsCount: snapshot?.positions.length ?? review?.positionsCount ?? 0,
      dividends30d: income.dividends30d,
      keyTakeaway: structured?.keyTakeaway ?? null,
      actionItems: structured
        ? [...structured.repositioning, ...structured.watch].slice(0, 4)
        : [],
    };
  } catch (error) {
    console.error('[WeeklyJournalInsights] portfolio recap failed:', error);
    return null;
  }
}

function buildStats(trades: Trade[], entriesCount: number): WeeklyStats {
  const closed = trades.filter((t) => t.status === 'CLOSED');
  const wins = closed.filter((t) => (t.netPnL || 0) > 0).length;
  const losses = closed.filter((t) => (t.netPnL || 0) < 0).length;
  const netPnL = closed.reduce((s, t) => s + (t.netPnL || 0), 0);

  let bestTrade: WeeklyStats['bestTrade'] = null;
  let worstTrade: WeeklyStats['worstTrade'] = null;
  for (const t of closed) {
    const pnl = t.netPnL || 0;
    if (!bestTrade || pnl > bestTrade.pnl) bestTrade = { symbol: t.symbol, pnl };
    if (!worstTrade || pnl < worstTrade.pnl) worstTrade = { symbol: t.symbol, pnl };
  }

  return {
    netPnL,
    wins,
    losses,
    winRate: wins + losses > 0 ? wins / (wins + losses) : null,
    closedTrades: closed.length,
    entriesCount,
    bestTrade,
    worstTrade,
  };
}

/** "Aug 3 – Aug 7, 2026" for the Monday–Friday trading week of the report. */
function tradingWeekLabel(periodStartIso: string): string {
  const monday = new Date(periodStartIso);
  const friday = new Date(monday);
  friday.setUTCDate(friday.getUTCDate() + 4);
  const fmt = (d: Date, withYear: boolean) =>
    d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      ...(withYear ? { year: 'numeric' } : {}),
      timeZone: 'UTC',
    });
  return `${fmt(monday, false)} – ${fmt(friday, true)}`;
}

export async function POST() {
  const startTime = Date.now();

  try {
    const owner = await getUserByEmail(OWNER_EMAIL);
    if (!owner) {
      return NextResponse.json({ success: true, skipped: true, reason: 'Owner account not found' });
    }

    const generated = await generateJournalInsightsReport(owner.id, 'week');
    if (!generated) {
      // Quiet trading week. If a long-term portfolio is connected its recap
      // still goes out (the review is generated regardless of trading
      // activity); otherwise skip as before.
      const portfolio = await buildPortfolioRecap(owner.id);
      if (!portfolio) {
        await postToCronResults(
          'weekly-journal-insights',
          'No journal entries or trades this week — skipped email.',
          'review',
        );
        return NextResponse.json({ success: true, skipped: true, reason: 'No data for this week' });
      }

      const periodKey = getPeriodKey('week');
      const periodLabel = getPeriodLabel('week', periodKey);
      const emailResult = await sendEmail({
        to: OWNER_EMAIL,
        subject: `Weekly Journal Insights — ${periodLabel}`,
        react: WeeklyJournalInsightsEmail({
          periodLabel,
          dateRangeLabel: tradingWeekLabel(getDateRange('week').start.toISOString()),
          stats: null,
          structured: null,
          rawAnalysis: '',
          portfolio,
        }),
      });
      await postToCronResults(
        'weekly-journal-insights',
        `Quiet trading week — sent portfolio-only recap (${portfolio.positionsCount} positions). ` +
          `Email ${emailResult.success ? 'sent' : `failed: ${emailResult.error}`}.`,
        'review',
      );
      return NextResponse.json({
        success: true,
        data: { quietWeek: true, emailSent: emailResult.success, emailError: emailResult.error },
      });
    }

    const { report, trades } = generated;
    const stats = buildStats(trades, report.entriesCount);
    const structured = parseAnalysis(report.analysis);
    const portfolio = await buildPortfolioRecap(owner.id);

    const emailResult = await sendEmail({
      to: OWNER_EMAIL,
      subject: `Weekly Journal Insights — ${report.periodLabel}`,
      react: WeeklyJournalInsightsEmail({
        periodLabel: report.periodLabel,
        dateRangeLabel: tradingWeekLabel(report.periodStart),
        stats,
        structured,
        rawAnalysis: report.analysis,
        portfolio,
      }),
    });

    await Promise.all([
      postToCronResults(
        'weekly-journal-insights',
        `${report.periodLabel}: ${stats.wins}W/${stats.losses}L, net $${stats.netPnL.toFixed(2)}, ` +
          `${report.entriesCount} journal entries` +
          `${portfolio ? `, portfolio recap included (${portfolio.positionsCount} positions)` : ''}. ` +
          `Email ${emailResult.success ? 'sent' : `failed: ${emailResult.error}`}.`,
        'review',
      ),
      logToActivityLog(
        'Weekly journal insights',
        `Generated ${report.periodLabel} report (${report.tradesCount} closed trades, ${report.entriesCount} entries)` +
          `${emailResult.success ? ' and emailed the owner' : ` — email failed: ${emailResult.error}`}`,
        'cron',
      ),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        periodKey: report.periodKey,
        entriesCount: report.entriesCount,
        closedTrades: stats.closedTrades,
        netPnL: stats.netPnL,
        emailSent: emailResult.success,
        emailError: emailResult.error,
        durationMs: Date.now() - startTime,
      },
    });
  } catch (error) {
    console.error('[WeeklyJournalInsights] failed:', error);
    await postToCronResults(
      'weekly-journal-insights',
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
