/**
 * ConfluenceTrading rejection (owner-only).
 *
 * POST /api/confluence/proposals/:id/reject  body (optional): { note? }
 *
 * Terminal for the proposal. No order is ever created — the guaranteed worst
 * case: a rejected proposal simply never touches money.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireOwner } from '@/lib/auth-session';
import { getProposalById, decideProposal } from '@/lib/db/confluence/proposals';
import { appendAudit } from '@/lib/db/confluence/audit';

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { userId, email, error } = await requireOwner();
  if (error) return error;
  const { id } = await params;

  const proposal = await getProposalById(id, userId);
  if (!proposal) {
    return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
  }
  if (proposal.status !== 'pending') {
    return NextResponse.json({ success: false, error: `Proposal is already ${proposal.status}` }, { status: 409 });
  }

  let note: string | undefined;
  try {
    const body = (await request.json()) as { note?: string };
    note = body?.note?.trim() || undefined;
  } catch {
    /* no body is fine */
  }

  const now = new Date().toISOString();
  const rejected = await decideProposal(id, userId, { status: 'rejected', decidedBy: email, decidedAt: now });
  await appendAudit(userId, {
    actor: 'user',
    actorId: email,
    eventType: 'proposal.rejected',
    entityType: 'proposal',
    entityId: id,
    note: `Rejected ${proposal.direction} ${proposal.symbol}${note ? ` — ${note}` : ''}`,
  });

  return NextResponse.json({ success: true, proposal: rejected });
}
