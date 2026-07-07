/**
 * Server-side Google Sheet sync — shared by the API route (manual "Sync
 * now") and the nightly finance-refresh cron. Fetch/parse/merge logic and
 * the sheet format live in lib/finance/sheet-sync.ts (pure, unit-testable);
 * this file owns the I/O: fetching the CSV export and writing both account
 * stores + the sheet-link status back to Redis.
 */

import { getRedisClient } from '@/lib/redis';
import { getNowInEST } from '@/lib/date-utils';
import { sheetCsvUrl, parseSheetCsv, mergeSheetRows, mergeSheetAssetRows } from './sheet-sync';
import { recordSnapshots } from './history';
import { BalanceAccount, DebtAccount, SheetLink } from './types';

const sheetKey = (userId: string) => `finance:${userId}:sheet`;
const accountsKey = (userId: string) => `finance:${userId}:accounts`;
const balanceAccountsKey = (userId: string) => `finance:${userId}:balance-accounts`;
const FETCH_TIMEOUT_MS = 15_000;
const MAX_SHEET_BYTES = 2_000_000;

export async function loadSheetLink(userId: string): Promise<SheetLink | null> {
  const redis = await getRedisClient();
  const raw = await redis.get(sheetKey(userId));
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function loadJsonArray<T>(key: string): Promise<T[]> {
  const redis = await getRedisClient();
  const raw = await redis.get(key);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function syncFromSheet(
  userId: string,
  link: SheetLink,
): Promise<{ link: SheetLink; created: number; updated: number; rowErrors: string[] } | { error: string }> {
  const csvUrl = sheetCsvUrl(link.url);
  if (typeof csvUrl !== 'string') return { error: csvUrl.error };

  let res: Response;
  try {
    res = await fetch(csvUrl, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      // Google serves the CSV without auth for link-shared/published sheets;
      // a 302 to a login page means the sheet isn't shared.
      redirect: 'follow',
    });
  } catch (e) {
    return { error: `Could not reach Google Sheets: ${e instanceof Error ? e.message : 'fetch failed'}` };
  }
  if (!res.ok) {
    return {
      error: `Google returned ${res.status} — make sure the sheet is shared as "Anyone with the link" or published to the web`,
    };
  }
  const text = await res.text();
  if (text.length > MAX_SHEET_BYTES) return { error: 'Sheet is too large to sync' };
  if (/<html/i.test(text.slice(0, 200))) {
    return { error: 'Got a sign-in page instead of CSV — the sheet is not link-shared or published' };
  }

  const parsed = parseSheetCsv(text);
  if (typeof parsed === 'string') return { error: parsed };

  const now = getNowInEST();
  const redis = await getRedisClient();

  // Debt rows → debt accounts
  const existing = await loadJsonArray<DebtAccount>(accountsKey(userId));
  const { accounts, created, updated } = mergeSheetRows(existing, parsed.rows, now);
  await redis.set(accountsKey(userId), JSON.stringify(accounts));

  // Asset rows (savings/checking/investment types) → balance accounts
  const existingBalances = await loadJsonArray<BalanceAccount>(balanceAccountsKey(userId));
  const assetMerge = mergeSheetAssetRows(existingBalances, parsed.assetRows, now);
  await redis.set(balanceAccountsKey(userId), JSON.stringify(assetMerge.accounts));

  await recordSnapshots(userId);

  const totalRows = parsed.rows.length + parsed.assetRows.length;
  const totalCreated = created + assetMerge.created;
  const totalUpdated = updated + assetMerge.updated;
  const summary =
    `Synced ${totalRows} rows (${totalCreated} added, ${totalUpdated} updated` +
    (parsed.assetRows.length ? `; ${parsed.assetRows.length} asset` : '') +
    `)` +
    (parsed.errors.length ? `; ${parsed.errors.length} row issue(s)` : '');
  const updatedLink: SheetLink = { url: link.url, lastSyncedAt: now, lastResult: summary };
  await redis.set(sheetKey(userId), JSON.stringify(updatedLink));

  return { link: updatedLink, created: totalCreated, updated: totalUpdated, rowErrors: parsed.errors };
}

/** Record a failed attempt on the stored link so the UI shows the error. */
export async function recordSheetSyncError(userId: string, link: SheetLink, error: string): Promise<SheetLink> {
  const failedLink: SheetLink = { url: link.url, lastSyncedAt: link.lastSyncedAt, lastResult: `Error: ${error}` };
  const redis = await getRedisClient();
  await redis.set(sheetKey(userId), JSON.stringify(failedLink));
  return failedLink;
}
