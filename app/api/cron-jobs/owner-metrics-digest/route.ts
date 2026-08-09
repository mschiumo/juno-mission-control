/**
 * GET /api/cron-jobs/owner-metrics-digest — daily account-metrics email.
 *
 * Runs each morning (see vercel.json) and sends the owner a rundown of
 * account state and the last 24 hours of plan activity. Uses the same
 * computeAccountMetrics() as the in-app Accounts tab.
 */

import { NextResponse } from 'next/server';
import { requireCronSecret } from '@/lib/auth-session';
import { computeAccountMetrics } from '@/lib/admin-metrics';
import { sendEmail } from '@/lib/email';
import { OwnerMetricsEmail } from '@/lib/emails/OwnerMetricsEmail';
import { OWNER_EMAIL } from '@/lib/owner';

export async function GET(request: Request): Promise<NextResponse> {
  const authError = requireCronSecret(request);
  if (authError) return authError;

  try {
    const metrics = await computeAccountMetrics();
    const paid = metrics.tiers.gold + metrics.tiers.platinum;
    const result = await sendEmail({
      to: OWNER_EMAIL,
      subject: `ConfluenceTrading metrics — ${metrics.totalUsers} accounts, ${paid} paid, ${metrics.last24h.length} events`,
      react: OwnerMetricsEmail({ metrics }),
    });
    return NextResponse.json({
      success: result.success,
      sent: result.success,
      error: result.error,
      snapshot: {
        totalUsers: metrics.totalUsers,
        tiers: metrics.tiers,
        brokerageConnected: metrics.brokerageConnected,
        eventsLast24h: metrics.last24h.length,
      },
    });
  } catch (error) {
    console.error('Owner metrics digest failed:', error);
    return NextResponse.json({ success: false, error: 'Digest failed' }, { status: 500 });
  }
}
