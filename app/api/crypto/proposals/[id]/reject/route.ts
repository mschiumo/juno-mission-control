import { NextRequest, NextResponse } from 'next/server';
import { requireOwner } from '@/lib/auth-session';
import { appendAudit, listProposals, upsertProposal } from '@/lib/db/crypto/collections';

export const dynamic = 'force-dynamic';

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(_request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { userId, email, error } = await requireOwner();
  if (error) return error;
  const { id } = await params;

  const proposals = await listProposals(userId);
  const proposal = proposals.find((p) => p.id === id);
  if (!proposal) {
    return NextResponse.json({ success: false, error: 'Proposal not found' }, { status: 404 });
  }
  if (proposal.status !== 'pending') {
    return NextResponse.json({ success: false, error: `Proposal is ${proposal.status}` }, { status: 409 });
  }

  proposal.status = 'rejected';
  proposal.decidedAt = new Date().toISOString();
  proposal.decidedBy = email;
  await upsertProposal(userId, proposal);
  await appendAudit(userId, {
    actor: 'user',
    actorId: email,
    eventType: 'proposal.rejected',
    entityType: 'proposal',
    entityId: proposal.id,
    note: `${proposal.symbol} rejected`,
  });

  return NextResponse.json({ success: true, proposal });
}
