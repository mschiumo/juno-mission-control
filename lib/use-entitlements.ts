'use client';

/**
 * Client-side entitlements — which tier the signed-in user holds and which
 * features that unlocks. Backed by GET /api/user/entitlements.
 *
 * Built on useSyncExternalStore with a module-scoped cache so every gating
 * component in the tree shares ONE request per page load, no matter how many
 * of them mount. Call invalidateEntitlements() after a plan change (trial
 * start, referral redemption, checkout) so gates re-evaluate without a
 * reload.
 */

import { useSyncExternalStore } from 'react';
import {
  type Entitlements,
  type Tier,
  FREE_ENTITLEMENTS,
} from '@/lib/entitlements';

export interface PlanStatus {
  entitlements: Entitlements;
  /** Whether the free Gold trial is still available to this user. */
  trialAvailable: boolean;
  /** Whether a referral code can still be redeemed by this user. */
  referralAvailable: boolean;
  /** ISO expiry of the current record, if it has one (trial/referral/billing). */
  expiresAt: string | null;
  /** Source of the current record ('trial', 'referral', 'billing', ...). */
  source: string | null;
}

const EMPTY_STATUS: PlanStatus = {
  entitlements: FREE_ENTITLEMENTS,
  trialAvailable: false,
  referralAvailable: false,
  expiresAt: null,
  source: null,
};

let cached: PlanStatus | null = null;
let inFlight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function load(): void {
  if (cached || inFlight) return;
  inFlight = fetch('/api/user/entitlements')
    .then((r) => r.json())
    .then((j) => (j?.success && j.status ? (j.status as PlanStatus) : EMPTY_STATUS))
    .catch(() => EMPTY_STATUS)
    .then((s) => {
      cached = s;
      inFlight = null;
      emit();
    });
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  load();
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): PlanStatus | null {
  return cached;
}

/** Server render has no session fetch; treat as loading so nothing flashes. */
function getServerSnapshot(): PlanStatus | null {
  return null;
}

/** Drop the cache after a plan change so gates re-evaluate without a reload. */
export function invalidateEntitlements(): void {
  cached = null;
  inFlight = null;
  emit();
  if (listeners.size > 0) load();
}

export function usePlanStatus(): { status: PlanStatus; loading: boolean } {
  const value = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return { status: value ?? EMPTY_STATUS, loading: value === null };
}

export function useEntitlements(): {
  entitlements: Entitlements;
  tier: Tier;
  loading: boolean;
} {
  const { status, loading } = usePlanStatus();
  return { entitlements: status.entitlements, tier: status.entitlements.tier, loading };
}
