import { describe, it, expect } from 'vitest';
import { isRunHabit, isExerciseHabit, isCardioHabit, isTrainingHabit } from '@/lib/habit-sync';
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
