/**
 * ConfluenceTrading single proposal API (owner-only).
 *
 * GET    /api/confluence/proposals/:id — fetch one
 * PATCH  /api/confluence/proposals/:id — edit numbers while still `pending`
 * DELETE /api/confluence/proposals/:id — remove a proposal
 *
 * Editing is only permitted while pending — once approved/rejected the proposal
 * is part of the decision record and must not change.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireOwner } from '@/lib/auth-session';
import {
  deleteProposal,
  getProposalById,
  updateProposal,
} from '@/lib/db/confluence/proposals';
import { appendAudit } from '@/lib/db/confluence/audit';
import type { Proposal, ProposalEdit, ProposalPatch } from '@/types/confluence';

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { userId, error } = await requireOwner();
  if (error) return error;
  const { id } = await params;
  const proposal = await getProposalById(id, userId);
  if (!proposal) {
    return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json({ success: true, proposal });
}

/** Build the ProposalEdit trail from a patch, ignoring no-op changes. */
function diffEdits(current: Proposal, patch: ProposalPatch): { edits: ProposalEdit[]; applied: Partial<Proposal> } {
  const edits: ProposalEdit[] = [];
  const applied: Partial<Proposal> = {};

  const numericFields: Array<'suggestedLimitPrice' | 'suggestedShares' | 'stopPrice' | 'targetPrice'> = [
    'suggestedLimitPrice',
    'suggestedShares',
    'stopPrice',
    'targetPrice',
  ];
  for (const field of numericFields) {
    if (patch[field] === undefined) continue;
    // null clears an optional field (stop/target).
    const next = patch[field] === null ? undefined : (patch[field] as number);
    const prev = current[field];
    if (next !== prev) {
      edits.push({ field, from: prev, to: next });
      applied[field] = next;
    }
  }
  if (patch.timeInForce && patch.timeInForce !== current.timeInForce) {
    edits.push({ field: 'timeInForce', from: current.timeInForce, to: patch.timeInForce });
    applied.timeInForce = patch.timeInForce;
  }
  return { edits, applied };
}

export async function PATCH(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { userId, error } = await requireOwner();
  if (error) return error;
  const { id } = await params;

  const current = await getProposalById(id, userId);
  if (!current) {
    return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
  }
  if (current.status !== 'pending') {
    return NextResponse.json(
      { success: false, error: `Cannot edit a ${current.status} proposal` },
      { status: 409 },
    );
  }

  try {
    const patch = (await request.json()) as ProposalPatch;
    // Validate any provided numeric fields.
    if (patch.suggestedLimitPrice !== undefined && !(patch.suggestedLimitPrice > 0)) {
      return NextResponse.json({ success: false, error: 'Limit price must be positive' }, { status: 400 });
    }
    if (patch.suggestedShares !== undefined && !(patch.suggestedShares > 0)) {
      return NextResponse.json({ success: false, error: 'Shares must be positive' }, { status: 400 });
    }

    const { edits, applied } = diffEdits(current, patch);
    if (edits.length === 0) {
      return NextResponse.json({ success: true, proposal: current });
    }

    const mergedEdits = [...(current.edits ?? []), ...edits];
    const updated = await updateProposal(id, { ...applied, edits: mergedEdits }, userId);
    await appendAudit(userId, {
      actor: 'user',
      type: 'proposal_edited',
      summary: `Edited ${current.ticker} proposal: ${edits.map((e) => `${e.field} ${e.from ?? '—'}→${e.to ?? '—'}`).join(', ')}`,
      proposalId: id,
      data: { edits },
    });
    return NextResponse.json({ success: true, proposal: updated });
  } catch (e) {
    console.error('Error editing ConfluenceTrading proposal:', e);
    return NextResponse.json({ success: false, error: 'Failed to edit proposal' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { userId, error } = await requireOwner();
  if (error) return error;
  const { id } = await params;
  const ok = await deleteProposal(id, userId);
  if (!ok) {
    return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
