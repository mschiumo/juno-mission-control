import type {
  CryptoOrder,
  CryptoPosition,
  CryptoProposal,
  CryptoSystemState,
  OrderReason,
} from '@/types/crypto-trader';
import { getBrokerAdapter } from './broker';
import { checkBuyGuardrails, checkSellGuardrails } from './guardrails';
import {
  appendAudit,
  getRiskState,
  listPositions,
  recordRealizedPnl,
  upsertOrder,
  upsertPosition,
  upsertProposal,
} from '@/lib/db/crypto/collections';
import { newId } from '@/lib/db/crypto/store';
import { getTokenSnapshot } from './providers/dexscreener';

/**
 * Execution service — the only code path that talks to a broker adapter.
 * Guardrails are re-checked here authoritatively (the approve route's check is
 * UX), every transition is audited, and realized P&L feeds the circuit breaker.
 */

export interface ExecuteResult {
  ok: boolean;
  order?: CryptoOrder;
  position?: CryptoPosition;
  error?: string;
  guardrailCode?: string;
}

function baseOrder(
  proposal: CryptoProposal,
  isPaper: boolean,
  reason: OrderReason,
): CryptoOrder {
  const now = new Date().toISOString();
  return {
    id: newId('ord'),
    proposalId: proposal.id,
    chainId: proposal.chainId,
    tokenAddress: proposal.tokenAddress,
    pairAddress: proposal.pairAddress,
    symbol: proposal.symbol,
    side: 'buy',
    notionalUsd: proposal.notionalUsd,
    expectedPriceUsd: proposal.entryPriceUsd,
    status: 'staged',
    isPaper,
    reason,
    refId: newId('ref'),
    createdAt: now,
    updatedAt: now,
    history: [{ status: 'staged', at: now }],
  };
}

