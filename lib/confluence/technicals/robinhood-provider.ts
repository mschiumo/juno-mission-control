/**
 * Robinhood-backed technicals provider.
 *
 * Fetches ~14 months of daily bars via the Robinhood Trading MCP
 * `get_equity_historicals` tool (split-adjusted — the right basis for
 * indicators) and computes the snapshot locally with ./indicators.
 *
 * ⚠️ Same caveat as RobinhoodFundamentalsProvider: the transport
 * (lib/confluence/robinhood/mcp-client) is env-gated and inert until the
 * server-side OAuth token is provisioned. The bar field mapping below is
 * tolerant of both snake_case REST-style and plain OHLCV keys; verify against
 * live data on first use the same way the fundamentals mapping was.
 */

import type { OhlcvBar, Technicals, TechnicalsProvider } from './provider';
import { computeTechnicals } from './indicators';
import { callRobinhoodTool } from '@/lib/confluence/robinhood/mcp-client';

/** 14 months of calendar days ≈ 290+ trading bars — enough for SMA200. */
const LOOKBACK_DAYS = 430;

interface RhBar {
  begins_at?: string;
  timestamp?: string;
  date?: string;
  open_price?: string | number;
  open?: string | number;
  high_price?: string | number;
  high?: string | number;
  low_price?: string | number;
  low?: string | number;
  close_price?: string | number;
  close?: string | number;
  volume?: string | number;
}

interface RhHistoricalsResult {
  symbol?: string;
  historicals?: RhBar[];
  bars?: RhBar[];
}

function num(v?: string | number): number | undefined {
  if (v == null) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function toBar(raw: RhBar): OhlcvBar | null {
  const ts = raw.begins_at ?? raw.timestamp ?? raw.date;
  const open = num(raw.open_price ?? raw.open);
  const high = num(raw.high_price ?? raw.high);
  const low = num(raw.low_price ?? raw.low);
  const close = num(raw.close_price ?? raw.close);
  const volume = num(raw.volume) ?? 0;
  if (!ts || open == null || high == null || low == null || close == null) return null;
  return { date: ts.slice(0, 10), open, high, low, close, volume };
}

export class RobinhoodTechnicalsProvider implements TechnicalsProvider {
  readonly name = 'robinhood';

  async getTechnicals(symbol: string): Promise<Technicals | null> {
    const startTime = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const res = await callRobinhoodTool<{ data?: { results?: RhHistoricalsResult[] } }>(
      'get_equity_historicals',
      { symbols: [symbol], start_time: startTime, interval: 'day' },
    );
    const result = res?.data?.results?.[0];
    const rawBars = result?.historicals ?? result?.bars;
    if (!rawBars?.length) return null;

    const bars = rawBars
      .map(toBar)
      .filter((b): b is OhlcvBar => b !== null)
      .sort((a, b) => a.date.localeCompare(b.date));
    if (!bars.length) return null;
    return computeTechnicals(symbol.toUpperCase(), bars);
  }
}
