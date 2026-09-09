/**
 * Plain-English messages for AI report failures.
 *
 * The report endpoints used to hand the raw Anthropic SDK error to the UI, so
 * a billing problem on our own account surfaced to the user as
 * `400 {"type":"error","error":{"type":"invalid_request_error","message":"Your
 * credit balance is too low ..."}}`. The raw error still goes to the server
 * logs — the user gets a sentence that says whether to retry, wait, or do
 * nothing.
 */

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
 * Map an Anthropic API or network failure onto a message that is safe and
 * useful to show a user. Never returns the provider's own wording.
 */
export function friendlyAiErrorMessage(error: unknown): string {
  const status = statusOf(error);
  const text = textOf(error).toLowerCase();

  // Billing / auth problems come back as a 400 or 401, so match on the text
  // before falling through to the status buckets below.
  if (
    /credit balance|billing|quota|payment|authentication_error|permission_error|invalid x-api-key|invalid api key/.test(
      text,
    ) ||
    status === 401 ||
    status === 403
  ) {
    return UNAVAILABLE;
  }

  if (status === 429 || status === 529 || /rate_limit|overloaded|too many requests/.test(text)) {
    return BUSY;
  }

  if (/prompt is too long|context.*too long|too many tokens|max_tokens/.test(text)) {
    return TOO_LONG;
  }

  if (
    /fetch failed|econnreset|econnrefused|etimedout|enotfound|socket hang up|network|timed? ?out|aborted/.test(
      text,
    )
  ) {
    return NETWORK;
  }

  if (status !== null && status >= 500) return UNAVAILABLE;

  return GENERIC;
}
