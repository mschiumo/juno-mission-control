import type { CryptoChain, SafetyReport, ScreenerToken } from '@/types/crypto-trader';

/**
 * Rug/scam filtering — the layer practitioners consistently rank above entry speed.
 * Solana tokens go through RugCheck (free, no key); EVM tokens through GoPlus
 * Security (free tier). Hard failures disqualify a token from agent buys entirely;
 * the numeric score feeds the guardrail floor (minSafetyScore).
 */

const GOPLUS_CHAIN_IDS: Record<string, string> = {
  ethereum: '1',
  base: '8453',
};

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

const unavailable = (): SafetyReport => ({
  // No data is treated as unsafe: score 0 fails every sane minSafetyScore.
  score: 0,
  hardFails: ['Safety data unavailable'],
  warnings: [],
  source: 'unavailable',
  checkedAt: new Date().toISOString(),
});

// --- Solana: RugCheck (https://api.rugcheck.xyz) ---

interface RugCheckReport {
  score_normalised?: number; // 0–100, higher = RISKIER
  rugged?: boolean;
  risks?: { name: string; level?: string; description?: string }[];
  token?: { mintAuthority?: string | null; freezeAuthority?: string | null };
  markets?: { lp?: { lpLockedPct?: number } }[];
  topHolders?: { pct?: number; owner?: string }[];
}

async function checkSolana(tokenAddress: string): Promise<SafetyReport> {
  const report = await fetchJson<RugCheckReport>(
    `https://api.rugcheck.xyz/v1/tokens/${tokenAddress}/report`,
  );
  if (!report) return unavailable();

  const hardFails: string[] = [];
  const warnings: string[] = [];

  if (report.rugged) hardFails.push('RugCheck marks this token as rugged');
  if (report.token?.mintAuthority) hardFails.push('Mint authority not revoked');
  if (report.token?.freezeAuthority) hardFails.push('Freeze authority not revoked');

  const lpLockedPct = report.markets?.[0]?.lp?.lpLockedPct;
  if (lpLockedPct !== undefined && lpLockedPct < 50) {
    hardFails.push(`Only ${Math.round(lpLockedPct)}% of LP locked/burned`);
  }

  // Top-10 holder concentration (excluding obvious LP entries is not possible
  // reliably here, so we use a looser 30% threshold as the hard gate).
  const top10Pct = (report.topHolders ?? []).slice(0, 10).reduce((sum, h) => sum + (h.pct ?? 0), 0);
  if (top10Pct > 30) hardFails.push(`Top-10 holders own ${Math.round(top10Pct)}% of supply`);
  else if (top10Pct > 20) warnings.push(`Top-10 holders own ${Math.round(top10Pct)}% of supply`);

  for (const risk of report.risks ?? []) {
    if (risk.level === 'danger') hardFails.push(risk.name);
    else warnings.push(risk.name);
  }

  // RugCheck score_normalised: 0–100 where HIGHER IS RISKIER — invert it.
  const riskScore = report.score_normalised ?? 100;
  let score = Math.max(0, Math.min(100, Math.round(100 - riskScore)));
  if (hardFails.length) score = Math.min(score, 30);

  return { score, hardFails, warnings, source: 'rugcheck', checkedAt: new Date().toISOString() };
}

// --- EVM: GoPlus Security (https://docs.gopluslabs.io) ---

interface GoPlusTokenData {
  is_honeypot?: string;
  cannot_sell_all?: string;
  buy_tax?: string;
  sell_tax?: string;
  is_open_source?: string;
  is_proxy?: string;
  is_mintable?: string;
  owner_change_balance?: string;
  is_blacklisted?: string;
  hidden_owner?: string;
  holders?: { percent?: string; is_contract?: number }[];
  lp_holders?: { is_locked?: number; percent?: string }[];
}

async function checkEvm(chain: CryptoChain, tokenAddress: string): Promise<SafetyReport> {
  const chainId = GOPLUS_CHAIN_IDS[chain];
  if (!chainId) return unavailable();
  const res = await fetchJson<{ result?: Record<string, GoPlusTokenData> }>(
    `https://api.gopluslabs.io/api/v1/token_security/${chainId}?contract_addresses=${tokenAddress}`,
  );
  const data = res?.result?.[tokenAddress.toLowerCase()];
  if (!data) return unavailable();

  const hardFails: string[] = [];
  const warnings: string[] = [];

  if (data.is_honeypot === '1') hardFails.push('Honeypot: sells blocked');
  if (data.cannot_sell_all === '1') hardFails.push('Cannot sell full balance');
  if (data.owner_change_balance === '1') hardFails.push('Owner can edit balances');
  if (data.is_mintable === '1') hardFails.push('Token is mintable');
  if (data.hidden_owner === '1') hardFails.push('Hidden owner');
  if (data.is_open_source === '0') hardFails.push('Contract not verified');

  const buyTax = parseFloat(data.buy_tax ?? '0') * 100;
  const sellTax = parseFloat(data.sell_tax ?? '0') * 100;
  if (buyTax > 10 || sellTax > 10) hardFails.push(`Tax too high (buy ${buyTax.toFixed(1)}%, sell ${sellTax.toFixed(1)}%)`);
  else if (buyTax > 5 || sellTax > 5) warnings.push(`Elevated tax (buy ${buyTax.toFixed(1)}%, sell ${sellTax.toFixed(1)}%)`);

  if (data.is_proxy === '1') warnings.push('Upgradeable proxy contract');
  if (data.is_blacklisted === '1') warnings.push('Has blacklist function');

  const top10Pct = (data.holders ?? [])
    .slice(0, 10)
    .reduce((sum, h) => sum + parseFloat(h.percent ?? '0') * 100, 0);
  if (top10Pct > 30) hardFails.push(`Top-10 holders own ${Math.round(top10Pct)}% of supply`);
  else if (top10Pct > 20) warnings.push(`Top-10 holders own ${Math.round(top10Pct)}% of supply`);

  const lockedLp = (data.lp_holders ?? []).some((lp) => lp.is_locked === 1);
  if (data.lp_holders?.length && !lockedLp) warnings.push('No locked LP detected');

  let score = 100 - hardFails.length * 35 - warnings.length * 10;
  score = Math.max(0, Math.min(100, score));

  return { score, hardFails, warnings, source: 'goplus', checkedAt: new Date().toISOString() };
}

export async function checkTokenSafety(token: ScreenerToken): Promise<SafetyReport> {
  if (token.chainId === 'solana') return checkSolana(token.tokenAddress);
  return checkEvm(token.chainId, token.tokenAddress);
}
