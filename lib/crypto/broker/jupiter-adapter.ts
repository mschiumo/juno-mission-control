import type { CryptoBrokerAdapter, SwapRequest, SwapResult } from './types';
import { signTransaction, walletPublicKey } from './solana-signer';
import { acquireLock, readJson, releaseLock, writeJson } from '@/lib/db/crypto/store';

/**
 * Live Solana execution via the Jupiter Ultra API (order → sign → execute).
 * Ultra broadcasts the transaction itself (no RPC dependency for sending) and
 * runs its real-time slippage estimator; we additionally enforce our own
 * slippage cap against the quote before signing anything.
 *
 * Only reachable when CRYPTO_ALLOW_LIVE=true, paper mode is off, and a
 * dedicated hot-wallet key is configured — all checked in the guardrail layer.
 * EVM chains are screener-only for now; live execution is Solana-first since
 * that is where the memecoin flow is.
 */

const ULTRA_BASE = 'https://lite-api.jup.ag/ultra/v1';
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const SOLANA_RPC = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';

const resultKey = (refId: string) => `crypto:live-fill:${refId}`;
const lockKey = (refId: string) => `crypto:live-lock:${refId}`;
const decimalsKey = (mint: string) => `crypto:decimals:${mint}`;

async function getTokenDecimals(mint: string): Promise<number> {
  const cached = await readJson<number | null>(decimalsKey(mint), null);
  if (cached !== null) return cached;
  const res = await fetch(SOLANA_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getTokenSupply', params: [mint] }),
    signal: AbortSignal.timeout(10000),
  });
  const json = await res.json();
  const decimals = json?.result?.value?.decimals;
  if (typeof decimals !== 'number') throw new Error(`Could not resolve decimals for ${mint}`);
  await writeJson(decimalsKey(mint), decimals, 7 * 86400);
  return decimals;
}

interface UltraOrderResponse {
  transaction?: string;
  requestId?: string;
  outAmount?: string;
  errorMessage?: string;
}

interface UltraExecuteResponse {
  status?: string;
  signature?: string;
  outputAmountResult?: string;
  inputAmountResult?: string;
  error?: string;
}

export const jupiterAdapter: CryptoBrokerAdapter = {
  name: 'jupiter',

  async executeSwap(req: SwapRequest): Promise<SwapResult> {
    if (req.chainId !== 'solana') {
      return { ok: false, error: `Live execution not supported on ${req.chainId} yet (Solana only).` };
    }

    // Idempotency: return the recorded result for a retried refId, and take a
    // lock so two concurrent runs can never double-execute the same order.
    const prior = await readJson<SwapResult | null>(resultKey(req.refId), null);
    if (prior) return prior;
    if (!(await acquireLock(lockKey(req.refId), 120))) {
      return { ok: false, error: 'Order already in flight (idempotency lock).' };
    }

    try {
      const taker = walletPublicKey();
      const tokenDecimals = await getTokenDecimals(req.tokenAddress);

      let inputMint: string;
      let outputMint: string;
      let rawAmount: bigint;
      if (req.side === 'buy') {
        inputMint = USDC_MINT;
        outputMint = req.tokenAddress;
        rawAmount = BigInt(Math.floor(req.amount * 1e6)); // USDC has 6 decimals
      } else {
        inputMint = req.tokenAddress;
        outputMint = USDC_MINT;
        rawAmount = BigInt(Math.floor(req.amount * 10 ** tokenDecimals));
      }

      const orderUrl = `${ULTRA_BASE}/order?inputMint=${inputMint}&outputMint=${outputMint}&amount=${rawAmount}&taker=${taker}`;
      const orderRes = await fetch(orderUrl, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(15000),
      });
      const order = (await orderRes.json()) as UltraOrderResponse;
      if (!orderRes.ok || !order.transaction || !order.requestId) {
        const result: SwapResult = { ok: false, error: order.errorMessage || `Jupiter order failed (${orderRes.status})` };
        await writeJson(resultKey(req.refId), result, 86400);
        return result;
      }

      // Our own slippage gate on the quote, independent of Jupiter's estimator.
      const outRaw = Number(order.outAmount ?? 0);
      const quotedPriceUsd =
        req.side === 'buy'
          ? req.amount / (outRaw / 10 ** tokenDecimals)
          : outRaw / 1e6 / req.amount;
      const direction = req.side === 'buy' ? 1 : -1;
      const quotedSlippageBps = Math.round(
        ((quotedPriceUsd - req.expectedPriceUsd) / req.expectedPriceUsd) * 10000 * direction,
      );
      if (quotedSlippageBps > req.maxSlippageBps) {
        const result: SwapResult = {
          ok: false,
          error: `Quote slippage ${quotedSlippageBps}bps exceeds cap ${req.maxSlippageBps}bps — aborted before signing.`,
        };
        await writeJson(resultKey(req.refId), result, 86400);
        return result;
      }

      const signedTransaction = signTransaction(order.transaction);
      const execRes = await fetch(`${ULTRA_BASE}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signedTransaction, requestId: order.requestId }),
        signal: AbortSignal.timeout(60000),
      });
      const exec = (await execRes.json()) as UltraExecuteResponse;

      if (exec.status !== 'Success') {
        const result: SwapResult = { ok: false, error: exec.error || `Swap failed (status ${exec.status})`, txSignature: exec.signature };
        await writeJson(resultKey(req.refId), result, 86400);
        return result;
      }

      const outResult = Number(exec.outputAmountResult ?? outRaw);
      const filledQtyTokens = req.side === 'buy' ? outResult / 10 ** tokenDecimals : req.amount;
      const filledUsd = req.side === 'buy' ? req.amount : outResult / 1e6;
      const filledPriceUsd = filledUsd / filledQtyTokens;
      const result: SwapResult = {
        ok: true,
        filledPriceUsd,
        filledQtyTokens,
        feeUsd: 0,
        slippageBps: Math.round(((filledPriceUsd - req.expectedPriceUsd) / req.expectedPriceUsd) * 10000 * direction),
        txSignature: exec.signature,
      };
      await writeJson(resultKey(req.refId), result, 86400);
      return result;
    } catch (error) {
      // No result marker on unknown-outcome errors — but the lock prevents an
      // immediate blind retry; the operator can inspect the wallet first.
      return { ok: false, error: error instanceof Error ? error.message : 'Live swap failed' };
    } finally {
      await releaseLock(lockKey(req.refId));
    }
  },
};
