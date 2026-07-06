import type { CryptoBrokerAdapter, SwapRequest, SwapResult } from './types';
import { estimateImpactBps } from '../guardrails';
import { readJson, writeJson } from '@/lib/db/crypto/store';

/**
 * Paper broker — fills instantly at the live reference price plus a modeled
 * price impact (constant-product approximation against pool depth) and a flat
 * fee, so paper P&L bakes in realistic execution drag instead of fantasy fills.
 * Idempotent on refId via a Redis marker, mirroring how the live path dedupes.
 */

const FEE_BPS = 30; // DEX pool fee + priority-fee stand-in.

const fillKey = (refId: string) => `crypto:paper-fill:${refId}`;

export const paperAdapter: CryptoBrokerAdapter = {
  name: 'paper',

  async executeSwap(req: SwapRequest): Promise<SwapResult> {
    // Idempotency: a retried refId returns the recorded fill, never a second one.
    const prior = await readJson<SwapResult | null>(fillKey(req.refId), null);
    if (prior) return prior;

    if (!(req.expectedPriceUsd > 0)) {
      return { ok: false, error: 'No reference price available for paper fill.' };
    }

    const notionalUsd =
      req.side === 'buy' ? req.amount : req.amount * req.expectedPriceUsd;
    const impactBps = Math.min(
      estimateImpactBps(notionalUsd, req.liquidityUsd),
      req.maxSlippageBps,
    );

    // Impact moves the price against us in both directions.
    const direction = req.side === 'buy' ? 1 : -1;
    const filledPriceUsd = req.expectedPriceUsd * (1 + (direction * impactBps) / 10000);
    const feeUsd = (notionalUsd * FEE_BPS) / 10000;
    const filledQtyTokens =
      req.side === 'buy' ? (req.amount - feeUsd) / filledPriceUsd : req.amount;

    const result: SwapResult = {
      ok: true,
      filledPriceUsd,
      filledQtyTokens,
      feeUsd,
      slippageBps: impactBps,
    };
    await writeJson(fillKey(req.refId), result, 86400);
    return result;
  },
};
