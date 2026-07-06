/**
 * ConfluenceTrading agent cron — the scheduled swing-cadence scan.
 *
 * Runs on a swing cadence (nightly, weekdays), not intraday. It:
 *   1. Expires stale pending proposals (past their swing horizon).
 *   2. Runs the analysis agent, which screens fundamentals and writes new
 *      `pending` proposals for the owner to review.
 *
 * It PLACES NO ORDERS — the agent only proposes; execution stays behind the
 * human gate. Runs for the app owner (single-user feature).
 *
 * Auth: /api/cron-jobs/* is gated by CRON_SECRET in middleware.ts; Vercel sends
 * "Authorization: Bearer <CRON_SECRET>" automatically. No in-route check needed.
 */

import { NextResponse } from 'next/server';
import { getUserByEmail } from '@/lib/db/users';
import { OWNER_EMAIL } from '@/lib/owner';
import { postToCronResults } from '@/lib/cron-helpers';
import { runAgent } from '@/lib/confluence/agent/runner';
import { expireStaleProposals } from '@/lib/confluence/agent/expiry';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const owner = await getUserByEmail(OWNER_EMAIL);
    if (!owner) {
      return NextResponse.json({ success: false, error: 'Owner account not found' }, { status: 404 });
    }

    const expired = await expireStaleProposals(owner.id);
    const run = await runAgent(owner.id, { cadence: 'nightly' });

    const summary = `ConfluenceTrading agent: ${run.proposalsGenerated} new proposal(s), ${expired} expired (run ${run.status}).`;
    await postToCronResults('confluence-agent', summary, run.status === 'failed' ? 'error' : 'review');

    return NextResponse.json({
      success: run.status !== 'failed',
      runId: run.id,
      proposalsGenerated: run.proposalsGenerated,
      expired,
      status: run.status,
    });
  } catch (e) {
    console.error('ConfluenceTrading agent cron failed:', e);
    return NextResponse.json({ success: false, error: 'Agent cron failed' }, { status: 500 });
  }
}
