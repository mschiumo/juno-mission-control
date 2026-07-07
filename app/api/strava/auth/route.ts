import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { requireUserId } from '@/lib/auth-session';
import { saveOAuthState } from '@/lib/strava';

// Kicks off the Strava OAuth flow. The redirect URI is derived from the
// request origin so the same code works on localhost, Vercel previews, and
// production — the origin's host just has to match the app's Authorization
// Callback Domain in Strava settings.
export async function GET(request: NextRequest) {
  const { userId, error } = await requireUserId();
  if (error) return error;

  const clientId = process.env.STRAVA_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ success: false, error: 'STRAVA_CLIENT_ID not configured' }, { status: 500 });
  }

  const state = randomBytes(16).toString('hex');
  await saveOAuthState(userId, state);

  const origin = new URL(request.url).origin;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${origin}/api/strava/callback`,
    response_type: 'code',
    // 'force' guarantees a fresh consent screen — Strava can otherwise reuse a
    // stale narrower-scope grant from a previous app authorization (bit us in
    // the March 2026 attempt).
    approval_prompt: 'force',
    scope: 'read,activity:read,activity:read_all',
    state,
  });

  return NextResponse.redirect(`https://www.strava.com/oauth/authorize?${params}`);
}
