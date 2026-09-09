import { describe, expect, it } from 'vitest';
import { classifyAiError, friendlyAiErrorMessage } from '@/lib/ai-error-message';

/** Shape the Anthropic SDK throws: a message with the raw body, plus status. */
function apiError(status: number, body: string): Error {
  const err = new Error(`${status} ${body}`);
  Object.assign(err, { status });
  return err;
}

const CREDIT_BALANCE_ERROR = apiError(
  400,
  '{"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits."}}',
);

describe('friendlyAiErrorMessage', () => {
  it('never leaks the provider wording for a billing failure', () => {
    const msg = friendlyAiErrorMessage(CREDIT_BALANCE_ERROR);
    expect(msg).toBe(
      'AI analysis is temporarily unavailable. This is a problem on our end, not with your data — please try again later.',
    );
    expect(msg).not.toMatch(/anthropic|credit balance|invalid_request_error/i);
  });

  it('tells the user to wait when the provider is rate limited or overloaded', () => {
    expect(friendlyAiErrorMessage(apiError(429, 'rate_limit_error'))).toMatch(/busy/i);
    expect(friendlyAiErrorMessage(apiError(529, 'overloaded_error'))).toMatch(/busy/i);
  });

  it('treats auth failures as our problem', () => {
    expect(friendlyAiErrorMessage(apiError(401, 'authentication_error'))).toMatch(
      /temporarily unavailable/i,
    );
  });

  it('suggests a shorter period when the prompt is too long', () => {
    expect(
      friendlyAiErrorMessage(new Error('400 prompt is too long: 250000 tokens > 200000')),
    ).toMatch(/shorter period/i);
  });

  it('points at the connection for network failures', () => {
    expect(friendlyAiErrorMessage(new TypeError('fetch failed'))).toMatch(/connection/i);
  });

  it('falls back to a generic retry message', () => {
    expect(friendlyAiErrorMessage(new Error('something odd happened'))).toMatch(
      /please try again in a few minutes/i,
    );
    expect(friendlyAiErrorMessage(undefined)).toMatch(/please try again in a few minutes/i);
  });
});

describe('classifyAiError', () => {
  it('separates billing from auth, so the alert can say which one', () => {
    expect(classifyAiError(CREDIT_BALANCE_ERROR)).toBe('credits');
    expect(classifyAiError(apiError(401, 'authentication_error'))).toBe('auth');
  });

  it('recognises a server with no key configured', () => {
    expect(classifyAiError(new Error('ANTHROPIC_API_KEY is not configured'))).toBe('not_configured');
    expect(
      classifyAiError(new Error('ANTHROPIC_API_KEY unset — required for the weekly review narrative.')),
    ).toBe('not_configured');
  });

  it('buckets transient provider problems', () => {
    expect(classifyAiError(apiError(429, 'rate_limit_error'))).toBe('rate_limit');
    expect(classifyAiError(apiError(529, 'overloaded_error'))).toBe('rate_limit');
    expect(classifyAiError(apiError(503, 'service unavailable'))).toBe('server');
    expect(classifyAiError(new TypeError('fetch failed'))).toBe('network');
  });

  it('does not claim to recognise an unrelated failure', () => {
    expect(classifyAiError(new Error('Redis connection lost'))).toBe('unknown');
  });
});
