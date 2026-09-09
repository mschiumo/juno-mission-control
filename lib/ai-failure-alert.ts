/**
 * Owner alert for AI report failures.
 *
 * The Sep 9 2026 outage was the motivation: the Anthropic account ran out of
 * credits, every AI report in the app started failing, and the only signal was
 * a red box in the UI that someone had to happen to look at. This module turns
 * any AI generation failure into an email to the owner.
 *
 * Two rules shape the design:
 *
 * 1. **Alerting must never break the caller.** Everything here is wrapped and
 *    swallowed — a failed alert is logged, never thrown. It runs from inside
 *    catch blocks that are already handling a user-visible failure.
 * 2. **One outage, one email.** An out-of-credits account fails every report
 *    for every user, so alerts are throttled per error kind: the first failure
 *    sends, the rest are counted and folded into the next email once the
 *    window expires. Counting happens in Redis so it holds across serverless
 *    invocations.
 *
 * Only the app's own Anthropic API calls are visible here. Usage on claude.ai
 * (a separate subscription, billed separately) is not something the app can
 * observe.
 */

import React from 'react';
import { getRedisClient } from '@/lib/redis';
import { sendEmail } from '@/lib/email';
import { OWNER_EMAIL } from '@/lib/owner';
import { classifyAiError, type AiErrorKind } from '@/lib/ai-error-message';
import { AiFailureAlertEmail } from '@/lib/emails/AiFailureAlertEmail';

/** Every place in the app that calls Claude, in the owner's language. */
export type AiFeature =
  | 'journal-insights'
  | 'weekly-journal-insights'
  | 'personal-journal-report'
  | 'portfolio-review'
  | 'portfolio-weekly-review'
  | 'market-briefing'
  | 'daily-market-recap'
  | 'weekly-habits-recap'
  | 'confluence-weekly-review';

export const AI_FEATURE_LABELS: Record<AiFeature, string> = {
  'journal-insights': 'Journal Insights (Trading)',
  'weekly-journal-insights': 'Weekly journal insights email',
  'personal-journal-report': 'Personal journal report',
  'portfolio-review': 'Portfolio review (on demand)',
  'portfolio-weekly-review': 'Portfolio weekly review email',
  'market-briefing': 'Morning market briefing',
  'daily-market-recap': 'Daily market recap',
  'weekly-habits-recap': 'Weekly habits recap',
  'confluence-weekly-review': 'ConfluenceTrading weekly review',
};

/** Headline + next step per failure kind. This is what makes the email useful. */
const KIND_COPY: Record<AiErrorKind, { headline: string; hint: string; severe: boolean }> = {
  credits: {
    headline: 'Anthropic credits are exhausted',
    hint: 'Add API credits in the Anthropic Console (Settings → Billing) for the organization that owns the app’s API key. Console credits are separate from a claude.ai subscription — a claude.ai purchase does not fund the API.',
    severe: true,
  },
  auth: {
    headline: 'Anthropic rejected the API key',
    hint: 'The key was revoked, rotated, or belongs to a disabled workspace. Issue a fresh key in the Anthropic Console and update ANTHROPIC_API_KEY in Vercel (Production), then redeploy.',
    severe: true,
  },
  not_configured: {
    headline: 'ANTHROPIC_API_KEY is missing on the server',
    hint: 'Set ANTHROPIC_API_KEY in the Vercel project environment and redeploy. Every AI report is disabled until it is present.',
    severe: true,
  },
  rate_limit: {
    headline: 'Anthropic is rate limiting or overloaded',
    hint: 'Usually transient — reports should work again shortly. If it persists for hours, check the rate limits on the account’s workspace.',
    severe: false,
  },
  too_long: {
    headline: 'A report exceeded the model’s context window',
    hint: 'The period being analyzed produced too much input. Worth trimming what the prompt includes for that feature.',
    severe: false,
  },
  network: {
    headline: 'Could not reach the Anthropic API',
    hint: 'A network or DNS failure between Vercel and Anthropic. Usually transient; check status.anthropic.com if it repeats.',
    severe: false,
  },
  server: {
    headline: 'Anthropic returned a server error',
    hint: 'A 5xx on Anthropic’s side. Usually transient; check status.anthropic.com if it repeats.',
    severe: false,
  },
  unknown: {
    headline: 'An AI report failed',
    hint: 'The error did not match a known API failure, so it may be a bug in the report itself rather than the Anthropic account. The raw error is below.',
    severe: false,
  },
};

/**
 * How long one alert suppresses the next for the same kind. Long enough that a
 * multi-day billing outage sends a daily-ish nudge rather than one per click,
 * short enough that a fresh outage isn't sat on. Override with
 * AI_ALERT_THROTTLE_MINUTES.
 */
