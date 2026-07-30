'use client';

/**
 * Client-side entitlement lookup.
 *
 * Components used to gate on the owner email, which is a client-safe constant.
 * Plans aren't — they live in Redis — so this fetches them once and shares the
 * result across every caller, keeping the several components that gate on
 * brokerage access to a single request.
 *
 * Implemented as an external store rather than per-component state: the cache
 * genuinely lives outside React (module scope, shared across the tree), which
 * is exactly what useSyncExternalStore is for, and it avoids each consumer
 * re-fetching or cascading renders on mount.
 *
 * `loading` matters: gates should render nothing rather than flash the
 * free-tier state at a paying user while the fetch is in flight.
 */

import { useSyncExternalStore } from 'react';
import { type Entitlements, FREE_ENTITLEMENTS } from '@/lib/entitlements';

let cached: Entitlements | null = null;
let inFlight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function load(): void {
  if (cached || inFlight) return;
  inFlight = fetch('/api/user/entitlements')
    .then((r) => r.json())
    .then((j) => (j?.success && j.entitlements ? (j.entitlements as Entitlements) : FREE_ENTITLEMENTS))
    .catch(() => FREE_ENTITLEMENTS)
    .then((e) => {
      cached = e;
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

function getSnapshot(): Entitlements | null {
  return cached;
}

/** Server render has no session fetch; treat as loading so nothing flashes. */
function getServerSnapshot(): Entitlements | null {
  return null;
}

/** Drop the cache after a plan change so gates re-evaluate without a reload. */
export function invalidateEntitlements(): void {
  cached = null;
  inFlight = null;
  emit();
  if (listeners.size > 0) load();
}

export function useEntitlements(): { entitlements: Entitlements; loading: boolean } {
  const value = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return { entitlements: value ?? FREE_ENTITLEMENTS, loading: value === null };
}

/** Convenience wrapper for the one gate most components care about. */
export function useBrokerageAccess(): { allowed: boolean; loading: boolean } {
  const { entitlements, loading } = useEntitlements();
  return { allowed: entitlements.brokerageAccess, loading };
}
