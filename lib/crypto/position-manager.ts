import type { CryptoPosition, CryptoSystemState } from '@/types/crypto-trader';
import { executeSell } from './execution';
import { getTokenSnapshot } from './providers/dexscreener';
import { openPositions, upsertPosition } from '@/lib/db/crypto/collections';

/**
 * Exit engine, run on every cron tick. Implements the practitioner-standard
 * memecoin exit system:
 *   - hard stop (wide, because tight stops get chopped by normal meme volatility)
 *   - laddered take-profits (e.g. sell 50% at 2x — principal recovered — 25% at 5x)
 *   - trailing stop on the remainder ("moonbag") from the high-water mark
 * Exits deliberately run even when the kill switch is on: freezing a bot while
 * it holds falling tokens converts a safety feature into a loss amplifier.
 */

export interface ManagementAction {
  positionId: string;
  symbol: string;
  action: 'stop_loss' | 'take_profit' | 'trailing_stop' | 'hold' | 'error';
  detail: string;
}

export async function manageOpenPositions(
  userId: string,
  state: CryptoSystemState,
): Promise<ManagementAction[]> {
  const positions = await openPositions(userId);
  const actions: ManagementAction[] = [];

  for (const position of positions) {
    try {
      const action = await managePosition(userId, position, state);
      actions.push(action);
    } catch (error) {
      actions.push({
        positionId: position.id,
        symbol: position.symbol,
        action: 'error',
        detail: error instanceof Error ? error.message : 'unknown error',
      });
    }
  }
  return actions;
}

async function managePosition(
  userId: string,
  position: CryptoPosition,
  state: CryptoSystemState,
): Promise<ManagementAction> {
  const snapshot = await getTokenSnapshot(position.chainId, position.tokenAddress);
  if (!snapshot) {
    return { positionId: position.id, symbol: position.symbol, action: 'hold', detail: 'no price data this tick' };
  }
  const price = snapshot.priceUsd;

  // Track the high-water mark for the trailing stop.
  if (price > position.highWaterMarkUsd) {
    position.highWaterMarkUsd = price;
    await upsertPosition(userId, position);
  }

  // 1. Hard stop — full exit, no partials on the way down.
  if (price <= position.stopPriceUsd) {
    const result = await executeSell(
      userId, position, position.qtyTokens, 'stop_loss', state, price, snapshot.liquidityUsd,
    );
    return {
      positionId: position.id,
      symbol: position.symbol,
      action: 'stop_loss',
      detail: result.ok ? `stopped out @ $${price.toPrecision(6)}` : `stop failed: ${result.error}`,
    };
  }

  // 2. Take-profit ladder (rungs fire once each, sized off the ORIGINAL qty).
  for (let i = 0; i < position.takeProfitLadder.length; i++) {
    if (position.laddersFilled.includes(i)) continue;
    const rung = position.takeProfitLadder[i];
    if (price >= position.avgEntryPriceUsd * rung.multiple) {
      const qty = Math.min(
        position.initialQtyTokens * (rung.sellPct / 100),
        position.qtyTokens,
      );
      const result = await executeSell(
        userId, position, qty, 'take_profit', state, price, snapshot.liquidityUsd,
      );
      if (result.ok && result.position) {
        result.position.laddersFilled = [...position.laddersFilled, i];
        await upsertPosition(userId, result.position);
      }
      return {
        positionId: position.id,
        symbol: position.symbol,
        action: 'take_profit',
        detail: result.ok
          ? `rung ${rung.multiple}x hit: sold ${rung.sellPct}% @ $${price.toPrecision(6)}`
          : `take-profit failed: ${result.error}`,
      };
    }
  }

  // 3. Trailing stop from the high-water mark — armed once the position is in
  // profit or any ladder rung has filled (protects the moonbag, not the entry).
  const inProfit = price > position.avgEntryPriceUsd;
  const armed = position.laddersFilled.length > 0 || (inProfit && position.highWaterMarkUsd >= position.avgEntryPriceUsd * 1.5);
  if (armed && position.trailingStopPct > 0) {
    const trailPrice = position.highWaterMarkUsd * (1 - position.trailingStopPct / 100);
    if (price <= trailPrice && trailPrice > position.stopPriceUsd) {
      const result = await executeSell(
        userId, position, position.qtyTokens, 'trailing_stop', state, price, snapshot.liquidityUsd,
      );
      return {
        positionId: position.id,
        symbol: position.symbol,
        action: 'trailing_stop',
        detail: result.ok
          ? `trailed out @ $${price.toPrecision(6)} (HWM $${position.highWaterMarkUsd.toPrecision(6)})`
          : `trailing stop failed: ${result.error}`,
      };
    }
  }

  return {
    positionId: position.id,
    symbol: position.symbol,
    action: 'hold',
    detail: `$${price.toPrecision(6)} | stop $${position.stopPriceUsd.toPrecision(6)} | HWM $${position.highWaterMarkUsd.toPrecision(6)}`,
  };
}
