import { NextRequest, NextResponse } from 'next/server';
import { requireOwner } from '@/lib/auth-session';
import { getRedisClient } from '@/lib/redis';
import { getNowInEST, getTodayInEST, isoWeekKey } from '@/lib/date-utils';
import {
  GoalsData,
  GoalsHistory,
  PeriodRecord,
  CATEGORIES,
  goalsKey,
  goalsHistoryKey,
} from '@/lib/goals/types';

/**
 * Owner-gated, history-backed insights for the Goals tab.
 *
 * KPIs/breakdowns the UI can derive from the main GET payload (active count,
 * completion rate, overdue, per-category %) are NOT duplicated here — this
 * endpoint only returns what needs the recurrence history: the weekly
 * completion trend and per-goal streaks. Kept off the hot main GET so editing
 * goals never pays for chart data.
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** The last `n` ISO weeks (oldest -> newest), each with its key and a short axis label. */
function lastNWeeks(n: number): { key: string; label: string }[] {
  const [ty, tm, td] = getTodayInEST().split('-').map(Number);
  const monday = new Date(Date.UTC(ty, tm - 1, td));
  const dow = monday.getUTCDay() || 7;
  monday.setUTCDate(monday.getUTCDate() - (dow - 1)); // Monday of the current EST week
  const weeks: { key: string; label: string }[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(monday);
    d.setUTCDate(monday.getUTCDate() - i * 7);
    const m = d.getUTCMonth() + 1;
    weeks.push({
      key: isoWeekKey(d.getUTCFullYear(), m, d.getUTCDate()),
      label: `${MONTHS[m - 1]} ${d.getUTCDate()}`,
    });
  }
  return weeks;
}

/** Map a period record (daily/weekly/monthly key) to the ISO week it falls in. */
function recordToIsoWeek(rec: PeriodRecord): string | null {
  const k = rec.periodKey;
  if (/^\d{4}-W\d{2}$/.test(k)) return k; // already weekly
  if (/^\d{4}-\d{2}-\d{2}$/.test(k)) {
    const [y, m, d] = k.split('-').map(Number);
    return isoWeekKey(y, m, d);
  }
  if (/^\d{4}-\d{2}$/.test(k)) {
    const [y, m] = k.split('-').map(Number);
    return isoWeekKey(y, m, 1); // monthly -> week containing the 1st
  }
  return null;
}

export async function GET(request: NextRequest) {
  const { userId, error } = await requireOwner();
  if (error) return error;

  const raw = new URL(request.url).searchParams.get('window');
  const parsed = raw == null ? NaN : Number(raw);
  const window = Number.isFinite(parsed) ? Math.min(26, Math.max(4, parsed)) : 12;

  const weeks = lastNWeeks(window);
  const buckets = weeks.map((w) => ({ periodKey: w.key, label: w.label, completed: 0, total: 0, rate: 0 }));
  const streaksByGoal: Record<string, { current: number; best: number }> = {};

  try {
    const redis = await getRedisClient();
    const [goalsRaw, historyRaw] = await Promise.all([
      redis.get(goalsKey(userId)),
      redis.get(goalsHistoryKey(userId)),
    ]);

    if (goalsRaw) {
      const goals = JSON.parse(goalsRaw) as GoalsData;
      for (const cat of CATEGORIES) {
        for (const g of goals[cat] ?? []) {
          if (g.streak) streaksByGoal[g.id] = { current: g.streak.current, best: g.streak.best };
        }
      }
    }

    if (historyRaw) {
      const history = JSON.parse(historyRaw) as GoalsHistory;
      const idxByKey = new Map(weeks.map((w, i) => [w.key, i]));
      for (const goalId of Object.keys(history)) {
        for (const rec of history[goalId]) {
          const wk = recordToIsoWeek(rec);
          if (wk == null) continue;
          const idx = idxByKey.get(wk);
          if (idx === undefined) continue;
          buckets[idx].total++;
          if (rec.completed) buckets[idx].completed++;
        }
      }
      for (const b of buckets) b.rate = b.total > 0 ? Math.round((b.completed / b.total) * 100) : 0;
    }
  } catch (err) {
    // Redis unavailable — return empty series so the panel still renders.
    console.error('Goals insights error:', err);
  }

  return NextResponse.json({
    success: true,
    generatedAt: getNowInEST(),
    trend: { period: 'weekly', buckets },
    streaksByGoal,
  });
}