function throttleSeconds(): number {
  const parsed = Number(process.env.AI_ALERT_THROTTLE_MINUTES);
  const minutes = Number.isFinite(parsed) && parsed > 0 ? parsed : 6 * 60;
  return Math.round(minutes * 60);
}

const KEY_PREFIX = 'ai-failure-alert';
/** Counters outlive the throttle window so a folded count is never lost. */
const COUNTER_TTL_SECONDS = 48 * 60 * 60;

/** Provider wording, trimmed to something readable in an email client. */
function summarizeError(error: unknown): string {
  const raw =
    error instanceof Error ? error.message : typeof error === 'string' ? error : String(error);
  const collapsed = raw.replace(/\s+/g, ' ').trim();
  return collapsed.length > 600 ? `${collapsed.slice(0, 600)}…` : collapsed || 'No error message.';
}

export interface AiFailureAlertResult {
  sent: boolean;
  kind: AiErrorKind;
  /** Why it did or didn't send — surfaced in cron JSON responses and logs. */
  reason: string;
}

/**
 * Record an AI failure and email the owner if this kind of failure hasn't
 * already been reported inside the throttle window.
 *
 * Never throws.
 */
export async function reportAiFailure({
  feature,
  error,
}: {
  feature: AiFeature;
  error: unknown;
}): Promise<AiFailureAlertResult> {
  const kind = classifyAiError(error);
  const detail = summarizeError(error);

  console.error(`[AiAlert] ${feature} failed (${kind}): ${detail}`);

  try {
    const redis = await getRedisClient();
    const countKey = `${KEY_PREFIX}:${kind}:count`;
    const featureKey = `${KEY_PREFIX}:${kind}:features`;
    const sentKey = `${KEY_PREFIX}:${kind}:sent`;

    const count = await redis.incr(countKey);
    if (count === 1) await redis.expire(countKey, COUNTER_TTL_SECONDS);
    await redis.sAdd(featureKey, feature);
    await redis.expire(featureKey, COUNTER_TTL_SECONDS);

    // NX: only the first failure in the window claims the send.
    const claimed = await redis.set(sentKey, new Date().toISOString(), {
      NX: true,
      EX: throttleSeconds(),
    });

    if (claimed !== 'OK') {
      return {
        sent: false,
        kind,
        reason: `throttled (${count} failures folded into the next alert)`,
      };
    }

    const features = await redis.sMembers(featureKey);
    const result = await deliver({ kind, feature, detail, count, features });

    if (result.sent) {
      // Start a clean window for the next alert.
      await redis.del(countKey);
      await redis.del(featureKey);
    } else {
      // Delivery failed. Release the claim and keep the counters, so the next
      // failure tries again rather than buying six hours of silence.
      await redis.del(sentKey);
    }

    return result;
  } catch (err) {
    // Redis is how we throttle; without it, still alert — a duplicate email
    // beats a silent outage — but say so, so the volume is explicable.
    console.error('[AiAlert] Redis unavailable, sending unthrottled:', err);
    return deliver({ kind, feature, detail, count: 1, features: [feature], degraded: true });
  }
}

async function deliver({
  kind,
  feature,
  detail,
  count,
  features,
  degraded,
}: {
  kind: AiErrorKind;
  feature: AiFeature;
  detail: string;
  count: number;
  features: string[];
  degraded?: boolean;
}): Promise<AiFailureAlertResult> {
  const copy = KIND_COPY[kind];
  const props = {
    headline: copy.headline,
    severe: copy.severe,
    hint: copy.hint,
    feature: AI_FEATURE_LABELS[feature],
    affected: features
      .map((f) => AI_FEATURE_LABELS[f as AiFeature] ?? f)
      .sort((a, b) => a.localeCompare(b)),
    failureCount: count,
    error: detail,
    generatedAt: formatEt(new Date()),
    throttleNote: degraded
      ? 'Alert de-duplication is unavailable right now, so repeats of this failure may email again.'
      : `Further failures of this kind are folded into one email every ${Math.round(throttleSeconds() / 60)} minutes.`,
  };

  const result = await sendEmail({
    to: OWNER_EMAIL,
    subject: `[ConfluenceTrading] ${copy.headline}`,
    react: React.createElement(AiFailureAlertEmail, props),
  });

  if (!result.success) {
    console.error('[AiAlert] Email delivery failed:', result.error);
    return { sent: false, kind, reason: `email failed: ${result.error}` };
  }
  return { sent: true, kind, reason: 'alert sent' };
}

/** Shared with the email preview route so the sample matches the real thing. */
export function formatEt(date: Date): string {
  return `${date.toLocaleString('en-US', {
    timeZone: 'America/New_York',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })} ET`;
}
