/**
 * The one Robinhood connectivity check, shared by the health endpoint and the
 * scheduled alert.
 *
 * READ-ONLY: calls `get_accounts` and nothing else. Placing no orders is a
 * property of this module, not a convention — the alert cron runs unattended.
 *
 * Deliberately a real broker round-trip rather than a config inspection.
 * `isRobinhoodAvailable()` proves only that a token EXISTS; the Aug 2026
 * outage had a present, refreshing token that Robinhood rejected at every
 * call. Presence checks cannot see that. Only a real call can.
 */

import { callRobinhoodTool, isRobinhoodAvailable } from './mcp-client';
import { describeRobinhoodAuth, type RobinhoodAuthDiagnostics } from './oauth';

export interface RhHealthAccount {
  account: string;
  type?: string;
  nickname?: string;
  agentic_allowed: boolean;
  is_default: boolean;
}

export interface RobinhoodHealth {
  connected: boolean;
  /** False only when nothing at all is configured. */
  configured: boolean;
  auth: RobinhoodAuthDiagnostics;
  accounts?: RhHealthAccount[];
  /** The broker's own failure message. */
  error?: string;
  /** The next concrete action, when the failure is one we recognise. */
  hint?: string;
  /** Set when auth is absent entirely (nothing was attempted). */
  message?: string;
}

interface RhAccount {
  account_number?: string;
  brokerage_account_type?: string;
  type?: string;
  nickname?: string;
  agentic_allowed?: boolean;
  is_default?: boolean;
}

/** Mask all but the last 4 — account numbers are shown in emails and UI. */
function mask(n: string | undefined): string {
  if (!n) return '—';
  return n.length > 4 ? `••••${n.slice(-4)}` : n;
}

export async function checkRobinhoodHealth(): Promise<RobinhoodHealth> {
  const auth = await describeRobinhoodAuth();

  if (!(await isRobinhoodAvailable())) {
    return {
      connected: false,
      configured: false,
      auth,
      message: 'Robinhood auth not configured (set ROBINHOOD_OAUTH_CLIENT_ID + ROBINHOOD_OAUTH_REFRESH_TOKEN).',
    };
  }

  try {
    const res = await callRobinhoodTool<{ data?: { accounts?: RhAccount[] } }>('get_accounts', {});
    const accounts = (res?.data?.accounts ?? []).map((a) => ({
      account: mask(a.account_number),
      type: a.brokerage_account_type || a.type,
      nickname: a.nickname,
      agentic_allowed: !!a.agentic_allowed,
      is_default: !!a.is_default,
    }));
    return { connected: true, configured: true, auth, accounts };
  } catch (e) {
    const error = e instanceof Error ? e.message : 'Unknown error';
    return { connected: false, configured: true, auth, error, hint: diagnoseRobinhoodFailure(error, auth) };
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
export function diagnoseRobinhoodFailure(
  message: string,
  auth: RobinhoodAuthDiagnostics,
): string | undefined {
  const clientIdRejected = message.includes('401') && message.toLowerCase().includes('client id');
  if (clientIdRejected && auth.tokenSource === 'static') {
    return (
      'The bearer sent came from the static ROBINHOOD_MCP_TOKEN, because ' +
      (auth.clientIdSet ? 'no refresh token is available' : 'ROBINHOOD_OAUTH_CLIENT_ID is not set') +
      '. A pasted access token is short-lived and is not bound to the registered agentic client, so ' +
      'Robinhood resolves no client id from it. Set ROBINHOOD_OAUTH_CLIENT_ID + a fresh ' +
      'ROBINHOOD_OAUTH_REFRESH_TOKEN (docs/CONFLUENCE_ROBINHOOD_TOKEN.md) and clear the stale ' +
      'Redis key confluence:robinhood:refresh, which takes precedence over the env seed.'
    );
  }
  if (clientIdRejected) {
    return (
      'Robinhood resolved no allowed OAuth client from the access token. Tokens are still being issued, ' +
      'so the grant is intact — but this client was registered dynamically (scripts/robinhood-oauth.mjs ' +
      'POSTs to agent.robinhood.com/mcp/trading/register), and the MCP no longer accepts it. Note the ' +
      'split: tokens come from api.robinhood.com, which keeps minting for a client the MCP has dropped. ' +
      'Re-run `node scripts/robinhood-oauth.mjs` — it mints a NEW client_id, so update BOTH ' +
      'ROBINHOOD_OAUTH_CLIENT_ID and ROBINHOOD_OAUTH_REFRESH_TOKEN, not just the token. Then POST ' +
      '/api/confluence/robinhood/reset-auth (or use Agents → Settings → Reconnect Robinhood): the cached ' +
      'refresh token in Redis outranks the env seed, and pairing it with the new client id fails as ' +
      'invalid_grant, which looks like a bad capture.'
    );
  }
  if (message.includes('token refresh failed')) {
    return 'The refresh grant itself was rejected — re-run the OAuth capture (docs/CONFLUENCE_ROBINHOOD_TOKEN.md).';
  }
  return undefined;
}
