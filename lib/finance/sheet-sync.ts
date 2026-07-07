/**
 * Google Sheets account sync — pull debt-account numbers from a sheet the
 * user edits, so updating a balance in Sheets updates the dashboard.
 *
 * Works with either sharing mode, no OAuth required:
 * - "Anyone with the link (Viewer)" → we fetch /spreadsheets/d/{id}/export?format=csv
 * - File → Share → Publish to web (CSV) → we fetch the /d/e/…/pub URL as-is
 *
 * Expected sheet columns (header row, loose matching): Name | Type |
 * Balance | APR | Min Payment | Due Day. Rows upsert into the account list
 * by name; synced accounts get source:'gsheet'. Rows removed from the sheet
 * do NOT delete app accounts (safe default — delete in the UI instead).
 *
 * The Type column routes each row: debt types (credit, auto, student,
 * mortgage…) go to the Debt section; asset types (savings, checking,
 * investment, brokerage, 401k, IRA, HYSA…) go to the Savings/Investing
 * sections — so one sheet drives the whole Finances tab.
 *
 * NEXT STEP (private sheets): reuse the service-account JWT flow from
 * lib/google-calendar.ts with the spreadsheets.readonly scope and have the
 * user share the sheet with GOOGLE_SERVICE_ACCOUNT_EMAIL — then the link
 * doesn't need to be viewable by "anyone with the link".
 */

import { parseCsv, mapColumns, parseMoney } from './csv';
import { DebtAccount, DebtType, BalanceAccount, BalanceKind } from './types';

const SHEET_COLUMN_ALIASES: Record<string, string[]> = {
  name: ['name', 'account'],
  type: ['type'],
  balance: ['balance'],
  apr: ['apr', 'interestrate', 'rate'],
  minPayment: ['minpayment', 'minimumpayment', 'minimum', 'min'],
  dueDay: ['dueday', 'due'],
};

const DEBT_TYPE_KEYWORDS: Array<[RegExp, DebtType]> = [
  [/credit/i, 'credit-card'],
  [/auto\s*loan|car\s*loan|^auto$|^car$/i, 'auto-loan'],
  [/student/i, 'student-loan'],
  [/personal/i, 'personal-loan'],
  [/mortgage|home\s*loan/i, 'mortgage'],
  [/loan|debt/i, 'other'],
];

// Checked BEFORE debt keywords: an asset match routes the row to the
// Savings/Investing sections instead of the Debt section.
const ASSET_TYPE_KEYWORDS: Array<[RegExp, BalanceKind]> = [
  [/invest|brokerage|401\s*k|403\s*b|\bira\b|roth|stocks?|etf|crypto/i, 'investment'],
  [/saving|hysa|emergency|\bcd\b/i, 'savings'],
  [/checking|cash/i, 'checking'],
];

export interface SheetRow {
  name: string;
  type: DebtType;
  balance: number;
  apr: number;
  minPayment: number;
  dueDay: number;
}

export interface SheetAssetRow {
  name: string;
  kind: BalanceKind;
  balance: number;
}

export interface SheetParseResult {
  rows: SheetRow[]; // debt rows
  assetRows: SheetAssetRow[];
  errors: string[]; // per-row problems, sheet still usable
}

/**
 * Normalize a pasted Google Sheets URL to its CSV endpoint.
 * Returns an error string when the URL isn't a Google Sheets link (also our
 * SSRF guard — this URL is fetched server-side, so only docs.google.com
 * spreadsheet paths are allowed).
 */
export function sheetCsvUrl(pasted: string): string | { error: string } {
  let url: URL;
  try {
    url = new URL(pasted.trim());
  } catch {
    return { error: 'Not a valid URL' };
  }
  if (url.hostname !== 'docs.google.com' || !url.pathname.startsWith('/spreadsheets/')) {
    return { error: 'Only Google Sheets links (docs.google.com/spreadsheets/…) are supported' };
  }

  // Published-to-web URL (/spreadsheets/d/e/2PACX-…/pub…): force CSV output.
  if (url.pathname.includes('/d/e/')) {
    const base = url.pathname.replace(/\/(pubhtml|pub).*$/, '/pub');
    const gid = url.searchParams.get('gid');
    return `https://docs.google.com/spreadsheets${base.replace(/^\/spreadsheets/, '')}?output=csv${gid ? `&gid=${gid}` : ''}`;
  }

  // Regular sheet URL (/spreadsheets/d/{id}/…): use the export endpoint.
  const m = url.pathname.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!m) return { error: 'Could not find the spreadsheet id in the URL' };
  const gid = url.searchParams.get('gid') || url.hash.match(/gid=(\d+)/)?.[1];
  return `https://docs.google.com/spreadsheets/d/${m[1]}/export?format=csv${gid ? `&gid=${gid}` : ''}`;
}

