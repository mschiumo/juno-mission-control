import { NextRequest, NextResponse } from 'next/server';
import { getRedisClient } from '@/lib/redis';
import { requireFeature } from '@/lib/auth-session';
import { AI_NOT_CONFIGURED_MESSAGE, friendlyAiErrorMessage } from '@/lib/ai-error-message';
import { reportAiFailure } from '@/lib/ai-failure-alert';
import {
  consumeReportGeneration,
  getReportGenerationStatus,
  rateLimitMessage,
  refundReportGeneration,
} from '@/lib/report-rate-limit';
import {
  generateJournalInsightsReport,
  getPeriodKey,
  redisKey,
  indexKey,
  type SavedReport,
} from '@/lib/journal-insights';

// GET — fetch saved report for current period + archived reports
export async function GET(request: NextRequest) {
  const { userId, error: authError } = await requireFeature('journalInsights');
  if (authError) return authError;

  const period = request.nextUrl.searchParams.get('period') || 'week';
  const redis = await getRedisClient();
  const currentPeriodKey = getPeriodKey(period);

  // Fetch current report
  const currentKey = redisKey(userId, period, currentPeriodKey);
  const currentData = await redis.get(currentKey);
  const currentReport: SavedReport | null = currentData ? JSON.parse(currentData) : null;

  // Fetch archive index
  const rawIndex = await redis.get(indexKey(userId));
  const allReports: { period: string; periodKey: string; periodLabel: string; generatedAt: string }[] = rawIndex
    ? JSON.parse(rawIndex)
    : [];

  // Archived = past reports for this period type that aren't the current one
  const archived = allReports.filter(
    (r) => r.period === period && r.periodKey !== currentPeriodKey,
  );

  const rateLimit = await getReportGenerationStatus(userId, 'journal-insights');

  return NextResponse.json({
    success: true,
    report: currentReport,
    archived,
    rateLimit,
  });
}

// POST — generate new report, save to Redis
export async function POST(request: NextRequest) {
  const { userId, error: authError } = await requireFeature('journalInsights');
  if (authError) return authError;

  if (!process.env.ANTHROPIC_API_KEY) {
    await reportAiFailure({
      feature: 'journal-insights',
      error: new Error('ANTHROPIC_API_KEY is not configured'),
    });
    return NextResponse.json(
      { success: false, error: AI_NOT_CONFIGURED_MESSAGE },
      { status: 500 },
    );
  }

  let consumed = false;
  try {
    const body = await request.json();
    const period: 'week' | 'month' = body.period === 'month' ? 'month' : 'week';

    // If requesting an archived report, fetch it directly
    if (body.archivePeriodKey) {
      const redis = await getRedisClient();
      const data = await redis.get(redisKey(userId, period, body.archivePeriodKey));
      if (!data) {
        return NextResponse.json(
          { success: false, error: 'Archived report not found' },
          { status: 404 },
        );
      }
      return NextResponse.json({ success: true, report: JSON.parse(data) });
    }

    const rate = await consumeReportGeneration(userId, 'journal-insights');
    if (!rate.allowed) {
      return NextResponse.json(
        { success: false, error: rateLimitMessage(rate.limit), rateLimit: rate },
        { status: 429 },
      );
    }
    consumed = true;

    const generated = await generateJournalInsightsReport(userId, period);

    if (!generated) {
      // Nothing to analyze — Claude was never called, so give the slot back.
      consumed = false;
      await refundReportGeneration(userId, 'journal-insights');
      return NextResponse.json({
        success: true,
        report: null,
        message: `No journal entries or trades found for this ${period}.`,
      });
    }

    return NextResponse.json({
      success: true,
      report: generated.report,
      rateLimit: rate,
    });
  } catch (error) {
    // Don't spend the user's daily allowance on a report they never received.
    if (consumed) await refundReportGeneration(userId, 'journal-insights');
    await reportAiFailure({ feature: 'journal-insights', error });
    return NextResponse.json(
      {
        success: false,
        error: friendlyAiErrorMessage(error),
      },
      { status: 500 },
    );
  }
}
