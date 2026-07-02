/**
 * ConfluenceTrading approval — THE human gate (owner-only).
 *
 * POST /api/confluence/proposals/:id/approve
 *   body (optional): final edits to apply before approving
 *     { suggestedLimitPrice?, suggestedShares?, stopPrice?, targetPrice?, timeInForce?, note? }
 *
 * This is the ONLY path that leads to an order being placed, and it only runs
 * because the owner tapped Approve. Flow:
 *   1. Proposal must be `pending`.
 *   2. Apply any last-second edits.
 *   3. Guardrail pre-check (UX): if it would breach caps / kill switch, refuse
 *      and leave the proposal pending so the user can adjust.
 *   4. Flip to `approved`, record the decision, audit it.
 *   5. Hand off to the deterministic execution service (which re-checks the
 *      guardrails authoritatively and places the order).
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireOwner } from '@/lib/auth-session';
import { getProposalById, updateProposal } from '@/lib/db/confluence/proposals';
import { getSettings } from '@/lib/db/confluence/settings';
import { getOpenOrders } from '@/lib/db/confluence/orders';
import { appendAudit } from '@/lib/db/confluence/audit';
import { checkGuardrails } from '@/lib/confluence/guardrails';
import { executeApprovedProposal } from '@/lib/confluence/execution';
import type { Proposal, ProposalEdit, ProposalPatch } from '@/types/confluence';

type RouteParams = { params: Promise<{ id: string }> };

interface ApproveBody extends ProposalPatch {
  note?: string;
}

/** Apply an edit patch to a proposal copy, returning the merged copy + edit trail. */
function applyEdits(current: Proposal, patch: ProposalPatch): { next: Proposal; edits: ProposalEdit[] } {
  const next = { ...current };
  const edits: ProposalEdit[] = [];
  const numeric: Array<'suggestedLimitPrice' | 'suggestedShares' | 'stopPrice' | 'targetPrice'> = [
    'suggestedLimitPrice',
    'suggestedShares',
    'stopPrice',
    'targetPrice',
  ];
  for (const field of numeric) {
    if (patch[field] === undefined) continue;
    const value = patch[field] === null ? undefined : (patch[field] as number);
    if (value !== current[field]) {
      edits.push({ field, from: current[field], to: value });
      next[field] = value as never;
    }
  }
  if (patch.timeInForce && patch.timeInForce !== current.timeInForce) {
    edits.push({ field: 'timeInForce', from: current.timeInForce, to: patch.timeInForce });
    next.timeInForce = patch.timeInForce;
  }
  return { next, edits };
}

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

  let body: ApproveBody = {};
  try {
    body = (await request.json()) as ApproveBody;
  } catch {
    // Approve with no body / edits is fine.
  }

  // Validate edits.
  if (body.suggestedLimitPrice !== undefined && !(body.suggestedLimitPrice > 0)) {
    return NextResponse.json({ success: false, error: 'Limit price must be positive' }, { status: 400 });
  }
  if (body.suggestedShares !== undefined && !(body.suggestedShares > 0)) {
    return NextResponse.json({ success: false, error: 'Shares must be positive' }, { status: 400 });
  }

  const { next: edited, edits } = applyEdits(current, body);

  // Guardrail pre-check for UX — the execution service enforces authoritatively.
  const settings = await getSettings(userId);
  const openOrders = await getOpenOrders(userId);
  const guard = checkGuardrails(edited, settings, openOrders);
  if (!guard.ok) {
    await appendAudit(userId, {
      actor: 'system',
      type: 'guardrail_blocked',
      summary: `Approval blocked for ${edited.ticker}: ${guard.reason}`,
      proposalId: id,
      data: { code: guard.code },
    });
    return NextResponse.json(
      { success: false, error: guard.reason, code: guard.code, guardrail: true },
      { status: 422 },
    );
  }

  // Commit the decision.
  const now = new Date().toISOString();
  const approved = await updateProposal(
    id,
    {
      ...(edits.length
        ? {
            suggestedLimitPrice: edited.suggestedLimitPrice,
            suggestedShares: edited.suggestedShares,
            stopPrice: edited.stopPrice,
            targetPrice: edited.targetPrice,
            timeInForce: edited.timeInForce,
            edits: [...(current.edits ?? []), ...edits],
          }
        : {}),
      status: 'approved',
      decision: { action: 'approved', decidedBy: email, decidedAt: now, note: body.note?.trim() },
    },
    userId,
  );

  if (edits.length) {
    await appendAudit(userId, {
      actor: 'user',
      type: 'proposal_edited',
      summary: `Edited on approval: ${edits.map((e) => `${e.field} ${e.from ?? '—'}→${e.to ?? '—'}`).join(', ')}`,
      proposalId: id,
      data: { edits },
    });
  }
  await appendAudit(userId, {
    actor: 'user',
    type: 'proposal_approved',
    summary: `Approved ${edited.direction} ${edited.ticker} ${edited.suggestedShares} @ $${edited.suggestedLimitPrice}`,
    proposalId: id,
  });

  // Deterministic execution. No LLM beyond this point.
  const result = await executeApprovedProposal(approved ?? edited, userId);
  if (!result.ok) {
    return NextResponse.json(
      { success: false, error: result.reason, proposal: approved, order: result.order },
      { status: 422 },
    );
  }

  return NextResponse.json({ success: true, proposal: approved, order: result.order });
}
