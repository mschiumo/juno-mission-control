/**
 * Recurring Goals Reset Cron
 *
 * Runs daily at 05:05 UTC (~00:05 EST / 01:05 EDT — just after the local
 * day/week/month boundary) and rolls over the owner's recurring goals:
 *   - daily goals roll every day, weekly on Monday, monthly on the 1st.
 *   - when a goal's period changes, the closed period is recorded to
 *     goals_history (completed = was it 'achieved'?), the streak is updated by
 *     period-adjacency, and the goal resets to Todo for the new period.
 *
 * Idempotent: rollover only fires when the current period key differs from the
 * goal's stored lastPeriodKey, so a double-run or same-day re-run is a no-op.
 * One daily run covers all cadences — the period key is self-describing.
 *
 * Auth: /api/cron-jobs/* is gated by CRON_SECRET in middleware.ts; Vercel sends
 * "Authorization: Bearer <CRON_SECRET>" automatically. No in-route check needed.
 */

import { NextResponse } from 'next/server';
import { getRedisClient } from '@/lib/redis';
import { getUserByEmail } from '@/lib/db/users';
import { OWNER_EMAIL } from '@/lib/owner';
import { logToActivityLog, postToCronResults } from '@/lib/cron-helpers';
import { getNowInEST, getPeriodKey, previousPeriodKey, type PeriodRecurrence } from '@/lib/date-utils';
import {
  GoalsData,
  GoalsHistory,
  PeriodRecord,
  CATEGORIES,
  goalsKey,
  goalsHistoryKey,
  HISTORY_CAP,
} from '@/lib/goals/types';

export const dynamic = 'force-dynamic';

export async function GET() {
  const startTime = Date.now();

  try {
    const user = await getUserByEmail(OWNER_EMAIL);
    if (!user) {
      const msg = `Owner account not found: ${OWNER_EMAIL}`;
      console.error(`[ResetRecurringGoals] ${msg}`);
      await logToActivityLog('Goals Reset Failed', msg, 'cron');
      return NextResponse.json({ success: false, error: msg }, { status: 404 });
    }

    const userId = user.id;
    const redis = await getRedisClient();

    const goalsRaw = await redis.get(goalsKey(userId));
    if (!goalsRaw) {
      return NextResponse.json({ success: true, skipped: true, reason: 'No goals stored' });
    }
    const goals: GoalsData = JSON.parse(goalsRaw);
    const historyRaw = await redis.get(goalsHistoryKey(userId));
    const history: GoalsHistory = historyRaw ? JSON.parse(historyRaw) : {};

    const nowEST = getNowInEST();
    let rolled = 0;
    let initialized = 0;
    const rolledTitles: string[] = [];

    for (const cat of CATEGORIES) {
      for (const goal of goals[cat]) {
        if (!goal.recurrence || goal.recurrence === 'none') continue;
        const cadence = goal.recurrence as PeriodRecurrence;
        const current = getPeriodKey(cadence);

        // First time we see this recurring goal: pin bookkeeping to the current
        // period so it doesn't false-trigger a rollover.
        if (!goal.lastPeriodKey) {
          goal.lastPeriodKey = current;
          if (!goal.streak) goal.streak = { current: 0, best: 0 };
          initialized++;
          continue;
        }

        if (goal.lastPeriodKey === current) continue; // no rollover (idempotent)

        // ── Rollover: close out the previous period ──
        const closedKey = goal.lastPeriodKey;
        const completed = goal.phase === 'achieved';

        const list = history[goal.id] ?? [];
        if (!list.some((r) => r.periodKey === closedKey)) {
          const rec: PeriodRecord = {
            periodKey: closedKey,
            completed,
            value: goal.target?.current,
            recordedAt: nowEST,
          };
          list.push(rec);
          if (list.length > HISTORY_CAP) list.splice(0, list.length - HISTORY_CAP);
          history[goal.id] = list;
        }

        // Streak via period adjacency (a missed period breaks the chain).
        const streak = goal.streak ?? { current: 0, best: 0 };
        if (completed) {
          const expectedPrev = previousPeriodKey(cadence, closedKey);
          streak.current = streak.lastCompletedPeriodKey === expectedPrev ? streak.current + 1 : 1;
          streak.lastCompletedPeriodKey = closedKey;
        } else {
          streak.current = 0;
        }
        streak.best = Math.max(streak.best ?? 0, streak.current);
        goal.streak = streak;

        // Reset for the new period (mutate only recurrence-owned fields).
        goal.phase = 'not-started';
        if (goal.target) goal.target.current = 0;
        delete goal.completedAt;
        goal.lastPeriodKey = current;

        rolled++;
        rolledTitles.push(goal.title);
      }
    }

    if (rolled > 0 || initialized > 0) {
      await redis.set(goalsKey(userId), JSON.stringify(goals));
      if (rolled > 0) await redis.set(goalsHistoryKey(userId), JSON.stringify(history));
    }

    const summary =
      `Reset ${rolled} recurring goal(s)` +
      (rolled ? `: ${rolledTitles.join(', ')}` : '') +
      (initialized ? ` · initialized ${initialized}` : '');
    console.log(`[ResetRecurringGoals] ${summary}`);
    if (rolled > 0) {
      await logToActivityLog('Goals Reset', summary, 'cron');
      await postToCronResults('Goals Reset', summary, 'check-in');
    }

    return NextResponse.json({
      success: true,
      account: OWNER_EMAIL,
      rolled,
      initialized,
      durationMs: Date.now() - startTime,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[ResetRecurringGoals] Error:', msg);
    await logToActivityLog('Goals Reset Failed', msg, 'cron');
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
