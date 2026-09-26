import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  isRunHabit, isExerciseHabit, isCardioHabit, isTrainingHabit, isJournalHabit,
  isTradeHabit, isTradeJournalHabit, isTradingJournalHabit, isWriteHabit,
  syncJournalHabitForEntry, clearJournalHabitForEntry, reconcileJournalHabits,
  syncTradingJournalHabitsForEntry, clearTradingJournalHabitsForEntry,
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

  it('leaves the Trade Journal habit to the Trading Journal', () => {
    expect(isJournalHabit({ id: 'trade-journal', name: 'Trade Journal' })).toBe(false);
    expect(isJournalHabit({ id: 'habit_9', name: 'Trading journal' })).toBe(false);
  });
});

describe('trading journal habit matchers', () => {
  it('matches Trade Journal by id or name', () => {
    expect(isTradeJournalHabit({ id: 'trade-journal', name: 'Anything' })).toBe(true);
    expect(isTradeJournalHabit({ id: 'habit_9', name: 'Trade Journal' })).toBe(true);
    expect(isTradeJournalHabit({ id: 'habit_9', name: 'Trading Journal 📓' })).toBe(true);
    expect(isTradeJournalHabit({ id: 'journal', name: 'Journal' })).toBe(false);
    expect(isTradeJournalHabit({ id: 'habit_9', name: 'Trade' })).toBe(false);
  });

  it('matches only a habit named exactly Trade / Trading', () => {
    expect(isTradeHabit({ id: 'trade', name: 'Anything' })).toBe(true);
    expect(isTradeHabit({ id: 'habit_1774143388698', name: 'Trade' })).toBe(true);
    expect(isTradeHabit({ id: 'habit_9', name: ' Trading 📈 ' })).toBe(true);
    expect(isTradeHabit({ id: 'habit_9', name: 'Trade Journal' })).toBe(false);
    expect(isTradeHabit({ id: 'habit_9', name: 'Review trade ideas' })).toBe(false);
    expect(isTradeHabit({ id: 'habit_9', name: 'Paper trading' })).toBe(false);
  });

  it('the combined matcher covers both and nothing else', () => {
    expect(isTradingJournalHabit({ id: 'habit_1', name: 'Trade' })).toBe(true);
    expect(isTradingJournalHabit({ id: 'trade-journal', name: 'Trade Journal' })).toBe(true);
    expect(isTradingJournalHabit({ id: 'journal', name: 'Journal' })).toBe(false);
    expect(isTradingJournalHabit({ id: 'market-brief', name: 'Read Market Brief, Stock Screeners' })).toBe(false);
  });
});

