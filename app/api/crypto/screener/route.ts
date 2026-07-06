import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth-session';
import { DEFAULT_FILTERS, runScreener } from '@/lib/crypto/screener';
import type { CryptoChain } from '@/types/crypto-trader';

export const dynamic = 'force-dynamic';

/**
 * Crypto screener results. Available to any logged-in user (public market data);
 * the trading agent surfaces are owner-only. Cached in Redis for ~2 minutes;
 * pass ?refresh=1 to force a fresh sweep.
 */
export async function GET(request: NextRequest) {
  const { error } = await requireUserId();
  if (error) return error;

  const params = request.nextUrl.searchParams;
  const chainParam = params.get('chain');
  const chain: CryptoChain | 'all' =
    chainParam === 'solana' || chainParam === 'ethereum' || chainParam === 'base' ? chainParam : 'all';

  const num = (name: string, fallback: number) => {
    const raw = parseFloat(params.get(name) ?? '');
    return Number.isFinite(raw) && raw >= 0 ? raw : fallback;
  };

  try {
    const snapshot = await runScreener(
      {
        ...DEFAULT_FILTERS,
        chain,
        minLiquidityUsd: num('minLiquidity', DEFAULT_FILTERS.minLiquidityUsd),
        minVolumeH24Usd: num('minVolume', DEFAULT_FILTERS.minVolumeH24Usd),
        minMarketCapUsd: num('minMarketCap', DEFAULT_FILTERS.minMarketCapUsd),
        maxMarketCapUsd: params.get('maxMarketCap') ? num('maxMarketCap', 0) || undefined : undefined,
        safeOnly: params.get('safeOnly') === '1',
      },
      params.get('refresh') === '1',
    );
    const results = params.get('safeOnly') === '1'
      ? { ...snapshot, results: snapshot.results.filter((r) => r.safety.hardFails.length === 0) }
      : snapshot;
    return NextResponse.json({ success: true, ...results });
  } catch (err) {
    console.error('crypto screener failed:', err);
    return NextResponse.json({ success: false, error: 'Screener failed' }, { status: 500 });
  }
}
