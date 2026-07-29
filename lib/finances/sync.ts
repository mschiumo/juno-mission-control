/**
 * Sync orchestration: Plaid Items → account rows → daily history snapshot.
 *
 * Shared by the manual Refresh button and the nightly cron so both paths behave
 * identically. One institution failing never aborts the others — its accounts
 * keep their last known values and carry an error state the UI can show.
 */

import { type BalanceSnapshot, type CreditAccount, type PlaidAccountSnapshot } from './credit-cards';
import { mergeSnapshots } from './merge';
import { fetchCreditSnapshots, PlaidError } from './plaid';
import { accessTokenOf, markItemStatus, readItems, type StoredPlaidItem } from './plaid-items';
import { readAccounts, recordSnapshot, writeAccounts } from './store';

export interface SyncItemOutcome {
  itemId: string;
  institutionName: string;
  status: 'ok' | 'reauth-required' | 'error';
  message?: string;
  accountsCreated: number;
  accountsUpdated: number;
}

export interface SyncSummary {
  ranAt: string;
  outcomes: SyncItemOutcome[];
  accountsCreated: number;
  accountsUpdated: number;
}

/** Flag every account belonging to a failed Item so the row can explain itself. */
function markAccountsFailed(
  accounts: CreditAccount[],
  itemId: string,
  status: 'reauth-required' | 'error',
  message: string,
): CreditAccount[] {
  return accounts.map((a) =>
    a.plaidItemId === itemId ? { ...a, syncStatus: status, syncError: message } : a,
  );
}

/**
 * One institution's fetch result, before any account state is touched.
 * Network work is deliberately separated from the account read/merge/write so
 * that slow Plaid calls do not sit inside the critical section.
 */
type FetchResult =
  | { item: StoredPlaidItem; ok: true; snapshots: PlaidAccountSnapshot[] }
  | { item: StoredPlaidItem; ok: false; status: 'reauth-required' | 'error'; message: string };

/**
 * Refresh every linked institution. Returns the persisted accounts and history
 * so callers can answer the request without a second read.
 *
 * Accounts are read *after* every Plaid call completes and written immediately
 * afterwards. Reading up front instead would leave a multi-second window (the
 * duration of the network calls) in which a concurrent edit or Refresh could be
 * silently overwritten by this write.
 */
export async function syncAllItems(
  userId: string,
  options: { onlyItemId?: string } = {},
): Promise<{ summary: SyncSummary; accounts: CreditAccount[]; history: BalanceSnapshot[] }> {
  const now = new Date().toISOString();
  const allItems = await readItems(userId);
  const items = options.onlyItemId
    ? allItems.filter((i) => i.itemId === options.onlyItemId)
    : allItems;

  // Phase 1 — all network I/O, touching no account state.
  const fetched: FetchResult[] = [];
  for (const item of items) {
    fetched.push(await fetchForItem(userId, item));
  }

  // Phase 2 — fold results into the freshest account list and persist at once.
  let accounts = (await readAccounts(userId)) ?? [];
  const outcomes: SyncItemOutcome[] = [];
  let totalCreated = 0;
  let totalUpdated = 0;

  for (const result of fetched) {
    const base = { itemId: result.item.itemId, institutionName: result.item.institutionName };
    if (result.ok) {
      const merged = mergeSnapshots(accounts, result.snapshots, now);
      accounts = merged.accounts;
      totalCreated += merged.created;
      totalUpdated += merged.updated;
      outcomes.push({
        ...base,
        status: 'ok',
        accountsCreated: merged.created,
        accountsUpdated: merged.updated,
      });
    } else {
      accounts = markAccountsFailed(accounts, result.item.itemId, result.status, result.message);
      outcomes.push({
        ...base,
        status: result.status,
        message: result.message,
        accountsCreated: 0,
        accountsUpdated: 0,
      });
    }
  }

  await writeAccounts(userId, accounts);
  const history = await recordSnapshot(userId, accounts);

  return {
    summary: { ranAt: now, outcomes, accountsCreated: totalCreated, accountsUpdated: totalUpdated },
    accounts,
    history,
  };
}

/** Fetch one Item's balances, translating every failure into a stored status. */
async function fetchForItem(userId: string, item: StoredPlaidItem): Promise<FetchResult> {
  let token: string;
  try {
    token = accessTokenOf(item);
  } catch {
    // Almost always a rotated FINANCE_TOKEN_SECRET — the stored ciphertext can
    // no longer be opened, so reconnecting is the only route forward.
    const message = 'Stored credentials could not be read — reconnect this bank.';
    await markItemStatus(userId, item.itemId, 'reauth-required', message);
    return { item, ok: false, status: 'reauth-required', message };
  }

  try {
    const snapshots = await fetchCreditSnapshots(token, {
      itemId: item.itemId,
      institutionName: item.institutionName,
    });
    await markItemStatus(userId, item.itemId, 'ok');
    return { item, ok: true, snapshots };
  } catch (error) {
    const plaidError =
      error instanceof PlaidError
        ? error
        : new PlaidError({
            message: error instanceof Error ? error.message : 'Unknown sync failure',
            httpStatus: 500,
          });
    const status = plaidError.isReauthRequired ? 'reauth-required' : 'error';
    const message = plaidError.userMessage;

    // Log the code only — never the token, the response body, or credentials.
    console.error(`Plaid sync failed for item ${item.itemId} (${plaidError.errorCode})`);
    await markItemStatus(userId, item.itemId, status, message);

    return { item, ok: false, status, message };
  }
}
