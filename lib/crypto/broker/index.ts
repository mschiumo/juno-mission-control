import type { CryptoSystemState } from '@/types/crypto-trader';
import type { CryptoBrokerAdapter } from './types';
import { paperAdapter } from './paper-adapter';
import { jupiterAdapter } from './jupiter-adapter';
import { isLiveAllowed } from '@/lib/db/crypto/system-state';

/**
 * Adapter router. Live execution requires BOTH the owner flipping paper mode off
 * AND the server being armed with CRYPTO_ALLOW_LIVE=true — otherwise every order
 * routes to the paper adapter, same defense-in-depth as the confluence broker.
 */
export function getBrokerAdapter(state: CryptoSystemState): CryptoBrokerAdapter {
  if (!state.paperMode && isLiveAllowed()) return jupiterAdapter;
  return paperAdapter;
}

export type { CryptoBrokerAdapter, SwapRequest, SwapResult } from './types';
