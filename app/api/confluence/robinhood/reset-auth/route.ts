/**
 * Clear the cached Robinhood credentials (owner-only, no orders, no money).
 *
 * POST /api/confluence/robinhood/reset-auth
 *   → deletes `confluence:robinhood:refresh` and `confluence:robinhood:access`.
 *
 * WHY THIS EXISTS. The refresh token in Redis takes precedence over the
 * ROBINHOOD_OAUTH_REFRESH_TOKEN env seed (see oauth.currentRefreshToken), and
 * the access token is cached until ~60s before expiry. So after re-running the
 * OAuth capture and updating Vercel, the app keeps using the OLD credentials —
 * and because a new capture mints a NEW client_id (the flow is dynamic client
 * registration), the stale refresh token is now paired with a mismatched
 * client id. The recovery then fails as `invalid_grant`, which reads like a
 * botched capture rather than a stale cache. There was no way to clear these
 * without opening the Redis console.
 *
 * Safe by construction: this removes only cached credentials. Whatever is in
 * the environment re-seeds on the next call, so the worst case is one extra
 * token refresh.
 */

import { NextResponse } from 'next/server';
import { requireOwner } from '@/lib/auth-session';
import { getRedisClient } from '@/lib/redis';
import { appendAudit } from '@/lib/db/confluence/audit';

export const dynamic = 'force-dynamic';

const ACCESS_KEY = 'confluence:robinhood:access';
const REFRESH_KEY = 'confluence:robinhood:refresh';

export async function POST(): Promise<NextResponse> {
  const { userId, email, error } = await requireOwner();
  if (error) return error;

  try {
    const redis = await getRedisClient();
    // Report what was actually present, so a no-op is distinguishable from a
    // clear — "nothing was cached" is a different diagnosis mid-recovery.
    const [hadRefresh, hadAccess] = await Promise.all([redis.get(REFRESH_KEY), redis.get(ACCESS_KEY)]);
    await Promise.all([redis.del(REFRESH_KEY), redis.del(ACCESS_KEY)]);

    const cleared = {
      refreshToken: !!hadRefresh,
      accessToken: !!hadAccess,
    };

    await appendAudit(userId, {
      actor: 'user',
      actorId: email,
      eventType: 'robinhood.auth_reset',
      entityType: 'system',
      entityId: 'robinhood-auth',
      after: cleared,
      note:
        `Cleared cached Robinhood credentials (refresh: ${cleared.refreshToken ? 'removed' : 'none'}, ` +
        `access: ${cleared.accessToken ? 'removed' : 'none'}). The environment now re-seeds both.`,
    });

    return NextResponse.json({
      success: true,
      cleared,
      message:
        'Cached Robinhood credentials cleared. The next call re-seeds from ROBINHOOD_OAUTH_CLIENT_ID + ' +
        'ROBINHOOD_OAUTH_REFRESH_TOKEN — make sure BOTH are the values from the latest OAuth capture, ' +
        'then re-check /api/confluence/robinhood/health.',
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to clear cached credentials';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
