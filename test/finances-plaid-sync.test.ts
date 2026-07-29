import { describe, it, expect } from 'vitest';
import {
  applySnapshot,
  applyManualEdit,
  clearOverrides,
  isLinked,
  isPinned,
  monthlyInterest,
  projectPayoff,
  weightedAvgApr,
  type CreditAccount,
  type PlaidAccountSnapshot,
} from '../lib/finances/credit-cards';
import { findAdoptionCandidate, mergeSnapshots, unlinkAccount } from '../lib/finances/merge';
import { selectPurchaseApr } from '../lib/finances/plaid';

const NOW = '2026-07-30T12:00:00.000Z';

function account(overrides: Partial<CreditAccount> = {}): CreditAccount {
  return {
    id: 'acct-1',
    name: 'Amazon (Synchrony)',
    balance: 5139,
    apr: 30,
    monthlyPayment: 250,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}

function snapshot(overrides: Partial<PlaidAccountSnapshot> = {}): PlaidAccountSnapshot {
  return {
    plaidItemId: 'item-abc',
    plaidAccountId: 'plaid-acct-1',
    institutionName: 'Synchrony Bank',
    name: 'Synchrony Store Card',
    mask: '4321',
    balance: 5010.42,
    apr: 29.99,
    creditLimit: 8000,
    minPayment: 128,
    nextDueDate: '2026-08-15',
    lastStatementBalance: 5139,
    ...overrides,
  };
}

describe('applySnapshot', () => {
  it('pulls Plaid values into an unpinned account and stamps sync metadata', () => {
    const next = applySnapshot(account(), snapshot(), NOW);

    expect(next.balance).toBe(5010.42);
    expect(next.apr).toBe(29.99);
    expect(next.source).toBe('plaid');
    expect(next.plaidAccountId).toBe('plaid-acct-1');
    expect(next.institutionName).toBe('Synchrony Bank');
    expect(next.mask).toBe('4321');
    expect(next.lastSyncedAt).toBe(NOW);
    expect(next.syncStatus).toBe('ok');
    expect(next.syncError).toBeUndefined();
    expect(isLinked(next)).toBe(true);
  });

  it('never rewrites the user-owned name or planned payment', () => {
    const next = applySnapshot(account({ name: 'My Amazon Card', monthlyPayment: 400 }), snapshot(), NOW);

    // Plaid calls it "Synchrony Store Card" — the user's label wins.
    expect(next.name).toBe('My Amazon Card');
    // Plaid's minimum is informational; the planned payment is the user's.
    expect(next.monthlyPayment).toBe(400);
    expect(next.minPayment).toBe(128);
  });

  it('leaves a pinned balance alone but still records what Plaid reported', () => {
    const next = applySnapshot(
      account({ balance: 5200, manualOverrides: ['balance'], source: 'plaid', plaidAccountId: 'plaid-acct-1' }),
      snapshot({ balance: 5010.42 }),
      NOW,
    );

    expect(next.balance).toBe(5200); // user's pinned figure survives the sync
    expect(next.syncedBalance).toBe(5010.42); // ...and Plaid's is retained for display
    expect(isPinned(next, 'balance')).toBe(true);
  });

  it('leaves a pinned APR alone', () => {
    const next = applySnapshot(
      account({ apr: 24.99, manualOverrides: ['apr'], source: 'plaid', plaidAccountId: 'plaid-acct-1' }),
      snapshot({ apr: 29.99 }),
      NOW,
    );

    expect(next.apr).toBe(24.99);
    expect(next.syncedApr).toBe(29.99);
    expect(next.balance).toBe(5010.42); // unpinned field still syncs
  });

  it('keeps the existing APR when Plaid reports none rather than zeroing it', () => {
    const next = applySnapshot(account({ apr: 18.49 }), snapshot({ apr: undefined }), NOW);

    expect(next.apr).toBe(18.49);
    expect(next.syncedApr).toBeUndefined();
  });

  it('treats a genuine 0% promotional APR as a real value', () => {
    const next = applySnapshot(account({ name: 'Affirm', apr: 12 }), snapshot({ apr: 0 }), NOW);

    expect(next.apr).toBe(0);
    expect(next.syncedApr).toBe(0);
  });

  it('clears a previous error once a sync succeeds', () => {
    const next = applySnapshot(
      account({ syncStatus: 'reauth-required', syncError: 'Login expired' }),
      snapshot(),
      NOW,
    );

    expect(next.syncStatus).toBe('ok');
    expect(next.syncError).toBeUndefined();
  });
});

describe('applyManualEdit', () => {
  const linked = account({
    source: 'plaid',
    plaidAccountId: 'plaid-acct-1',
    balance: 5010.42,
    apr: 29.99,
    monthlyPayment: 250,
  });
  const seen = { balance: 5010.42, apr: 29.99 };

  function edit(over: Partial<{ name: string; balance: number; apr: number; monthlyPayment: number }> = {}) {
    return { name: linked.name, balance: 5010.42, apr: 29.99, monthlyPayment: 250, ...over };
  }

  it('pins nothing when only the planned payment changed', () => {
    const next = applyManualEdit(linked, edit({ monthlyPayment: 400 }), seen, NOW);
    expect(next.manualOverrides).toBeUndefined();
    expect(next.monthlyPayment).toBe(400);
  });

  it('pins just the field the user actually changed', () => {
    expect(applyManualEdit(linked, edit({ balance: 4900 }), seen, NOW).manualOverrides).toEqual(['balance']);
    expect(applyManualEdit(linked, edit({ apr: 24 }), seen, NOW).manualOverrides).toEqual(['apr']);
  });

  it('pins both when both changed', () => {
    const next = applyManualEdit(linked, edit({ balance: 4900, apr: 24 }), seen, NOW);
    expect([...next.manualOverrides!].sort()).toEqual(['apr', 'balance']);
    expect(next.balance).toBe(4900);
    expect(next.apr).toBe(24);
  });

  it('ignores sub-cent float noise from a JSON round-trip', () => {
    expect(applyManualEdit(linked, edit({ balance: 5010.4200000001 }), seen, NOW).manualOverrides).toBeUndefined();
  });

  it('keeps pins that were already set', () => {
    const alreadyPinned = { ...linked, manualOverrides: ['apr' as const] };
    const next = applyManualEdit(alreadyPinned, edit({ balance: 4900 }), seen, NOW);
    expect([...next.manualOverrides!].sort()).toEqual(['apr', 'balance']);
  });

  it('never pins anything on a manual (unlinked) account', () => {
    const next = applyManualEdit(account(), edit({ balance: 1, apr: 2 }), undefined, NOW);
    expect(next.manualOverrides).toBeUndefined();
    expect(next.balance).toBe(1);
  });

  // The regression this API exists for: a sync lands while the edit form is open.
  it('does not pin a stale balance the user never touched', () => {
    // Form was opened when the balance read 5010.42; a sync then moved it to 4800.
    const synced = { ...linked, balance: 4800 };
    const next = applyManualEdit(synced, edit({ monthlyPayment: 300 }), seen, NOW);

    expect(next.manualOverrides).toBeUndefined(); // no accidental pin
    expect(next.balance).toBe(4800); // fresher stored value survives, not the stale 5010.42
    expect(next.monthlyPayment).toBe(300); // the intended change lands
  });

  it('still honours a real override when the value also moved underneath', () => {
    const synced = { ...linked, balance: 4800 };
    const next = applyManualEdit(synced, edit({ balance: 5200 }), seen, NOW);

    expect(next.manualOverrides).toEqual(['balance']);
    expect(next.balance).toBe(5200);
  });

  it('falls back to comparing against stored values when seen is absent', () => {
    const next = applyManualEdit(linked, edit({ balance: 4900 }), undefined, NOW);
    expect(next.manualOverrides).toEqual(['balance']);
  });

  it('always takes the name and payment from the edit', () => {
    const next = applyManualEdit(linked, edit({ name: 'Renamed Card', monthlyPayment: 0 }), seen, NOW);
    expect(next.name).toBe('Renamed Card');
    expect(next.monthlyPayment).toBe(0);
  });
});

describe('clearOverrides', () => {
  it('restores the last Plaid values immediately', () => {
    const pinned = account({
      source: 'plaid',
      plaidAccountId: 'plaid-acct-1',
      balance: 5200,
      apr: 24.99,
      manualOverrides: ['balance', 'apr'],
      syncedBalance: 5010.42,
      syncedApr: 29.99,
    });

    const next = clearOverrides(pinned, NOW);

    expect(next.manualOverrides).toEqual([]);
    expect(next.balance).toBe(5010.42);
    expect(next.apr).toBe(29.99);
  });

  it('leaves values as-is when Plaid never reported one', () => {
    const next = clearOverrides(account({ balance: 100, apr: 5, manualOverrides: ['balance'] }), NOW);

    expect(next.balance).toBe(100);
    expect(next.apr).toBe(5);
  });
});

describe('selectPurchaseApr', () => {
  it('prefers the purchase APR over cash-advance and balance-transfer rates', () => {
    expect(
      selectPurchaseApr([
        { apr_percentage: 29.99, apr_type: 'cash_apr' },
        { apr_percentage: 18.49, apr_type: 'purchase_apr' },
        { apr_percentage: 0, apr_type: 'balance_transfer_apr' },
      ]),
    ).toBe(18.49);
  });

  it('falls back to a promotional rate when no purchase APR is reported', () => {
    expect(selectPurchaseApr([{ apr_percentage: 0, apr_type: 'special' }])).toBe(0);
  });

  it('uses a lone unlabelled rate but refuses to guess between several', () => {
    expect(selectPurchaseApr([{ apr_percentage: 22.5, apr_type: null }])).toBe(22.5);
    expect(
      selectPurchaseApr([
        { apr_percentage: 22.5, apr_type: null },
        { apr_percentage: 27.5, apr_type: null },
      ]),
    ).toBeUndefined();
  });

  it('handles missing and malformed data', () => {
    expect(selectPurchaseApr(undefined)).toBeUndefined();
    expect(selectPurchaseApr(null)).toBeUndefined();
    expect(selectPurchaseApr([])).toBeUndefined();
    expect(selectPurchaseApr([{ apr_percentage: null, apr_type: 'purchase_apr' }])).toBeUndefined();
  });
});

describe('findAdoptionCandidate', () => {
  const manualRoster: CreditAccount[] = [
    account({ id: 'a1', name: 'CapitalOne QS' }),
    account({ id: 'a2', name: 'CapitalOne Venture' }),
    account({ id: 'a3', name: 'Apple' }),
    account({ id: 'a4', name: 'Venmo' }),
  ];

  it('adopts a manual account whose name the Plaid name contains', () => {
    expect(findAdoptionCandidate(manualRoster, snapshot({ name: 'Apple Card' }))?.id).toBe('a3');
    expect(findAdoptionCandidate(manualRoster, snapshot({ name: 'Venmo Credit Card' }))?.id).toBe('a4');
  });

  it('matches on last-four when both sides have one', () => {
    const withMask = [...manualRoster, account({ id: 'a5', name: 'Store card', mask: '4321' })];
    expect(findAdoptionCandidate(withMask, snapshot({ name: 'Unrecognizable', mask: '4321' }))?.id).toBe('a5');
  });

  it('refuses to guess when the name is ambiguous between two accounts', () => {
    const ambiguous = [account({ id: 'b1', name: 'Chase' }), account({ id: 'b2', name: 'Chase' })];
    expect(findAdoptionCandidate(ambiguous, snapshot({ name: 'Chase', mask: undefined }))).toBeNull();
  });

  it('does not adopt when nothing resembles the incoming card', () => {
    expect(findAdoptionCandidate(manualRoster, snapshot({ name: 'Chase Ink Business Cash' }))).toBeNull();
  });

  it('never steals an account that is already linked to Plaid', () => {
    const linked = [account({ id: 'c1', name: 'Apple', source: 'plaid', plaidAccountId: 'other-plaid-id' })];
    expect(findAdoptionCandidate(linked, snapshot({ name: 'Apple Card' }))).toBeNull();
  });
});

describe('mergeSnapshots', () => {
  let counter = 0;
  const ids = () => `generated-${++counter}`;

  it('updates the already-linked account in place', () => {
    const existing = [
      account({ id: 'a1', source: 'plaid', plaidAccountId: 'plaid-acct-1', balance: 5139, monthlyPayment: 300 }),
    ];
    const result = mergeSnapshots(existing, [snapshot({ balance: 4800 })], NOW, ids);

    expect(result.created).toBe(0);
    expect(result.updated).toBe(1);
    expect(result.accounts).toHaveLength(1);
    expect(result.accounts[0].balance).toBe(4800);
    expect(result.accounts[0].monthlyPayment).toBe(300);
  });

  it('creates a new account when nothing matches, defaulting the planned payment to zero', () => {
    const result = mergeSnapshots([], [snapshot({ name: 'Brand New Card', apr: 21 })], NOW, ids);

    expect(result.created).toBe(1);
    expect(result.accounts[0].name).toBe('Brand New Card');
    expect(result.accounts[0].apr).toBe(21);
    expect(result.accounts[0].monthlyPayment).toBe(0);
    expect(result.accounts[0].source).toBe('plaid');
  });

  it('adopts a matching manual account instead of duplicating it', () => {
    const existing = [account({ id: 'a1', name: 'Apple', balance: 16243, monthlyPayment: 500 })];
    const result = mergeSnapshots(existing, [snapshot({ name: 'Apple Card', balance: 16100 })], NOW, ids);

    expect(result.created).toBe(0);
    expect(result.accounts).toHaveLength(1);
    expect(result.accounts[0].id).toBe('a1'); // same row, now live
    expect(result.accounts[0].name).toBe('Apple'); // user's label kept
    expect(result.accounts[0].monthlyPayment).toBe(500); // user's plan kept
    expect(result.accounts[0].balance).toBe(16100); // balance now from Plaid
    expect(result.accounts[0].source).toBe('plaid');
  });

  it('leaves unrelated accounts untouched', () => {
    const existing = [account({ id: 'keep', name: 'Chase Business', balance: 4206 })];
    const result = mergeSnapshots(existing, [snapshot({ name: 'Totally Different' })], NOW, ids);

    expect(result.accounts).toHaveLength(2);
    expect(result.accounts.find((a) => a.id === 'keep')!.balance).toBe(4206);
    expect(result.accounts.find((a) => a.id === 'keep')!.source).toBeUndefined();
  });

  it('is idempotent — syncing the same data twice changes nothing but timestamps', () => {
    const first = mergeSnapshots([], [snapshot()], NOW, ids);
    const second = mergeSnapshots(first.accounts, [snapshot()], NOW, ids);

    expect(second.created).toBe(0);
    expect(second.accounts).toHaveLength(1);
    expect(second.accounts[0].balance).toBe(first.accounts[0].balance);
  });

  it('does not resurrect a pinned balance across a merge', () => {
    const pinned = [
      account({
        id: 'a1',
        source: 'plaid',
        plaidAccountId: 'plaid-acct-1',
        balance: 5200,
        manualOverrides: ['balance'],
      }),
    ];
    const result = mergeSnapshots(pinned, [snapshot({ balance: 4800 })], NOW, ids);

    expect(result.accounts[0].balance).toBe(5200);
    expect(result.accounts[0].syncedBalance).toBe(4800);
  });
});

describe('unlinkAccount', () => {
  it('keeps every user-visible number but strips all sync state', () => {
    const linked = account({
      source: 'plaid',
      plaidItemId: 'item-abc',
      plaidAccountId: 'plaid-acct-1',
      institutionName: 'Synchrony Bank',
      lastSyncedAt: NOW,
      syncStatus: 'ok',
      manualOverrides: ['balance'],
      syncedBalance: 5010,
      syncedApr: 29.99,
      minPayment: 128,
      nextDueDate: '2026-08-15',
      lastStatementBalance: 5139,
      balance: 5200,
      apr: 24.99,
      monthlyPayment: 250,
      name: 'My Amazon Card',
    });

    const manual = unlinkAccount(linked, NOW);

    expect(manual.name).toBe('My Amazon Card');
    expect(manual.balance).toBe(5200);
    expect(manual.apr).toBe(24.99);
    expect(manual.monthlyPayment).toBe(250);
    expect(manual.source).toBe('manual');
    expect(isLinked(manual)).toBe(false);

    for (const key of [
      'plaidItemId',
      'plaidAccountId',
      'institutionName',
      'lastSyncedAt',
      'syncStatus',
      'manualOverrides',
      'syncedBalance',
      'syncedApr',
      'minPayment',
      'nextDueDate',
      'lastStatementBalance',
    ]) {
      expect(manual).not.toHaveProperty(key);
    }
  });
});

// Guards on the payoff math the tab already shipped with — a Plaid-synced
// balance flows straight into these, so regressions here would misreport dates.
describe('payoff math with synced balances', () => {
  it('matches the hand-checked CapitalOne QS case', () => {
    const result = projectPayoff(3491, 18.49, 200);
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.months).toBe(21);
    expect(result.totalInterest).toBeCloseTo(607, 0);
  });

  it('flags a payment that cannot cover accruing interest', () => {
    expect(projectPayoff(1000, 99, 50).status).toBe('payment-too-low');
  });

  it('handles a 0% balance with no interest', () => {
    const result = projectPayoff(2314, 0, 200);
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.months).toBe(12);
    expect(result.totalInterest).toBe(0);
  });

  it('computes monthly interest and weighted APR across the real roster', () => {
    expect(monthlyInterest(3491, 18.49)).toBeCloseTo(53.79, 2);
    expect(
      weightedAvgApr([
        { balance: 3491, apr: 18.49 },
        { balance: 6218, apr: 25.5 },
        { balance: 2314, apr: 0 },
        { balance: 4206, apr: 23 },
        { balance: 4202, apr: 28 },
        { balance: 5139, apr: 30 },
        { balance: 16243, apr: 19.5 },
      ]),
    ).toBeCloseTo(21.73, 2);
  });
});
