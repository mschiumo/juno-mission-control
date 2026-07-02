/**
 * ConfluenceTrading rejection (owner-only).
 *
 * POST /api/confluence/proposals/:id/reject  body (optional): { note? }
 *
 * Terminal for the proposal. No order is ever created. This is the "worst case"
 * the design guarantees: a rejected proposal simply never touches money.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireOwner } from '@/lib/auth-session';
import { getProposalById, updateProposal } from '@/lib/db/confluence/proposals';
import { appendAudit } from '@/lib/db/confluence/audit';

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { userId, email, error } = await requireOwner();
  if (error) return error;
  const { id } = await params;

  const current = await getProposalById(id, userId);
  if (!current) {
    return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
  }
  if (current.status !== 'pending') {
    return NextResponse.json(
      { success: false, error: `Proposal is already ${current.status}` },
      { status: 409 },
    );
  }

  let note: string | undefined;
  try {
    const body = (await request.json()) as { note?: string };
    note = body?.note?.trim() || undefined;
  } catch {
    /* no body is fine */
  }

  const now = new Date().toISOString();
  const rejected = await updateProposal(
    id,
    { status: 'rejected', decision: { action: 'rejected', decidedBy: email, decidedAt: now, note } },
    userId,
  );
  await appendAudit(userId, {
    actor: 'user',
    type: 'proposal_rejected',
    summary: `Rejected ${current.direction} ${current.ticker}${note ? ` — ${note}` : ''}`,
    proposalId: id,
  });

  return NextResponse.json({ success: true, proposal: rejected });
}
