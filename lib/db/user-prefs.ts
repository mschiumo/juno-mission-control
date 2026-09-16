/**
 * Per-user preferences blob (`user:prefs:<userId>`), shared by the prefs API
 * route and any server code that needs to read a preference without going
 * through HTTP (e.g. the Journal calendar's daily-stats endpoint).
 */
import { getRedisClient } from '@/lib/redis';

export interface EmailAlertPrefs {
  marketBriefing: boolean;
  gapScanner: boolean;
  dailyRecap: boolean;
}

export interface UserPrefs {
  tradingTourCompleted?: boolean;
  /** Tier the user held when they finished the tour — upgrading re-offers it. */
  tourCompletedTier?: string;
  startingBalance?: number;
  /** Anchor date of `startingBalance` when it came from an account statement. */
  startingBalanceDate?: string;
  emailAlerts?: EmailAlertPrefs;
  tradingRules?: string[];
  /**
   * Trading days (YYYY-MM-DD, ET) the user declared they were not trading —
   * the "Not trading today" dismissal on the Trading Rules modal. The Journal
   * calendar leaves these days grey instead of flagging them as "still
   * syncing" while the brokerage feed has nothing for them.
   */
  noTradeDays?: string[];
}

/** Only the most recent N no-trade days are kept; older ones can't be pending. */
export const NO_TRADE_DAYS_MAX = 366;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isYmd(value: unknown): value is string {
  return typeof value === 'string' && DATE_RE.test(value);
}

function prefsKey(userId: string): string {
  return `user:prefs:${userId}`;
}

export async function getUserPrefs(userId: string): Promise<UserPrefs> {
  const redis = await getRedisClient();
  const raw = await redis.get(prefsKey(userId));
  if (!raw) return {};
  try {
    return JSON.parse(raw as string) as UserPrefs;
  } catch {
    return {};
  }
}

export async function saveUserPrefs(userId: string, prefs: UserPrefs): Promise<void> {
  const redis = await getRedisClient();
  await redis.set(prefsKey(userId), JSON.stringify(prefs));
}

/** Add a day to the no-trade list: deduped, sorted, trimmed to the newest N. */
export function withNoTradeDay(existing: string[] | undefined, day: string): string[] {
  const set = new Set((existing ?? []).filter(isYmd));
  set.add(day);
  return [...set].sort().slice(-NO_TRADE_DAYS_MAX);
}
