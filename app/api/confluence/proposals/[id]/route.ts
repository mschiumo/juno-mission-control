/**
 * ConfluenceTrading single proposal API (owner-only).
 *
 * GET    /api/confluence/proposals/:id — fetch one
 * DELETE /api/confluence/proposals/:id — remove a proposal
 *
 * There is deliberately NO PATCH: a proposal is an immutable snapshot of the
 * agent's suggestion. Edits are applied at approval time and land on the ORDER,
 * with the diff captured in the audit log (see the approve route).
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireOwner } from '@/lib/auth-session';
import { deleteProposal, getProposalById } from '@/lib/db/confluence/proposals';

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
