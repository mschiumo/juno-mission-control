/**
 * The watchdog's two failure modes, pinned.
 *
 * SILENCE is what actually happened: the broker died ~Aug 14 2026 and nothing
 * said so until Aug 18. An alert that fires only on the transition reproduces
 * that whenever the first email is missed — hence the daily reminder.
 *
 * NOISE is the other way to end up ignored, which is silence with extra steps.
 */

import { describe, expect, it } from 'vitest';
import {
  decideAlert,
  formatDowntime,
  nextAlertState,
  REMINDER_INTERVAL_MS,
  type HealthAlertState,
} from '@/lib/confluence/health-alert';

const NOW = Date.parse('2026-08-18T12:30:00Z');
const nowIso = new Date(NOW).toISOString();

describe('decideAlert', () => {
  it('stays quiet while everything is healthy', () => {
    const d = decideAlert({ healthy: true, previous: { status: 'ok' }, now: NOW });
    expect(d.send).toBe(false);
  });

  it('fires immediately when the connection breaks', () => {
    const d = decideAlert({ healthy: false, previous: { status: 'ok' }, now: NOW });
    expect(d).toMatchObject({ send: true, kind: 'down' });
  });

  it('does not re-fire within the reminder window', () => {
    const previous: HealthAlertState = {
      status: 'failing',
      since: new Date(NOW - 3 * 60 * 60 * 1000).toISOString(),
      lastNotifiedAt: new Date(NOW - 3 * 60 * 60 * 1000).toISOString(),
    };
    expect(decideAlert({ healthy: false, previous, now: NOW }).send).toBe(false);
  });

  it('reminds once the window has elapsed — an outage must not go quiet', () => {
    const previous: HealthAlertState = {
      status: 'failing',
      since: new Date(NOW - 4 * 24 * 60 * 60 * 1000).toISOString(),
      lastNotifiedAt: new Date(NOW - REMINDER_INTERVAL_MS - 1000).toISOString(),
    };
    expect(decideAlert({ healthy: false, previous, now: NOW })).toMatchObject({
      send: true,
      kind: 'still_down',
    });
  });

  it('announces recovery', () => {
    const previous: HealthAlertState = { status: 'failing', since: nowIso, lastNotifiedAt: nowIso };
    expect(decideAlert({ healthy: true, previous, now: NOW })).toMatchObject({
      send: true,
      kind: 'recovered',
    });
  });

  it('alerts when prior state is unreadable — unknown must not read as healthy', () => {
    expect(decideAlert({ healthy: false, previous: null, now: NOW })).toMatchObject({
      send: true,
      kind: 'down',
    });
  });

  it('a four-day outage produces repeat alerts, not one and then silence', () => {
    // Replay the Aug 2026 outage one weekday check at a time.
    let state: HealthAlertState | null = { status: 'ok' };
    let sent = 0;
    for (let day = 0; day < 4; day++) {
      const now = NOW + day * 24 * 60 * 60 * 1000;
      const decision = decideAlert({ healthy: false, previous: state, now });
      if (decision.send) sent++;
      state = nextAlertState({
        healthy: false,
        previous: state,
        decision,
        nowIso: new Date(now).toISOString(),
      });
    }
    expect(sent).toBe(4);
  });
});

describe('nextAlertState', () => {
  it('preserves the original breakage time across reminders', () => {
    const firstBreak = new Date(NOW - 2 * 24 * 60 * 60 * 1000).toISOString();
    const previous: HealthAlertState = { status: 'failing', since: firstBreak, lastNotifiedAt: firstBreak };
    const decision = decideAlert({ healthy: false, previous, now: NOW });
    const next = nextAlertState({ healthy: false, previous, decision, nowIso });
    expect(next.since).toBe(firstBreak);
  });

  it('clears the failure once healthy, so the next break alerts again', () => {
    const previous: HealthAlertState = { status: 'failing', since: nowIso, lastNotifiedAt: nowIso };
    const decision = decideAlert({ healthy: true, previous, now: NOW });
    expect(nextAlertState({ healthy: true, previous, decision, nowIso })).toEqual({ status: 'ok' });
  });

  it('does not advance lastNotifiedAt when nothing was sent', () => {
    const earlier = new Date(NOW - 60_000).toISOString();
    const previous: HealthAlertState = { status: 'failing', since: earlier, lastNotifiedAt: earlier };
    const decision = decideAlert({ healthy: false, previous, now: NOW });
    expect(decision.send).toBe(false);
    expect(nextAlertState({ healthy: false, previous, decision, nowIso }).lastNotifiedAt).toBe(earlier);
  });
});

describe('formatDowntime', () => {
  it('reports the real span of the Aug outage', () => {
    expect(formatDowntime('2026-08-14T12:30:00Z', NOW)).toBe('4 days');
  });

  it('combines days and hours', () => {
    expect(formatDowntime('2026-08-14T08:30:00Z', NOW)).toBe('4 days, 4 hours');
  });

  it('falls back to minutes for a fresh break', () => {
    expect(formatDowntime(new Date(NOW - 25 * 60_000).toISOString(), NOW)).toBe('25 minutes');
  });

  it('returns undefined when there is nothing to report', () => {
    expect(formatDowntime(undefined, NOW)).toBeUndefined();
    expect(formatDowntime(new Date(NOW + 60_000).toISOString(), NOW)).toBeUndefined();
  });
});