/** Execute an approved buy proposal: guardrails → broker swap → open position. */
export async function executeApprovedProposal(
  userId: string,
  proposal: CryptoProposal,
  actor: 'agent' | 'user',
  actorId: string,
): Promise<ExecuteResult> {
  const { getSystemState } = await import('@/lib/db/crypto/system-state');
  const state = await getSystemState(userId);
  const positions = await listPositions(userId);
  const risk = await getRiskState(userId);

  // Refresh the price so we never fill a stale quote from screening time.
  const snapshot = await getTokenSnapshot(proposal.chainId, proposal.tokenAddress);
  const entryPriceUsd = snapshot?.priceUsd ?? proposal.entryPriceUsd;
  const liquidityUsd = snapshot?.liquidityUsd ?? 0;

  const guardrail = checkBuyGuardrails(
    {
      notionalUsd: proposal.notionalUsd,
      entryPriceUsd,
      tokenAddress: proposal.tokenAddress,
      safetyScore: proposal.safetyScore,
      liquidityUsd,
    },
    state,
    positions,
    risk,
  );
  if (!guardrail.ok) {
    proposal.status = 'failed';
    proposal.executionNote = `Guardrail: ${guardrail.reason}`;
    await upsertProposal(userId, proposal);
    await appendAudit(userId, {
      actor: 'system',
      eventType: 'order.rejected',
      entityType: 'proposal',
      entityId: proposal.id,
      note: guardrail.reason,
      data: { code: guardrail.code },
    });
    return { ok: false, error: guardrail.reason, guardrailCode: guardrail.code };
  }

  // Paper bankroll check (live buys are bounded by actual wallet USDC).
  if (state.paperMode) {
    const spent = positions
      .filter((p) => p.isPaper)
      .reduce((sum, p) => sum + (p.status === 'open' ? p.costUsd : -p.realizedPnlUsd), 0);
    if (spent + proposal.notionalUsd > state.paperBankrollUsd) {
      return { ok: false, error: 'Paper bankroll exhausted.', guardrailCode: 'insufficient_bankroll' };
    }
  }

  const order = baseOrder(proposal, state.paperMode, actor === 'agent' ? 'agent_entry' : 'manual_entry');
  order.expectedPriceUsd = entryPriceUsd;
  await upsertOrder(userId, order);
  await appendAudit(userId, {
    actor,
    actorId,
    eventType: 'order.staged',
    entityType: 'order',
    entityId: order.id,
    note: `${proposal.symbol} buy $${proposal.notionalUsd}`,
  });

  const broker = getBrokerAdapter(state);
  const result = await broker.executeSwap({
    chainId: proposal.chainId,
    tokenAddress: proposal.tokenAddress,
    pairAddress: proposal.pairAddress,
    side: 'buy',
    amount: proposal.notionalUsd,
    expectedPriceUsd: entryPriceUsd,
    liquidityUsd,
    maxSlippageBps: state.maxSlippageBps,
    refId: order.refId,
  });

  const now = new Date().toISOString();
  if (!result.ok || !result.filledPriceUsd || !result.filledQtyTokens) {
    order.status = 'failed';
    order.note = result.error;
    order.updatedAt = now;
    order.history.push({ status: 'failed', at: now, note: result.error });
    await upsertOrder(userId, order);
    proposal.status = 'failed';
    proposal.executionNote = result.error;
    await upsertProposal(userId, proposal);
    await appendAudit(userId, {
      actor: 'system',
      eventType: 'order.failed',
      entityType: 'order',
      entityId: order.id,
      note: result.error,
    });
    return { ok: false, error: result.error, order };
  }

  order.status = 'filled';
  order.filledPriceUsd = result.filledPriceUsd;
  order.filledQtyTokens = result.filledQtyTokens;
  order.feeUsd = result.feeUsd;
  order.slippageBps = result.slippageBps;
  order.txSignature = result.txSignature;
  order.updatedAt = now;
  order.history.push({ status: 'filled', at: now });

  // The proposal's stop is a price relative to its (possibly stale) entry quote.
  // Rescale the stop DISTANCE onto the actual fill price — a memecoin can move
  // materially between proposal and approval, and an absolute stale stop can
  // land above the fill (instant stop-out) or uselessly far below it.
  const stopFraction =
    proposal.entryPriceUsd > 0 && proposal.stopPriceUsd > 0 && proposal.stopPriceUsd < proposal.entryPriceUsd
      ? proposal.stopPriceUsd / proposal.entryPriceUsd
      : 0.55; // default 45% stop

  const position: CryptoPosition = {
    id: newId('pos'),
    proposalId: proposal.id,
    orderIds: [order.id],
    chainId: proposal.chainId,
    tokenAddress: proposal.tokenAddress,
    pairAddress: proposal.pairAddress,
    symbol: proposal.symbol,
    name: proposal.name,
    qtyTokens: result.filledQtyTokens,
    initialQtyTokens: result.filledQtyTokens,
    avgEntryPriceUsd: result.filledPriceUsd,
    costUsd: proposal.notionalUsd,
    stopPriceUsd: result.filledPriceUsd * stopFraction,
    takeProfitLadder: proposal.takeProfitLadder,
    laddersFilled: [],
    trailingStopPct: proposal.trailingStopPct,
    highWaterMarkUsd: result.filledPriceUsd,
    realizedPnlUsd: 0,
    status: 'open',
    isPaper: state.paperMode,
    thesis: proposal.thesis,
    strategy: proposal.strategy,
    openedAt: now,
  };
  order.positionId = position.id;

  await upsertOrder(userId, order);
  await upsertPosition(userId, position);
  proposal.status = 'executed';
  proposal.executionNote = `Filled ${result.filledQtyTokens.toFixed(4)} @ $${result.filledPriceUsd.toPrecision(6)}`;
  await upsertProposal(userId, proposal);
  await appendAudit(userId, {
    actor,
    actorId,
    eventType: 'position.opened',
    entityType: 'position',
    entityId: position.id,
    note: `${proposal.symbol}: $${proposal.notionalUsd} @ $${result.filledPriceUsd.toPrecision(6)} (slippage ${result.slippageBps}bps)`,
  });

  return { ok: true, order, position };
}

