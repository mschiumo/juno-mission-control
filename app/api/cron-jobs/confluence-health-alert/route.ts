/**
 * Broker-connection watchdog — the thing that was missing when the agentic
 * rail died on ~Aug 14 2026 and nobody noticed until Aug 18.
 *
 * Runs each weekday at 12:30 UTC (8:30am ET), half an hour after the screen
 * and a full hour before the open. That ordering is deliberate: by then the
 * morning screen has either produced proposals or failed, so this reports the
 * real outcome AND still leaves time to re-capture the token and re-run before
 * the market opens.
 *
 * READ-ONLY — calls `get_accounts` and reads the run log. Places no orders.
 *
 * Emails the owner when the connection breaks, once a day while it stays
 * broken, and once when it recovers (see lib/confluence/health-alert.ts for
 * why all three matter). Single-user today, like the other confluence crons;
 * multi-user would fan out over connected users here.
 *
 * Auth: /api/cron-jobs/* is gated by CRON_SECRET in middleware.ts.
 */

import { NextResponse } from 'next/server';
import React from 'react';
import { getUserByEmail } from '@/lib/db/users';
import { OWNER_EMAIL } from '@/lib/owner';
import { postToCronResults } from '@/lib/cron-helpers';
import { getRedisClient } from '@/lib/redis';
import { getAllRuns } from '@/lib/db/confluence/agent-runs';
import { checkRobinhoodHealth } from '@/lib/confluence/robinhood/health-check';
import {
  decideAlert,
  formatDowntime,
  nextAlertState,
  type HealthAlertState,
} from '@/lib/confluence/health-alert';
import { sendEmail } from '@/lib/email';
import { ConfluenceHealthAlertEmail } from '@/lib/emails/ConfluenceHealthAlertEmail';

export const dynamic = 'force-dynamic';

const STATE_KEY = 'confluence:health-alert:state';

async function readState(): Promise<HealthAlertState | null> {
  try {
    const redis = await getRedisClient();
    const raw = await redis.get(STATE_KEY);
    return raw ? (JSON.parse(raw) as HealthAlertState) : null;
  } catch {
    // Unreadable state means we cannot tell "just broke" from "still broken".
    // Returning null biases toward alerting, which is the safe direction.
    return null;
  }
}

async function writeState(state: HealthAlertState): Promise<void> {
  try {
    const redis = await getRedisClient();
    await redis.set(STATE_KEY, JSON.stringify(state));
  } catch {
    /* best effort — a lost write costs at most one duplicate reminder */
  }
}

/** One-line summary of the live credential path, for the email body. */
function summarizeAuth(auth: Awaited<ReturnType<typeof checkRobinhoodHealth>>['auth']): string {
  return (
    `${auth.tokenSource} · client id ${auth.clientIdSet ? 'set' : 'MISSING'} · ` +
    `refresh token from ${auth.refreshTokenSource} · ` +
    `static token ${auth.staticTokenSet ? 'SET (should not be, in prod)' : 'unset'}`
  );
}

export async function GET(): Promise<NextResponse> {
  try {
    const owner = await getUserByEmail(OWNER_EMAIL);
    if (!owner) {
      return NextResponse.json({ success: false, error: 'Owner account not found' }, { status: 404 });
    }

    const health = await checkRobinhoodHealth();
    const healthy = health.connected;
    const now = Date.now();
    const nowIso = new Date(now).toISOString();

    const previous = await readState();
    const decision = decideAlert({ healthy, previous, now });
    const next = nextAlertState({ healthy, previous, decision, nowIso });
    await writeState(next);

    // The morning screen runs 30 minutes before this. A failure there is the
    // other way trades go missing, so it rides along in the same alert rather
    // than needing its own channel.
    let lastRunError: string | undefined;
    if (!healthy) {
      try {
        const runs = await getAllRuns(owner.id);
        const latest = runs[0];
        if (latest?.status === 'failed') lastRunError = latest.error || 'The last screen failed.';
      } catch {
        /* advisory only */
      }
    }

    if (!decision.send) {
      return NextResponse.json({ success: true, healthy, alerted: false, reason: decision.reason });
    }

    // On recovery `next` is already cleared, so the span comes from the state
    // we just replaced; otherwise it is the (preserved) first-breakage time.
    const downtime = formatDowntime(decision.kind === 'recovered' ? previous?.since : next.since, now);
    const generatedAt = `${new Date(now).toLocaleString('en-US', {
      timeZone: 'America/New_York',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })} ET`;

    const subject =
      decision.kind === 'recovered'
        ? '✅ Robinhood connection restored'
        : decision.kind === 'still_down'
          ? `⚠️ Robinhood STILL down${downtime ? ` (${downtime})` : ''} — trades are being missed`
          : '🚨 Robinhood connection is DOWN — trades are being missed';

    if (owner.email) {
      await sendEmail({
        to: owner.email,
        subject,
        react: React.createElement(ConfluenceHealthAlertEmail, {
          kind: decision.kind,
          generatedAt,
          error: health.error ?? health.message,
          hint: health.hint,
          downtime,
          authSummary: summarizeAuth(health.auth),
          lastRunError,
        }),
      });
    }

    await postToCronResults(
      'confluence-health-alert',
      `Robinhood health: ${healthy ? 'OK' : 'FAILING'} — ${decision.kind} alert sent${health.error ? ` (${health.error})` : ''}`,
      healthy ? 'review' : 'error',
    );

    return NextResponse.json({ success: true, healthy, alerted: true, kind: decision.kind });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Health alert failed';
    // The watchdog failing is itself worth surfacing — a silent watchdog is
    // indistinguishable from a healthy system, which is the whole problem.
    await postToCronResults('confluence-health-alert', `Health alert FAILED: ${message}`, 'error');
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
