/**
 * Pure matching rules for folding Plaid data into the account list.
 *
 * Kept free of Redis/network imports so the rules that decide whether a bank
 * balance overwrites a user's row can be unit-tested in isolation.
 */

import { randomUUID } from 'crypto';
import { applySnapshot, type CreditAccount, type PlaidAccountSnapshot } from './credit-cards';

/** lowercase, alphanumerics only — "CapitalOne QS" -> "capitaloneqs" */
function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Find the pre-existing manual account a freshly-linked Plaid card refers to, so
 * connecting a bank enriches the row the user already curated instead of leaving
 * a duplicate beside it.
 *
 * Deliberately refuses to guess: it only adopts on a strong signal (matching
 * last-four, or one name clearly containing the other) and bails out entirely
 * when two candidates tie. A wrong merge would silently overwrite the balance of
 * an unrelated card, which is far worse than leaving a duplicate to delete.
 */
export function findAdoptionCandidate(
  accounts: CreditAccount[],
  snap: PlaidAccountSnapshot,
): CreditAccount | null {
  const unlinked = accounts.filter((a) => a.source !== 'plaid' && !a.plaidAccountId);
  if (!unlinked.length) return null;

  if (snap.mask) {
    const byMask = unlinked.filter((a) => a.mask && a.mask === snap.mask);
    if (byMask.length === 1) return byMask[0];
  }

  const target = normalizeName(snap.name);
  if (target.length < 3) return null;

  const exact = unlinked.filter((a) => normalizeName(a.name) === target);
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return null;

  const overlapping = unlinked.filter((a) => {
    const candidate = normalizeName(a.name);
    if (candidate.length < 4) return false;
    return target.includes(candidate) || candidate.includes(target);
  });
  return overlapping.length === 1 ? overlapping[0] : null;
}

/**
 * Fold one Item's snapshots into the account list. Pure apart from id/timestamp
 * generation, so the matching rules stay easy to reason about and test.
 */
export function mergeSnapshots(
  accounts: CreditAccount[],
  snapshots: PlaidAccountSnapshot[],
  now: string,
  newId: () => string = randomUUID,
): { accounts: CreditAccount[]; created: number; updated: number } {
  let created = 0;
  let updated = 0;
  const next = [...accounts];

  for (const snap of snapshots) {
    const linkedIdx = next.findIndex((a) => a.plaidAccountId === snap.plaidAccountId);
    if (linkedIdx >= 0) {
      next[linkedIdx] = applySnapshot(next[linkedIdx], snap, now);
      updated++;
      continue;
    }

    const candidate = findAdoptionCandidate(next, snap);
    if (candidate) {
      const idx = next.findIndex((a) => a.id === candidate.id);
      next[idx] = applySnapshot(candidate, snap, now);
      updated++;
      continue;
    }

    next.push(
      applySnapshot(
        {
          id: newId(),
          name: snap.name,
          balance: snap.balance,
          apr: snap.apr ?? 0,
          monthlyPayment: 0,
          createdAt: now,
          updatedAt: now,
        },
        snap,
        now,
      ),
    );
    created++;
  }

  return { accounts: next, created, updated };
}

/**
 * Turn a linked account back into a plain manual one, keeping every number the
 * user can see. Used when disconnecting a bank: losing the row (and its history)
 * would be a far worse outcome than losing live updates.
 */
export function unlinkAccount(account: CreditAccount, now: string): CreditAccount {
  // Built as an explicit allowlist rather than by omitting sync keys, so any
  // future Plaid-sourced field is dropped by default instead of leaking through
  // as a stale number the user can no longer refresh.
  return {
    id: account.id,
    name: account.name,
    balance: account.balance,
    apr: account.apr,
    monthlyPayment: account.monthlyPayment,
    createdAt: account.createdAt,
    updatedAt: now,
    source: 'manual',
  };
}
