/**
 * Begin the in-app Robinhood reconnect (owner-only).
 *
 * GET /api/confluence/robinhood/oauth/start
 *   → registers a fresh dynamic client for this deployment's callback URL,
 *     stashes the PKCE verifier + state in Redis, and redirects the browser to
 *     Robinhood's sign-in page. The callback route finishes the exchange.
 *
 * Linked directly from the health-alert email: middleware sends a logged-out
 * click through /login?callbackUrl=… and back here, so recovery from a phone
 * is login → approve → done. Registration is always fresh — reconnect exists
 * precisely because Robinhood stopped honouring the previous client, and an
 * abandoned registration costs nothing.
 *
 * No orders, no money: this route only mints credentials.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireOwner } from '@/lib/auth-session';
import {
  buildAuthorizeUrl,
  discoverOAuthMeta,
  newPkce,
  newState,
  registerClient,
  stashPendingOAuth,
} from '@/lib/confluence/robinhood/connect';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { error } = await requireOwner();
  if (error) return error;

  // Prefer the configured public URL; the request origin covers local dev.
  const origin = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
  const redirectUri = `${origin}/api/confluence/robinhood/oauth/callback`;

  try {
    const meta = await discoverOAuthMeta();
    const clientId = await registerClient(meta, redirectUri);
    const { verifier, challenge } = newPkce();
    const state = newState();
    await stashPendingOAuth(state, {
      clientId,
      codeVerifier: verifier,
      redirectUri,
      tokenEndpoint: meta.token_endpoint,
    });
    return NextResponse.redirect(
      buildAuthorizeUrl(meta, { clientId, redirectUri, state, codeChallenge: challenge }),
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Could not start the Robinhood connect flow';
    return NextResponse.json({ success: false, error: message }, { status: 502 });
  }
}
