/**
 * Clear the cached Robinhood credentials (owner-only, no orders, no money).
 *
 * POST /api/confluence/robinhood/reset-auth
 *   → deletes `confluence:robinhood:client-id`, `:refresh` and `:access`.
 *
 * WHY THIS EXISTS. The Redis-cached credentials (client id + refresh token, as
 * written by the in-app reconnect flow or by refresh-token rotation) take
 * precedence over the ROBINHOOD_OAUTH_* env seeds, and the access token is
 * cached until ~60s before expiry. So after a MANUAL re-capture (the script
 * runbook) with updated Vercel env, the app keeps using the OLD credentials —
 * and because each capture mints a NEW client_id (dynamic client registration),
 * the stale refresh token is paired with a mismatched client id and fails as
 * `invalid_grant`, which reads like a botched capture rather than a stale
 * cache. The normal path is now Agents → Settings → "Reconnect Robinhood"
 * (which overwrites the cache itself); this reset remains the escape hatch for
 * the manual runbook.
 *
 * Safe by construction: this removes only cached credentials. Whatever is in
 * the environment re-seeds on the next call, so the worst case is one extra
 * token refresh.
 */

import { NextResponse } from 'next/server';
import { requireOwner } from '@/lib/auth-session';
import { resetCachedRobinhoodAuth } from '@/lib/confluence/robinhood/oauth';
import { appendAudit } from '@/lib/db/confluence/audit';

export const dynamic = 'force-dynamic';

export async function POST(): Promise<NextResponse> {
  const { userId, email, error } = await requireOwner();
  if (error) return error;

  try {
    // Reports what was actually present, so a no-op is distinguishable from a
    // clear — "nothing was cached" is a different diagnosis mid-recovery.
    const cleared = await resetCachedRobinhoodAuth();

    await appendAudit(userId, {
      actor: 'user',
      actorId: email,
      eventType: 'robinhood.auth_reset',
      entityType: 'system',
      entityId: 'robinhood-auth',
      after: cleared,
      note:
        `Cleared cached Robinhood credentials (client id: ${cleared.clientId ? 'removed' : 'none'}, ` +
        `refresh: ${cleared.refreshToken ? 'removed' : 'none'}, ` +
        `access: ${cleared.accessToken ? 'removed' : 'none'}). The environment now re-seeds all of them.`,
    });

    return NextResponse.json({
      success: true,
      cleared,
      message:
        'Cached Robinhood credentials cleared. The next call re-seeds from ROBINHOOD_OAUTH_CLIENT_ID + ' +
        'ROBINHOOD_OAUTH_REFRESH_TOKEN — make sure BOTH are the values from the latest OAuth capture, ' +
        'then re-check /api/confluence/robinhood/health. (Or skip env entirely: use Reconnect Robinhood.)',
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to clear cached credentials';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
