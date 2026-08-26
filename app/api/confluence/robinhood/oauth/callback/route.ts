/**
 * Finish the in-app Robinhood reconnect (owner-only).
 *
 * GET /api/confluence/robinhood/oauth/callback?code&state
 *   → redeems the single-use state for the stashed PKCE verifier, exchanges
 *     the code, persists client id + refresh token to Redis (which outranks
 *     the env seeds from here on), then verifies with a REAL get_accounts
 *     round-trip before declaring success.
 *
 * Always redirects back to Trading → Agents with `rh=connected` or
 * `rh=failed&rhReason=…` so the outcome is readable in the app, not as bare
 * JSON in a browser tab. Owner-gated: the browser that started the flow holds
 * the session, and the single-use state ties the callback to that start.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireOwner } from '@/lib/auth-session';
import { consumePendingOAuth, exchangeCode } from '@/lib/confluence/robinhood/connect';
import { persistOAuthCredentials } from '@/lib/confluence/robinhood/oauth';
import { checkRobinhoodHealth } from '@/lib/confluence/robinhood/health-check';
import { appendAudit } from '@/lib/db/confluence/audit';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { userId, email, error } = await requireOwner();
  if (error) return error;

  const origin = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
  const backToAgents = (params: Record<string, string>): NextResponse => {
    const url = new URL('/', origin);
    url.searchParams.set('tab', 'trading');
    url.searchParams.set('subtab', 'agents');
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    return NextResponse.redirect(url);
  };
  const fail = (reason: string): NextResponse => backToAgents({ rh: 'failed', rhReason: reason });

  const q = req.nextUrl.searchParams;
  const authorizeError = q.get('error');
  if (authorizeError) return fail(`Robinhood did not authorize: ${authorizeError}`);

  const code = q.get('code');
  const state = q.get('state');
  if (!code || !state) return fail('Callback was missing code/state — start again from Settings.');

  const pending = await consumePendingOAuth(state);
  if (!pending) {
    return fail('This connect link expired or was already used — start again from Settings.');
  }

  try {
    const tokens = await exchangeCode(pending.tokenEndpoint, {
      code,
      clientId: pending.clientId,
      redirectUri: pending.redirectUri,
      codeVerifier: pending.codeVerifier,
    });
    if (!tokens.refreshToken) {
      return fail('Robinhood returned no refresh token — try the flow again.');
    }

    await persistOAuthCredentials({
      clientId: pending.clientId,
      refreshToken: tokens.refreshToken,
      accessToken: tokens.accessToken,
      expiresInSec: tokens.expiresInSec,
    });

    await appendAudit(userId, {
      actor: 'user',
      actorId: email,
      eventType: 'robinhood.reconnected',
      entityType: 'system',
      entityId: 'robinhood-auth',
      note: 'Reconnected Robinhood via the in-app OAuth flow (new dynamic client registered; credentials stored in Redis).',
    });

    // Proof over promise: a real broker round-trip, not "the exchange worked".
    const health = await checkRobinhoodHealth();
    if (!health.connected) {
      return fail(
        `Credentials stored, but the verification call failed: ${health.error ?? 'unknown error'}`,
      );
    }
    return backToAgents({ rh: 'connected' });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Token exchange failed';
    return fail(message);
  }
}
