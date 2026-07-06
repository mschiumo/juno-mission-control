/**
 * ConfluenceTrading approval — THE human gate (owner-only).
 *
 * POST /api/confluence/proposals/:id/approve
 *   body (optional): final order params to use instead of the agent's suggestion
 *     { limitPrice?, quantity?, timeInForce?, stopPrice?, targetPrice?, note? }
 *
 * The ONLY path that leads to an order, and it only runs because the owner
 * tapped Approve. The proposal itself stays immutable — any edits become the
 * ORDER's parameters and the diff is recorded as a proposal.edited audit event.
 * Flow:
 *   1. Proposal must be `pending`.
 *   2. Resolve final order params (agent suggestion + edits).
 *   3. Guardrail pre-check (UX): kill switch / caps / account / duplicate order.
 *      If blocked, leave the proposal pending so the user can adjust.
 *   4. Flip to `approved` (decidedAt/decidedBy), audit edited (if any) + approved.
 *   5. Hand off to the deterministic execution service (re-checks + places).
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireOwner } from '@/lib/auth-session';
import { getRedisClient } from '@/lib/redis';
import { getProposalById, decideProposal } from '@/lib/db/confluence/proposals';
import { getSystemState } from '@/lib/db/confluence/system-state';
import { getActiveOrders, hasActiveOrderForProposal } from '@/lib/db/confluence/orders';
import { appendAudit } from '@/lib/db/confluence/audit';
import { checkGuardrails } from '@/lib/confluence/guardrails';
import { checkPreTradeReviewRules } from '@/lib/confluence/review/rules';
import { getRiskConfig, getRoundTrips } from '@/lib/db/confluence/review';
import { executeApprovedProposal } from '@/lib/confluence/execution';
import type { OrderParams, TimeInForce } from '@/types/confluence';

type RouteParams = { params: Promise<{ id: string }> };

interface ApproveBody {
  limitPrice?: number;
  quantity?: number;
  timeInForce?: TimeInForce;
  stopPrice?: number | null;
  targetPrice?: number | null;
  note?: string;
}

export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { userId, email, error } = await requireOwner();
  if (error) return error;
  const { id } = await params;

  // Per-proposal mutex: the whole approve→execute path must run at most once
  // concurrently. Without it, two rapid taps landing on two serverless
  // instances each pass the `pending` + no-active-order checks and place TWO
  // real orders (each staged order mints its own refId, so broker-side ref_id
  // dedupe can't catch this). SET NX + TTL; released in `finally`, TTL is the
  // crash backstop.
  const lockKey = `confluence:approve-lock:${userId}:${id}`;
  const redis = await getRedisClient();
  const acquired = await redis.set(lockKey, '1', { NX: true, EX: 60 });
  if (acquired !== 'OK') {
    return NextResponse.json(
      { success: false, error: 'This proposal is already being approved — check Orders before retrying.' },
      { status: 409 },
    );
  }
  try {
    return await approveLocked(request, id, userId, email);
  } finally {
    await redis.del(lockKey).catch(() => {});
  }
}

async function approveLocked(
  request: NextRequest,
  id: string,
  userId: string,
  email: string,
): Promise<NextResponse> {
  const proposal = await getProposalById(id, userId);
  if (!proposal) {
    return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
  }
  if (proposal.status !== 'pending') {
    return NextResponse.json({ success: false, error: `Proposal is already ${proposal.status}` }, { status: 409 });
  }

  let body: ApproveBody = {};
  try {
    body = (await request.json()) as ApproveBody;
  } catch {
    /* approving with no edits is fine */
  }

  // 2. Resolve final order params (agent suggestion + edits).
  const limitPrice = body.limitPrice ?? proposal.suggestedLimitPrice;
  const quantity = body.quantity ?? proposal.suggestedQuantity;
  if (!(typeof limitPrice === 'number' && limitPrice > 0)) {
    return NextResponse.json({ success: false, error: 'A positive limit price is required to approve' }, { status: 400 });
  }
  if (!(typeof quantity === 'number' && quantity > 0)) {
    return NextResponse.json({ success: false, error: 'A positive quantity is required to approve' }, { status: 400 });
  }
  // Robinhood allows fractional shares only on MARKET orders; every order here
  // is a limit order, so a fractional quantity would be rejected at the broker.
  if (!Number.isInteger(quantity)) {
    return NextResponse.json(
      { success: false, error: 'Quantity must be a whole number of shares (fractional is not supported on limit orders)' },
      { status: 400 },
    );
  }
  // Sub-penny limit prices are rejected at the broker; catch them here.
  // Epsilon comparison — 60.3 * 100 is 6030.000000000001 in floating point.
  if (Math.abs(limitPrice * 100 - Math.round(limitPrice * 100)) > 1e-6) {
    return NextResponse.json(
      { success: false, error: 'Limit price must have at most 2 decimal places' },
      { status: 400 },
    );
  }
  // Stop/target: null clears, undefined falls back to the agent's suggestion.
  // Anything else must be a positive finite number — same hygiene as
  // limitPrice/quantity above (the stop feeds the max-loss rule check).
  for (const [label, v] of [['stopPrice', body.stopPrice], ['targetPrice', body.targetPrice]] as const) {
    if (v !== undefined && v !== null && !(typeof v === 'number' && Number.isFinite(v) && v > 0)) {
      return NextResponse.json({ success: false, error: `${label} must be a positive number (or null to clear)` }, { status: 400 });
    }
  }
  const params2: OrderParams = {
    limitPrice,
    quantity,
    timeInForce: body.timeInForce ?? 'gfd',
    stopPrice: body.stopPrice === null ? undefined : body.stopPrice ?? proposal.suggestedStopPrice,
    targetPrice: body.targetPrice === null ? undefined : body.targetPrice ?? proposal.suggestedTargetPrice,
  };

  // 3. Guardrail pre-check for UX — the execution service enforces authoritatively.
  if (await hasActiveOrderForProposal(id, userId)) {
    return NextResponse.json({ success: false, error: 'Proposal already has an active order.' }, { status: 409 });
  }
  const state = await getSystemState(userId);
  const activeOrders = await getActiveOrders(userId);
  const guard = checkGuardrails({ limitPrice, quantity }, state, activeOrders);
  if (!guard.ok) {
    return NextResponse.json(
      { success: false, error: guard.reason, code: guard.code, guardrail: true },
      { status: 422 },
    );
  }
  // Milestone R review rules (stop bound / probation / breadth) — same UX
  // pre-check so a blocked proposal stays pending; the execution service
  // re-checks authoritatively.
  const reviewCheck = checkPreTradeReviewRules(
    { symbol: proposal.symbol, side: proposal.direction, limitPrice, quantity, stopPrice: params2.stopPrice },
    {
      config: await getRiskConfig(userId),
      agenticTrades: await getRoundTrips(userId, 'agentic_rh'),
      activeOrderSymbols: activeOrders.map((o) => o.symbol),
    },
  );
  if (!reviewCheck.ok) {
    return NextResponse.json(
      { success: false, error: reviewCheck.reason, code: reviewCheck.code, guardrail: true },
      { status: 422 },
    );
  }

  // 4. Commit the decision. The proposal's suggested_* fields are NOT changed.
  const now = new Date().toISOString();
  const approved = await decideProposal(id, userId, { status: 'approved', decidedBy: email, decidedAt: now });

  // Record the edit diff (order params vs the agent's suggestion), if any.
  const diff: Record<string, { from: unknown; to: unknown }> = {};
  if (limitPrice !== proposal.suggestedLimitPrice) diff.limitPrice = { from: proposal.suggestedLimitPrice, to: limitPrice };
  if (quantity !== proposal.suggestedQuantity) diff.quantity = { from: proposal.suggestedQuantity, to: quantity };
  if (params2.stopPrice !== proposal.suggestedStopPrice) diff.stopPrice = { from: proposal.suggestedStopPrice, to: params2.stopPrice };
  if (params2.targetPrice !== proposal.suggestedTargetPrice) diff.targetPrice = { from: proposal.suggestedTargetPrice, to: params2.targetPrice };
  if (Object.keys(diff).length > 0) {
    await appendAudit(userId, {
      actor: 'user',
      actorId: email,
      eventType: 'proposal.edited',
      entityType: 'proposal',
      entityId: id,
      before: Object.fromEntries(Object.entries(diff).map(([k, v]) => [k, v.from])),
      after: Object.fromEntries(Object.entries(diff).map(([k, v]) => [k, v.to])),
      note: `Edited on approval: ${Object.keys(diff).join(', ')}`,
    });
  }
  await appendAudit(userId, {
    actor: 'user',
    actorId: email,
    eventType: 'proposal.approved',
    entityType: 'proposal',
    entityId: id,
    after: { limitPrice, quantity, timeInForce: params2.timeInForce },
    note: `Approved ${proposal.direction} ${proposal.symbol} ${quantity} @ $${limitPrice}${body.note ? ` — ${body.note.trim()}` : ''}`,
  });

  // 5. Deterministic execution. No LLM beyond this point.
  const result = await executeApprovedProposal(approved!, params2, email, userId);
  if (!result.ok) {
    // Blocked BEFORE anything was staged (guardrail re-check, buying power…):
    // put the proposal back to `pending` so it can be adjusted and re-approved.
    // If an order record exists the attempt reached the broker path — the
    // proposal stays `approved` and the order carries the failure detail.
    let proposal2 = approved;
    if (!result.order) {
      proposal2 = await decideProposal(id, userId, { status: 'pending' });
      await appendAudit(userId, {
        actor: 'system',
        actorId: 'system',
        eventType: 'proposal.reverted',
        entityType: 'proposal',
        entityId: id,
        before: { status: 'approved' },
        after: { status: 'pending' },
        note: `Approval blocked before staging (${result.code}) — proposal returned to pending`,
      });
    }
    return NextResponse.json(
      { success: false, error: result.reason, code: result.code, proposal: proposal2, order: result.order },
      { status: 422 },
    );
  }
  return NextResponse.json({ success: true, proposal: approved, order: result.order });
}
