/**
 * Seed dummy proposals (owner-only, paper-mode demo helper).
 *
 * POST /api/confluence/seed
 *
 * Milestone 1's acceptance test is "watch dummy proposals flow end to end".
 * This creates a few realistic `pending` proposals so the queue → approve →
 * paper order → fill loop can be exercised before the real analysis agent
 * (Milestone 2) exists. It places NO orders itself.
 *
 * The theses/fundamentals are illustrative placeholders — the user's real
 * fundamental criteria are an Open Item and are NOT invented by this feature.
 */

import { NextResponse } from 'next/server';
import { requireOwner } from '@/lib/auth-session';
import { saveProposal } from '@/lib/db/confluence/proposals';
import { appendAudit } from '@/lib/db/confluence/audit';
import type { Proposal } from '@/types/confluence';

type Seed = Pick<
  Proposal,
  | 'symbol'
  | 'direction'
  | 'thesis'
  | 'suggestedLimitPrice'
  | 'suggestedQuantity'
  | 'suggestedStopPrice'
  | 'suggestedTargetPrice'
  | 'fundamentals'
>;

const SEEDS: Seed[] = [
  {
    symbol: 'AAPL',
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
    suggestedQuantity: 5,
    suggestedStopPrice: 174,
    suggestedTargetPrice: 205,
  },
  {
    symbol: 'MSFT',
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
    suggestedQuantity: 2,
    suggestedStopPrice: 388,
    suggestedTargetPrice: 460,
  },
  {
    symbol: 'KO',
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
    suggestedQuantity: 10,
    suggestedStopPrice: 56,
    suggestedTargetPrice: 70,
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
      createdAt: now,
      status: 'pending',
      ...seed,
    };
    await saveProposal(proposal, userId);
    await appendAudit(userId, {
      actor: 'system',
      actorId: 'system',
      eventType: 'proposal.created',
      entityType: 'proposal',
      entityId: proposal.id,
      after: { symbol: proposal.symbol, direction: proposal.direction, limitPrice: proposal.suggestedLimitPrice, seed: true },
      note: `Seeded demo proposal: ${proposal.direction} ${proposal.symbol} @ $${proposal.suggestedLimitPrice}`,
    });
    created.push(proposal);
  }

  return NextResponse.json({ success: true, created: created.length, proposals: created }, { status: 201 });
}
