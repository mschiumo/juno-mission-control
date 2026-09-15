import { describe, expect, it } from 'vitest';
import {
  describeGrantWindow,
  referralExpiryFor,
  referralGrantFor,
  type EntitlementRecord,
} from '@/lib/entitlements';

const NOW = new Date('2026-09-14T12:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

function record(overrides: Partial<EntitlementRecord>): EntitlementRecord {
  return { tier: 'gold', source: 'trial', updatedAt: NOW.toISOString(), ...overrides };
}

describe('referralGrantFor', () => {
  it('resolves SinaTrades to three months of Gold, case-insensitively', () => {
    expect(referralGrantFor('SinaTrades')).toEqual({ tier: 'gold', days: 90 });
    expect(referralGrantFor('  sinatrades ')).toEqual({ tier: 'gold', days: 90 });
    expect(referralGrantFor('SINATRADES')).toEqual({ tier: 'gold', days: 90 });
  });

  it('keeps the existing EmmanuelTrades month', () => {
    expect(referralGrantFor('EmmanuelTrades')).toEqual({ tier: 'gold', days: 30 });
  });

  it('rejects unknown codes', () => {
    expect(referralGrantFor('nope')).toBeNull();
    expect(referralGrantFor('')).toBeNull();
  });
});

describe('describeGrantWindow', () => {
  it('renders whole months and plain days', () => {
    expect(describeGrantWindow(30)).toBe('1 month');
    expect(describeGrantWindow(90)).toBe('3 months');
    expect(describeGrantWindow(7)).toBe('7 days');
    expect(describeGrantWindow(1)).toBe('1 day');
  });
});

describe('referralExpiryFor', () => {
  const grant = referralGrantFor('SinaTrades')!;

  it('starts the window now for a user with no record', () => {
    expect(referralExpiryFor(null, grant, NOW)).toBe(new Date(NOW.getTime() + 90 * DAY).toISOString());
  });

  it('starts the window now when the existing record has expired', () => {
    const expired = record({ expiresAt: new Date(NOW.getTime() - DAY).toISOString() });
    expect(referralExpiryFor(expired, grant, NOW)).toBe(new Date(NOW.getTime() + 90 * DAY).toISOString());
  });

  it('starts the window now for an active lower tier', () => {
    const silver = record({ tier: 'silver', source: 'admin' });
    expect(referralExpiryFor(silver, grant, NOW)).toBe(new Date(NOW.getTime() + 90 * DAY).toISOString());
  });

  it('stacks onto an active Gold trial so the friend gets the full 3 months on top', () => {
    const trialEnd = new Date(NOW.getTime() + 5 * DAY);
    const trial = record({ source: 'trial', expiresAt: trialEnd.toISOString() });
    expect(referralExpiryFor(trial, grant, NOW)).toBe(new Date(trialEnd.getTime() + 90 * DAY).toISOString());
  });

  it('stacks onto an active same-tier referral window', () => {
    const end = new Date(NOW.getTime() + 20 * DAY);
    const referral = record({ source: 'referral', expiresAt: end.toISOString() });
    expect(referralExpiryFor(referral, grant, NOW)).toBe(new Date(end.getTime() + 90 * DAY).toISOString());
  });

  it('has nothing to add for a paying Gold subscriber', () => {
    const billing = record({
      source: 'billing',
      billingRef: 'sub_1',
      expiresAt: new Date(NOW.getTime() + 20 * DAY).toISOString(),
    });
    expect(referralExpiryFor(billing, grant, NOW)).toBeNull();
  });

  it('has nothing to add for an open-ended admin grant or a higher tier', () => {
    expect(referralExpiryFor(record({ source: 'admin' }), grant, NOW)).toBeNull();
    const platinum = record({ tier: 'platinum', source: 'trial', expiresAt: new Date(NOW.getTime() + DAY).toISOString() });
    expect(referralExpiryFor(platinum, grant, NOW)).toBeNull();
  });
});
