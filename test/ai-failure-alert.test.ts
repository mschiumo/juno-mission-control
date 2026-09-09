import { beforeEach, describe, expect, it, vi } from 'vitest';

/** Minimal in-memory stand-in for the Redis commands the alert module uses. */
function fakeRedis() {
  const strings = new Map<string, string>();
  const sets = new Map<string, Set<string>>();
  return {
    strings,
    sets,
    async incr(key: string) {
      const next = Number(strings.get(key) ?? 0) + 1;
      strings.set(key, String(next));
      return next;
    },
    async expire() {
      return true;
    },
    async sAdd(key: string, member: string) {
      const set = sets.get(key) ?? new Set<string>();
      set.add(member);
      sets.set(key, set);
      return 1;
    },
    async sMembers(key: string) {
      return [...(sets.get(key) ?? [])];
    },
    async set(key: string, value: string, opts?: { NX?: boolean }) {
      if (opts?.NX && strings.has(key)) return null;
      strings.set(key, value);
      return 'OK';
    },
    async del(key: string) {
      strings.delete(key);
      sets.delete(key);
      return 1;
    },
  };
}

const redis = fakeRedis();
const sendEmail = vi.fn(async () => ({ success: true, id: 'email_1' }));

vi.mock('@/lib/redis', () => ({ getRedisClient: async () => redis }));
vi.mock('@/lib/email', () => ({ sendEmail: (...args: unknown[]) => sendEmail(...(args as [])) }));

const { reportAiFailure, AI_FEATURE_LABELS, formatEt } = await import('@/lib/ai-failure-alert');

function creditError() {
  const err = new Error(
    '400 {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API."}}',
  );
  Object.assign(err, { status: 400 });
  return err;
}

beforeEach(() => {
  redis.strings.clear();
  redis.sets.clear();
  sendEmail.mockClear();
  sendEmail.mockResolvedValue({ success: true, id: 'email_1' });
});

describe('reportAiFailure', () => {
  it('emails the owner on the first failure of a kind', async () => {
    const result = await reportAiFailure({ feature: 'journal-insights', error: creditError() });
    expect(result).toMatchObject({ sent: true, kind: 'credits' });
    expect(sendEmail).toHaveBeenCalledOnce();
    const [{ to, subject }] = sendEmail.mock.calls[0] as unknown as [
      { to: string; subject: string },
    ];
    expect(to).toBe('mschiumo18@gmail.com');
    expect(subject).toMatch(/credits are exhausted/i);
  });

  it('folds the rest of an outage into one email', async () => {
    await reportAiFailure({ feature: 'journal-insights', error: creditError() });
    const second = await reportAiFailure({ feature: 'market-briefing', error: creditError() });
    const third = await reportAiFailure({ feature: 'daily-market-recap', error: creditError() });

    expect(sendEmail).toHaveBeenCalledOnce();
    expect(second.sent).toBe(false);
    expect(third.reason).toMatch(/2 failures folded/);
  });

  it('alerts separately for a different kind of failure', async () => {
    await reportAiFailure({ feature: 'journal-insights', error: creditError() });
    const network = await reportAiFailure({
      feature: 'daily-market-recap',
      error: new TypeError('fetch failed'),
    });
    expect(network).toMatchObject({ sent: true, kind: 'network' });
    expect(sendEmail).toHaveBeenCalledTimes(2);
  });

  it('does not buy silence when the email itself fails to send', async () => {
    sendEmail.mockResolvedValueOnce({ success: false, error: 'Resend down' } as never);
    const first = await reportAiFailure({ feature: 'journal-insights', error: creditError() });
    expect(first.sent).toBe(false);

    // The next failure must try again rather than being throttled behind a
    // send that never happened.
    const second = await reportAiFailure({ feature: 'journal-insights', error: creditError() });
    expect(second.sent).toBe(true);
    expect(sendEmail).toHaveBeenCalledTimes(2);
  });

  it('never throws, even when Redis is unreachable', async () => {
    const boom = vi.spyOn(redis, 'incr').mockRejectedValueOnce(new Error('Redis down'));
    const result = await reportAiFailure({ feature: 'portfolio-review', error: creditError() });
    expect(result.sent).toBe(true); // degraded: unthrottled, but still delivered
    boom.mockRestore();
  });
});

describe('AI failure alert copy', () => {
  it('labels every AI call site in the owner’s language', () => {
    for (const [feature, label] of Object.entries(AI_FEATURE_LABELS)) {
      expect(label, feature).toBeTruthy();
      expect(label, feature).not.toMatch(/-/);
    }
  });

  it('stamps alerts in ET regardless of the server timezone', () => {
    expect(formatEt(new Date('2026-09-09T19:00:00Z'))).toBe('Sep 9, 2026, 3:00 PM ET');
  });
});
