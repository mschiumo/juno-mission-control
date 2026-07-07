/**
 * Robinhood-backed fundamentals provider.
 *
 * Maps the Robinhood Trading MCP `get_equity_fundamentals` response to our
 * {@link Fundamentals} shape. The field mapping is verified against live data;
 * the transport (lib/confluence/robinhood/mcp-client) is env-gated and inert
 * until a server-side agent token is provisioned (see that file's note).
 *
 * Coverage note: Robinhood fundamentals provide valuation ratios (P/E, P/B),
 * market cap, float, 52-week range, dividends, and sector/industry — but NOT
 * forward P/E, margins, ROE/ROA, leverage, or revenue growth. A strategy that
 * needs those should use Massive (see massive-provider) or another source.
 */

import type { Fundamentals, FundamentalsProvider } from './provider';
import { callRobinhoodTool } from '@/lib/confluence/robinhood/mcp-client';
import { chunk, MCP_SYMBOL_BATCH_SIZE } from '@/lib/confluence/batching';

/** The screening universe — exact tickers (Robinhood fundamentals is not a screener). */
function universeFromEnv(): string[] {
  const raw = process.env.CONFLUENCE_UNIVERSE;
  if (raw && raw.trim()) {
    return raw.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
  }
  // Sensible default watchlist; override with CONFLUENCE_UNIVERSE.
  return ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'KO', 'JNJ', 'PG', 'JPM'];
}

interface RhFundamental {
  symbol: string;
  market_cap?: string;
  shares_outstanding?: string;
  float?: string;
  pe_ratio?: string;
  pb_ratio?: string;
  dividend_yield?: string; // percent, e.g. "2.56" = 2.56%
  high_52_weeks?: string;
  low_52_weeks?: string;
  sector?: string;
  industry?: string;
}

function num(v?: string): number | undefined {
  if (v == null) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/** Map one raw result to our shape, or null when it carries no symbol. */
function mapResult(r: RhFundamental): Fundamentals | null {
  if (!r?.symbol) return null;

  const marketCap = num(r.market_cap);
  const shares = num(r.shares_outstanding);
  // Robinhood fundamentals carry no last/close; derive price from cap / shares.
  const price = marketCap && shares ? marketCap / shares : undefined;
  const divYieldPct = num(r.dividend_yield);

  return {
    symbol: r.symbol,
    price,
    peTtm: num(r.pe_ratio),
    pbRatio: num(r.pb_ratio),
    marketCap,
    dividendYield: divYieldPct != null ? divYieldPct / 100 : undefined, // % → fraction
    high52w: num(r.high_52_weeks),
    low52w: num(r.low_52_weeks),
    sector: r.sector,
    industry: r.industry,
    raw: r as unknown as Record<string, unknown>,
  };
}

export class RobinhoodFundamentalsProvider implements FundamentalsProvider {
  readonly name = 'robinhood';

  async getUniverse(): Promise<string[]> {
    return universeFromEnv();
  }

  async getFundamentals(symbol: string): Promise<Fundamentals | null> {
    const map = await this.getFundamentalsBatch([symbol]);
    return map.get(symbol.toUpperCase()) ?? null;
  }

  /**
   * Batched fetch — the tool natively accepts up to 10 symbols, so this costs
   * one MCP call per chunk instead of one per symbol. Reads are idempotent, so
   * transient failures (timeout/429/5xx) retry with backoff.
   */
  async getFundamentalsBatch(symbols: string[]): Promise<Map<string, Fundamentals>> {
    const out = new Map<string, Fundamentals>();
    for (const batch of chunk(symbols, MCP_SYMBOL_BATCH_SIZE)) {
      const res = await callRobinhoodTool<{ data?: { results?: RhFundamental[] } }>(
        'get_equity_fundamentals',
        { symbols: batch },
        { retries: 2 },
      );
      for (const r of res?.data?.results ?? []) {
        const f = mapResult(r);
        if (f) out.set(f.symbol.toUpperCase(), f);
      }
    }
    return out;
  }
}
