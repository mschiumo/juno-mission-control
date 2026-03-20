import { NextResponse } from 'next/server';

export async function GET() {
  const clientId = process.env.STRAVA_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: 'STRAVA_CLIENT_ID not set' }, { status: 500 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const redirectUri = `${appUrl}/api/strava/callback`;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    approval_prompt: 'auto',
    scope: 'read,activity:read',
  });

  return NextResponse.redirect(`https://www.strava.com/oauth/authorize?${params}`);
}
