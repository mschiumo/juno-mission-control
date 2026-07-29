import { NextResponse } from 'next/server';
import { getRedisClient } from '@/lib/redis';
import { requireCronSecret } from '@/lib/auth-session';
import { plaidConfigured } from '@/lib/finances/plaid';
import { PLAID_ITEMS_KEY } from '@/lib/finances/plaid-items';
import { syncAllItems } from '@/lib/finances/sync';

/**
 * Nightly balance refresh for every user with linked banks (today: the owner).
 *
 * Runs at 09:00 UTC — after overnight statement posting, before the owner looks
 * at the tab — so balances and the history chart stay current without anyone
 * pressing Refresh. Scheduled in vercel.json; auth is enforced by CRON_SECRET in
 * middleware.ts, re-checked here so the route is never reachable unauthenticated
 * if that matcher ever changes.
 */

export const maxDuration = 120;

export async function GET(request: Request) {
  const unauthorized = requireCronSecret(request);
  if (unauthorized) return unauthorized;

  if (!plaidConfigured()) {
    return NextResponse.json({ success: true, skipped: 'Plaid not configured' });
  }

  try {
    const redis = await getRedisClient();
    const prefix = PLAID_ITEMS_KEY('');
    const userIds: string[] = [];
    for await (const key of redis.scanIterator({ MATCH: `${prefix}*`, COUNT: 100 })) {
      const userId = String(key).slice(prefix.length);
      if (userId) userIds.push(userId);
    }

    const results = [];
    for (const userId of userIds) {
      try {
        const { summary } = await syncAllItems(userId);
        results.push({
          userId,
          accountsUpdated: summary.accountsUpdated,
          accountsCreated: summary.accountsCreated,
          failures: summary.outcomes.filter((o) => o.status !== 'ok').map((o) => ({
            institution: o.institutionName,
            status: o.status,
          })),
        });
      } catch (error) {
        // One user's failure must not abort the rest of the sweep.
        console.error(`Nightly finances refresh failed for ${userId}:`, error instanceof Error ? error.message : error);
        results.push({ userId, error: 'sync failed' });
      }
    }

    return NextResponse.json({ success: true, users: userIds.length, results });
  } catch (error) {
    console.error('Nightly finances refresh failed:', error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: 'Refresh sweep failed' }, { status: 500 });
  }
}
