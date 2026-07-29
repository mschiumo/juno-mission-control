import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fetchCreditSnapshots, PlaidError, plaidConfigured } from '../lib/finances/plaid';
import { encryptToken, decryptToken } from '../lib/finances/crypto';
import {
  PLAID_ITEMS_KEY,
  PLAID_ITEMS_SCAN_PATTERN,
  userIdFromItemsKey,
} from '../lib/finances/plaid-items';

/**
 * Exercises the Plaid client against a payload shaped like the documented
 * /liabilities/get response. A wrong field name here would fail silently in
 * production (balances quietly missing), so the fixture mirrors Plaid's docs
 * field-for-field rather than being simplified.
 */

const LIABILITIES_FIXTURE = {
  accounts: [
    {
      account_id: 'plaid-cc-1',
      name: 'Quicksilver',
      official_name: 'Capital One Quicksilver Cash Rewards',
      mask: '4321',
      type: 'credit',
      subtype: 'credit card',
      balances: { available: 6509, current: 3491.24, limit: 10000, iso_currency_code: 'USD' },
    },
    {
      account_id: 'plaid-cc-2',
      name: 'Venture',
      official_name: null,
      mask: '8899',
      type: 'credit',
      subtype: 'credit card',
      balances: { available: null, current: 6218, limit: null, iso_currency_code: 'USD' },
    },
    {
      account_id: 'plaid-checking',
      name: 'Checking',
      official_name: '360 Checking',
      mask: '1111',
      type: 'depository',
      subtype: 'checking',
      balances: { available: 2500, current: 2500, limit: null, iso_currency_code: 'USD' },
    },
  ],
  liabilities: {
    credit: [
      {
        account_id: 'plaid-cc-1',
        aprs: [
          { apr_percentage: 27.99, apr_type: 'cash_apr', balance_subject_to_apr: 0, interest_charge_amount: 0 },
          { apr_percentage: 18.49, apr_type: 'purchase_apr', balance_subject_to_apr: 3491.24, interest_charge_amount: 53.79 },
        ],
        is_overdue: false,
        last_payment_amount: 200,
        last_payment_date: '2026-07-01',
        last_statement_balance: 3600.5,
        minimum_payment_amount: 45,
        next_payment_due_date: '2026-08-15T00:00:00Z',
      },
      {
        account_id: 'plaid-cc-2',
        aprs: null,
        is_overdue: null,
        last_payment_amount: null,
        last_statement_balance: null,
        minimum_payment_amount: null,
        next_payment_due_date: null,
      },
    ],
  },
  item: { item_id: 'item-abc' },
  request_id: 'req-123',
};

function mockFetchOnce(body: unknown, status = 200) {
  const spy = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal('fetch', spy);
  return spy;
}

