import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth-session';
import { consumeOAuthState, exchangeCodeForTokens, saveTokens } from '@/lib/strava';

// OAuth redirect target. Exchanges the code, persists tokens in Redis (per
// user), and bounces back to the dashboard — no manual token copying, unlike
// the removed 2026-02 integration.
export async function GET(request: NextRequest) {
  const { userId, error } = await requireUserId();
  if (error) return error;

  const url = new URL(request.url);
  const dashboard = new URL('/', url.origin);

  const denied = url.searchParams.get('error');
  if (denied) {
    dashboard.searchParams.set('strava', 'denied');
    return NextResponse.redirect(dashboard);
  }

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (!code || !state || !(await consumeOAuthState(userId, state))) {
    dashboard.searchParams.set('strava', 'error');
    return NextResponse.redirect(dashboard);
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    await saveTokens(userId, tokens);
    dashboard.searchParams.set('strava', 'connected');
  } catch (err) {
    console.error('Strava callback error:', err);
    dashboard.searchParams.set('strava', 'error');
  }

  return NextResponse.redirect(dashboard);
}
