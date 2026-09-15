/**
 * Market Events API
 * Returns FOMC + major foreign central-bank rate decisions, key gov events,
 * and notable earnings for today and the next trading day.
 *
 * Selection logic and the hardcoded schedules live in lib/market-events.ts.
 */

import { NextResponse } from 'next/server';
import { requireFeature } from '@/lib/auth-session';
import { getTodayInEST } from '@/lib/date-utils';
import {
  buildMarketEvents,
  dayLabelFor,
  nextSessionDay,
  type EarningsRow,
} from '@/lib/market-events';

export type { MarketEvent, MarketEventType } from '@/lib/market-events';

const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;

interface FinnhubEarningsResponse {
  earningsCalendar: EarningsRow[];
}

async function fetchUpcomingEarnings(from: string, to: string): Promise<EarningsRow[]> {
  if (!FINNHUB_API_KEY) return [];
  try {
    const res = await fetch(
      `https://finnhub.io/api/v1/calendar/earnings?from=${from}&to=${to}&token=${FINNHUB_API_KEY}`,
      { next: { revalidate: 3600 } }
    );
    if (!res.ok) return [];
    const data: FinnhubEarningsResponse = await res.json();
    return data.earningsCalendar || [];
  } catch {
    return [];
  }
}

export async function GET() {
  const { error: entitlementError } = await requireFeature('marketFull');
  if (entitlementError) return entitlementError;

  const today = getTodayInEST();
  const nextDay = nextSessionDay(today);

  const earnings = await fetchUpcomingEarnings(today, nextDay);
  const events = buildMarketEvents({ today, nextDay, earnings });

  return NextResponse.json({
    success: true,
    data: events,
    today,
    nextDay,
    nextDayLabel: dayLabelFor(today, nextDay),
    source: FINNHUB_API_KEY ? 'live' : 'fomc-only',
  }, {
    headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200' },
  });
}
