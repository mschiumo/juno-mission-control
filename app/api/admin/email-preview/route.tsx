/**
 * GET /api/admin/email-preview?template=welcome|checkin|trial|digest
 *
 * Owner-only: renders any lifecycle/digest email template to HTML with
 * sample data, so copy and layout can be checked in a browser without
 * sending anything. Add new templates to the map as they appear.
 */

import { NextRequest, NextResponse } from 'next/server';
import { render } from '@react-email/render';
import { requireOwner } from '@/lib/auth-session';
import { WelcomeEmail } from '@/lib/emails/WelcomeEmail';
import { CheckinEmail } from '@/lib/emails/CheckinEmail';
import { TrialEndingEmail } from '@/lib/emails/TrialEndingEmail';
import { OwnerMetricsEmail } from '@/lib/emails/OwnerMetricsEmail';
import type { AccountMetrics } from '@/lib/admin-metrics';

const SAMPLE_METRICS: AccountMetrics = {
  generatedAt: new Date().toISOString(),
  totalUsers: 24,
  tiers: { silver: 19, gold: 4, platinum: 1 },
  paidSources: { owner: 1, admin: 1, billing: 0, trial: 2, referral: 1 },
  brokerageConnected: 3,
  briefingOptIns: 5,
  trialsUsedTotal: 7,
  referralsRedeemedTotal: 2,
  expiringWithin7Days: [
    {
      email: 'trader@example.com',
      tier: 'gold',
      source: 'trial',
      expiresAt: new Date(Date.now() + 2 * 86400000).toISOString(),
    },
  ],
  recentEvents: [
    { type: 'trial_started', at: new Date().toISOString(), userId: 'u1', email: 'trader@example.com', detail: 'Gold trial' },
    { type: 'signup', at: new Date().toISOString(), userId: 'u2', email: 'new@example.com' },
  ],
  last24h: [
    { type: 'trial_started', at: new Date().toISOString(), userId: 'u1', email: 'trader@example.com', detail: 'Gold trial' },
  ],
};

export async function GET(request: NextRequest): Promise<NextResponse | Response> {
  const { error: ownerError } = await requireOwner();
  if (ownerError) return ownerError;

  const template = request.nextUrl.searchParams.get('template') ?? 'welcome';
  const sampleExpiry = new Date(Date.now() + 26 * 60 * 60 * 1000).toISOString();

  let element: React.ReactElement;
  switch (template) {
    case 'welcome':
      element = <WelcomeEmail name="Alex Trader" />;
      break;
    case 'checkin':
      element = <CheckinEmail name="Alex Trader" />;
      break;
    case 'trial':
      element = <TrialEndingEmail name="Alex Trader" expiresAt={sampleExpiry} />;
      break;
    case 'digest':
      element = <OwnerMetricsEmail metrics={SAMPLE_METRICS} />;
      break;
    default:
      return NextResponse.json(
        { success: false, error: "template must be 'welcome', 'checkin', 'trial', or 'digest'" },
        { status: 400 },
      );
  }

  const html = await render(element);
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}