export function parseSheetCsv(text: string): SheetParseResult | string {
  const rows = parseCsv(text);
  if (rows.length < 2) return 'Sheet has no data rows below the header';

  const cols = mapColumns(rows[0], SHEET_COLUMN_ALIASES);
  if (cols.name === undefined || cols.balance === undefined) {
    return 'Sheet needs at least "Name" and "Balance" columns (plus optional Type / APR / Min Payment / Due Day)';
  }

  const parsed: SheetRow[] = [];
  const assetRows: SheetAssetRow[] = [];
  const errors: string[] = [];

  rows.slice(1).forEach((row, i) => {
    const rowNum = i + 2; // 1-indexed + header
    const name = row[cols.name]?.trim();
    if (!name) return; // blank spacer row — ignore silently

    const balance = parseMoney(row[cols.balance] ?? '');
    if (!Number.isFinite(balance) || balance < 0) {
      errors.push(`Row ${rowNum} (${name}): invalid balance "${row[cols.balance]}"`);
      return;
    }
    const roundedBalance = Math.round(balance * 100) / 100;

    const rawType = cols.type !== undefined ? (row[cols.type] ?? '') : '';

    // Asset rows (savings/checking/investment) skip the debt-only fields.
    const assetKind = ASSET_TYPE_KEYWORDS.find(([re]) => re.test(rawType))?.[1];
    if (assetKind) {
      assetRows.push({ name, kind: assetKind, balance: roundedBalance });
      return;
    }

    const type = DEBT_TYPE_KEYWORDS.find(([re]) => re.test(rawType))?.[1] ?? 'other';

    const apr = cols.apr !== undefined ? parseMoney(row[cols.apr] ?? '') : NaN;
    const minPayment = cols.minPayment !== undefined ? parseMoney(row[cols.minPayment] ?? '') : NaN;
    const dueDay = cols.dueDay !== undefined ? parseInt(row[cols.dueDay] ?? '', 10) : NaN;

    if (cols.apr !== undefined && !Number.isFinite(apr)) {
      errors.push(`Row ${rowNum} (${name}): invalid APR "${row[cols.apr]}" — using 0`);
    }
    parsed.push({
      name,
      type,
      balance: roundedBalance,
      apr: Number.isFinite(apr) && apr >= 0 && apr <= 100 ? Math.round(apr * 100) / 100 : 0,
      minPayment: Number.isFinite(minPayment) && minPayment >= 0 ? Math.round(minPayment * 100) / 100 : 0,
      dueDay: Number.isFinite(dueDay) && dueDay >= 1 && dueDay <= 28 ? dueDay : 1,
    });
  });

  if (parsed.length === 0 && assetRows.length === 0) return 'No valid account rows found in the sheet';
  return { rows: parsed, assetRows, errors };
}

/**
 * Merge sheet rows into the stored account list (match by name,
 * case-insensitive). Returns the new list plus a summary of what changed.
 */
export function mergeSheetRows(
  existing: DebtAccount[],
  rows: SheetRow[],
  now: string,
): { accounts: DebtAccount[]; created: number; updated: number } {
  const accounts = [...existing];
  let created = 0;
  let updated = 0;

  for (const row of rows) {
    const idx = accounts.findIndex((a) => a.name.toLowerCase() === row.name.toLowerCase());
    if (idx !== -1) {
      accounts[idx] = { ...accounts[idx], ...row, source: 'gsheet', updatedAt: now };
      updated++;
    } else {
      accounts.push({
        id: `debt_${now.replace(/\D/g, '').slice(0, 14)}_${Math.random().toString(36).slice(2, 8)}`,
        ...row,
        source: 'gsheet',
        createdAt: now,
        updatedAt: now,
      });
      created++;
    }
  }
  return { accounts, created, updated };
}

/** Same upsert-by-name merge for asset rows → BalanceAccounts. */
export function mergeSheetAssetRows(
  existing: BalanceAccount[],
  rows: SheetAssetRow[],
  now: string,
): { accounts: BalanceAccount[]; created: number; updated: number } {
  const accounts = [...existing];
  let created = 0;
  let updated = 0;

  for (const row of rows) {
    const idx = accounts.findIndex((a) => a.name.toLowerCase() === row.name.toLowerCase());
    if (idx !== -1) {
      accounts[idx] = { ...accounts[idx], ...row, source: 'gsheet', updatedAt: now };
      updated++;
    } else {
      accounts.push({
        id: `bal_${now.replace(/\D/g, '').slice(0, 14)}_${Math.random().toString(36).slice(2, 8)}`,
        ...row,
        source: 'gsheet',
        createdAt: now,
        updatedAt: now,
      });
      created++;
    }
  }
  return { accounts, created, updated };
}
