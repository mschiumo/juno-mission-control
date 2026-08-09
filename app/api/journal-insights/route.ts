import { NextRequest, NextResponse } from 'next/server';
import { getRedisClient } from '@/lib/redis';
import { requireFeature } from '@/lib/auth-session';
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

  return NextResponse.json({
    success: true,
    report: currentReport,
    archived,
  });
}

// POST — generate new report, save to Redis
export async function POST(request: NextRequest) {
  const { userId, error: authError } = await requireFeature('journalInsights');
  if (authError) return authError;

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { success: false, error: 'ANTHROPIC_API_KEY is not configured' },
      { status: 500 },
    );
  }

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

    const generated = await generateJournalInsightsReport(userId, period);

    if (!generated) {
      return NextResponse.json({
        success: true,
        report: null,
        message: `No journal entries or trades found for this ${period}.`,
      });
    }

    return NextResponse.json({
      success: true,
      report: generated.report,
    });
  } catch (error) {
    console.error('Error generating journal insights:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to generate insights',
      },
      { status: 500 },
    );
  }
}