/**
 * Sell part or all of an open position (stops, take-profit rungs, trailing
 * stops, manual closes). Records realized P&L into the circuit breaker.
 */
export async function executeSell(
  userId: string,
  position: CryptoPosition,
  qtyTokens: number,
  reason: OrderReason,
  state: CryptoSystemState,
  currentPriceUsd: number,
  liquidityUsd: number,
  actorId = 'system',
): Promise<ExecuteResult> {
  const guardrail = checkSellGuardrails(state);
  if (!guardrail.ok) return { ok: false, error: guardrail.reason, guardrailCode: guardrail.code };

  const qty = Math.min(qtyTokens, position.qtyTokens);
  if (!(qty > 0) || !(currentPriceUsd > 0)) {
    return { ok: false, error: 'Nothing to sell or no price available.' };
  }

  const now = new Date().toISOString();
  const order: CryptoOrder = {
    id: newId('ord'),
    positionId: position.id,
    proposalId: position.proposalId,
    chainId: position.chainId,
    tokenAddress: position.tokenAddress,
    pairAddress: position.pairAddress,
    symbol: position.symbol,
    side: 'sell',
    qtyTokens: qty,
    expectedPriceUsd: currentPriceUsd,
    status: 'staged',
    isPaper: position.isPaper,
    reason,
    refId: newId('ref'),
    createdAt: now,
    updatedAt: now,
    history: [{ status: 'staged', at: now }],
  };
  await upsertOrder(userId, order);

  const broker = getBrokerAdapter(state);
  const result = await broker.executeSwap({
    chainId: position.chainId,
    tokenAddress: position.tokenAddress,
    pairAddress: position.pairAddress,
    side: 'sell',
    amount: qty,
    expectedPriceUsd: currentPriceUsd,
    liquidityUsd,
    // Exits are risk-reducing: allow generous slippage rather than being stuck.
    maxSlippageBps: Math.max(state.maxSlippageBps * 3, 500),
    refId: order.refId,
  });

  const doneAt = new Date().toISOString();
  if (!result.ok || !result.filledPriceUsd) {
    order.status = 'failed';
    order.note = result.error;
    order.updatedAt = doneAt;
    order.history.push({ status: 'failed', at: doneAt, note: result.error });
    await upsertOrder(userId, order);
    await appendAudit(userId, {
      actor: 'system',
      eventType: 'order.failed',
      entityType: 'order',
      entityId: order.id,
      note: `${position.symbol} ${reason}: ${result.error}`,
    });
    return { ok: false, error: result.error, order };
  }

  const proceeds = qty * result.filledPriceUsd - (result.feeUsd ?? 0);
  const costBasis = qty * position.avgEntryPriceUsd;
  const pnl = proceeds - costBasis;

  order.status = 'filled';
  order.filledPriceUsd = result.filledPriceUsd;
  order.filledQtyTokens = qty;
  order.feeUsd = result.feeUsd;
  order.slippageBps = result.slippageBps;
  order.txSignature = result.txSignature;
  order.updatedAt = doneAt;
  order.history.push({ status: 'filled', at: doneAt });
  await upsertOrder(userId, order);

  position.qtyTokens -= qty;
  position.orderIds.push(order.id);
  position.realizedPnlUsd += pnl;
  const closed = position.qtyTokens <= position.initialQtyTokens * 0.001;
  if (closed) {
    position.qtyTokens = 0;
    position.status = 'closed';
    position.closedAt = doneAt;
    position.closeReason = reason;
  }
  await upsertPosition(userId, position);
  await recordRealizedPnl(userId, pnl);
  await appendAudit(userId, {
    actor: 'system',
    actorId,
    eventType: closed ? 'position.closed' : 'position.scaled_out',
    entityType: 'position',
    entityId: position.id,
    note: `${position.symbol} ${reason}: sold ${qty.toFixed(4)} @ $${result.filledPriceUsd.toPrecision(6)}, P&L $${pnl.toFixed(2)}`,
    data: { pnlUsd: pnl, reason },
  });

  return { ok: true, order, position };
}
