/**
 * The in-app reconnect flow's pure pieces. The stakes: a wrong PKCE challenge
 * or a mangled authorize URL fails only at Robinhood's end, mid-login, where
 * nothing in our logs explains it — so the derivations are pinned here.
 */

import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  FALLBACK_META,
  ROBINHOOD_MCP_RESOURCE,
  buildAuthorizeUrl,
  mergeOAuthMeta,
  newPkce,
  newState,
} from '@/lib/confluence/robinhood/connect';

describe('mergeOAuthMeta', () => {
  it('returns the fallback when discovery is unreachable', () => {
    expect(mergeOAuthMeta(null)).toEqual(FALLBACK_META);
    expect(mergeOAuthMeta(undefined)).toEqual(FALLBACK_META);
  });

  it('lets discovery override fields — the registration endpoint has already moved once', () => {
    const merged = mergeOAuthMeta({
      registration_endpoint: 'https://agent.robinhood.com/somewhere/new/register',
    });
    expect(merged.registration_endpoint).toBe('https://agent.robinhood.com/somewhere/new/register');
    expect(merged.token_endpoint).toBe(FALLBACK_META.token_endpoint);
    expect(merged.authorization_endpoint).toBe(FALLBACK_META.authorization_endpoint);
  });

  it('ignores an empty scopes list so a partial document cannot drop the scope param', () => {
    expect(mergeOAuthMeta({ scopes_supported: [] }).scopes_supported).toEqual(
      FALLBACK_META.scopes_supported,
    );
  });
});

describe('newPkce', () => {
  it('derives the challenge as base64url(SHA-256(verifier))', () => {
    const { verifier, challenge } = newPkce();
    const expected = createHash('sha256').update(verifier).digest('base64url');
    expect(challenge).toBe(expected);
  });

  it('meets RFC 7636 verifier length (43–128 chars) and is unique per call', () => {
    const a = newPkce();
    const b = newPkce();
    expect(a.verifier.length).toBeGreaterThanOrEqual(43);
    expect(a.verifier.length).toBeLessThanOrEqual(128);
    expect(a.verifier).not.toBe(b.verifier);
  });
});

describe('newState', () => {
  it('is unique per call', () => {
    expect(newState()).not.toBe(newState());
  });
});

describe('buildAuthorizeUrl', () => {
  const url = new URL(
    buildAuthorizeUrl(FALLBACK_META, {
      clientId: 'client-123',
      redirectUri: 'https://confluencetrading.app/api/confluence/robinhood/oauth/callback',
      state: 'state-abc',
      codeChallenge: 'challenge-xyz',
    }),
  );

  it('targets the authorization endpoint', () => {
    expect(url.origin + url.pathname).toBe(FALLBACK_META.authorization_endpoint);
  });

  it('carries every required OAuth 2.1 parameter', () => {
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('client_id')).toBe('client-123');
    expect(url.searchParams.get('redirect_uri')).toBe(
      'https://confluencetrading.app/api/confluence/robinhood/oauth/callback',
    );
    expect(url.searchParams.get('code_challenge')).toBe('challenge-xyz');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('state')).toBe('state-abc');
  });

  it('pins scope and the MCP resource — without `resource`, the minted token is not bound to the MCP host', () => {
    expect(url.searchParams.get('scope')).toBe('internal');
    expect(url.searchParams.get('resource')).toBe(ROBINHOOD_MCP_RESOURCE);
  });
});
