/**
 * Robinhood-backed technicals provider.
 *
 * Fetches ~14 months of daily bars via the Robinhood Trading MCP
 * `get_equity_historicals` tool (split-adjusted — the right basis for
 * indicators) and computes the snapshot locally with ./indicators.
 *
 * Field mapping verified against the live API (2026-07-06): the response is
 * `data.results[0].bars` with snake_case string fields (`begins_at`,
 * `open_price`, …), bars oldest-first, `adjustment_type` defaulting to split.
 * The mapping stays tolerant of plain OHLCV keys anyway. The transport
 * (lib/confluence/robinhood/mcp-client) is env-gated and inert until the
 * server-side OAuth token is provisioned.
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
  /** true = gap-fill bar; Robinhood's own guidance is to ignore for analytics. */
  interpolated?: boolean;
}

interface RhHistoricalsResult {
  symbol?: string;
  historicals?: RhBar[];
  bars?: RhBar[];
}

/** Today's date (YYYY-MM-DD) in market time. */
function etToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
}

/**
 * Coarse "is the regular session plausibly still running" check (ET, ignores
 * holidays — a false positive just drops one settled bar, which is harmless;
 * the nightly cron at ~10pm ET always keeps the day's close).
 */
function isEtSessionLikelyOpen(): boolean {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
    weekday: 'short',
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const weekday = get('weekday');
  if (weekday === 'Sat' || weekday === 'Sun') return false;
  const minutes = Number(get('hour')) * 60 + Number(get('minute'));
  // 9:30–16:15 ET (a little past the close to cover settlement lag).
  return minutes >= 9 * 60 + 30 && minutes <= 16 * 60 + 15;
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
      // Interpolated bars are flat gap-fill — they deflate ATR and distort RSI.
      .filter((raw) => raw.interpolated !== true)
      .map(toBar)
      .filter((b): b is OhlcvBar => b !== null)
      .sort((a, b) => a.date.localeCompare(b.date));
    // The most recent bar is not settled until the session ends; an intraday
    // run would otherwise compute daily indicators over a partial bar.
    if (bars.length && bars[bars.length - 1].date === etToday() && isEtSessionLikelyOpen()) {
      bars.pop();
    }
    if (!bars.length) return null;
    return computeTechnicals(symbol.toUpperCase(), bars);
  }
}
