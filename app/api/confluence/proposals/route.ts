/**
 * ConfluenceTrading proposals API (owner-only).
 *
 * GET  /api/confluence/proposals            — list all (optional ?status= filter)
 * POST /api/confluence/proposals            — create a proposal (manual entry)
 *
 * Proposals created here are always `pending`. Nothing in this route places an
 * order — that only happens via the approve route + execution service.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireOwner } from '@/lib/auth-session';
import { getAllProposals, getProposalsByStatus, saveProposal } from '@/lib/db/confluence/proposals';
import { appendAudit } from '@/lib/db/confluence/audit';
import type {
  FundamentalMetric,
  Proposal,
  ProposalStatus,
  TimeInForce,
  TradeDirection,
} from '@/types/confluence';

const STATUSES: ProposalStatus[] = ['pending', 'approved', 'rejected', 'expired', 'superseded'];

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { userId, error } = await requireOwner();
  if (error) return error;

  const statusParam = request.nextUrl.searchParams.get('status') as ProposalStatus | null;
  const proposals =
    statusParam && STATUSES.includes(statusParam)
      ? await getProposalsByStatus(userId, statusParam)
      : await getAllProposals(userId);

  proposals.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return NextResponse.json({ success: true, proposals });
}

interface CreateProposalBody {
  symbol?: string;
  direction?: TradeDirection;
  thesis?: string;
  fundamentals?: FundamentalMetric[];
  suggestedLimitPrice?: number;
  suggestedQuantity?: number;
  suggestedStopPrice?: number;
  suggestedTargetPrice?: number;
  expiresAt?: string;
  // timeInForce is chosen at approval (order-side), but a manual proposal may hint it.
  timeInForce?: TimeInForce;
}

function validate(b: CreateProposalBody): string | null {
  if (!b || typeof b !== 'object') return 'Invalid request body';
  if (!b.symbol || !b.symbol.trim()) return 'Symbol is required';
  if (b.direction !== 'buy' && b.direction !== 'sell') return 'Direction must be buy or sell';
  if (!b.thesis || !b.thesis.trim()) return 'Thesis is required';
  if (typeof b.suggestedLimitPrice !== 'number' || !(b.suggestedLimitPrice > 0)) {
    return 'Suggested limit price must be a positive number';
  }
  if (typeof b.suggestedQuantity !== 'number' || !(b.suggestedQuantity > 0)) {
    return 'Suggested quantity must be a positive number';
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
      createdAt: now,
      symbol: body.symbol!.trim().toUpperCase(),
      direction: body.direction!,
      thesis: body.thesis!.trim(),
      suggestedLimitPrice: body.suggestedLimitPrice,
      suggestedQuantity: body.suggestedQuantity,
      suggestedStopPrice: typeof body.suggestedStopPrice === 'number' ? body.suggestedStopPrice : undefined,
      suggestedTargetPrice: typeof body.suggestedTargetPrice === 'number' ? body.suggestedTargetPrice : undefined,
      fundamentals: Array.isArray(body.fundamentals) ? body.fundamentals : [],
      status: 'pending',
      expiresAt: typeof body.expiresAt === 'string' ? body.expiresAt : undefined,
    };

    await saveProposal(proposal, userId);
    await appendAudit(userId, {
      actor: 'user',
      actorId: userId,
      eventType: 'proposal.created',
      entityType: 'proposal',
      entityId: proposal.id,
      after: { symbol: proposal.symbol, direction: proposal.direction, limitPrice: proposal.suggestedLimitPrice },
      note: `Manual proposal: ${proposal.direction} ${proposal.symbol} @ $${proposal.suggestedLimitPrice}`,
    });

    return NextResponse.json({ success: true, proposal }, { status: 201 });
  } catch (e) {
    console.error('Error creating ConfluenceTrading proposal:', e);
    return NextResponse.json({ success: false, error: 'Failed to create proposal' }, { status: 500 });
  }
}
