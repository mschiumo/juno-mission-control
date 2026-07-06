import type {
  CryptoPosition,
  CryptoSystemState,
  GuardrailResult,
  RiskState,
} from '@/types/crypto-trader';
import { isLiveAllowed } from '@/lib/db/crypto/system-state';

/**
 * Code-enforced invariants, checked immediately before any order is staged.
 * These run AFTER the LLM analyst — the model can propose, but it cannot raise a
 * cap, skip a cooldown, or bypass the kill switch. Mirrors confluence guardrails.
 */

export interface BuyGuardrailInput {
  notionalUsd: number;
  entryPriceUsd: number;
  tokenAddress: string;
  safetyScore: number;
  liquidityUsd: number;
}

export function checkBuyGuardrails(
  order: BuyGuardrailInput,
  state: CryptoSystemState,
  positions: CryptoPosition[],
  risk: RiskState,
): GuardrailResult {
  // 1. Kill switch — hard stop for everything, paper included.
  if (!state.tradingEnabled) {
    return { ok: false, code: 'kill_switch', reason: 'Trading is disabled (kill switch).' };
  }

  // 2. Structural validity.
  if (!(order.notionalUsd > 0) || !(order.entryPriceUsd > 0)) {
    return { ok: false, code: 'invalid_order', reason: 'Order must have positive notional and price.' };
  }

  // 3. Live arming — server env gate + wallet configured, else live is impossible.
  if (!state.paperMode) {
    if (!isLiveAllowed()) {
      return { ok: false, code: 'live_not_armed', reason: 'CRYPTO_ALLOW_LIVE is not enabled on the server.' };
    }
    if (!process.env.CRYPTO_WALLET_SECRET_KEY) {
      return { ok: false, code: 'live_not_armed', reason: 'No trading wallet configured (CRYPTO_WALLET_SECRET_KEY).' };
    }
  }

  const open = positions.filter((p) => p.status === 'open');

  // 4. One position per token — no averaging into the same memecoin.
  if (open.some((p) => p.tokenAddress === order.tokenAddress)) {
    return { ok: false, code: 'duplicate_position', reason: 'Already holding this token.' };
  }

  // 5. Per-position notional cap.
  if (order.notionalUsd > state.perPositionCapUsd) {
    return {
      ok: false,
      code: 'per_position_cap',
      reason: `Notional $${order.notionalUsd.toFixed(2)} exceeds per-position cap $${state.perPositionCapUsd}.`,
    };
  }

  // 6. Total exposure cap across open positions.
  const exposure = open.reduce((sum, p) => sum + p.qtyTokens * p.avgEntryPriceUsd, 0);
  if (exposure + order.notionalUsd > state.totalExposureCapUsd) {
    return {
      ok: false,
      code: 'total_exposure_cap',
      reason: `Exposure $${(exposure + order.notionalUsd).toFixed(2)} would exceed cap $${state.totalExposureCapUsd}.`,
    };
  }

  // 7. Max concurrent positions.
  if (open.length >= state.maxOpenPositions) {
    return { ok: false, code: 'max_open_positions', reason: `Already at ${open.length}/${state.maxOpenPositions} open positions.` };
  }

  // 8. Daily loss circuit breaker.
  if (risk.realizedPnlUsd <= -state.dailyLossLimitUsd) {
    return {
      ok: false,
      code: 'daily_loss_limit',
      reason: `Daily realized loss $${(-risk.realizedPnlUsd).toFixed(2)} has hit the $${state.dailyLossLimitUsd} limit — no more buys today.`,
    };
  }

  // 9. Post-loss cooldown.
  if (risk.lastLossAt) {
    const minutesSinceLoss = (Date.now() - new Date(risk.lastLossAt).getTime()) / 60000;
    if (minutesSinceLoss < state.cooldownMinutesAfterLoss) {
      return {
        ok: false,
        code: 'loss_cooldown',
        reason: `In post-loss cooldown (${Math.ceil(state.cooldownMinutesAfterLoss - minutesSinceLoss)} min remaining).`,
      };
    }
  }

  // 10. Safety score floor.
  if (order.safetyScore < state.minSafetyScore) {
    return { ok: false, code: 'safety_score', reason: `Safety score ${order.safetyScore} below minimum ${state.minSafetyScore}.` };
  }

  // 11. Liquidity floor.
  if (order.liquidityUsd < state.minLiquidityUsd) {
    return { ok: false, code: 'liquidity_floor', reason: `Liquidity $${Math.round(order.liquidityUsd)} below floor $${state.minLiquidityUsd}.` };
  }

  // 12. Estimated price impact (rough constant-product approximation).
  const impactBps = estimateImpactBps(order.notionalUsd, order.liquidityUsd);
  if (impactBps > state.maxSlippageBps) {
    return { ok: false, code: 'slippage_cap', reason: `Estimated impact ${impactBps}bps exceeds cap ${state.maxSlippageBps}bps.` };
  }

  return { ok: true };
}

/**
 * Sells (stops, take-profits, closes) only require the position to exist and, in
 * live mode, the server to be armed. The kill switch intentionally does NOT block
 * risk-reducing exits — freezing a bot while it holds falling memecoins is worse.
 */
export function checkSellGuardrails(state: CryptoSystemState): GuardrailResult {
  if (!state.paperMode) {
    if (!isLiveAllowed()) {
      return { ok: false, code: 'live_not_armed', reason: 'CRYPTO_ALLOW_LIVE is not enabled on the server.' };
    }
    if (!process.env.CRYPTO_WALLET_SECRET_KEY) {
      return { ok: false, code: 'live_not_armed', reason: 'No trading wallet configured (CRYPTO_WALLET_SECRET_KEY).' };
    }
  }
  return { ok: true };
}

/** Rough constant-product price-impact estimate: notional against half the pool. */
export function estimateImpactBps(notionalUsd: number, liquidityUsd: number): number {
  if (liquidityUsd <= 0) return 10000;
  return Math.round((notionalUsd / (liquidityUsd / 2)) * 10000);
}
