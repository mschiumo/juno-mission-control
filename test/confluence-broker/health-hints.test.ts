/**
 * Every broker-failure shape Robinhood has actually produced must map to a
 * remedy hint. The Aug 24 2026 outage shipped two alert emails with NO hint
 * because `401 … token revoked` matched no branch — an alert that names the
 * error but not the next action still leaves the operator researching.
 */

import { describe, expect, it } from 'vitest';
import { diagnoseRobinhoodFailure } from '@/lib/confluence/robinhood/health-check';
import type { RobinhoodAuthDiagnostics } from '@/lib/confluence/robinhood/oauth';

const refreshAuth: RobinhoodAuthDiagnostics = {
  tokenSource: 'refresh',
  clientIdSet: true,
  clientIdSource: 'redis',
  staticTokenSet: false,
  refreshTokenSource: 'redis',
  accessTokenCached: true,
};

describe('diagnoseRobinhoodFailure', () => {
  it('maps the Aug 24 2026 shape — 401 token revoked at the MCP host — to the in-app reconnect', () => {
    const hint = diagnoseRobinhoodFailure(
      'Robinhood MCP initialize failed (HTTP 401) for get_accounts: token revoked',
      refreshAuth,
    );
    expect(hint).toBeDefined();
    expect(hint).toContain('Reconnect Robinhood');
  });

  it('maps the Aug 18 2026 shape — 401 client id not allowed — to the in-app reconnect', () => {
    const hint = diagnoseRobinhoodFailure(
      'Robinhood MCP initialize failed (HTTP 401) for get_accounts: client id not allowed: <missing>',
      refreshAuth,
    );
    expect(hint).toBeDefined();
    expect(hint).toContain('Reconnect Robinhood');
  });

  it('names the static-token trap when the bearer came from ROBINHOOD_MCP_TOKEN', () => {
    const hint = diagnoseRobinhoodFailure(
      'Robinhood MCP initialize failed (HTTP 401) for get_accounts: client id not allowed: <missing>',
      { ...refreshAuth, tokenSource: 'static', staticTokenSet: true },
    );
    expect(hint).toBeDefined();
    expect(hint).toContain('ROBINHOOD_MCP_TOKEN');
  });

  it('maps a rejected refresh grant to reconnecting', () => {
    const hint = diagnoseRobinhoodFailure(
      'Robinhood token refresh failed (invalid_grant). Re-run the OAuth capture (docs/CONFLUENCE_ROBINHOOD_TOKEN.md).',
      { ...refreshAuth, accessTokenCached: false },
    );
    expect(hint).toBeDefined();
    expect(hint).toContain('Reconnect Robinhood');
  });

  it('stays silent on failures it does not recognise — a wrong hint is worse than none', () => {
    expect(diagnoseRobinhoodFailure('fetch failed', refreshAuth)).toBeUndefined();
  });
});
