import { NextResponse } from 'next/server';
import { requireCronSecret } from '@/lib/auth-session';

// OpenClaw Gateway endpoint
const GATEWAY_URL = process.env.GATEWAY_URL || 'http://127.0.0.1:18789';
const GATEWAY_TOKEN = process.env.GATEWAY_TOKEN || '';

export async function POST(request: Request) {
  const authError = requireCronSecret(request);
  if (authError) return authError;

  try {
    const { jobId } = await request.json();

    if (!jobId) {
      return NextResponse.json({
        success: false,
        error: 'Job ID is required'
      }, { status: 400 });
    }

    const response = await fetch(`${GATEWAY_URL}/api/cron/run`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GATEWAY_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ jobId })
    });

    if (response.ok) {
      const data = await response.json();
      return NextResponse.json({
        success: true,
        message: `Job ${jobId} triggered successfully`,
        data
      });
    }

    return NextResponse.json({
      success: false,
      error: `Gateway returned ${response.status}`
    }, { status: 502 });

  } catch (error) {
    console.error('Run cron job error:', error);
    return NextResponse.json({
      success: false,
      error: 'Internal error triggering cron job'
    }, { status: 500 });
  }
}
