/**
 * Plain-English messages for AI report failures, and the classification the
 * owner alert (lib/ai-failure-alert.ts) reports on.
 *
 * The report endpoints used to hand the raw Anthropic SDK error to the UI, so
 * a billing problem on our own account surfaced to the user as
 * `400 {"type":"error","error":{"type":"invalid_request_error","message":"Your
 * credit balance is too low ..."}}`. The raw error still goes to the server
 * logs — the user gets a sentence that says whether to retry, wait, or do
 * nothing.
 */

/**
 * What went wrong, at the granularity worth acting on. The user-facing message
 * collapses several of these; the owner alert keeps them apart, because
 * "we're out of credits" and "Anthropic is having a bad minute" need very
 * different responses.
 */
export type AiErrorKind =
  | 'credits' // out of credits / billing / quota
  | 'auth' // bad or revoked API key
  | 'not_configured' // ANTHROPIC_API_KEY missing on the server
  | 'rate_limit' // 429 / 529 / overloaded
  | 'too_long' // prompt exceeded the context window
  | 'network' // never reached Anthropic
  | 'server' // 5xx from Anthropic
  | 'unknown';

/** Our problem (billing, bad key, provider outage) — retrying now won't help. */
const UNAVAILABLE =
  'AI analysis is temporarily unavailable. This is a problem on our end, not with your data — please try again later.';

/** Transient load on the provider — retrying shortly usually works. */
const BUSY = 'The AI service is busy right now. Give it a minute and try again.';

const NETWORK =
  "We couldn't reach the AI service. Check your connection and try again.";

const TOO_LONG =
  'There was too much to analyze in one report. Try a shorter period and generate it again.';

const GENERIC =
  'Something went wrong while generating your report. Please try again in a few minutes.';

/** Shown when the server has no Anthropic key configured at all. */
export const AI_NOT_CONFIGURED_MESSAGE = UNAVAILABLE;

function statusOf(error: unknown): number | null {
  if (typeof error === 'object' && error !== null && 'status' in error) {
    const status = Number((error as { status: unknown }).status);
    if (Number.isFinite(status)) return status;
  }
  return null;
}

function textOf(error: unknown): string {
  if (error instanceof Error) return `${error.message} ${String(error.cause ?? '')}`;
  return String(error ?? '');
}

/**
 * Bucket an Anthropic API or network failure. Billing and auth problems come
 * back as a 400 or 401, so the text is matched before the status buckets.
 */
export function classifyAiError(error: unknown): AiErrorKind {
  const status = statusOf(error);
  const text = textOf(error).toLowerCase();

  if (/anthropic_api_key is not configured|anthropic_api_key unset/.test(text)) {
    return 'not_configured';
  }
  if (/credit balance|billing|quota|payment/.test(text)) return 'credits';
  if (
    /authentication_error|permission_error|invalid x-api-key|invalid api key/.test(text) ||
    status === 401 ||
    status === 403
  ) {
    return 'auth';
  }
  if (status === 429 || status === 529 || /rate_limit|overloaded|too many requests/.test(text)) {
    return 'rate_limit';
  }
  if (/prompt is too long|context.*too long|too many tokens|max_tokens/.test(text)) {
    return 'too_long';
  }
  if (
    /fetch failed|econnreset|econnrefused|etimedout|enotfound|socket hang up|network|timed? ?out|aborted/.test(
      text,
    )
  ) {
    return 'network';
  }
  if (status !== null && status >= 500) return 'server';

  return 'unknown';
}

const MESSAGE_BY_KIND: Record<AiErrorKind, string> = {
  credits: UNAVAILABLE,
  auth: UNAVAILABLE,
  not_configured: UNAVAILABLE,
  server: UNAVAILABLE,
  rate_limit: BUSY,
  too_long: TOO_LONG,
  network: NETWORK,
  unknown: GENERIC,
};

/**
 * Map an Anthropic API or network failure onto a message that is safe and
 * useful to show a user. Never returns the provider's own wording.
 */
export function friendlyAiErrorMessage(error: unknown): string {
  return MESSAGE_BY_KIND[classifyAiError(error)];
}
