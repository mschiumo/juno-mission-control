import { getRedisClient } from '@/lib/redis';
import { hasJournalContent, hasJournalContentRaw } from '@/lib/journal-content';
import type { JournalPrompt } from '@/lib/journal-prompts';

// Shared helpers for marking habits complete from other surfaces (Strava
// sync, Workout Split, the Dashboard Daily Journal, the Trading Journal). Habit ids aren't stable
// slugs (the list was seeded once and users add their own), so matching is by
// id OR name.

export interface HabitData {
  id: string;
  name: string;
  icon: string;
  completedToday: boolean;
  streak: number;
  history: boolean[];
  paused?: boolean;
  [key: string]: unknown;
}

function habitsKey(userId: string, date: string) {
  return `habits_data:${userId}:${date}`;
}

function habitsListKey(userId: string) {
  return `habits_list:${userId}`;
}

function personalJournalKey(userId: string, date: string) {
  return `personal-journal:${userId}:${date}`;
}

function tradingJournalKey(userId: string, date: string) {
  return `daily-journal:${userId}:${date}`;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isRunHabit(h: HabitData): boolean {
  return h.id === 'run' || h.id === 'ran' || /\brun/i.test(h.name);
}

export function isExerciseHabit(h: HabitData): boolean {
  return h.id === 'exercise' || /exercise|work\s?out|lift|gym|train/i.test(h.name);
}

export function isCardioHabit(h: HabitData): boolean {
  return h.id === 'cardio' || /cardio/i.test(h.name);
}

/** The "Trade Journal" habit — earned by writing the day's Trading Journal entry. */
export function isTradeJournalHabit(h: Pick<HabitData, 'id' | 'name'>): boolean {
  return h.id === 'trade-journal' || /trad(e|ing)\s*journal/i.test(h.name);
}

/**
 * The "Trade" habit — a habit named exactly Trade / Trading (emoji and
 * punctuation ignored). Deliberately narrow so it can't swallow "Trade
 * Journal" or something like "Review trade ideas".
 */
export function isTradeHabit(h: Pick<HabitData, 'id' | 'name'>): boolean {
  if (h.id === 'trade') return true;
  const words = h.name.toLowerCase().replace(/[^a-z]+/g, ' ').trim();
  return words === 'trade' || words === 'trading';
}

/** Habits the Trading Journal completes: Trade + Trade Journal. */
export function isTradingJournalHabit(h: Pick<HabitData, 'id' | 'name'>): boolean {
  return isTradeHabit(h) || isTradeJournalHabit(h);
}

/**
 * The "Journal" habit, earned by the Dashboard Daily Journal. "Trade Journal"
 * also contains the word, but it belongs to the Trading Journal, so it is
 * excluded here.
 */
export function isJournalHabit(h: Pick<HabitData, 'id' | 'name'>): boolean {
  if (isTradeJournalHabit(h)) return false;
  return h.id === 'journal' || /journal/i.test(h.name);
}

// Anything that counts as a training session for the Weekly Scoreboard:
// Lift / Cardio / Exercise / Run-style habits, by id or name.
export function isTrainingHabit(h: Pick<HabitData, 'id' | 'name'>): boolean {
  return (
    ['exercise', 'lift', 'cardio', 'run'].includes(h.id) ||
    /lift|cardio|exercise|work\s?out|gym|train|\brun/i.test(h.name)
  );
}

export function streakWith(completed: boolean, history: boolean[]): number {
  let streak = completed ? 1 : 0;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i]) streak++;
    else break;
  }
  return streak;
}

/**
 * A day's habit rows, or — when `createDay` is set and the day was never
 * opened — a fresh set built from the user's saved habit list so a past day
 * can still be credited (e.g. a backdated journal entry). Streak/history on a
 * seeded day are placeholders: the habit-status API recomputes both from the
 * surrounding days on every read.
 */
