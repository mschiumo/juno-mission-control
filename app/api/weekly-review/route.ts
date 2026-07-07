import { NextRequest, NextResponse } from 'next/server';
import { getRedisClient } from '@/lib/redis';
import { requireUserId } from '@/lib/auth-session';
import { fetchRecentActivities } from '@/lib/strava';
import { getAllTrades } from '@/lib/db/trades-v2';
import { getESTDateFromTimestamp } from '@/lib/date-utils';
import { pctPaid, projectDebtFreeDate, paceStatus, DEBT_TARGET, type BalanceEntry } from '@/lib/debt-math';

// Weekly Scoreboard — the "four numbers" from MJ's plan (card balance,
// trades journaled, training sessions, posts published) plus the debt
// thermometer. Training and trade-journal counts are computed from data the
// app already records; card balance and posts are deliberate manual entries.

const REVIEW_KEY_PREFIX = 'weekly_review';
const DEBT_KEY_PREFIX = 'debt_plan';

interface WeeklyEntry {
  cardBalance?: number;
  postsPublished?: number;
  updatedAt?: string;
}

interface DebtPlan {
  startBalance: number;
  startDate: string; // week-start YYYY-MM-DD
  entries: BalanceEntry[]; // weekly balances, oldest first
}

function reviewKey(userId: string, weekStart: string) {
  return `${REVIEW_KEY_PREFIX}:${userId}:${weekStart}`;
}

function debtKey(userId: string) {
  return `${DEBT_KEY_PREFIX}:${userId}`;
}

function getTodayEST(): string {
  const dateStr = new Date().toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const [month, day, year] = dateStr.split('/');
  return `${year}-${month}-${day}`;
}

function shiftDate(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d + days, 12);
  const yy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function mondayOf(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d, 12);
  const dow = (date.getDay() + 6) % 7; // 0 = Monday
  return shiftDate(dateStr, -dow);
}

async function loadWeeklyEntry(userId: string, weekStart: string): Promise<WeeklyEntry> {
  const redis = await getRedisClient();
  const raw = await redis.get(reviewKey(userId, weekStart));
  if (!raw) return {};
  try {
    return JSON.parse(raw) as WeeklyEntry;
  } catch {
    return {};
  }
}

async function loadDebtPlan(userId: string): Promise<DebtPlan | null> {
  const redis = await getRedisClient();
  const raw = await redis.get(debtKey(userId));
  if (!raw) return null;
  try {
    const plan = JSON.parse(raw) as DebtPlan;
    if (typeof plan.startBalance !== 'number' || !plan.startDate) return null;
    return { ...plan, entries: Array.isArray(plan.entries) ? plan.entries : [] };
  } catch {
    return null;
  }
}

/** Distinct training days this week: Strava activity days ∪ workout-split completions. */
async function trainingDays(userId: string, weekStart: string, today: string): Promise<number> {
  const days = new Set<string>();

  // Workout split completions (local Redis, always available).
  try {
    const redis = await getRedisClient();
    const raw = await redis.get(`workout_schedule:${userId}`);
    if (raw) {
      const state = JSON.parse(raw) as { history?: { date: string }[] };
      for (const h of state.history ?? []) {
        if (h.date >= weekStart && h.date <= today) days.add(h.date);
      }
    }
  } catch {
    /* ignore */
  }

  // Strava activity days (skip silently when disconnected or unreachable).
  try {
    const weekStartEpoch = Math.floor(new Date(weekStart + 'T00:00:00-05:00').getTime() / 1000);
    const activities = await fetchRecentActivities(userId, weekStartEpoch);
    for (const a of activities ?? []) {
      const d = a.start_date_local.slice(0, 10);
      if (d >= weekStart && d <= today) days.add(d);
    }
  } catch {
    /* Strava unreachable — workout-split days still count */
  }

  return days.size;
}

/** Realized P&L this week: closed trades whose EST exit date falls in the week. */
async function weeklyPnl(userId: string, weekStart: string, today: string): Promise<{ pnl: number; trades: number }> {
  try {
    const trades = await getAllTrades(userId);
    let pnl = 0;
    let count = 0;
    for (const t of trades) {
      if (t.status !== 'CLOSED' || !t.exitDate) continue;
      const d = getESTDateFromTimestamp(t.exitDate);
      if (d >= weekStart && d <= today) {
        pnl += t.netPnL || 0;
        count++;
      }
    }
    return { pnl: Math.round(pnl * 100) / 100, trades: count };
  } catch (err) {
    console.error('weeklyPnl error:', err);
    return { pnl: 0, trades: 0 };
  }
}

/** Days this week with a personal (daily) journal entry that has content. */
async function journalDays(userId: string, weekStart: string, today: string): Promise<number> {
  const redis = await getRedisClient();
  let count = 0;
  for (let i = 0; i < 7; i++) {
    const date = shiftDate(weekStart, i);
    if (date > today) break;
    const hash = await redis.hGetAll(`personal-journal:${userId}:${date}`);
    if (hash && hash.prompts) {
      try {
        const prompts = JSON.parse(hash.prompts) as { answer?: string }[];
        if (prompts.some((p) => p.answer?.trim())) count++;
      } catch {
        /* malformed entry — skip */
      }
    }
  }
  return count;
}

// "Write" habit matcher — habit ids aren't stable slugs, so match id or name.
function isWriteHabit(h: { id: string; name: string }): boolean {
  return h.id === 'write' || /\bwrit|poem|poetry/i.test(h.name);
}

