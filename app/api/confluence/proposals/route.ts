/**
 * ConfluenceTrading proposals API (owner-only).
 *
 * GET  /api/confluence/proposals            — list all (optional ?status= filter)
 * POST /api/confluence/proposals            — create a proposal (source: manual)
 *
 * NOTE: proposals created here are always `pending`. Nothing in this route
 * places an order — that only ever happens via the approve route + execution
 * service.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireOwner } from '@/lib/auth-session';
import { getAllProposals, getProposalsByStatus, saveProposal } from '@/lib/db/confluence/proposals';
import { appendAudit } from '@/lib/db/confluence/audit';
import type {
  FundamentalMetric,
  Proposal,
  ProposalStatus,
  TradeDirection,
} from '@/types/confluence';

const STATUSES: ProposalStatus[] = ['pending', 'approved', 'rejected', 'expired'];

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { userId, error } = await requireOwner();
  if (error) return error;

  const statusParam = request.nextUrl.searchParams.get('status') as ProposalStatus | null;
  const proposals =
    statusParam && STATUSES.includes(statusParam)
      ? await getProposalsByStatus(userId, statusParam)
      : await getAllProposals(userId);

  // Newest first.
  proposals.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return NextResponse.json({ success: true, proposals });
}

interface CreateProposalBody {
  ticker?: string;
  direction?: TradeDirection;
  thesis?: string;
  fundamentals?: FundamentalMetric[];
  suggestedLimitPrice?: number;
  suggestedShares?: number;
  stopPrice?: number;
  targetPrice?: number;
  timeInForce?: 'day' | 'gtc';
}

function validate(b: CreateProposalBody): string | null {
  if (!b || typeof b !== 'object') return 'Invalid request body';
  if (!b.ticker || !b.ticker.trim()) return 'Ticker is required';
  if (b.direction !== 'buy' && b.direction !== 'sell') return 'Direction must be buy or sell';
  if (!b.thesis || !b.thesis.trim()) return 'Thesis is required';
  if (typeof b.suggestedLimitPrice !== 'number' || !(b.suggestedLimitPrice > 0)) {
    return 'Suggested limit price must be a positive number';
  }
  if (typeof b.suggestedShares !== 'number' || !(b.suggestedShares > 0)) {
    return 'Suggested shares must be a positive number';
  }
  if (b.timeInForce && b.timeInForce !== 'day' && b.timeInForce !== 'gtc') {
    return 'timeInForce must be day or gtc';
  }
  return null;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const { userId, error } = await requireOwner();
  if (error) return error;

  try {
    const body = (await request.json()) as CreateProposalBody;
    const validationError = validate(body);
    if (validationError) {
      return NextResponse.json({ success: false, error: validationError }, { status: 400 });
    }

    const now = new Date().toISOString();
    const proposal: Proposal = {
      id: crypto.randomUUID(),
      userId,
      createdAt: now,
      updatedAt: now,
      source: 'manual',
      status: 'pending',
      ticker: body.ticker!.trim().toUpperCase(),
      direction: body.direction!,
      thesis: body.thesis!.trim(),
      fundamentals: Array.isArray(body.fundamentals) ? body.fundamentals : [],
      suggestedLimitPrice: body.suggestedLimitPrice!,
      suggestedShares: body.suggestedShares!,
      stopPrice: typeof body.stopPrice === 'number' ? body.stopPrice : undefined,
      targetPrice: typeof body.targetPrice === 'number' ? body.targetPrice : undefined,
      timeInForce: body.timeInForce ?? 'day',
    };

    await saveProposal(proposal, userId);
    await appendAudit(userId, {
      actor: 'user',
      type: 'proposal_created',
      summary: `Manual proposal created: ${proposal.direction} ${proposal.ticker} @ $${proposal.suggestedLimitPrice}`,
      proposalId: proposal.id,
    });

    return NextResponse.json({ success: true, proposal }, { status: 201 });
  } catch (e) {
    console.error('Error creating ConfluenceTrading proposal:', e);
    return NextResponse.json({ success: false, error: 'Failed to create proposal' }, { status: 500 });
  }
}
