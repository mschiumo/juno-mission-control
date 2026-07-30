import { describe, it, expect } from 'vitest';
import {
  entitlementsFor,
  isRecordActive,
  hasBrokerageAccess,
  FREE_ENTITLEMENTS,
  type EntitlementRecord,
} from '../lib/entitlements';

const NOW = new Date('2026-08-01T12:00:00.000Z');

function record(over: Partial<EntitlementRecord> = {}): EntitlementRecord {
  return { plan: 'pro', source: 'billing', updatedAt: NOW.toISOString(), ...over };
}

describe('isRecordActive', () => {
  it('treats a missing record as inactive', () => {
    expect(isRecordActive(null, NOW)).toBe(false);
  });

  it('treats an open-ended record as active', () => {
    expect(isRecordActive(record(), NOW)).toBe(true);
  });

  it('honours expiry in both directions', () => {
    expect(isRecordActive(record({ expiresAt: '2026-08-02T00:00:00.000Z' }), NOW)).toBe(true);
    expect(isRecordActive(record({ expiresAt: '2026-07-31T00:00:00.000Z' }), NOW)).toBe(false);
  });

  it('treats an unparseable expiry as inactive rather than active', () => {
    expect(isRecordActive(record({ expiresAt: 'not-a-date' }), NOW)).toBe(false);
  });
});

describe('entitlementsFor', () => {
  it('grants brokerage access on an active pro record', () => {
    expect(entitlementsFor(record(), NOW)).toEqual({ plan: 'pro', brokerageAccess: true });
  });

  // The money rule: a lapsed subscription must fall back to free, so a missed
  // billing webhook can never leave a non-paying user costing us a SnapTrade seat.
  it('falls back to free once a pro record expires', () => {
    const lapsed = record({ expiresAt: '2026-07-31T00:00:00.000Z' });
    expect(entitlementsFor(lapsed, NOW)).toEqual(FREE_ENTITLEMENTS);
    expect(hasBrokerageAccess(entitlementsFor(lapsed, NOW))).toBe(false);
  });

  it('gives no access with no record at all', () => {
    expect(entitlementsFor(null, NOW)).toEqual(FREE_ENTITLEMENTS);
  });

  it('does not grant brokerage access to an active free record', () => {
    expect(entitlementsFor(record({ plan: 'free' }), NOW)).toEqual(FREE_ENTITLEMENTS);
  });
});
