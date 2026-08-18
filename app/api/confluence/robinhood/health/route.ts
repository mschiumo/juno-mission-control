/**
 * Robinhood connection health check (owner-only, READ-ONLY).
 *
 * GET /api/confluence/robinhood/health
 *   → verifies the server-side Robinhood MCP transport + OAuth token by calling
 *     the read-only `get_accounts` tool. Places NO orders. Use it to confirm the
 *     live rail is wired before ever arming live execution.
 *
 * Every response carries `auth` — which credential path is live (presence and
 * enums only, never a secret) — and a failure carries a `hint` naming the next
 * concrete action. Without those, `configured: true` was the only signal, and
 * it is satisfied by a static token alone; a deployment that had silently
 * fallen back to one looked identical to a healthy OAuth setup.
 */

import { NextResponse } from 'next/server';
import { requireOwner } from '@/lib/auth-session';
import { callRobinhoodTool, isRobinhoodAvailable } from '@/lib/confluence/robinhood/mcp-client';
import { describeRobinhoodAuth, type RobinhoodAuthDiagnostics } from '@/lib/confluence/robinhood/oauth';

interface RhAccount {
  account_number?: string;
  brokerage_account_type?: string;
  type?: string;
  nickname?: string;
  agentic_allowed?: boolean;
  is_default?: boolean;
}

function mask(n: string | undefined): string {
  if (!n) return '—';
  return n.length > 4 ? `••••${n.slice(-4)}` : n;
}

export async function GET(): Promise<NextResponse> {
  const { error } = await requireOwner();
  if (error) return error;

  if (!(await isRobinhoodAvailable())) {
    return NextResponse.json({
      success: true,
      connected: false,
      configured: false,
      auth: await describeRobinhoodAuth(),
      message: 'Robinhood auth not configured (set ROBINHOOD_OAUTH_CLIENT_ID + ROBINHOOD_OAUTH_REFRESH_TOKEN).',
    });
  }

  // Which credential path is live. Reported on every response: a bare
  // `configured: true` cannot distinguish a healthy OAuth setup from a
  // fallback to the static token, which is what made a 401 unattributable.
  const auth = await describeRobinhoodAuth();

  try {
    const res = await callRobinhoodTool<{ data?: { accounts?: RhAccount[] } }>('get_accounts', {});
    const accounts = (res?.data?.accounts ?? []).map((a) => ({
      account: mask(a.account_number),
      type: a.brokerage_account_type || a.type,
      nickname: a.nickname,
      agentic_allowed: !!a.agentic_allowed,
      is_default: !!a.is_default,
    }));
    return NextResponse.json({
      success: true,
      connected: true,
      configured: true,
      auth,
      accountCount: accounts.length,
      accounts,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({
      success: true,
      connected: false,
      configured: true,
      auth,
      error: message,
      hint: diagnose(message, auth),
    });
  }
}

/**
 * Turn a broker failure into the next concrete action.
 *
 * Robinhood answers an unrecognised bearer with `401 … client id not allowed:
 * <missing>` — it resolves the OAuth client FROM the token, so `<missing>`
 * means the token it received maps to no allowed agentic client. That is a
 * different failure from a refresh that never succeeded, and it is reached
 * only after a token was obtained and sent.
 */
function diagnose(message: string, auth: RobinhoodAuthDiagnostics): string | undefined {
  const clientIdRejected = message.includes('401') && message.toLowerCase().includes('client id');
  if (clientIdRejected && auth.tokenSource === 'static') {
    return (
      'The bearer sent came from the static ROBINHOOD_MCP_TOKEN, because ' +
      (auth.clientIdSet
        ? 'no refresh token is available'
        : 'ROBINHOOD_OAUTH_CLIENT_ID is not set') +
      '. A pasted access token is short-lived and is not bound to the registered agentic client, so ' +
      'Robinhood resolves no client id from it. Set ROBINHOOD_OAUTH_CLIENT_ID + a fresh ' +
      'ROBINHOOD_OAUTH_REFRESH_TOKEN (docs/CONFLUENCE_ROBINHOOD_TOKEN.md) and clear the stale ' +
      'Redis key confluence:robinhood:refresh, which takes precedence over the env seed.'
    );
  }
  if (clientIdRejected) {
    return (
      'Robinhood resolved no allowed OAuth client from the access token. The token refreshed ' +
      'successfully, so the grant itself is intact — the client id it was minted under is no longer ' +
      'permitted for agentic MCP access. Re-run the OAuth capture against the registered client ' +
      '(docs/CONFLUENCE_ROBINHOOD_TOKEN.md), then clear Redis key confluence:robinhood:refresh so the ' +
      'new refresh token is the one used.' +
      (auth.accessTokenCached
        ? ' An access token is still cached in Redis (confluence:robinhood:access) — clear it too, or it will be reused until it expires.'
        : '')
    );
  }
  if (message.includes('token refresh failed')) {
    return 'The refresh grant itself was rejected — re-run the OAuth capture (docs/CONFLUENCE_ROBINHOOD_TOKEN.md).';
  }
  return undefined;
}