async function loadDay(
  redis: Awaited<ReturnType<typeof getRedisClient>>,
  userId: string,
  date: string,
  createDay: boolean
): Promise<HabitData[] | null> {
  const stored = await redis.get(habitsKey(userId, date));
  if (stored) return JSON.parse(stored);
  if (!createDay) return null;

  const list = await redis.get(habitsListKey(userId));
  if (!list) return null;
  const defs: Array<Pick<HabitData, 'id' | 'name' | 'icon'> & Record<string, unknown>> = JSON.parse(list);
  if (!Array.isArray(defs) || defs.length === 0) return null;

  return defs.map((h) => ({
    ...h,
    completedToday: false,
    streak: 0,
    history: [false, false, false, false, false, false, false],
  }));
}

/**
 * Mark all not-yet-completed habits matching `match` as complete for `date`.
 * Returns the habits that were actually flipped (empty when none matched or
 * no habit data exists for the day — unless `createDay` seeds it).
 */
export async function completeMatchingHabits(
  userId: string,
  date: string,
  match: (h: HabitData) => boolean,
  { createDay = false }: { createDay?: boolean } = {}
): Promise<{ id: string; name: string; icon: string }[]> {
  const redis = await getRedisClient();
  const habits = await loadDay(redis, userId, date, createDay);
  if (!habits) return [];

  const flipped: { id: string; name: string; icon: string }[] = [];
  for (const h of habits) {
    // Paused habits are neither completable nor tracked (same rule as the
    // manual toggle in /api/habit-status).
    if (h.completedToday || h.paused || !match(h)) continue;
    h.completedToday = true;
    h.streak = streakWith(true, h.history);
    flipped.push({ id: h.id, name: h.name, icon: h.icon });
  }
  if (flipped.length > 0) {
    await redis.set(habitsKey(userId, date), JSON.stringify(habits));
  }
  return flipped;
}

/**
 * Un-complete the given habit ids for `date` (used to revert an auto-complete
 * when its source action is undone). Only flips habits that are currently
 * completed; returns the ids actually flipped.
 */
export async function uncompleteHabits(userId: string, date: string, habitIds: string[]): Promise<string[]> {
  if (habitIds.length === 0) return [];
  const redis = await getRedisClient();
  const stored = await redis.get(habitsKey(userId, date));
  if (!stored) return [];

  const habits: HabitData[] = JSON.parse(stored);
  const ids = new Set(habitIds);
  const flipped: string[] = [];
  for (const h of habits) {
    if (!ids.has(h.id) || !h.completedToday) continue;
    h.completedToday = false;
    h.streak = streakWith(false, h.history);
    flipped.push(h.id);
  }
  if (flipped.length > 0) {
    await redis.set(habitsKey(userId, date), JSON.stringify(habits));
  }
  return flipped;
}

/** Un-complete every completed habit matching `match` for `date`; returns the ids flipped. */
export async function uncompleteMatchingHabits(
  userId: string,
  date: string,
  match: (h: HabitData) => boolean
): Promise<string[]> {
  const redis = await getRedisClient();
  const stored = await redis.get(habitsKey(userId, date));
  if (!stored) return [];
  const habits: HabitData[] = JSON.parse(stored);
  return uncompleteHabits(userId, date, habits.filter(match).map((h) => h.id));
}

// ── Journals ↔ habits ───────────────────────────────────────────────────────
//
// Two journals each own a set of habits, and each journal is the source of
// truth for its habits:
//   • Dashboard Daily Journal (personal-journal:) → "Journal"
//   • Trading Journal (daily-journal:)            → "Trade" + "Trade Journal"
// An entry with content on a date means those habits are done for that date,
// whether the entry was written that day or backdated later. Two paths keep
// them in step — each journal API syncs on every save/delete, and the habit
// API reconciles its lookback window on read so an entry can never be missed.

interface JournalSource {
  key: (userId: string, date: string) => string;
  match: (h: Pick<HabitData, 'id' | 'name'>) => boolean;
}

