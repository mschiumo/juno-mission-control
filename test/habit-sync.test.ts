import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  isRunHabit, isExerciseHabit, isCardioHabit, isTrainingHabit, isJournalHabit,
  syncJournalHabitForEntry, clearJournalHabitForEntry, reconcileJournalHabit,
} from '@/lib/habit-sync';
import type { HabitData } from '@/lib/habit-sync';

function habit(partial: Pick<HabitData, 'id' | 'name'>): HabitData {
  return { icon: '💪', completedToday: false, streak: 0, history: [], ...partial };
}

describe('habit matchers', () => {
  it('matches cardio habits by id or name', () => {
    expect(isCardioHabit(habit({ id: 'cardio', name: 'Anything' }))).toBe(true);
    expect(isCardioHabit(habit({ id: 'habit_123', name: 'Cardio' }))).toBe(true);
    expect(isCardioHabit(habit({ id: 'habit_123', name: 'Morning cardio session' }))).toBe(true);
    expect(isCardioHabit(habit({ id: 'exercise', name: 'Exercise' }))).toBe(false);
    expect(isCardioHabit(habit({ id: 'run', name: 'Run' }))).toBe(false);
  });

  it('cardio habits do not accidentally match exercise or run rules', () => {
    const cardio = habit({ id: 'habit_123', name: 'Cardio' });
    expect(isExerciseHabit(cardio)).toBe(false);
    expect(isRunHabit(cardio)).toBe(false);
  });

  it('matches run habits by id or name', () => {
    expect(isRunHabit(habit({ id: 'run', name: 'X' }))).toBe(true);
    expect(isRunHabit(habit({ id: 'habit_1', name: 'Morning run' }))).toBe(true);
    expect(isRunHabit(habit({ id: 'habit_1', name: 'Brunch' }))).toBe(false);
  });

  it('matches exercise habits by id or name', () => {
    expect(isExerciseHabit(habit({ id: 'exercise', name: 'X' }))).toBe(true);
    expect(isExerciseHabit(habit({ id: 'habit_1', name: 'Lift' }))).toBe(true);
    expect(isExerciseHabit(habit({ id: 'habit_1', name: 'Work out' }))).toBe(true);
    expect(isExerciseHabit(habit({ id: 'habit_1', name: 'Read' }))).toBe(false);
  });

  it('training matcher covers all workout-style habits for the scoreboard', () => {
    for (const name of ['Cardio', 'Lift', 'Exercise', 'Run', 'Gym']) {
      expect(isTrainingHabit({ id: 'habit_x', name })).toBe(true);
    }
    expect(isTrainingHabit({ id: 'habit_x', name: 'Journal' })).toBe(false);
  });
});

describe('journal habit matcher', () => {
  it('matches the seeded id or any habit named like a journal', () => {
    expect(isJournalHabit({ id: 'journal', name: 'Anything' })).toBe(true);
    expect(isJournalHabit({ id: 'habit_9', name: 'Journal' })).toBe(true);
    expect(isJournalHabit({ id: 'habit_9', name: 'Evening journaling' })).toBe(true);
    expect(isJournalHabit({ id: 'read', name: 'Read' })).toBe(false);
  });
});

// ── Daily Journal ↔ Journal habit sync (fake Redis) ─────────────────────────

const store = new Map<string, string>();
const hashes = new Map<string, Record<string, string>>();

vi.mock('@/lib/redis', () => ({
  getRedisClient: async () => ({
    get: async (k: string) => store.get(k) ?? null,
    set: async (k: string, v: string) => { store.set(k, v); },
    multi: () => {
      const ops: Array<() => string | null> = [];
      return {
        hGet: (k: string, f: string) => { ops.push(() => hashes.get(k)?.[f] ?? null); },
        exec: async () => ops.map((op) => op()),
      };
    },
  }),
}));

const USER = 'u1';
const dayKey = (d: string) => `habits_data:${USER}:${d}`;
const journalKey = (d: string) => `personal-journal:${USER}:${d}`;
const day = (d: string) => JSON.parse(store.get(dayKey(d)) ?? 'null') as HabitData[] | null;
const journalHabit = (d: string) => day(d)?.find(isJournalHabit);

