import type { CryptoSystemState } from '@/types/crypto-trader';
import { readJson, writeJson } from './store';

const key = (userId: string) => `crypto:system-state:${userId}`;

/**
 * Conservative defaults: kill switch OFF (no trading), paper mode ON, auto-trade OFF,
 * small caps. Live execution additionally requires the CRYPTO_ALLOW_LIVE env gate —
 * flipping paperMode alone can never place a real order.
 */
export const DEFAULT_SYSTEM_STATE: CryptoSystemState = {
  tradingEnabled: false,
  paperMode: true,
  autoTrade: false,
  paperBankrollUsd: 1000,
  perPositionCapUsd: 100,
  totalExposureCapUsd: 500,
  maxOpenPositions: 5,
  dailyLossLimitUsd: 50,
  cooldownMinutesAfterLoss: 60,
  minSafetyScore: 70,
  minLiquidityUsd: 50000,
  minTokenAgeHours: 24,
  maxSlippageBps: 150,
  updatedAt: new Date(0).toISOString(),
};

export async function getSystemState(userId: string): Promise<CryptoSystemState> {
  const stored = await readJson<Partial<CryptoSystemState>>(key(userId), {});
  return { ...DEFAULT_SYSTEM_STATE, ...stored };
}

export async function updateSystemState(
  userId: string,
  updates: Partial<Omit<CryptoSystemState, 'updatedAt'>>,
  updatedBy?: string,
): Promise<CryptoSystemState> {
  const current = await getSystemState(userId);
  const next: CryptoSystemState = {
    ...current,
    ...updates,
    updatedAt: new Date().toISOString(),
    updatedBy,
  };
  await writeJson(key(userId), next);
  return next;
}

/** Server-level gate: live orders are impossible unless this env flag is set. */
export function isLiveAllowed(): boolean {
  return process.env.CRYPTO_ALLOW_LIVE === 'true';
}
