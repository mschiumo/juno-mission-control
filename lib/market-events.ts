/**
 * Market events — pure selection logic behind the Today's Events card.
 *
 * Sources:
 *  - FOMC rate decisions (hardcoded from the Fed's published schedule)
 *  - Major foreign central-bank rate decisions (hardcoded from each bank's
 *    published schedule). Finnhub's /calendar/economic endpoint is premium
 *    and returns 403 on our plan, so these live here alongside FOMC.
 *  - Key government/legislative events (hardcoded)
 *  - Notable earnings (Finnhub earnings calendar, fetched by the route)
 *
 * The card shows today plus the next trading day ("Tomorrow", or "Mon" when
 * viewed on a Friday/Saturday).
 */

export type MarketEventType = 'fomc' | 'centralbank' | 'gov' | 'earnings';

export interface MarketEvent {
  id: string;
  type: MarketEventType;
  date: string;       // YYYY-MM-DD
  label: string;      // display name
  sublabel?: string;  // e.g. "Q1 2026 · BMO"
  time?: string;      // human-readable time, for tooltip
  daysUntil: number;  // 0 = today, 1 = tomorrow, 3 = Monday when viewed Friday
  dayLabel: string;   // "Today" | "Tomorrow" | "Mon" …
}

export interface EarningsRow {
  date: string;
  hour: string; // 'bmo' | 'amc' | 'dmh' | ''
  quarter: number;
  symbol: string;
  year: number;
}

