/**
 * Finance — Google Sheet account sync. Owner-only.
 *
 * GET    → current link status { sheetLink } (never returns the full sheet).
 * POST   → { sheetUrl } saves a new link and syncs immediately;
 *          {} (empty body) re-syncs the saved link ("Sync now").
 * DELETE → unlink the sheet (accounts keep their last-synced values and
 *          flip back to source:'manual' so they're clearly editable again).
 *
 * The sheet URL is validated to docs.google.com/spreadsheets/* before any
 * server-side fetch (SSRF guard in sheetCsvUrl). See lib/finance/sheet-sync.ts
 * for the expected sheet format and the private-sheet upgrade path.
 *
 * NEXT STEP: add a nightly refresh via the run-cron pattern so sheet edits
 * show up without opening the Finance tab first.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getRedisClient } from '@/lib/redis';
import { requireOwner } from '@/lib/auth-session';
import { getNowInEST } from '@/lib/date-utils';
import { sheetCsvUrl, parseSheetCsv, mergeSheetRows } from '@/lib/finance/sheet-sync';
import { DebtAccount, SheetLink } from '@/lib/finance/types';

const sheetKey = (userId: string) => `finance:${userId}:sheet`;
const accountsKey = (userId: string) => `finance:${userId}:accounts`;
const FETCH_TIMEOUT_MS = 15_000;
const MAX_SHEET_BYTES = 2_000_000;

async function loadSheetLink(userId: string): Promise<SheetLink | null> {
  const redis = await getRedisClient();
  const raw = await redis.get(sheetKey(userId));
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function loadAccounts(userId: string): Promise<DebtAccount[]> {
  const redis = await getRedisClient();
  const raw = await redis.get(accountsKey(userId));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function syncFromSheet(userId: string, link: SheetLink) {
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
  const existing = await loadAccounts(userId);
  const { accounts, created, updated } = mergeSheetRows(existing, parsed.rows, now);

  const redis = await getRedisClient();
  await redis.set(accountsKey(userId), JSON.stringify(accounts));

  const summary =
    `Synced ${parsed.rows.length} rows (${created} added, ${updated} updated)` +
    (parsed.errors.length ? `; ${parsed.errors.length} row issue(s)` : '');
  const updatedLink: SheetLink = { url: link.url, lastSyncedAt: now, lastResult: summary };
  await redis.set(sheetKey(userId), JSON.stringify(updatedLink));

  return { link: updatedLink, created, updated, rowErrors: parsed.errors };
}

// GET — link status
export async function GET() {
  const { userId, error } = await requireOwner();
  if (error) return error;

  try {
    const sheetLink = await loadSheetLink(userId);
    return NextResponse.json({ success: true, sheetLink });
  } catch (e) {
    console.error('[finance/sheet-sync] GET failed:', e);
    return NextResponse.json({ success: false, error: 'Failed to load sheet link' }, { status: 500 });
  }
}

// POST — save link and/or sync now
export async function POST(request: NextRequest) {
  const { userId, error } = await requireOwner();
  if (error) return error;

  try {
    const body = await request.json().catch(() => ({}));
    let link = await loadSheetLink(userId);

    if (typeof body.sheetUrl === 'string' && body.sheetUrl.trim()) {
      const validated = sheetCsvUrl(body.sheetUrl);
      if (typeof validated !== 'string') {
        return NextResponse.json({ success: false, error: validated.error }, { status: 400 });
      }
      link = { url: body.sheetUrl.trim(), lastSyncedAt: null, lastResult: null };
    }
    if (!link) {
      return NextResponse.json(
        { success: false, error: 'No sheet linked — provide a sheetUrl' },
        { status: 400 },
      );
    }

    const result = await syncFromSheet(userId, link);
    if ('error' in result) {
      // Persist the attempted link with its error so the UI can show state.
      const redis = await getRedisClient();
      const failedLink: SheetLink = { url: link.url, lastSyncedAt: link.lastSyncedAt, lastResult: `Error: ${result.error}` };
      await redis.set(sheetKey(userId), JSON.stringify(failedLink));
      return NextResponse.json({ success: false, error: result.error, sheetLink: failedLink }, { status: 422 });
    }

    return NextResponse.json({ success: true, sheetLink: result.link, created: result.created, updated: result.updated, rowErrors: result.rowErrors });
  } catch (e) {
    console.error('[finance/sheet-sync] POST failed:', e);
    return NextResponse.json({ success: false, error: 'Sheet sync failed' }, { status: 500 });
  }
}

// DELETE — unlink; synced accounts revert to manual so edits stick
export async function DELETE() {
  const { userId, error } = await requireOwner();
  if (error) return error;

  try {
    const redis = await getRedisClient();
    await redis.del(sheetKey(userId));

    const accounts = await loadAccounts(userId);
    const now = getNowInEST();
    const reverted = accounts.map((a) =>
      a.source === 'gsheet' ? { ...a, source: 'manual' as const, updatedAt: now } : a,
    );
    await redis.set(accountsKey(userId), JSON.stringify(reverted));

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('[finance/sheet-sync] DELETE failed:', e);
    return NextResponse.json({ success: false, error: 'Failed to unlink sheet' }, { status: 500 });
  }
}