beforeEach(() => {
  vi.stubEnv('PLAID_CLIENT_ID', 'test-client-id');
  vi.stubEnv('PLAID_SECRET', 'test-secret');
  vi.stubEnv('PLAID_ENV', 'sandbox');
  vi.stubEnv('FINANCE_TOKEN_SECRET', 'test-secret-key-for-unit-tests-only');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('plaidConfigured', () => {
  it('requires the API keys and the encryption secret together', () => {
    expect(plaidConfigured()).toBe(true);
    vi.stubEnv('FINANCE_TOKEN_SECRET', '');
    expect(plaidConfigured()).toBe(false);
  });
});

describe('fetchCreditSnapshots', () => {
  it('maps a documented liabilities payload onto snapshots', async () => {
    mockFetchOnce(LIABILITIES_FIXTURE);

    const snapshots = await fetchCreditSnapshots('access-token', {
      itemId: 'item-abc',
      institutionName: 'Capital One',
    });

    // The depository account is excluded — this tab only tracks credit lines.
    expect(snapshots).toHaveLength(2);

    const [first, second] = snapshots;
    expect(first).toEqual({
      plaidItemId: 'item-abc',
      plaidAccountId: 'plaid-cc-1',
      institutionName: 'Capital One',
      name: 'Capital One Quicksilver Cash Rewards', // official_name preferred
      mask: '4321',
      balance: 3491.24,
      apr: 18.49, // purchase APR, not the 27.99 cash APR
      creditLimit: 10000,
      minPayment: 45,
      nextDueDate: '2026-08-15', // timestamp trimmed to a date
      lastStatementBalance: 3600.5,
    });

    // An account with no card terms still syncs its balance.
    expect(second.balance).toBe(6218);
    expect(second.name).toBe('Venture'); // falls back to name when official_name is null
    expect(second.apr).toBeUndefined();
    expect(second.creditLimit).toBeUndefined();
    expect(second.minPayment).toBeUndefined();
    expect(second.nextDueDate).toBeUndefined();
  });

  it('sends credentials as headers, never in the request body', async () => {
    const spy = mockFetchOnce(LIABILITIES_FIXTURE);
    await fetchCreditSnapshots('access-token', { itemId: 'i', institutionName: 'Bank' });

    const [url, init] = spy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://sandbox.plaid.com/liabilities/get');
    expect((init.headers as Record<string, string>)['PLAID-CLIENT-ID']).toBe('test-client-id');
    expect((init.headers as Record<string, string>)['PLAID-SECRET']).toBe('test-secret');
    expect(init.body).toBe(JSON.stringify({ access_token: 'access-token' }));
    expect(String(init.body)).not.toContain('test-secret');
  });

  it('includes a credit account even when the liabilities block is missing entirely', async () => {
    mockFetchOnce({ accounts: LIABILITIES_FIXTURE.accounts, liabilities: null });
    const snapshots = await fetchCreditSnapshots('t', { itemId: 'i', institutionName: 'Bank' });
    expect(snapshots).toHaveLength(2);
    expect(snapshots[0].balance).toBe(3491.24);
    expect(snapshots[0].apr).toBeUndefined();
  });

  it('skips accounts with no usable current balance', async () => {
    mockFetchOnce({
      accounts: [
        {
          account_id: 'x',
          name: 'Broken',
          official_name: null,
          mask: null,
          type: 'credit',
          subtype: 'credit card',
          balances: { available: null, current: null, limit: null, iso_currency_code: 'USD' },
        },
      ],
    });
    expect(await fetchCreditSnapshots('t', { itemId: 'i', institutionName: 'Bank' })).toEqual([]);
  });

  it('classifies an expired bank login as needing reauthentication', async () => {
    mockFetchOnce(
      {
        error_type: 'ITEM_ERROR',
        error_code: 'ITEM_LOGIN_REQUIRED',
        error_message: 'the login details of this item have changed',
        display_message: 'Please reconnect your account.',
      },
      400,
    );

    await expect(
      fetchCreditSnapshots('t', { itemId: 'i', institutionName: 'Bank' }),
    ).rejects.toSatisfy((error: unknown) => {
      const plaidError = error as PlaidError;
      return (
        plaidError instanceof PlaidError &&
        plaidError.isReauthRequired &&
        !plaidError.isTransient &&
        plaidError.userMessage === 'Bank login expired — reconnect to resume syncing.'
      );
    });
  });

  it('treats a rate limit as transient with its own message', async () => {
    mockFetchOnce({ error_type: 'RATE_LIMIT_EXCEEDED', error_code: 'RATE_LIMIT_EXCEEDED' }, 429);

    await expect(
      fetchCreditSnapshots('t', { itemId: 'i', institutionName: 'Bank' }),
    ).rejects.toSatisfy((error: unknown) => {
      const plaidError = error as PlaidError;
      return plaidError.isTransient && !plaidError.isReauthRequired;
    });
  });

  it('surfaces a non-JSON gateway failure as a transient error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>502</html>', { status: 502 })));

    await expect(
      fetchCreditSnapshots('t', { itemId: 'i', institutionName: 'Bank' }),
    ).rejects.toSatisfy((error: unknown) => (error as PlaidError).isTransient);
  });

  it('refuses to call Plaid at all when unconfigured', async () => {
    vi.stubEnv('PLAID_CLIENT_ID', '');
    const spy = mockFetchOnce(LIABILITIES_FIXTURE);

    await expect(fetchCreditSnapshots('t', { itemId: 'i', institutionName: 'B' })).rejects.toThrow(
      'Plaid is not configured',
    );
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('token encryption', () => {
  it('round-trips a token without storing it in the clear', () => {
    const token = 'access-sandbox-11111111-2222-3333-4444-555555555555';
    const stored = encryptToken(token);

    expect(stored).not.toContain(token);
    expect(stored.startsWith('v1:')).toBe(true);
    expect(decryptToken(stored)).toBe(token);
  });

  it('produces a different ciphertext each time (fresh IV)', () => {
    expect(encryptToken('same-token')).not.toBe(encryptToken('same-token'));
  });

  it('refuses to decrypt tampered ciphertext', () => {
    const stored = encryptToken('access-token');
    const [v, iv, tag, data] = stored.split(':');
    const tampered = [v, iv, tag, Buffer.from('evil').toString('base64')].join(':');
    expect(() => decryptToken(tampered)).toThrow();
    expect(() => decryptToken(`${v}:${iv}:${tag}:${data}extra`)).toThrow();
  });

  it('cannot be read after the secret rotates', () => {
    const stored = encryptToken('access-token');
    vi.stubEnv('FINANCE_TOKEN_SECRET', 'a-completely-different-secret-value');
    expect(() => decryptToken(stored)).toThrow();
  });
});

describe('nightly sweep key scanning', () => {
  it('builds a pattern that actually matches real item keys', () => {
    // The user id is infixed, so the wildcard must sit in the middle. A trailing
    // wildcard on PLAID_ITEMS_KEY('') matches nothing and the cron no-ops.
    expect(PLAID_ITEMS_SCAN_PATTERN).toBe('finances:*:plaid-items');
    expect(PLAID_ITEMS_KEY('abc123')).toBe('finances:abc123:plaid-items');

    const asRegex = new RegExp(`^${PLAID_ITEMS_SCAN_PATTERN.replace('*', '[^:]+')}$`);
    expect(asRegex.test(PLAID_ITEMS_KEY('abc123'))).toBe(true);
  });

  it('recovers the user id from a scanned key', () => {
    expect(userIdFromItemsKey('finances:abc123:plaid-items')).toBe('abc123');
    expect(userIdFromItemsKey('finances:user-with-dashes:plaid-items')).toBe('user-with-dashes');
  });

  it('rejects keys belonging to other features or with a malformed id', () => {
    expect(userIdFromItemsKey('finances:abc123:credit-cards')).toBeNull();
    expect(userIdFromItemsKey('finances::plaid-items')).toBeNull();
    expect(userIdFromItemsKey('other:abc:plaid-items')).toBeNull();
    expect(userIdFromItemsKey('finances:a:b:plaid-items')).toBeNull();
  });
});