describe('write habit matcher', () => {
  it('matches only the Write habit, not other poetry habits', () => {
    expect(isWriteHabit({ id: 'write', name: 'Anything' })).toBe(true);
    expect(isWriteHabit({ id: 'habit_1782903411463', name: 'Write ' })).toBe(true);
    expect(isWriteHabit({ id: 'habit_9', name: '✍️ Writing' })).toBe(true);
    expect(isWriteHabit({ id: 'habit_1774143368558', name: 'Daily Poem ' })).toBe(false);
    expect(isWriteHabit({ id: 'habit_1788291997082', name: '@poetrybymjs post ' })).toBe(false);
    expect(isWriteHabit({ id: 'habit_9', name: 'Write in journal' })).toBe(false);
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
const tradingKey = (d: string) => `daily-journal:${USER}:${d}`;
const day = (d: string) => JSON.parse(store.get(dayKey(d)) ?? 'null') as HabitData[] | null;
const journalHabit = (d: string) => day(d)?.find(isJournalHabit);
const tradeHabit = (d: string) => day(d)?.find(isTradeHabit);
const tradeJournalHabit = (d: string) => day(d)?.find(isTradeJournalHabit);

function seedDay(d: string, journalDone = false, tradingDone = false) {
  store.set(dayKey(d), JSON.stringify([
    habit({ id: 'read', name: 'Read' }),
    { ...habit({ id: 'habit_77', name: 'Journal' }), completedToday: journalDone },
    { ...habit({ id: 'habit_88', name: 'Trade' }), completedToday: tradingDone },
    { ...habit({ id: 'trade-journal', name: 'Trade Journal' }), completedToday: tradingDone },
  ]));
}
function seedEntry(d: string, answer: string) {
  hashes.set(journalKey(d), { prompts: JSON.stringify([{ id: 'mood', question: 'Mood?', answer }]) });
}
function seedTradingEntry(d: string, answer: string) {
  hashes.set(tradingKey(d), { prompts: JSON.stringify([{ id: 'plan', question: 'Followed plan?', answer }]) });
}
const answered = [{ id: 'mood', question: 'Mood?', answer: 'good' }];
const blank = [{ id: 'mood', question: 'Mood?', answer: '  ' }];

beforeEach(() => {
  store.clear();
  hashes.clear();
  store.set(`habits_list:${USER}`, JSON.stringify([
    { id: 'read', name: 'Read', icon: '📚', order: 0 },
    { id: 'habit_77', name: 'Journal', icon: '📝', order: 1 },
    { id: 'habit_88', name: 'Trade', icon: '📈', order: 2 },
    { id: 'trade-journal', name: 'Trade Journal', icon: '📓', order: 3 },
  ]));
});

describe('syncJournalHabitForEntry', () => {
  it('credits the Journal habit for a backdated entry, not just today', async () => {
    seedDay('2026-09-11');
    expect(await syncJournalHabitForEntry(USER, '2026-09-11', answered, '2026-09-12')).toBe('completed');
    expect(journalHabit('2026-09-11')?.completedToday).toBe(true);
    expect(day('2026-09-11')?.find((h) => h.id === 'read')?.completedToday).toBe(false);
    expect(tradeHabit('2026-09-11')?.completedToday).toBe(false);
    expect(tradeJournalHabit('2026-09-11')?.completedToday).toBe(false);
  });

  it('seeds a day that was never opened from the saved habit list', async () => {
    expect(day('2026-09-10')).toBeNull();
    expect(await syncJournalHabitForEntry(USER, '2026-09-10', answered, '2026-09-12')).toBe('completed');
    expect(day('2026-09-10')?.map((h) => h.id)).toEqual(['read', 'habit_77', 'habit_88', 'trade-journal']);
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

describe('syncTradingJournalHabitsForEntry', () => {
  it('credits Trade and Trade Journal, and only those, for the entry date', async () => {
    seedDay('2026-09-11');
    expect(await syncTradingJournalHabitsForEntry(USER, '2026-09-11', answered, '2026-09-12')).toBe('completed');
    expect(tradeHabit('2026-09-11')?.completedToday).toBe(true);
    expect(tradeJournalHabit('2026-09-11')?.completedToday).toBe(true);
    expect(journalHabit('2026-09-11')?.completedToday).toBe(false);
    expect(day('2026-09-11')?.find((h) => h.id === 'read')?.completedToday).toBe(false);
  });

  it('seeds a never-opened day and ignores future dates', async () => {
    expect(await syncTradingJournalHabitsForEntry(USER, '2026-09-10', answered, '2026-09-12')).toBe('completed');
    expect(tradeHabit('2026-09-10')?.completedToday).toBe(true);
    expect(tradeJournalHabit('2026-09-10')?.completedToday).toBe(true);
    expect(await syncTradingJournalHabitsForEntry(USER, '2026-09-13', answered, '2026-09-12')).toBe('unchanged');
    expect(day('2026-09-13')).toBeNull();
  });

  it('is a no-op when already complete, and reverts on a blank entry', async () => {
    seedDay('2026-09-11', false, true);
    expect(await syncTradingJournalHabitsForEntry(USER, '2026-09-11', answered, '2026-09-12')).toBe('unchanged');
    expect(await syncTradingJournalHabitsForEntry(USER, '2026-09-11', blank, '2026-09-12')).toBe('uncompleted');
    expect(tradeHabit('2026-09-11')?.completedToday).toBe(false);
    expect(tradeJournalHabit('2026-09-11')?.completedToday).toBe(false);
  });
});

describe('clearTradingJournalHabitsForEntry', () => {
  it('un-completes Trade and Trade Journal but leaves Journal alone', async () => {
    seedDay('2026-09-11', true, true);
    expect((await clearTradingJournalHabitsForEntry(USER, '2026-09-11')).sort()).toEqual(['habit_88', 'trade-journal']);
    expect(tradeHabit('2026-09-11')?.completedToday).toBe(false);
    expect(tradeJournalHabit('2026-09-11')?.completedToday).toBe(false);
    expect(journalHabit('2026-09-11')?.completedToday).toBe(true);
  });
});

describe('reconcileJournalHabits', () => {
  it('credits each journal\'s habits independently across the window', async () => {
    seedDay('2026-09-09');                 // trading entry only → Trade + Trade Journal
    seedTradingEntry('2026-09-09', 'yes');
    seedDay('2026-09-10');                 // both entries → all three
    seedEntry('2026-09-10', 'ok');
    seedTradingEntry('2026-09-10', 'yes');
    seedTradingEntry('2026-09-11', 'yes'); // never opened → seeded + trading habits only
    seedDay('2026-09-12', false, true);    // already in step → untouched

    seedTradingEntry('2026-09-12', 'yes');

    const flipped = await reconcileJournalHabits(USER, ['2026-09-09', '2026-09-10', '2026-09-11', '2026-09-12']);
    expect(flipped).toEqual(['2026-09-09', '2026-09-10', '2026-09-11']);
    expect(tradeHabit('2026-09-09')?.completedToday).toBe(true);
    expect(tradeJournalHabit('2026-09-09')?.completedToday).toBe(true);
    expect(journalHabit('2026-09-09')?.completedToday).toBe(false);
    expect(journalHabit('2026-09-10')?.completedToday).toBe(true);
    expect(tradeHabit('2026-09-10')?.completedToday).toBe(true);
    expect(journalHabit('2026-09-11')?.completedToday).toBe(false);
    expect(tradeJournalHabit('2026-09-11')?.completedToday).toBe(true);
  });

  it('marks every date in the window that has a Daily Journal entry with content', async () => {
    seedDay('2026-09-09');           // entry with content, habit unchecked → flip
    seedEntry('2026-09-09', 'ok');
    seedDay('2026-09-10', true);     // already in step → untouched
    seedEntry('2026-09-10', 'ok');
    seedEntry('2026-09-11', 'ok');   // day never opened → seeded + flipped
    seedDay('2026-09-12');           // blank entry → nothing
    seedEntry('2026-09-12', '');

    const flipped = await reconcileJournalHabits(USER, ['2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11', '2026-09-12']);
    expect(flipped).toEqual(['2026-09-09', '2026-09-11']);
    expect(journalHabit('2026-09-09')?.completedToday).toBe(true);
    expect(journalHabit('2026-09-11')?.completedToday).toBe(true);
    expect(journalHabit('2026-09-12')?.completedToday).toBe(false);
    expect(day('2026-09-08')).toBeNull(); // no entry → no day created
  });
});
