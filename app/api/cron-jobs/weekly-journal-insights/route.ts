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
import { generateJournalInsightsReport, parseAnalysis } from '@/lib/journal-insights';
import { sendEmail } from '@/lib/email';
import { postToCronResults, logToActivityLog } from '@/lib/cron-helpers';
import {
  WeeklyJournalInsightsEmail,
  type WeeklyStats,
} from '@/lib/emails/WeeklyJournalInsightsEmail';

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
      await postToCronResults(
        'weekly-journal-insights',
        'No journal entries or trades this week — skipped email.',
        'review',
      );
      return NextResponse.json({ success: true, skipped: true, reason: 'No data for this week' });
    }

    const { report, trades } = generated;
    const stats = buildStats(trades, report.entriesCount);
    const structured = parseAnalysis(report.analysis);

    const emailResult = await sendEmail({
      to: OWNER_EMAIL,
      subject: `Weekly Journal Insights — ${report.periodLabel}`,
      react: WeeklyJournalInsightsEmail({
        periodLabel: report.periodLabel,
        dateRangeLabel: tradingWeekLabel(report.periodStart),
        stats,
        structured,
        rawAnalysis: report.analysis,
      }),
    });

    await Promise.all([
      postToCronResults(
        'weekly-journal-insights',
        `${report.periodLabel}: ${stats.wins}W/${stats.losses}L, net $${stats.netPnL.toFixed(2)}, ` +
          `${report.entriesCount} journal entries. Email ${emailResult.success ? 'sent' : `failed: ${emailResult.error}`}.`,
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
