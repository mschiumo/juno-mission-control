/**
 * Test email delivery endpoint.
 * Sends a sample market briefing or gap scanner email to the authenticated user.
 *
 * Usage:
 *   GET /api/test-email?type=briefing
 *   GET /api/test-email?type=gapScanner
 */

import { NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth-session';
import { getUserById } from '@/lib/db/users';
import { sendEmail } from '@/lib/email';
import { MarketBriefingEmail } from '@/lib/emails/MarketBriefingEmail';

const SAMPLE_BRIEFING = {
  date: new Date().toLocaleDateString('en-US', { timeZone: 'America/New_York' }),
  indices: [
    { symbol: 'SPY', name: 'S&P 500', price: 582.41, change: 4.23, changePercent: 0.73, status: 'up' as const },
    { symbol: 'QQQ', name: 'NASDAQ', price: 502.18, change: 6.85, changePercent: 1.38, status: 'up' as const },
    { symbol: 'DIA', name: 'Dow Jones', price: 428.90, change: -1.20, changePercent: -0.28, status: 'down' as const },
    { symbol: 'VIX', name: 'VIX', price: 14.32, change: -0.88, changePercent: -5.79, status: 'down' as const },
  ],
  stocks: [
    { symbol: 'NVDA', name: 'NVIDIA', price: 142.50, change: 5.80, changePercent: 4.24, status: 'up' as const },
    { symbol: 'AAPL', name: 'Apple', price: 237.15, change: 1.42, changePercent: 0.60, status: 'up' as const },
    { symbol: 'TSLA', name: 'Tesla', price: 348.60, change: -8.40, changePercent: -2.35, status: 'down' as const },
  ],
  crypto: [
    { symbol: 'BTC', name: 'Bitcoin', price: 104520, change: 1850, changePercent: 1.80, status: 'up' as const },
    { symbol: 'ETH', name: 'Ethereum', price: 3840, change: -45, changePercent: -1.16, status: 'down' as const },
  ],
  aiSummary: {
    marketOverview: 'This is a test email from Confluence Trading. Markets are showing mixed signals with tech leading gains while defensives lag. The S&P 500 pushed higher on strong NVIDIA earnings momentum.',
    bigMovers: [
      { symbol: 'NVDA', move: '+4.24%', reason: 'Beat Q4 earnings estimates, raised guidance on AI chip demand' },
      { symbol: 'TSLA', move: '-2.35%', reason: 'Delivery numbers slightly below expectations for the quarter' },
    ],
    newsHighlights: [
      { headline: 'Fed signals patience on rate cuts amid sticky inflation', url: 'https://example.com' },
      { headline: 'NVIDIA data center revenue surges 400% year-over-year', url: 'https://example.com' },
    ],
    upcomingEvents: [
      '[Today] Core PCE Price Index (est. 2.8%)',
      '[Tomorrow] Michigan Consumer Sentiment',
    ],
    sentiment: 'bullish' as const,
  },
};

const SAMPLE_GAP_DATA = {
  gainers: [
    { symbol: 'SMCI', gapPercent: 18.5 },
    { symbol: 'MARA', gapPercent: 12.3 },
    { symbol: 'RIVN', gapPercent: 8.7 },
    { symbol: 'IONQ', gapPercent: 7.2 },
    { symbol: 'PLTR', gapPercent: 5.8 },
    { symbol: 'ARM', gapPercent: 5.4 },
    { symbol: 'SOFI', gapPercent: 4.9 },
    { symbol: 'RKLB', gapPercent: 4.3 },
    { symbol: 'HOOD', gapPercent: 3.8 },
    { symbol: 'COIN', gapPercent: 3.2 },
  ],
  losers: [
    { symbol: 'SNAP', gapPercent: -14.2 },
    { symbol: 'ROKU', gapPercent: -9.8 },
    { symbol: 'BYND', gapPercent: -7.5 },
    { symbol: 'LCID', gapPercent: -6.1 },
    { symbol: 'PINS', gapPercent: -5.3 },
    { symbol: 'DASH', gapPercent: -4.7 },
    { symbol: 'DKNG', gapPercent: -4.2 },
    { symbol: 'LYFT', gapPercent: -3.8 },
    { symbol: 'UPST', gapPercent: -3.4 },
    { symbol: 'OPEN', gapPercent: -2.9 },
  ],
};

export async function GET(request: Request) {
  const authResult = await requireUserId();
  if (authResult.error) return authResult.error;

  const user = await getUserById(authResult.userId);
  if (!user?.email) {
    return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const includeGaps = searchParams.get('gaps') !== 'false';

  const result = await sendEmail({
    to: user.email,
    subject: `[TEST] Morning Brief — ${SAMPLE_BRIEFING.date}`,
    react: MarketBriefingEmail({
      ...SAMPLE_BRIEFING,
      gapData: includeGaps ? SAMPLE_GAP_DATA : undefined,
    }),
  });

  return NextResponse.json({
    success: result.success,
    sentTo: user.email,
    includeGaps,
    emailId: result.id,
    error: result.error,
  });
}
