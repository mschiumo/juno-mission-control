import { NextResponse } from 'next/server';

export async function GET() {
  const envCheck = {
    hasClientId: !!process.env.STRAVA_CLIENT_ID,
    hasClientSecret: !!process.env.STRAVA_CLIENT_SECRET,
    hasRefreshToken: !!process.env.STRAVA_REFRESH_TOKEN,
    clientIdLength: process.env.STRAVA_CLIENT_ID?.length || 0,
    clientSecretLength: process.env.STRAVA_CLIENT_SECRET?.length || 0,
    refreshTokenLength: process.env.STRAVA_REFRESH_TOKEN?.length || 0,
    nodeEnv: process.env.NODE_ENV,
    vercelEnv: process.env.VERCEL_ENV,
  };

  return NextResponse.json({
    success: true,
    envCheck,
    timestamp: new Date().toISOString(),
  });
}