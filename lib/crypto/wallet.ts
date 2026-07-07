import { walletPublicKey } from './broker/solana-signer';
import { readJson, writeJson } from '@/lib/db/crypto/store';

/**
 * Trading-wallet visibility: address + SOL/USDC balances for the dedicated hot
 * wallet configured via CRYPTO_WALLET_SECRET_KEY. Read-only — the key itself
 * never leaves the signer module. Balances are cached briefly in Redis so the
 * UI poll and MCP tools don't hammer the public RPC.
 */

const SOLANA_RPC = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const CACHE_KEY = 'crypto:wallet-status';
const CACHE_TTL_SECONDS = 30;

export interface WalletStatus {
  /** Whether CRYPTO_WALLET_SECRET_KEY is configured on this server. */
  configured: boolean;
  /** Whether CRYPTO_ALLOW_LIVE=true (live execution armed at the server). */
  liveAllowed: boolean;
  address?: string;
  solBalance?: number;
  usdcBalance?: number;
  error?: string;
  checkedAt: string;
}

async function rpc<T>(method: string, params: unknown[]): Promise<T | null> {
  try {
    const res = await fetch(SOLANA_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const json = await res.json();
    return (json?.result ?? null) as T | null;
  } catch {
    return null;
  }
}

export async function getWalletStatus(force = false): Promise<WalletStatus> {
  const liveAllowed = process.env.CRYPTO_ALLOW_LIVE === 'true';
  if (!process.env.CRYPTO_WALLET_SECRET_KEY) {
    return { configured: false, liveAllowed, checkedAt: new Date().toISOString() };
  }

  if (!force) {
    const cached = await readJson<WalletStatus | null>(CACHE_KEY, null);
    if (cached) return { ...cached, liveAllowed };
  }

  let address: string;
  try {
    address = walletPublicKey();
  } catch (error) {
    return {
      configured: true,
      liveAllowed,
      error: error instanceof Error ? error.message : 'Invalid wallet key',
      checkedAt: new Date().toISOString(),
    };
  }

  const [lamports, tokenAccounts] = await Promise.all([
    rpc<{ value: number }>('getBalance', [address]),
    rpc<{ value: { account: { data: { parsed: { info: { tokenAmount: { uiAmount: number } } } } } }[] }>(
      'getTokenAccountsByOwner',
      [address, { mint: USDC_MINT }, { encoding: 'jsonParsed' }],
    ),
  ]);

  const status: WalletStatus = {
    configured: true,
    liveAllowed,
    address,
    solBalance: lamports ? lamports.value / 1e9 : undefined,
    usdcBalance:
      tokenAccounts?.value?.reduce(
        (sum, a) => sum + (a.account.data.parsed.info.tokenAmount.uiAmount ?? 0),
        0,
      ) ?? undefined,
    checkedAt: new Date().toISOString(),
  };
  await writeJson(CACHE_KEY, status, CACHE_TTL_SECONDS);
  return status;
}