// Known major tickers worth highlighting
export const NOTABLE_TICKERS = new Set([
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
export const GOV_EVENTS: { date: string; label: string; sublabel: string; time?: string }[] = [
  { date: '2025-05-06', label: 'CLARITY Act', sublabel: 'Senate vote · Crypto regulation', time: 'Senate floor session' },
  { date: '2025-07-15', label: 'Stablecoin Bill', sublabel: 'Senate floor vote', time: 'Senate floor session' },
  { date: '2026-01-15', label: 'Debt Ceiling', sublabel: 'Treasury X-date estimate', time: 'All day' },
  { date: '2026-04-15', label: 'Tax Deadline', sublabel: 'IRS · market liquidity impact', time: 'All day' },
];

// FOMC rate decision dates — second day of each 2-day meeting
// 2025 remaining + 2026 schedule (published annually by the Fed)
export const FOMC_DATES: { date: string; label: string }[] = [
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

/**
 * Major foreign central-bank rate decisions — 2026 schedules as published by
 * each bank (decision/announcement day, not the first day of a 2-day meeting).
 * Times are the usual announcement time expressed in US Eastern; Asia-Pacific
 * banks announce overnight relative to the US session.
 *
 * Sources checked 2026-09-15:
 *  BoJ  boj.or.jp/en/mopo/mpmsche_minu   ECB  ecb.europa.eu/press/calendars
 *  BoE  bankofengland.co.uk MPC dates    BoC  bankofcanada.ca 2026 schedule
 *  SNB  snb.ch quarterly assessments     RBA  rba.gov.au media release 25-02
 */
export interface CentralBankEvent {
  date: string;
  bank: string;     // short code used in the label, e.g. "BoJ"
  name: string;     // full name for the tooltip
  short: string;    // compact time shown in the chip
  time: string;     // fuller time for the tooltip
}

const BOJ = { bank: 'BoJ', name: 'Bank of Japan', short: 'Overnight ET', time: 'Overnight · ~11 PM ET the evening before (midday JST)' };
const ECB = { bank: 'ECB', name: 'European Central Bank', short: '8:15 AM ET', time: '8:15 AM ET · press conference 8:45 AM ET' };
const BOE = { bank: 'BoE', name: 'Bank of England', short: '7:00 AM ET', time: '7:00 AM ET (12:00 London)' };
const BOC = { bank: 'BoC', name: 'Bank of Canada', short: '9:45 AM ET', time: '9:45 AM ET' };
const SNB = { bank: 'SNB', name: 'Swiss National Bank', short: '3:30 AM ET', time: '3:30 AM ET (9:30 Zurich)' };
const RBA = { bank: 'RBA', name: 'Reserve Bank of Australia', short: 'Overnight ET', time: 'Overnight · ~11:30 PM ET the evening before (2:30 PM Sydney)' };

export const CENTRAL_BANK_DATES: CentralBankEvent[] = [
  // Bank of Japan — 2026 Monetary Policy Meetings (second day)
  { date: '2026-01-23', ...BOJ },
  { date: '2026-03-19', ...BOJ },
  { date: '2026-04-28', ...BOJ },
  { date: '2026-06-16', ...BOJ },
  { date: '2026-07-31', ...BOJ },
  { date: '2026-09-18', ...BOJ },
  { date: '2026-10-30', ...BOJ },
  { date: '2026-12-18', ...BOJ },
  // European Central Bank — 2026 monetary policy meetings (decision day)
  { date: '2026-02-05', ...ECB },
  { date: '2026-03-19', ...ECB },
  { date: '2026-04-30', ...ECB },
  { date: '2026-06-11', ...ECB },
  { date: '2026-07-23', ...ECB },
  { date: '2026-09-10', ...ECB },
  { date: '2026-10-29', ...ECB },
  { date: '2026-12-17', ...ECB },
  // Bank of England — 2026 MPC announcement dates
  { date: '2026-02-05', ...BOE },
  { date: '2026-03-19', ...BOE },
  { date: '2026-04-30', ...BOE },
  { date: '2026-06-18', ...BOE },
  { date: '2026-07-30', ...BOE },
  { date: '2026-09-17', ...BOE },
  { date: '2026-11-05', ...BOE },
  { date: '2026-12-17', ...BOE },
  // Bank of Canada — 2026 policy rate announcements
  { date: '2026-01-28', ...BOC },
  { date: '2026-03-18', ...BOC },
  { date: '2026-04-29', ...BOC },
  { date: '2026-06-10', ...BOC },
  { date: '2026-07-15', ...BOC },
  { date: '2026-09-02', ...BOC },
  { date: '2026-10-28', ...BOC },
  { date: '2026-12-09', ...BOC },
  // Swiss National Bank — 2026 quarterly monetary policy assessments
  { date: '2026-03-19', ...SNB },
  { date: '2026-06-18', ...SNB },
  { date: '2026-09-24', ...SNB },
  { date: '2026-12-10', ...SNB },
  // Reserve Bank of Australia — 2026 Monetary Policy Board meetings (second day)
  { date: '2026-02-03', ...RBA },
  { date: '2026-03-17', ...RBA },
  { date: '2026-05-05', ...RBA },
  { date: '2026-06-16', ...RBA },
  { date: '2026-08-11', ...RBA },
  { date: '2026-09-29', ...RBA },
  { date: '2026-11-03', ...RBA },
  { date: '2026-12-08', ...RBA },
];

// ---------------------------------------------------------------------------
// Date helpers — all operate on YYYY-MM-DD strings and are timezone-neutral.
// ---------------------------------------------------------------------------

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function toUtcNoon(dateStr: string): Date {
  return new Date(`${dateStr}T12:00:00Z`);
}

export function addDays(dateStr: string, n: number): string {
  const d = toUtcNoon(dateStr);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(fromStr: string, toStr: string): number {
  return Math.round((toUtcNoon(toStr).getTime() - toUtcNoon(fromStr).getTime()) / 86_400_000);
}

export function weekdayShort(dateStr: string): string {
  return WEEKDAY_SHORT[toUtcNoon(dateStr).getUTCDay()];
}

/**
 * The next trading day after `today`: tomorrow, or Monday when tomorrow lands
 * on a weekend. (Exchange holidays are not modelled — the card simply shows
 * nothing scheduled on those days.)
 */
export function nextSessionDay(today: string): string {
  let d = addDays(today, 1);
  while (toUtcNoon(d).getUTCDay() === 0 || toUtcNoon(d).getUTCDay() === 6) {
    d = addDays(d, 1);
  }
  return d;
}

export function dayLabelFor(today: string, date: string): string {
  const diff = daysBetween(today, date);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  return weekdayShort(date);
}

// ---------------------------------------------------------------------------
// Selection
// ---------------------------------------------------------------------------

const TYPE_PRIORITY: Record<MarketEventType, number> = { fomc: 0, centralbank: 1, gov: 2, earnings: 3 };

export interface BuildMarketEventsInput {
  today: string;
  nextDay: string;
  earnings: EarningsRow[];
}

/**
 * Assemble the events for `today` and `nextDay`, ordered today-first and
 * then by type priority (FOMC > central banks > gov > earnings).
 */
export function buildMarketEvents({ today, nextDay, earnings }: BuildMarketEventsInput): MarketEvent[] {
  const days = new Set([today, nextDay]);
  const meta = (date: string) => ({ daysUntil: daysBetween(today, date), dayLabel: dayLabelFor(today, date) });
  const events: MarketEvent[] = [];

  for (const fomc of FOMC_DATES) {
    if (!days.has(fomc.date)) continue;
    events.push({
      id: `fomc-${fomc.date}`,
      type: 'fomc',
      date: fomc.date,
      label: fomc.label,
      time: '2:00 PM ET',
      ...meta(fomc.date),
    });
  }

  for (const cb of CENTRAL_BANK_DATES) {
    if (!days.has(cb.date)) continue;
    events.push({
      id: `cb-${cb.bank.toLowerCase()}-${cb.date}`,
      type: 'centralbank',
      date: cb.date,
      label: `${cb.bank} Rate Decision`,
      sublabel: cb.short,
      time: `${cb.name} · ${cb.time}`,
      ...meta(cb.date),
    });
  }

  for (const gov of GOV_EVENTS) {
    if (!days.has(gov.date)) continue;
    events.push({
      id: `gov-${gov.date}-${gov.label}`,
      type: 'gov',
      date: gov.date,
      label: gov.label,
      sublabel: gov.sublabel,
      time: gov.time,
      ...meta(gov.date),
    });
  }

  for (const e of earnings) {
    if (!NOTABLE_TICKERS.has(e.symbol)) continue;
    if (!days.has(e.date)) continue;
    const timing = e.hour === 'bmo' ? 'BMO' : e.hour === 'amc' ? 'AMC' : '';
    const timeLabel = e.hour === 'bmo'
      ? 'Pre-market (before 9:30 AM ET)'
      : e.hour === 'amc'
        ? 'After close (after 4:00 PM ET)'
        : 'During market hours';
    events.push({
      id: `earnings-${e.symbol}-${e.date}`,
      type: 'earnings',
      date: e.date,
      label: e.symbol,
      sublabel: `Q${e.quarter} ${e.year}${timing ? ` · ${timing}` : ''}`,
      time: timeLabel,
      ...meta(e.date),
    });
  }

  events.sort((a, b) => a.daysUntil - b.daysUntil || TYPE_PRIORITY[a.type] - TYPE_PRIORITY[b.type]);
  return events;
}
