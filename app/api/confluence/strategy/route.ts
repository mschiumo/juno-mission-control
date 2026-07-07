/**
 * Strategy descriptor for the Agents → Strategy tab (owner-only, read-only).
 *
 * Returns every registered strategy with its display identity and — for the
 * active one — a rules breakdown DERIVED FROM THE LIVE PARAMS (VALUE_TA_PARAMS
 * et al.), so the tab can never drift from what the code actually enforces.
 *
 * Selection stays config-driven (CONFLUENCE_STRATEGY); this endpoint reports,
 * it does not switch. Future toggling lands here as a PUT.
 */

import { NextResponse } from 'next/server';
import { requireOwner } from '@/lib/auth-session';
import { getStrategy, listStrategies } from '@/lib/confluence/agent/strategies';
import { hedgeSleeveSymbols, VALUE_TA_PARAMS } from '@/lib/confluence/agent/strategies/value-ta-pullback';
import { strategyMeta } from '@/lib/confluence/strategies-meta';

export const dynamic = 'force-dynamic';

interface RuleSection {
  title: string;
  rules: string[];
}

const pct = (x: number) => `${(x * 100).toFixed(x * 100 % 1 === 0 ? 0 : 1)}%`;
const usdB = (x: number) => `$${Math.round(x / 1e9)}B`;
const usdM = (x: number) => `$${Math.round(x / 1e6)}M`;

/** Rules text generated from the live params — edits to the params show up here. */
function valueTaBreakdown(): RuleSection[] {
  const P = VALUE_TA_PARAMS;
  return [
    {
      title: 'Gate 1 — Value (a durable business at a fair price)',
      rules: [
        `Market cap ≥ ${usdB(P.minMarketCapUsd)} — large caps only`,
        `P/E (TTM) ≤ ${P.maxPeTtm}, or forward P/E ≤ ${P.maxForwardPe} when available — profitable, not paying up for hype`,
        `P/B ≤ ${P.maxPbRatio} — screens out balance-sheet extremes`,
        `Dividend yield ≥ ${pct(P.minDividendYield)} OR positive free cash flow — real cash returns`,
        `Quality guards when the data source provides them: ROE ≥ ${pct(P.minRoe)}, debt/equity ≤ ${P.maxDebtToEquity}, revenue growth ≥ ${pct(P.minRevenueGrowthYoY)}`,
      ],
    },
    {
      title: 'Gate 2 — Technicals (a pullback inside an orderly uptrend)',
      rules: [
        `Uptrend intact: close above the 200-day average, 50-day above 200-day (needs ≥ ${P.minBars} daily bars)`,
        `Pulled back to the 50-day: close between ${pct(P.pullbackBandBelowSma50)} below and ${pct(P.pullbackBandAboveSma50)} above it`,
        `RSI(14) between ${P.rsiMin} and ${P.rsiMax} — a dip, not a breakdown; a pause, not a chase`,
        `ATR(14) ≤ ${pct(P.maxAtrPct)} of price — volatility ceiling`,
        `20-day average dollar volume ≥ ${usdM(P.minAvgDollarVolume)} — liquidity floor`,
        `Not within ${pct(1 - P.max52wHighPct)} of the 52-week high — never buys the top`,
      ],
    },
    {
      title: 'Exits & sizing (computed at proposal time, human-approved)',
      rules: [
        `Entry: patient limit ${pct(1 - P.limitDiscount)} below the last close (GTC recommended — waits for the dip to touch)`,
        `Stop: ${P.atrStopMultiple}× ATR, widened to just under the 10-day swing low, bounded ${pct(P.minStopPct)}–${pct(P.maxStopPct)} — placed automatically at the broker after the entry fills`,
        `Target: ${P.rewardRiskRatio}:1 reward-to-risk from the stop distance`,
        `Sizing: risk budget (default ${pct(P.defaultRiskPerTradeFraction)} of the total exposure cap) ÷ per-share stop distance, capped by the per-position budget`,
        'Ranked by confluence score when more names qualify than the run budget',
      ],
    },
    {
      title: 'Hedge sleeve — inverse index ETFs (1x only)',
      rules: [
        `Watches ${hedgeSleeveSymbols().join(', ') || '(disabled — CONFLUENCE_INVERSE_ETFS is empty)'} — index-based 1x inverse ETFs (leveraged 2x/3x excluded: daily-rebalancing decay punishes swing holds)`,
        'Technicals-only: the same technical gate applied to the inverse ETF itself — its uptrend + pullback IS the index downtrend bouncing into resistance, so no separate regime detector',
        'No value gate (ETFs have no earnings); same entry/stop/target construction and risk-based sizing',
        'At most one hedge proposal per run — a hedge, not a second book; wears the VTA-HEDGE badge in the queue',
      ],
    },
    {
      title: 'Cadence & discipline',
      rules: [
        'Screens nightly after the close on settled daily bars — swing horizon (days to weeks), never intraday',
        'Zero-proposal nights are the strategy working: most days, nothing is in the pullback zone',
        'Never re-proposes a symbol already pending, working, or held',
        'Every proposal still passes the kill switch, exposure caps, and your explicit approval before any order exists',
      ],
    },
  ];
}

export async function GET(): Promise<NextResponse> {
  const { error } = await requireOwner();
  if (error) return error;

  const active = getStrategy();
  const strategies = listStrategies().map((s) => ({
    id: s.id,
    label: s.label,
    needsTechnicals: s.needsTechnicals,
    active: s.id === active.id,
    meta: strategyMeta(s.id),
    breakdown: s.id === 'value-ta-pullback' ? valueTaBreakdown() : undefined,
  }));

  return NextResponse.json({
    success: true,
    activeId: active.id,
    configuredVia: process.env.CONFLUENCE_STRATEGY ? 'CONFLUENCE_STRATEGY env' : 'default',
    strategies,
  });
}
