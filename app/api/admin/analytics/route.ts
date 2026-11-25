import { NextRequest, NextResponse } from 'next/server';
import { requireOwner } from '@/lib/auth-session';
import { getUsageSummary, parseAnalyticsSite } from '@/lib/db/usage-analytics';
import { listPlanEvents, eventsSince } from '@/lib/db/plan-events';
import { isOwnerEmail } from '@/lib/owner';

/** Matches the usage feed depth so the merged timeline is balanced. */
const PLAN_EVENT_LIMIT = 50;

/**
 * Owner-only usage analytics summary for one site, plus (for the app) the
 * recent plan-lifecycle events so the Analytics tab can render one merged
 * activity feed. Sites are summarised independently — the blog's traffic is
 * never folded into the app's numbers or vice versa.
 *
 * ?site=       'app' (default) or 'mjswrites'
 * ?days=       window length (default 14)
 * ?includeOwner=1  count the owner's own visits and clicks too; omitted, the
 *                  summary describes everyone but the owner. Plan events
 *                  about the owner's own account follow the same switch.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { error: ownerError } = await requireOwner();
  if (ownerError) return ownerError;

  const site = parseAnalyticsSite(request.nextUrl.searchParams.get('site'));
  const days = parseInt(request.nextUrl.searchParams.get('days') ?? '14', 10) || 14;
  const includeOwner = request.nextUrl.searchParams.get('includeOwner') === '1';

  try {
    // Plan events are an app concept; the blog has no accounts.
    const [summary, planEvents] = await Promise.all([
      getUsageSummary(site, days, includeOwner),
      site === 'app' ? listPlanEvents(PLAN_EVENT_LIMIT) : Promise.resolve([]),
    ]);
    const visiblePlanEvents = includeOwner
      ? planEvents
      : planEvents.filter((event) => !isOwnerEmail(event.email));
    // Computed here rather than in the component so render stays pure.
    const planEventsLast24h = eventsSince(
      visiblePlanEvents,
      new Date(Date.now() - 24 * 60 * 60 * 1000),
    ).length;
    return NextResponse.json({
      success: true,
      summary,
      planEvents: visiblePlanEvents,
      planEventsLast24h,
    });
  } catch (error) {
    console.error('Failed to compute usage summary:', error);
    return NextResponse.json({ success: false, error: 'Failed to load analytics' }, { status: 500 });
  }
}
