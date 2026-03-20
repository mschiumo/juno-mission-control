import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const error = searchParams.get('error');

  if (error) {
    return NextResponse.json({ error: `Strava authorization denied: ${error}` }, { status: 400 });
  }

  if (!code) {
    return NextResponse.json({ error: 'No authorization code returned from Strava' }, { status: 400 });
  }

  const clientId = process.env.STRAVA_CLIENT_ID;
  const clientSecret = process.env.STRAVA_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: 'STRAVA_CLIENT_ID or STRAVA_CLIENT_SECRET not set' }, { status: 500 });
  }

  const res = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: 'authorization_code',
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    return NextResponse.json({ error: `Token exchange failed: ${body}` }, { status: 500 });
  }

  const data = await res.json();

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Strava Connected</title>
        <style>
          body { font-family: monospace; background: #0d1117; color: #e6edf3; padding: 40px; max-width: 700px; margin: 0 auto; }
          h1 { color: #FC4C02; }
          .token-box { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 20px; margin: 20px 0; word-break: break-all; }
          .label { color: #8b949e; font-size: 12px; margin-bottom: 6px; }
          .value { color: #58a6ff; font-size: 13px; }
          .instruction { background: #238636/20; border: 1px solid #238636; border-radius: 8px; padding: 16px; color: #3fb950; margin-top: 24px; }
        </style>
      </head>
      <body>
        <h1>✓ Strava Connected</h1>
        <p>Copy your refresh token below and add it to your environment variables.</p>

        <div class="token-box">
          <div class="label">STRAVA_REFRESH_TOKEN</div>
          <div class="value">${data.refresh_token}</div>
        </div>

        <div class="token-box">
          <div class="label">Athlete</div>
          <div class="value">${data.athlete?.firstname ?? ''} ${data.athlete?.lastname ?? ''} (ID: ${data.athlete?.id ?? ''})</div>
        </div>

        <div class="instruction">
          Add to your <strong>.env.local</strong> and Vercel environment variables:<br/><br/>
          STRAVA_REFRESH_TOKEN=${data.refresh_token}
        </div>
      </body>
    </html>
  `;

  return new NextResponse(html, { headers: { 'Content-Type': 'text/html' } });
}
