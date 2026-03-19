/**
 * Market Events API
 * Returns upcoming FOMC meetings + major earnings releases (next 14 days)
 */

import { NextResponse } from 'next/server';

const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;

// Known major tickers worth highlighting
const NOTABLE_TICKERS = new Set([
  'AAPL', 'MSFT', 'GOOGL', 'GOOG', 'AMZN', 'META', 'NVDA', 'TSLA',
  'JPM', 'GS', 'BAC', 'MS', 'V', 'MA', 'BRK.B',
  'AMD', 'INTC', 'QCOM', 'AVGO', 'TSM',
  'NFLX', 'DIS', 'SPOT',
  'UNH', 'JNJ', 'PFE', 'MRNA', 'LLY',
  'XOM', 'CVX', 'COST', 'WMT', 'TGT', 'NKE', 'SBUX',
  'CRM', 'ORCL', 'SAP', 'NOW', 'SNOW', 'PLTR',
]);

// Key government/legislative events with direct market impact
// Update as new dates are confirmed. Keep to only the most consequential items.
const GOV_EVENTS: { date: string; label: string; sublabel: string; time?: string }[] = [
  { date: '2025-05-06', label: 'CLARITY Act', sublabel: 'Senate vote · Crypto regulation', time: 'Senate floor session' },
  { date: '2025-07-15', label: 'Stablecoin Bill', sublabel: 'Senate floor vote', time: 'Senate floor session' },
  { date: '2026-01-15', label: 'Debt Ceiling', sublabel: 'Treasury X-date estimate', time: 'All day' },
  { date: '2026-04-15', label: 'Tax Deadline', sublabel: 'IRS · market liquidity impact', time: 'All day' },
];

// FOMC rate decision dates — second day of each 2-day meeting
// 2025 remaining + 2026 schedule (published annually by the Fed)
const FOMC_DATES: { date: string; label: string }[] = [
  { date: '2025-04-30', label: 'FOMC Rate Decision' },
  { date: '2025-06-18', label: 'FOMC Rate Decision' },
  { date: '2025-07-30', label: 'FOMC Rate Decision' },
  { date: '2025-09-17', label: 'FOMC Rate Decision' },
  { date: '2025-10-29', label: 'FOMC Rate Decision' },
  { date: '2025-12-10', label: 'FOMC Rate Decision' },
  { date: '2026-01-28', label: 'FOMC Rate Decision' },
  { date: '2026-03-18', label: 'FOMC Rate Decision' },
  { date: '2026-04-29', label: 'FOMC Rate Decision' },
  { date: '2026-06-10', label: 'FOMC Rate Decision' },
  { date: '2026-07-29', label: 'FOMC Rate Decision' },
  { date: '2026-09-16', label: 'FOMC Rate Decision' },
  { date: '2026-10-28', label: 'FOMC Rate Decision' },
  { date: '2026-12-09', label: 'FOMC Rate Decision' },
];

interface FinnhubEarning {
  date: string;
  epsActual: number | null;
  epsEstimate: number | null;
  hour: string; // 'bmo' | 'amc' | 'dmh'
  quarter: number;
  symbol: string;
  year: number;
}

interface FinnhubEarningsResponse {
  earningsCalendar: FinnhubEarning[];
}

export interface MarketEvent {
  id: string;
  type: 'fomc' | 'earnings' | 'gov';
  date: string;       // YYYY-MM-DD
  label: string;      // display name
  sublabel?: string;  // e.g. "Q1 2026 · BMO"
  time?: string;      // human-readable time, for tooltip
  daysUntil: number;
}

function todayEST(): string {
  const now = new Date();
  const est = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  return est.toISOString().split('T')[0];
}

function daysUntil(dateStr: string, todayStr: string): number {
  const target = new Date(dateStr + 'T12:00:00');
  const today = new Date(todayStr + 'T12:00:00');
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

async function fetchUpcomingEarnings(from: string, to: string): Promise<FinnhubEarning[]> {
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
  const today = todayEST();

  const events: MarketEvent[] = [];

  // Government/legislative events — today only
  for (const gov of GOV_EVENTS) {
    if (daysUntil(gov.date, today) === 0) {
      events.push({
        id: `gov-${gov.date}-${gov.label}`,
        type: 'gov',
        date: gov.date,
        label: gov.label,
        sublabel: gov.sublabel,
        time: gov.time,
        daysUntil: 0,
      });
    }
  }

  // FOMC — today only; rate decision announced at 2:00 PM ET
  for (const fomc of FOMC_DATES) {
    if (daysUntil(fomc.date, today) === 0) {
      events.push({
        id: `fomc-${fomc.date}`,
        type: 'fomc',
        date: fomc.date,
        label: fomc.label,
        time: '2:00 PM ET',
        daysUntil: 0,
      });
    }
  }

  // Notable earnings — today only
  const earnings = await fetchUpcomingEarnings(today, today);
  for (const e of earnings) {
    if (!NOTABLE_TICKERS.has(e.symbol)) continue;
    if (daysUntil(e.date, today) !== 0) continue;
    const timing = e.hour === 'bmo' ? 'BMO' : e.hour === 'amc' ? 'AMC' : '';
    const timeLabel = e.hour === 'bmo' ? 'Pre-market (before 9:30 AM ET)' : e.hour === 'amc' ? 'After close (after 4:00 PM ET)' : 'During market hours';
    events.push({
      id: `earnings-${e.symbol}-${e.date}`,
      type: 'earnings',
      date: e.date,
      label: e.symbol,
      sublabel: `Q${e.quarter} ${e.year}${timing ? ` · ${timing}` : ''}`,
      time: timeLabel,
      daysUntil: 0,
    });
  }

  // Sort type priority: fomc > gov > earnings
  const priority = { fomc: 0, gov: 1, earnings: 2 };
  events.sort((a, b) => priority[a.type] - priority[b.type]);

  return NextResponse.json({
    success: true,
    data: events,
    today,
    source: FINNHUB_API_KEY ? 'live' : 'fomc-only',
  }, {
    headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200' },
  });
}
