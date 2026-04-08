import { NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth-session';

const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;

export async function GET() {
  const authResult = await requireUserId();
  if (authResult.error) return authResult.error;

  const checks = {
    finnhub: {
      keyPresent: !!FINNHUB_API_KEY,
      testCall: null as { success: boolean; status?: number; error?: string } | null
    },
  };

  if (FINNHUB_API_KEY) {
    try {
      const response = await fetch(
        `https://finnhub.io/api/v1/quote?symbol=AAPL&token=${FINNHUB_API_KEY}`,
        { next: { revalidate: 0 } }
      );
      checks.finnhub.testCall = {
        success: response.ok,
        status: response.status
      };
    } catch (error) {
      checks.finnhub.testCall = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  const allOk = checks.finnhub.keyPresent && checks.finnhub.testCall?.success;

  return NextResponse.json({
    success: allOk,
    checks,
    timestamp: new Date().toISOString(),
    message: allOk
      ? 'All systems operational'
      : 'FINNHUB_API_KEY not configured or invalid. Please add it to Vercel environment variables.'
  }, { status: allOk ? 200 : 503 });
}
