/**
 * Massive-backed fundamentals provider (Stocks → Fundamentals → Ratios endpoint).
 *
 * Requires the Massive **Stocks Advanced/Business** plan OR the **"Financials &
 * Ratios Expansion"** add-on on Stocks Starter, plus a MASSIVE_API_KEY. The
 * Ratios endpoint returns ~32 EOD metrics derived from the income statement,
 * balance sheet, and cash-flow statement (TTM). The raw statements ("Financials")
 * endpoint is deprecated, so Ratios is the intended source.
 *
 * ⚠️ The exact REST path/param/field names below follow Massive's documented
 * conventions but were NOT validated against a live key (the expansion isn't
 * enabled yet). Confirm against massive.com/docs/rest/stocks/fundamentals/ratios
 * before relying on it. Env-gated: throws ConfluenceNotConfigured until
 * MASSIVE_API_KEY is set, so it's inert by default.
 */

import type { Fundamentals, FundamentalsProvider } from './provider';
import { ConfluenceNotConfigured } from '@/lib/confluence/robinhood/mcp-client';

const DEFAULT_BASE = 'https://api.massive.com';

function universeFromEnv(): string[] {
  const raw = process.env.CONFLUENCE_UNIVERSE;
  if (raw && raw.trim()) {
    return raw.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
  }
  return ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'KO', 'JNJ', 'PG', 'JPM'];
}

/** Documented Ratios fields (subset used); everything is preserved in `raw`. */
interface MassiveRatios {
  ticker?: string;
  price?: number;
  market_cap?: number;
  enterprise_value?: number;
  pe_ratio?: number;
  pb_ratio?: number;
  ps_ratio?: number;
  return_on_equity?: number;
  return_on_assets?: number;
  debt_to_equity?: number;
  current_ratio?: number;
  free_cash_flow?: number;
  dividend_yield?: number;
  [k: string]: unknown;
}

export class MassiveFundamentalsProvider implements FundamentalsProvider {
  readonly name = 'massive';

  private apiKey(): string {
    const key = process.env.MASSIVE_API_KEY;
    if (!key) {
      throw new ConfluenceNotConfigured(
        'Massive is not configured (MASSIVE_API_KEY unset). Add the "Financials & Ratios Expansion" to your Stocks plan and set the key.',
      );
    }
    return key;
  }

  async getUniverse(): Promise<string[]> {
    // Presence check up front so a misconfig fails fast with a clear message.
    this.apiKey();
    return universeFromEnv();
  }

  async getFundamentals(symbol: string): Promise<Fundamentals | null> {
    const key = this.apiKey();
    const base = process.env.MASSIVE_API_URL || DEFAULT_BASE;
    const url = `${base}/stocks/v1/fundamentals/ratios?ticker=${encodeURIComponent(symbol)}&apiKey=${encodeURIComponent(key)}`;

    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        throw new ConfluenceNotConfigured(`Massive rejected the request (${res.status}) — check the key and that the Ratios entitlement is active.`);
      }
      throw new Error(`Massive ratios request failed: ${res.status}`);
    }
    const body = (await res.json()) as { results?: MassiveRatios[]; result?: MassiveRatios };
    const r = body.results?.[0] ?? body.result;
    if (!r) return null;

    return {
      symbol: r.ticker ?? symbol.toUpperCase(),
      price: r.price,
      peTtm: r.pe_ratio,
      pbRatio: r.pb_ratio,
      psRatio: r.ps_ratio,
      returnOnEquity: r.return_on_equity,
      returnOnAssets: r.return_on_assets,
      debtToEquity: r.debt_to_equity,
      currentRatio: r.current_ratio,
      freeCashFlow: r.free_cash_flow,
      marketCap: r.market_cap,
      dividendYield: r.dividend_yield,
      raw: r as Record<string, unknown>,
    };
  }
}
