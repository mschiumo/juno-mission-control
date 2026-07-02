/**
 * Seed dummy proposals (owner-only, paper-mode demo helper).
 *
 * POST /api/confluence/seed
 *
 * Milestone 1's acceptance test is "watch dummy proposals flow end to end".
 * This creates a few realistic `pending` proposals (source: manual) so the
 * queue → approve → paper order → fill loop can be exercised before the real
 * analysis agent (Milestone 2) exists. It places NO orders itself.
 *
 * The theses/fundamentals here are illustrative placeholders — the user's real
 * fundamental criteria are an Open Item and are NOT invented by this feature.
 */

import { NextResponse } from 'next/server';
import { requireOwner } from '@/lib/auth-session';
import { saveProposal } from '@/lib/db/confluence/proposals';
import { appendAudit } from '@/lib/db/confluence/audit';
import type { Proposal } from '@/types/confluence';

type Seed = Omit<Proposal, 'id' | 'userId' | 'createdAt' | 'updatedAt' | 'status' | 'source'>;

const SEEDS: Seed[] = [
  {
    ticker: 'AAPL',
    direction: 'buy',
    thesis:
      'Placeholder demo thesis — services margin expansion and a stable buyback support a staged swing entry on a pullback to support. (Illustrative only; not a real recommendation.)',
    fundamentals: [
      { label: 'P/E (TTM)', value: '29.1', hint: 'vs 5-yr avg 26' },
      { label: 'Gross margin', value: '46.2%', hint: 'services-led' },
      { label: 'FCF (TTM)', value: '$99B' },
      { label: 'Rev growth YoY', value: '4.9%' },
    ],
    suggestedLimitPrice: 182.5,
    suggestedShares: 5,
    stopPrice: 174,
    targetPrice: 205,
    timeInForce: 'gtc',
  },
  {
    ticker: 'MSFT',
    direction: 'buy',
    thesis:
      'Placeholder demo thesis — cloud/AI backlog growth with durable operating leverage; scale into a limit below the recent breakout. (Illustrative only.)',
    fundamentals: [
      { label: 'P/E (TTM)', value: '34.7' },
      { label: 'Operating margin', value: '44.6%' },
      { label: 'Azure growth YoY', value: '29%' },
      { label: 'Net cash', value: '$70B' },
    ],
    suggestedLimitPrice: 405,
    suggestedShares: 2,
    stopPrice: 388,
    targetPrice: 460,
    timeInForce: 'gtc',
  },
  {
    ticker: 'KO',
    direction: 'buy',
    thesis:
      'Placeholder demo thesis — defensive dividend compounder; small starter position on valuation reset. (Illustrative only.)',
    fundamentals: [
      { label: 'Dividend yield', value: '3.1%' },
      { label: 'P/E (TTM)', value: '24.0' },
      { label: 'Payout ratio', value: '68%' },
      { label: 'Rev growth YoY', value: '3.2%' },
    ],
    suggestedLimitPrice: 60,
    suggestedShares: 10,
    stopPrice: 56,
    targetPrice: 70,
    timeInForce: 'day',
  },
];

export async function POST(): Promise<NextResponse> {
  const { userId, error } = await requireOwner();
  if (error) return error;

  const now = new Date().toISOString();
  const created: Proposal[] = [];
  for (const seed of SEEDS) {
    const proposal: Proposal = {
      id: crypto.randomUUID(),
      userId,
      createdAt: now,
      updatedAt: now,
      source: 'manual',
      status: 'pending',
      ...seed,
    };
    await saveProposal(proposal, userId);
    await appendAudit(userId, {
      actor: 'system',
      type: 'proposal_created',
      summary: `Seeded demo proposal: ${proposal.direction} ${proposal.ticker} @ $${proposal.suggestedLimitPrice}`,
      proposalId: proposal.id,
      data: { seed: true },
    });
    created.push(proposal);
  }

  return NextResponse.json({ success: true, created: created.length, proposals: created }, { status: 201 });
}
