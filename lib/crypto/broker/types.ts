import type { CryptoChain } from '@/types/crypto-trader';

/**
 * Broker adapter contract for crypto execution. Two implementations:
 *  - paper: simulated fills at live DEX Screener prices (default, credential-free)
 *  - jupiter: live Solana swaps via the Jupiter Ultra API from a dedicated hot wallet
 */

export interface SwapRequest {
  chainId: CryptoChain;
  tokenAddress: string;
  pairAddress: string;
  side: 'buy' | 'sell';
  /** Buys: USD to spend. Sells: tokens to sell. */
  amount: number;
  /** Current reference price, for slippage accounting. */
  expectedPriceUsd: number;
  /** Pool depth, for the paper adapter's impact model. */
  liquidityUsd: number;
  maxSlippageBps: number;
  /** Idempotency key — a retry with the same refId must not double-execute. */
  refId: string;
}

export interface SwapResult {
  ok: boolean;
  filledPriceUsd?: number;
  filledQtyTokens?: number;
  feeUsd?: number;
  slippageBps?: number;
  txSignature?: string;
  error?: string;
}

export interface CryptoBrokerAdapter {
  name: string;
  executeSwap(req: SwapRequest): Promise<SwapResult>;
}
