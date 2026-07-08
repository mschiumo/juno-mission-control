import { NextRequest, NextResponse } from 'next/server';
import { getRedisClient } from '@/lib/redis';
import { requireUserId } from '@/lib/auth-session';
import { completeMatchingHabits, uncompleteHabits, isExerciseHabit } from '@/lib/habit-sync';

// Rotating workout split. The pointer advances one group per completed
// workout (not per calendar day), so a missed day just keeps the same group
// up next — the order is what matters.

const DEFAULT_GROUPS = ['Chest', 'Biceps', 'Triceps', 'Back', 'Shoulders'];

interface WorkoutState {
  index: number; // which group is up next
  lastCompletedDate: string | null; // YYYY-MM-DD of most recent completion
  // habitIds = habits this completion auto-checked, so undo only reverts
  // what we flipped (never a habit checked manually or by Strava sync).
  history: { date: string; group: string; habitIds?: string[] }[]; // most recent last, capped
  groups?: string[]; // custom rotation; absent = DEFAULT_GROUPS
}

const HISTORY_CAP = 60;
const MAX_GROUPS = 12;
const MAX_GROUP_LENGTH = 40;

// Trim, drop empties, dedupe (case-insensitive, first occurrence wins), cap
// count and length. Returns null when nothing usable remains.
function sanitizeGroups(input: unknown): string[] | null {
  if (!Array.isArray(input)) return null;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of input) {
    if (typeof item !== 'string') continue;
    const name = item.trim().slice(0, MAX_GROUP_LENGTH);
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    out.push(name);
    if (out.length >= MAX_GROUPS) break;
  }
  return out.length > 0 ? out : null;
}

function stateKey(userId: string) {
  return `workout_schedule:${userId}`;
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

async function loadState(userId: string): Promise<WorkoutState> {
  const redis = await getRedisClient();
  const raw = await redis.get(stateKey(userId));
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as WorkoutState;
      if (typeof parsed.index === 'number') {
        const groups = sanitizeGroups(parsed.groups) ?? DEFAULT_GROUPS;
        return {
          index: ((parsed.index % groups.length) + groups.length) % groups.length,
          lastCompletedDate: parsed.lastCompletedDate ?? null,
          history: Array.isArray(parsed.history) ? parsed.history : [],
          groups,
        };
      }
    } catch {
      /* fall through to fresh state */
    }
  }
  return { index: 0, lastCompletedDate: null, history: [], groups: DEFAULT_GROUPS };
}

function groupsOf(state: WorkoutState): string[] {
  return state.groups ?? DEFAULT_GROUPS;
}

async function saveState(userId: string, state: WorkoutState): Promise<void> {
  const redis = await getRedisClient();
  await redis.set(stateKey(userId), JSON.stringify(state));
}

function serialize(state: WorkoutState, today: string) {
  const groups = groupsOf(state);
  return {
    success: true,
    groups,
    nextIndex: state.index,
    nextGroup: groups[state.index],
    completedToday: state.lastCompletedDate === today,
    todayGroup: state.lastCompletedDate === today ? state.history[state.history.length - 1]?.group ?? null : null,
    lastCompletedDate: state.lastCompletedDate,
    recent: state.history.slice(-7),
  };
}

export async function GET() {
  const { userId, error } = await requireUserId();
  if (error) return error;

  try {
    const state = await loadState(userId);
    return NextResponse.json(serialize(state, getTodayEST()));
  } catch (err) {
    console.error('Workout schedule GET error:', err);
    return NextResponse.json({ success: false, error: 'Failed to load workout schedule' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const { userId, error } = await requireUserId();
  if (error) return error;

  try {
    const { action, groups: rawGroups } = (await request.json()) as { action?: string; groups?: unknown };
    const today = getTodayEST();
    const state = await loadState(userId);
    const groups = groupsOf(state);

    let completedHabits: { id: string; name: string; icon: string }[] = [];

    if (action === 'complete') {
      if (state.lastCompletedDate !== today) {
        // A logged workout checks off the Exercise/Lift habit too.
        completedHabits = await completeMatchingHabits(userId, today, isExerciseHabit);
        state.history.push({
          date: today,
          group: groups[state.index],
          ...(completedHabits.length > 0 ? { habitIds: completedHabits.map((h) => h.id) } : {}),
        });
        if (state.history.length > HISTORY_CAP) state.history = state.history.slice(-HISTORY_CAP);
        state.lastCompletedDate = today;
        state.index = (state.index + 1) % groups.length;
        await saveState(userId, state);
      }
    } else if (action === 'undo') {
      if (state.lastCompletedDate === today && state.history.length > 0) {
        const entry = state.history.pop();
        state.index = (state.index - 1 + groups.length) % groups.length;
        state.lastCompletedDate = state.history[state.history.length - 1]?.date ?? null;
        await saveState(userId, state);
        // Revert only the habits this completion flipped.
        await uncompleteHabits(userId, today, entry?.habitIds ?? []);
      }
    } else if (action === 'skip') {
      // Move past the up-next group without logging a workout.
      state.index = (state.index + 1) % groups.length;
      await saveState(userId, state);
    } else if (action === 'setGroups') {
      const next = sanitizeGroups(rawGroups);
      if (!next) {
        return NextResponse.json({ success: false, error: 'groups must be a non-empty array of names' }, { status: 400 });
      }
      // Keep pointing at the same up-next group when it survives the edit;
      // otherwise clamp so the pointer stays in range.
      const keep = next.indexOf(groups[state.index]);
      state.index = keep >= 0 ? keep : Math.min(state.index, next.length - 1);
      state.groups = next;
      await saveState(userId, state);
    } else {
      return NextResponse.json({ success: false, error: 'action must be complete, undo, skip, or setGroups' }, { status: 400 });
    }

    return NextResponse.json({ ...serialize(state, today), completedHabits });
  } catch (err) {
    console.error('Workout schedule POST error:', err);
    return NextResponse.json({ success: false, error: 'Failed to update workout schedule' }, { status: 500 });
  }
}
