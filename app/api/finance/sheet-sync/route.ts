/**
 * Finance — Google Sheet account sync. Owner-only.
 *
 * GET    → current link status { sheetLink } (never returns the full sheet).
 * POST   → { sheetUrl } saves a new link and syncs immediately;
 *          {} (empty body) re-syncs the saved link ("Sync now").
 * DELETE → unlink the sheet (accounts keep their last-synced values and
 *          flip back to source:'manual' so they're clearly editable again).
 *
 * Sync logic lives in lib/finance/sheet-sync-server.ts (shared with the
 * nightly finance-refresh cron); format/parsing in lib/finance/sheet-sync.ts.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getRedisClient } from '@/lib/redis';
import { requireOwner } from '@/lib/auth-session';
import { getNowInEST } from '@/lib/date-utils';
import { sheetCsvUrl } from '@/lib/finance/sheet-sync';
import { loadSheetLink, syncFromSheet, recordSheetSyncError } from '@/lib/finance/sheet-sync-server';
import { BalanceAccount, DebtAccount } from '@/lib/finance/types';

const sheetKey = (userId: string) => `finance:${userId}:sheet`;
const accountsKey = (userId: string) => `finance:${userId}:accounts`;
const balanceAccountsKey = (userId: string) => `finance:${userId}:balance-accounts`;

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
      const failedLink = await recordSheetSyncError(userId, link, result.error);
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
    const now = getNowInEST();

    const rawDebts = await redis.get(accountsKey(userId));
    if (rawDebts) {
      try {
        const debts: DebtAccount[] = JSON.parse(rawDebts);
        if (Array.isArray(debts)) {
          await redis.set(
            accountsKey(userId),
            JSON.stringify(debts.map((a) => (a.source === 'gsheet' ? { ...a, source: 'manual' as const, updatedAt: now } : a))),
          );
        }
      } catch {
        // leave debt accounts untouched if the key is corrupt
      }
    }

    const rawBalances = await redis.get(balanceAccountsKey(userId));
    if (rawBalances) {
      try {
        const balances: BalanceAccount[] = JSON.parse(rawBalances);
        if (Array.isArray(balances)) {
          await redis.set(
            balanceAccountsKey(userId),
            JSON.stringify(balances.map((a) => (a.source === 'gsheet' ? { ...a, source: 'manual' as const, updatedAt: now } : a))),
          );
        }
      } catch {
        // leave balance accounts untouched if the key is corrupt
      }
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('[finance/sheet-sync] DELETE failed:', e);
    return NextResponse.json({ success: false, error: 'Failed to unlink sheet' }, { status: 500 });
  }
}