function seedDay(d: string, journalDone = false) {
  store.set(dayKey(d), JSON.stringify([
    habit({ id: 'read', name: 'Read' }),
    { ...habit({ id: 'habit_77', name: 'Journal' }), completedToday: journalDone },
  ]));
}
function seedEntry(d: string, answer: string) {
  hashes.set(journalKey(d), { prompts: JSON.stringify([{ id: 'mood', question: 'Mood?', answer }]) });
}
const answered = [{ id: 'mood', question: 'Mood?', answer: 'good' }];
const blank = [{ id: 'mood', question: 'Mood?', answer: '  ' }];

beforeEach(() => {
  store.clear();
  hashes.clear();
  store.set(`habits_list:${USER}`, JSON.stringify([
    { id: 'read', name: 'Read', icon: '📚', order: 0 },
    { id: 'habit_77', name: 'Journal', icon: '📝', order: 1 },
  ]));
});

describe('syncJournalHabitForEntry', () => {
  it('credits the Journal habit for a backdated entry, not just today', async () => {
    seedDay('2026-09-11');
    expect(await syncJournalHabitForEntry(USER, '2026-09-11', answered, '2026-09-12')).toBe('completed');
    expect(journalHabit('2026-09-11')?.completedToday).toBe(true);
    expect(day('2026-09-11')?.find((h) => h.id === 'read')?.completedToday).toBe(false);
  });

  it('seeds a day that was never opened from the saved habit list', async () => {
    expect(day('2026-09-10')).toBeNull();
    expect(await syncJournalHabitForEntry(USER, '2026-09-10', answered, '2026-09-12')).toBe('completed');
    expect(day('2026-09-10')?.map((h) => h.id)).toEqual(['read', 'habit_77']);
    expect(journalHabit('2026-09-10')?.completedToday).toBe(true);
  });

  it('ignores future and malformed dates', async () => {
    expect(await syncJournalHabitForEntry(USER, '2026-09-13', answered, '2026-09-12')).toBe('unchanged');
    expect(await syncJournalHabitForEntry(USER, '09/11/2026', answered, '2026-09-12')).toBe('unchanged');
    expect(store.size).toBe(1); // only the habits list
  });

  it('is a no-op when already complete, and reverts when the entry is blanked out', async () => {
    seedDay('2026-09-11', true);
    expect(await syncJournalHabitForEntry(USER, '2026-09-11', answered, '2026-09-12')).toBe('unchanged');
    expect(await syncJournalHabitForEntry(USER, '2026-09-11', blank, '2026-09-12')).toBe('uncompleted');
    expect(journalHabit('2026-09-11')?.completedToday).toBe(false);
  });
});

describe('clearJournalHabitForEntry', () => {
  it('un-completes only the Journal habit for that date', async () => {
    store.set(dayKey('2026-09-11'), JSON.stringify([
      { ...habit({ id: 'read', name: 'Read' }), completedToday: true },
      { ...habit({ id: 'habit_77', name: 'Journal' }), completedToday: true },
    ]));
    expect(await clearJournalHabitForEntry(USER, '2026-09-11')).toEqual(['habit_77']);
    expect(journalHabit('2026-09-11')?.completedToday).toBe(false);
    expect(day('2026-09-11')?.find((h) => h.id === 'read')?.completedToday).toBe(true);
  });
});

describe('reconcileJournalHabit', () => {
  it('marks every date in the window that has an entry with content', async () => {
    seedDay('2026-09-09');           // entry with content, habit unchecked → flip
    seedEntry('2026-09-09', 'ok');
    seedDay('2026-09-10', true);     // already in step → untouched
    seedEntry('2026-09-10', 'ok');
    seedEntry('2026-09-11', 'ok');   // day never opened → seeded + flipped
    seedDay('2026-09-12');           // blank entry → nothing
    seedEntry('2026-09-12', '');

    const flipped = await reconcileJournalHabit(USER, ['2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11', '2026-09-12']);
    expect(flipped).toEqual(['2026-09-09', '2026-09-11']);
    expect(journalHabit('2026-09-09')?.completedToday).toBe(true);
    expect(journalHabit('2026-09-11')?.completedToday).toBe(true);
    expect(journalHabit('2026-09-12')?.completedToday).toBe(false);
    expect(day('2026-09-08')).toBeNull(); // no entry → no day created
  });
});
