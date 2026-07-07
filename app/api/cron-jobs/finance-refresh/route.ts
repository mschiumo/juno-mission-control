/**
 * Nightly Finances refresh — keeps balances and the progress charts live
 * without opening the tab. For every user with finance data:
 *   1. Re-sync the linked Google Sheet (if any)
 *   2. Re-sync Teller bank/card balances (if enrolled)
 *   3. Re-sync the live brokerage value (if ConfluenceTrading live mode)
 * Each sync records the day's history snapshots, so the debt/investing/
 * savings series accrue one point per day automatically.
 *
 * Registered in vercel.json (daily, pre-market). Auth: middleware.ts gates
 * /api/cron-jobs/* behind the Vercel CRON_SECRET bearer token.
 */

import { NextResponse } from 'next/server';
import { getRedisClient } from '@/lib/redis';
import { getAllUserIds } from '@/lib/db/users';
import { logToActivityLog } from '@/lib/cron-helpers';
import { loadSheetLink, syncFromSheet, recordSheetSyncError } from '@/lib/finance/sheet-sync-server';
import { loadEnrollment, syncTellerAccounts, tellerConfigured } from '@/lib/finance/teller';
import { brokerageSyncStatus, syncBrokerageInvesting } from '@/lib/finance/investing-sync';
import { recordSnapshots } from '@/lib/finance/history';

export const maxDuration = 120;

export async function GET() {
  const startTime = Date.now();
  const results: Record<string, string[]> = {};
  let usersProcessed = 0;

  try {
    const userIds = await getAllUserIds();
    const redis = await getRedisClient();

    for (const userId of userIds) {
      // Only process users who actually use the Finances tab.
      const hasFinanceData =
        (await redis.exists(`finance:${userId}:accounts`)) ||
        (await redis.exists(`finance:${userId}:balance-accounts`));
      if (!hasFinanceData) continue;
      usersProcessed++;

      const userResults: string[] = [];

      // 1. Google Sheet
      try {
        const link = await loadSheetLink(userId);
        if (link) {
          const r = await syncFromSheet(userId, link);
          if ('error' in r) {
            await recordSheetSyncError(userId, link, r.error);
            userResults.push(`sheet: ERROR ${r.error.slice(0, 120)}`);
          } else {
            userResults.push(`sheet: ${r.created} added, ${r.updated} updated`);
          }
        }
      } catch (e) {
        userResults.push(`sheet: threw ${String(e).slice(0, 120)}`);
      }

      // 2. Teller
      try {
        if (tellerConfigured() && (await loadEnrollment(userId))) {
          const r = await syncTellerAccounts(userId);
          userResults.push('error' in r ? `teller: ERROR ${r.error.slice(0, 120)}` : `teller: ${r.synced} accounts`);
        }
      } catch (e) {
        userResults.push(`teller: threw ${String(e).slice(0, 120)}`);
      }

      // 3. Brokerage (Robinhood via ConfluenceTrading)
      try {
        const status = await brokerageSyncStatus(userId);
        if (status.available) {
          const r = await syncBrokerageInvesting(userId);
          userResults.push('error' in r ? `brokerage: ERROR ${r.error.slice(0, 120)}` : `brokerage: $${r.accountValue}`);
        }
      } catch (e) {
        userResults.push(`brokerage: threw ${String(e).slice(0, 120)}`);
      }

      // Always stamp today's totals, even if no source synced — manual
      // balances still get their daily history point this way.
      try {
        await recordSnapshots(userId);
        userResults.push('snapshots: ok');
      } catch (e) {
        userResults.push(`snapshots: threw ${String(e).slice(0, 120)}`);
      }

      results[userId] = userResults;
    }

    const summary = Object.entries(results)
      .map(([uid, r]) => `${uid.slice(0, 8)}: ${r.join(' | ')}`)
      .join(' — ') || 'no finance users';
    await logToActivityLog('Finance Refresh', summary.slice(0, 500), 'cron');

    return NextResponse.json({
      success: true,
      usersProcessed,
      results,
      durationMs: Date.now() - startTime,
    });
  } catch (error) {
    console.error('[cron/finance-refresh] failed:', error);
    await logToActivityLog('Finance Refresh Failed', String(error).slice(0, 300), 'cron');
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
