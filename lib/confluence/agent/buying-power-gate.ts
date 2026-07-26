/**
 * Buying-power gate for agent proposals (live mode).
 *
 * The execution service already blocks an approved order the account can't
 * fund — but by then the user has reviewed and approved a trade that could
 * never fill. This gate runs at PROPOSAL time, so a run never surfaces a buy
 * the account can't pay for at the suggested price × quantity.
 *
 * Pure code, no MCP calls — the runner fetches buying power once and passes it
 * in. Buys are charged against the remaining balance in rank order, so the
 * run's proposals can execute collectively, not just each in isolation. Sells
 * don't consume buying power (mirrors the execution-service pre-check).
 */

import type { Candidate } from './strategy';

export interface BuyingPowerGateResult {
  kept: Candidate[];
  /** 'SYM (needs $X, $Y available)' strings for run metadata. */
  ruledOut: string[];
}

export function applyBuyingPowerGate(
  candidates: Candidate[],
  buyingPowerUsd: number,
): BuyingPowerGateResult {
  let remaining = buyingPowerUsd;
  const kept: Candidate[] = [];
  const ruledOut: string[] = [];
  for (const c of candidates) {
    if (c.direction !== 'buy') {
      kept.push(c);
      continue;
    }
    const notional = c.suggestedLimitPrice * c.suggestedQuantity;
    if (notional > remaining) {
      ruledOut.push(
        `${c.symbol.toUpperCase()} (needs $${notional.toLocaleString()}, $${Math.max(0, remaining).toLocaleString()} available)`,
      );
      continue;
    }
    remaining -= notional;
    kept.push(c);
  }
  return { kept, ruledOut };
}
