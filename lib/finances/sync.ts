/**
 * Sync orchestration: Plaid Items → account rows → daily history snapshot.
 *
 * Shared by the manual Refresh button and the nightly cron so both paths behave
 * identically. One institution failing never aborts the others — its accounts
 * keep their last known values and carry an error state the UI can show.
 */

import { type BalanceSnapshot, type CreditAccount } from './credit-cards';
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
 * Refresh every linked institution. Returns the persisted accounts and history
 * so callers can answer the request without a second read.
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

  let accounts = (await readAccounts(userId)) ?? [];
  const outcomes: SyncItemOutcome[] = [];
  let totalCreated = 0;
  let totalUpdated = 0;

  for (const item of items) {
    const outcome = await syncOneItem(userId, item, now, accounts);
    accounts = outcome.accounts;
    totalCreated += outcome.result.accountsCreated;
    totalUpdated += outcome.result.accountsUpdated;
    outcomes.push(outcome.result);
  }

  await writeAccounts(userId, accounts);
  const history = await recordSnapshot(userId, accounts);

  return {
    summary: { ranAt: now, outcomes, accountsCreated: totalCreated, accountsUpdated: totalUpdated },
    accounts,
    history,
  };
}

async function syncOneItem(
  userId: string,
  item: StoredPlaidItem,
  now: string,
  accounts: CreditAccount[],
): Promise<{ accounts: CreditAccount[]; result: SyncItemOutcome }> {
  const base = { itemId: item.itemId, institutionName: item.institutionName };

  let token: string;
  try {
    token = accessTokenOf(item);
  } catch {
    // Almost always a rotated FINANCE_TOKEN_SECRET — the stored ciphertext can
    // no longer be opened, so reconnecting is the only route forward.
    const message = 'Stored credentials could not be read — reconnect this bank.';
    await markItemStatus(userId, item.itemId, 'reauth-required', message);
    return {
      accounts: markAccountsFailed(accounts, item.itemId, 'reauth-required', message),
      result: { ...base, status: 'reauth-required', message, accountsCreated: 0, accountsUpdated: 0 },
    };
  }

  try {
    const snapshots = await fetchCreditSnapshots(token, {
      itemId: item.itemId,
      institutionName: item.institutionName,
    });
    const merged = mergeSnapshots(accounts, snapshots, now);
    await markItemStatus(userId, item.itemId, 'ok');
    return {
      accounts: merged.accounts,
      result: {
        ...base,
        status: 'ok',
        accountsCreated: merged.created,
        accountsUpdated: merged.updated,
      },
    };
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

    console.error(`Plaid sync failed for item ${item.itemId} (${plaidError.errorCode})`);
    await markItemStatus(userId, item.itemId, status, message);

    return {
      accounts: markAccountsFailed(accounts, item.itemId, status, message),
      result: { ...base, status, message, accountsCreated: 0, accountsUpdated: 0 },
    };
  }
}
