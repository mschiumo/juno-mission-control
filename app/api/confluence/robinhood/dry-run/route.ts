/**
 * Robinhood order DRY-RUN (owner-only) — simulates an order, never places one.
 *
 * POST /api/confluence/robinhood/dry-run
 *   body (either form):
 *     { proposalId }                              → review that proposal's params
 *     { symbol, side, limitPrice, quantity, timeInForce? }  → review explicit params
 *
 * Calls Robinhood's review_equity_order against the pinned agentic account and
 * returns the quote + pre-trade alerts. This validates the exact order-parameter
 * mapping the live rail will use, with ZERO risk (no order is placed).
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireOwner } from '@/lib/auth-session';
import { getSystemState } from '@/lib/db/confluence/system-state';
import { getProposalById } from '@/lib/db/confluence/proposals';
import { reviewLimitOrder } from '@/lib/confluence/broker/live-adapter';
import type { TradeDirection } from '@/types/confluence';

interface Body {
  proposalId?: string;
  symbol?: string;
  side?: TradeDirection;
  limitPrice?: number;
  quantity?: number;
  timeInForce?: 'gfd' | 'gtc';
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const { userId, error } = await requireOwner();
  if (error) return error;

  const state = await getSystemState(userId);
  if (!state.agenticAccount) {
    return NextResponse.json(
      { success: false, error: 'Pin the agentic account in Settings first (system_state.agenticAccount).' },
      { status: 400 },
    );
  }

  let body: Body = {};
  try {
    body = (await request.json()) as Body;
  } catch {
    /* empty body → defaults below */
  }

  // Resolve the order params: from a proposal, or explicit, or a tiny default.
  let symbol = body.symbol;
  let side: TradeDirection = body.side === 'sell' ? 'sell' : 'buy';
  let limitPrice = body.limitPrice;
  let quantity = body.quantity;
  const timeInForce: 'gfd' | 'gtc' = body.timeInForce === 'gtc' ? 'gtc' : 'gfd';

  if (body.proposalId) {
    const proposal = await getProposalById(body.proposalId, userId);
    if (!proposal) return NextResponse.json({ success: false, error: 'Proposal not found' }, { status: 404 });
    symbol = proposal.symbol;
    side = proposal.direction;
    limitPrice = proposal.suggestedLimitPrice;
    quantity = proposal.suggestedQuantity;
  }

  // Minimal safe default if nothing supplied.
  symbol = (symbol || 'KO').toUpperCase();
  quantity = quantity && quantity > 0 ? quantity : 1;
  limitPrice = limitPrice && limitPrice > 0 ? limitPrice : 1;

  const sentParams = { accountNumber: state.agenticAccount, symbol, side, limitPrice, quantity, timeInForce };

  try {
    const review = await reviewLimitOrder(sentParams);
    return NextResponse.json({
      success: true,
      simulatedOnly: true,
      sentParams: { ...sentParams, accountNumber: `••••${state.agenticAccount.slice(-4)}` },
      review,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ success: false, simulatedOnly: true, error: message }, { status: 502 });
  }
}