const PERSONAL_JOURNAL: JournalSource = { key: personalJournalKey, match: isJournalHabit };
const TRADING_JOURNAL: JournalSource = { key: tradingJournalKey, match: isTradingJournalHabit };
const JOURNAL_SOURCES: JournalSource[] = [PERSONAL_JOURNAL, TRADING_JOURNAL];

/**
 * Credit a journal's habits for `date` after an entry was saved (or revert
 * them when the saved entry has no content). `date` must be a `YYYY-MM-DD`
 * on or before `today` (ET) — future entries and malformed dates are ignored
 * rather than creating habit days.
 */
async function syncSourceForEntry(
  source: JournalSource,
  userId: string,
  date: string,
  prompts: unknown,
  today: string
): Promise<'completed' | 'uncompleted' | 'unchanged'> {
  if (!ISO_DATE.test(date) || date > today) return 'unchanged';
  if (hasJournalContent(prompts)) {
    const flipped = await completeMatchingHabits(userId, date, source.match, { createDay: true });
    return flipped.length > 0 ? 'completed' : 'unchanged';
  }
  const flipped = await uncompleteMatchingHabits(userId, date, source.match);
  return flipped.length > 0 ? 'uncompleted' : 'unchanged';
}

/** Credit the Journal habit for `date` after a Daily Journal entry was saved. */
export function syncJournalHabitForEntry(
  userId: string,
  date: string,
  prompts: JournalPrompt[] | undefined,
  today: string
): Promise<'completed' | 'uncompleted' | 'unchanged'> {
  return syncSourceForEntry(PERSONAL_JOURNAL, userId, date, prompts, today);
}

/** Revert the Journal habit for `date` when its Daily Journal entry is deleted. */
export async function clearJournalHabitForEntry(userId: string, date: string): Promise<string[]> {
  if (!ISO_DATE.test(date)) return [];
  return uncompleteMatchingHabits(userId, date, isJournalHabit);
}

/** Credit the Trade + Trade Journal habits for `date` after a Trading Journal entry was saved. */
export function syncTradingJournalHabitsForEntry(
  userId: string,
  date: string,
  prompts: unknown,
  today: string
): Promise<'completed' | 'uncompleted' | 'unchanged'> {
  return syncSourceForEntry(TRADING_JOURNAL, userId, date, prompts, today);
}

/** Revert the Trade + Trade Journal habits for `date` when its Trading Journal entry is deleted. */
export async function clearTradingJournalHabitsForEntry(userId: string, date: string): Promise<string[]> {
  if (!ISO_DATE.test(date)) return [];
  return uncompleteMatchingHabits(userId, date, isTradingJournalHabit);
}

/**
 * Make sure every date in `dates` that has a journal entry with content also
 * has that journal's habits marked complete (seeding the day if it was never
 * opened). Covers both journals. Returns the dates that were flipped. One
 * round trip to find the entries, then a write only for dates that are
 * actually out of step.
 */
export async function reconcileJournalHabits(userId: string, dates: string[]): Promise<string[]> {
  const valid = dates.filter((d) => ISO_DATE.test(d));
  if (valid.length === 0) return [];

  const redis = await getRedisClient();
  const multi = redis.multi();
  for (const date of valid) {
    for (const source of JOURNAL_SOURCES) multi.hGet(source.key(userId, date), 'prompts');
  }
  const raws = (await multi.exec()) as Array<string | null>;

  const flipped: string[] = [];
  for (let i = 0; i < valid.length; i++) {
    let changed = false;
    for (let j = 0; j < JOURNAL_SOURCES.length; j++) {
      const raw = raws[i * JOURNAL_SOURCES.length + j];
      if (!hasJournalContentRaw(raw ?? undefined)) continue;
      const done = await completeMatchingHabits(userId, valid[i], JOURNAL_SOURCES[j].match, { createDay: true });
      if (done.length > 0) changed = true;
    }
    if (changed) flipped.push(valid[i]);
  }
  return flipped;
}
