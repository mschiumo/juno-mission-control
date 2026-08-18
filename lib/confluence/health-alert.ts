/**
 * When to actually send a broker-health alert.
 *
 * Pure decision logic, separated from the cron so the two failure modes that
 * make alerting worthless can be tested directly:
 *
 *  - SILENCE. The Aug 2026 outage ran four days undetected. An alert that only
 *    fires on the transition is silent for the rest of the outage, so a missed
 *    first email means never hearing about it again. Hence the daily reminder.
 *  - NOISE. An alert that fires every run trains you to ignore it, which is
 *    the same as silence with extra steps.
 *
 * So: fire immediately when health breaks, then at most once a day while it
 * stays broken, and once more when it recovers. Recovery matters — "it's back"
 * is the signal that tells you the fix worked.
 */

/** Persisted between runs (Redis). */
export interface HealthAlertState {
  status: 'ok' | 'failing';
  /** When the current run of failures began (ISO). */
  since?: string;
  /** When we last emailed about it (ISO). */
  lastNotifiedAt?: string;
}

export type AlertDecision =
  | { send: false; reason: string }
  | { send: true; kind: 'down' | 'still_down' | 'recovered'; reason: string };

/** Re-notify at most this often while a failure persists. */
export const REMINDER_INTERVAL_MS = 20 * 60 * 60 * 1000; // 20h — once per trading day

export function decideAlert(input: {
  healthy: boolean;
  previous: HealthAlertState | null;
  now: number;
}): AlertDecision {
  const { healthy, previous, now } = input;
  const wasFailing = previous?.status === 'failing';

  if (healthy) {
    if (wasFailing) {
      return { send: true, kind: 'recovered', reason: 'Connection restored since the last check.' };
    }
    return { send: false, reason: 'Healthy, and it was healthy last check.' };
  }

  if (!wasFailing) {
    return { send: true, kind: 'down', reason: 'Connection just broke.' };
  }

  // Still failing — remind, but only once a day.
  const last = previous?.lastNotifiedAt ? new Date(previous.lastNotifiedAt).getTime() : 0;
  const elapsed = now - (Number.isFinite(last) ? last : 0);
  if (elapsed >= REMINDER_INTERVAL_MS) {
    return { send: true, kind: 'still_down', reason: 'Still failing, and the daily reminder is due.' };
  }
  return { send: false, reason: 'Still failing, but already notified within the reminder window.' };
}

/** The state to persist after a check (and any alert it triggered). */
export function nextAlertState(input: {
  healthy: boolean;
  previous: HealthAlertState | null;
  decision: AlertDecision;
  nowIso: string;
}): HealthAlertState {
  const { healthy, previous, decision, nowIso } = input;
  if (healthy) return { status: 'ok' };
  return {
    status: 'failing',
    // Preserve the original breakage time so the email can say how long it has been down.
    since: previous?.status === 'failing' ? (previous.since ?? nowIso) : nowIso,
    lastNotifiedAt: decision.send ? nowIso : previous?.lastNotifiedAt,
  };
}

/** "3 days, 4 hours" — how long the outage has run, for the email body. */
export function formatDowntime(sinceIso: string | undefined, now: number): string | undefined {
  if (!sinceIso) return undefined;
  const since = new Date(sinceIso).getTime();
  if (!Number.isFinite(since) || now <= since) return undefined;
  const mins = Math.floor((now - since) / 60_000);
  const days = Math.floor(mins / 1440);
  const hours = Math.floor((mins % 1440) / 60);
  const minutes = mins % 60;
  const parts: string[] = [];
  if (days) parts.push(`${days} day${days === 1 ? '' : 's'}`);
  if (hours) parts.push(`${hours} hour${hours === 1 ? '' : 's'}`);
  if (!days && !hours) parts.push(`${minutes} minute${minutes === 1 ? '' : 's'}`);
  return parts.join(', ');
}
