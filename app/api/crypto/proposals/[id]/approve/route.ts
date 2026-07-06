import { NextRequest, NextResponse } from 'next/server';
import { requireOwner } from '@/lib/auth-session';
import { listProposals, upsertProposal } from '@/lib/db/crypto/collections';
import { executeApprovedProposal } from '@/lib/crypto/execution';
import { acquireLock, releaseLock } from '@/lib/db/crypto/store';

export const dynamic = 'force-dynamic';
export const maxDuration = 90;

type RouteParams = { params: Promise<{ id: string }> };

/**
 * Approve a pending proposal and execute it immediately through the
 * guardrail-gated execution path. Per-proposal mutex prevents double-approval.
 */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { userId, email, error } = await requireOwner();
  if (error) return error;
  const { id } = await params;

  const lockKey = `crypto:approve-lock:${userId}:${id}`;
  if (!(await acquireLock(lockKey, 60))) {
    return NextResponse.json({ success: false, error: 'Approval already in progress' }, { status: 409 });
  }

  try {
    const proposals = await listProposals(userId);
    const proposal = proposals.find((p) => p.id === id);
    if (!proposal) {
      return NextResponse.json({ success: false, error: 'Proposal not found' }, { status: 404 });
    }
    if (proposal.status !== 'pending') {
      return NextResponse.json({ success: false, error: `Proposal is ${proposal.status}` }, { status: 409 });
    }
    if (new Date(proposal.expiresAt).getTime() < Date.now()) {
      proposal.status = 'expired';
      await upsertProposal(userId, proposal);
      return NextResponse.json({ success: false, error: 'Proposal expired' }, { status: 409 });
    }

    // Owner may shrink (never grow) the position before approving.
    try {
      const body = await request.json();
      if (typeof body?.notionalUsd === 'number' && body.notionalUsd > 0) {
        proposal.notionalUsd = Math.min(proposal.notionalUsd, body.notionalUsd);
      }
    } catch {
      // No body — approve as proposed.
    }

    proposal.status = 'approved';
    proposal.decidedAt = new Date().toISOString();
    proposal.decidedBy = email;
    await upsertProposal(userId, proposal);

    const result = await executeApprovedProposal(userId, proposal, 'user', email);
    if (!result.ok) {
      return NextResponse.json(
        { success: false, error: result.error, guardrailCode: result.guardrailCode },
        { status: 422 },
      );
    }
    return NextResponse.json({ success: true, order: result.order, position: result.position });
  } finally {
    await releaseLock(lockKey);
  }
}