function weeklyGoal(frequency: string | undefined): number {
  switch (frequency) {
    case 'weekdays': return 5;
    case '3x':       return 3;
    case '4x':       return 4;
    case '5x':       return 5;
    case '6x':       return 6;
    default:         return 7; // 'daily' or unset
  }
}

/**
 * Days this week the "Write" habit was checked off, with the weekly goal
 * taken from the habit's own frequency setting. Null when no Write-like
 * habit exists on the Habits card.
 */
async function writingDays(
  userId: string,
  weekStart: string,
  today: string
): Promise<{ days: number; goal: number } | null> {
  const redis = await getRedisClient();
  let days = 0;
  let goal: number | null = null;
  for (let i = 0; i < 7; i++) {
    const date = shiftDate(weekStart, i);
    if (date > today) break;
    const raw = await redis.get(`habits_data:${userId}:${date}`);
    if (!raw) continue;
    try {
      const habits = JSON.parse(raw) as { id: string; name: string; frequency?: string; completedToday: boolean }[];
      const matches = habits.filter(isWriteHabit);
      if (matches.length > 0) goal = weeklyGoal(matches[0].frequency);
      if (matches.some((h) => h.completedToday)) days++;
    } catch {
      /* malformed day — skip */
    }
  }
  return goal !== null ? { days, goal } : null;
}

function buildDebtPayload(plan: DebtPlan | null, today: string) {
  if (!plan) return { configured: false as const };
  const current = plan.entries.length > 0 ? plan.entries[plan.entries.length - 1].balance : plan.startBalance;
  return {
    configured: true as const,
    startBalance: plan.startBalance,
    startDate: plan.startDate,
    current,
    pctPaid: Math.round(pctPaid(plan.startBalance, current) * 10) / 10,
    paidOff: Math.round((plan.startBalance - current) * 100) / 100,
    projectedFreeDate: projectDebtFreeDate(plan.entries),
    pace: paceStatus(plan.startBalance, plan.startDate, current, today, DEBT_TARGET),
    entries: plan.entries.slice(-12),
  };
}

async function buildResponse(userId: string) {
  const today = getTodayEST();
  const weekStart = mondayOf(today);

  const [entry, plan, training, pnl, journal, writing] = await Promise.all([
    loadWeeklyEntry(userId, weekStart),
    loadDebtPlan(userId),
    trainingDays(userId, weekStart, today),
    weeklyPnl(userId, weekStart, today),
    journalDays(userId, weekStart, today),
    writingDays(userId, weekStart, today),
  ]);

  const prevBalance = plan && plan.entries.length > 0
    ? plan.entries.filter((e) => e.weekStart < weekStart).slice(-1)[0]?.balance ?? null
    : null;

  return {
    success: true,
    week: { start: weekStart, today },
    numbers: {
      cardBalance: entry.cardBalance ?? null,
      prevCardBalance: prevBalance,
      pnl: pnl.pnl,
      pnlTrades: pnl.trades,
      journal,
      training,
      writing,
    },
    debt: buildDebtPayload(plan, today),
  };
}

export async function GET() {
  const { userId, error } = await requireUserId();
  if (error) return error;

  try {
    return NextResponse.json(await buildResponse(userId));
  } catch (err) {
    console.error('Weekly review GET error:', err);
    return NextResponse.json({ success: false, error: 'Failed to load weekly review' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const { userId, error } = await requireUserId();
  if (error) return error;

  try {
    const body = (await request.json()) as { cardBalance?: number; startBalance?: number };
    const { cardBalance, startBalance } = body;

    for (const [name, v] of Object.entries({ cardBalance, startBalance })) {
      if (v !== undefined && (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 10_000_000)) {
        return NextResponse.json({ success: false, error: `${name} must be a non-negative number` }, { status: 400 });
      }
    }
    if (cardBalance === undefined && startBalance === undefined) {
      return NextResponse.json({ success: false, error: 'nothing to update' }, { status: 400 });
    }

    const redis = await getRedisClient();
    const today = getTodayEST();
    const weekStart = mondayOf(today);

    // Weekly entry (manual numbers)
    if (cardBalance !== undefined) {
      const entry = await loadWeeklyEntry(userId, weekStart);
      entry.cardBalance = cardBalance;
      entry.updatedAt = new Date().toISOString();
      await redis.set(reviewKey(userId, weekStart), JSON.stringify(entry));
    }

    // Debt plan: explicit start, or auto-seeded by the first balance entry
    let plan = await loadDebtPlan(userId);
    if (startBalance !== undefined) {
      plan = plan
        ? { ...plan, startBalance }
        : { startBalance, startDate: weekStart, entries: [] };
    }
    if (cardBalance !== undefined) {
      if (!plan) plan = { startBalance: cardBalance, startDate: weekStart, entries: [] };
      const idx = plan.entries.findIndex((e) => e.weekStart === weekStart);
      if (idx >= 0) plan.entries[idx] = { weekStart, balance: cardBalance };
      else plan.entries.push({ weekStart, balance: cardBalance });
      plan.entries.sort((a, b) => a.weekStart.localeCompare(b.weekStart));
      plan.entries = plan.entries.slice(-104); // two years of weekly history
    }
    if (plan) await redis.set(debtKey(userId), JSON.stringify(plan));

    return NextResponse.json(await buildResponse(userId));
  } catch (err) {
    console.error('Weekly review POST error:', err);
    return NextResponse.json({ success: false, error: 'Failed to save weekly review' }, { status: 500 });
  }
}
