/**
 * The health endpoint's reported token source must match the branch
 * getRobinhoodAccessToken() actually takes.
 *
 * Why it matters: on 2026-08-18 Robinhood answered every call with
 * `401 … client id not allowed: <missing>`, and the health endpoint said only
 * `configured: true` — which is satisfied by a static token alone. A missing
 * ROBINHOOD_OAUTH_CLIENT_ID silently falls back to that static token, and the
 * response could not distinguish the two.
 */

import { describe, expect, it } from 'vitest';
import { resolveTokenSource } from '@/lib/confluence/robinhood/oauth';

describe('resolveTokenSource', () => {
  it('uses the refresh flow when a client id and a refresh token both exist', () => {
    expect(resolveTokenSource({ clientIdSet: true, refreshTokenSource: 'redis', staticTokenSet: false })).toBe('refresh');
    expect(resolveTokenSource({ clientIdSet: true, refreshTokenSource: 'env', staticTokenSet: true })).toBe('refresh');
  });

  it('prefers the rotated Redis refresh token over the env seed', () => {
    // Both resolve to 'refresh'; the distinction is reported separately so a
    // stale Redis key (which wins) is visible during recovery.
    expect(resolveTokenSource({ clientIdSet: true, refreshTokenSource: 'redis', staticTokenSet: true })).toBe('refresh');
  });

  it('falls back to the static token when the client id is missing', () => {
    // The 2026-08-18 shape: a refresh token is present but unusable without a
    // client id, so a short-lived pasted token is sent instead.
    expect(resolveTokenSource({ clientIdSet: false, refreshTokenSource: 'env', staticTokenSet: true })).toBe('static');
    expect(resolveTokenSource({ clientIdSet: false, refreshTokenSource: 'redis', staticTokenSet: true })).toBe('static');
  });

  it('falls back to the static token when no refresh token is available', () => {
    expect(resolveTokenSource({ clientIdSet: true, refreshTokenSource: 'none', staticTokenSet: true })).toBe('static');
  });

  it('reports none when nothing is configured', () => {
    expect(resolveTokenSource({ clientIdSet: false, refreshTokenSource: 'none', staticTokenSet: false })).toBe('none');
    expect(resolveTokenSource({ clientIdSet: true, refreshTokenSource: 'none', staticTokenSet: false })).toBe('none');
  });
});
