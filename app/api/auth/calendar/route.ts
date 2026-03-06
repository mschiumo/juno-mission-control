/**
 * Google Calendar OAuth Authorization Endpoint
 * 
 * Initiates the OAuth flow for Google Calendar access.
 * Uses PKCE for secure authorization code flow.
 */

import { NextResponse } from 'next/server';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_CALENDAR_REDIRECT_URI || 
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}/api/auth/calendar/callback` : 'http://localhost:3000/api/auth/calendar/callback');

// Required OAuth scopes for Calendar and Gmail
const SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
  'openid'
];

/**
 * Generate a random state parameter for CSRF protection
 */
function generateState(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Generate a code verifier for PKCE
 */
function generateCodeVerifier(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Generate code challenge from verifier (S256 method)
 */
async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

export async function GET(request: Request) {
  try {
    if (!GOOGLE_CLIENT_ID) {
      return NextResponse.json(
        { success: false, error: 'Google Client ID not configured' },
        { status: 500 }
      );
    }

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId') || 'default';
    
    // Generate PKCE parameters
    const state = generateState();
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = await generateCodeChallenge(codeVerifier);

    // Build the authorization URL
    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.append('client_id', GOOGLE_CLIENT_ID);
    authUrl.searchParams.append('redirect_uri', GOOGLE_REDIRECT_URI);
    authUrl.searchParams.append('response_type', 'code');
    authUrl.searchParams.append('scope', SCOPES.join(' '));
    authUrl.searchParams.append('state', state);
    authUrl.searchParams.append('code_challenge', codeChallenge);
    authUrl.searchParams.append('code_challenge_method', 'S256');
    authUrl.searchParams.append('access_type', 'offline');
    authUrl.searchParams.append('prompt', 'consent');
    authUrl.searchParams.append('include_granted_scopes', 'true');

    // Store PKCE verifier in a cookie (will be used in callback)
    const response = NextResponse.redirect(authUrl.toString());
    
    // Set cookies with state and code verifier (valid for 10 minutes)
    const cookieOptions = 'Path=/; HttpOnly; SameSite=Lax; Max-Age=600';
    
    // In production, use secure cookies
    const secureFlag = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    
    response.headers.append('Set-Cookie', `oauth_state=${state}; ${cookieOptions}${secureFlag}`);
    response.headers.append('Set-Cookie', `oauth_code_verifier=${codeVerifier}; ${cookieOptions}${secureFlag}`);
    response.headers.append('Set-Cookie', `oauth_user_id=${userId}; ${cookieOptions}${secureFlag}`);

    return response;
  } catch (error) {
    console.error('Calendar auth error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to initiate OAuth flow' },
      { status: 500 }
    );
  }
}
