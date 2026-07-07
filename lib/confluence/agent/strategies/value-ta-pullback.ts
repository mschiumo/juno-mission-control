/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  VALUE-TA PULLBACK — quality-value names bought on pullbacks in uptrends.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Design goal: LOW-RISK, STEADY RETURNS. Two independent gates must BOTH pass
 * (the "confluence"):
 *
 *  1. VALUE gate — is this a durable business at a fair price?
 *     Large-cap, profitably valued (P/E), sane price-to-book, returning cash
 *     (dividend) or generating free cash flow. Quality guards (ROE, leverage,
 *     revenue growth) are enforced whenever the data source provides them.
 *
 *  2. TECHNICAL gate — is this the right moment to own it?
 *     Established uptrend (price > SMA200, SMA50 > SMA200), currently pulled
 *     back to the rising 50-day average (not chasing strength), RSI cooled to
 *     the 35–55 band (dip, not breakdown), low volatility (ATR ≤ 4% of price),
 *     liquid ($20M+ average daily dollar volume), and not pinned at the
 *     52-week high.
 *
 * Exits are defined at proposal time, per docs/TRADING_STRATEGY_GUIDE.md:
 *  - stop  = structure-aware: 1.8×ATR below entry, widened to just under the
 *            10-day swing low when that low is nearby, hard-capped at 8%.
 *  - target = entry + 2 × risk (fixed 2:1 reward-to-risk).
 *
 * Sizing is RISK-BASED, not budget-based: quantity = risk dollars ÷ stop
 * distance, then capped by the per-position budget. Risk per trade defaults to
 * 1% of the total exposure cap. This keeps every position's worst-case loss
 * roughly constant — the core of "steady".
 *
 * Like every strategy here it is a PURE function: snapshot in, optional
 * candidate out. It never places orders — candidates become `pending`
 * proposals a human must approve, and code-level guardrails (kill switch,
 * caps, buying power) re-check everything at execution time.
 *
 * This expresses the owner's stated approach (value + technicals, low risk);
 * parameters below are the tuning surface. Not investment advice.
 */

import type { Fundamentals } from '@/lib/confluence/fundamentals';
import type { Technicals } from '@/lib/confluence/technicals';
import type { FundamentalMetric } from '@/types/confluence';
import type { Candidate, StrategyContext } from '../strategy';

export const VALUE_TA_PARAMS = {
  // ── Value gate ──
  minMarketCapUsd: 10e9, // large caps only: stability over lottery tickets
  maxPeTtm: 25, // profitable and not paying up for hype
  maxForwardPe: 22, // slightly stricter when forward estimates exist
  maxPbRatio: 8, // loose guard — screens out balance-sheet extremes only
  minDividendYield: 0.01, // cash-return requirement (OR positive FCF below)
  minRoe: 0.1, // enforced only when the data source provides it
  maxDebtToEquity: 2.0, // enforced only when provided
  minRevenueGrowthYoY: 0.0, // no shrinking businesses; enforced when provided

  // ── Technical gate ──
  minBars: 200, // need a real SMA200 before trusting the trend read
  pullbackBandBelowSma50: 0.02, // close may sit up to 2% under the 50-day…
  pullbackBandAboveSma50: 0.04, // …or up to 4% over it: "at the moving average"
  rsiMin: 35, // below this the dip looks like a breakdown
  rsiMax: 55, // above this it isn't a pullback yet
  maxAtrPct: 0.04, // volatility ceiling: ATR14 ≤ 4% of price
  minAvgDollarVolume: 20e6, // liquidity floor, 20-day average
  max52wHighPct: 0.97, // skip anything within 3% of its 52-week high

  // ── Exits ──
  atrStopMultiple: 1.8,
  minStopPct: 0.03, // never tighter than 3% — room to breathe
  maxStopPct: 0.08, // never wider than 8% — bounded worst case
  swingLowBuffer: 0.995, // stop sits 0.5% under the swing low
  rewardRiskRatio: 2.0,

  // ── Entry / sizing ──
  limitDiscount: 0.995, // patient limit 0.5% below last close
  defaultRiskPerTradeFraction: 0.01, // of total exposure cap, when ctx omits it
} as const;

const P = VALUE_TA_PARAMS;

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

function pct(x?: number): string {
  return x == null ? '—' : `${(x * 100).toFixed(1)}%`;
}

interface ValueCheck {
  ok: boolean;
  peUsed?: number;
  peLabel?: string;
}

/** Gate 1 — durable business at a fair price. */
function passesValueGate(f: Fundamentals): ValueCheck {
  if (f.marketCap == null || f.marketCap < P.minMarketCapUsd) return { ok: false };

  // Valuation anchor: TTM or forward P/E must exist, be positive (profitable),
  // and clear its threshold.
  const ttmOk = f.peTtm != null && f.peTtm > 0 && f.peTtm <= P.maxPeTtm;
  const fwdOk = f.forwardPe != null && f.forwardPe > 0 && f.forwardPe <= P.maxForwardPe;
  if (!ttmOk && !fwdOk) return { ok: false };

  if (f.pbRatio != null && f.pbRatio > P.maxPbRatio) return { ok: false };

  // Cash discipline: a real dividend OR positive free cash flow.
  const paysDividend = f.dividendYield != null && f.dividendYield >= P.minDividendYield;
  const generatesCash = f.freeCashFlow != null && f.freeCashFlow > 0;
  if (!paysDividend && !generatesCash) return { ok: false };

  // Quality guards — only when the provider supplies the field.
  if (f.returnOnEquity != null && f.returnOnEquity < P.minRoe) return { ok: false };
  if (f.debtToEquity != null && f.debtToEquity > P.maxDebtToEquity) return { ok: false };
  if (f.revenueGrowthYoY != null && f.revenueGrowthYoY < P.minRevenueGrowthYoY) {
    return { ok: false };
  }

  return ttmOk
    ? { ok: true, peUsed: f.peTtm, peLabel: 'P/E (TTM)' }
    : { ok: true, peUsed: f.forwardPe, peLabel: 'Fwd P/E' };
}

/** Gate 2 — pullback within an established, orderly uptrend. */
function passesTechnicalGate(t: Technicals, high52w?: number): boolean {
  if (t.barCount < P.minBars) return false;
  if (t.sma50 == null || t.sma200 == null || t.rsi14 == null || t.atr14 == null) return false;
  if (t.avgDollarVolume20 == null || t.avgDollarVolume20 < P.minAvgDollarVolume) return false;

  const uptrend = t.lastClose > t.sma200 && t.sma50 > t.sma200;
  if (!uptrend) return false;

  const nearSma50 =
    t.lastClose >= t.sma50 * (1 - P.pullbackBandBelowSma50) &&
    t.lastClose <= t.sma50 * (1 + P.pullbackBandAboveSma50);
  if (!nearSma50) return false;

  if (t.rsi14 < P.rsiMin || t.rsi14 > P.rsiMax) return false;
  if (t.atr14 / t.lastClose > P.maxAtrPct) return false;
  if (high52w != null && t.lastClose > high52w * P.max52wHighPct) return false;

  return true;
}

/**
 * 0–100 confluence score for ranking when more names qualify than the run's
 * proposal budget. Rewards cheaper valuation, yield, an RSI near the middle of
 * the band, proximity to the 50-day, and trend strength.
 */
function confluenceScore(f: Fundamentals, t: Technicals, peUsed: number): number {
  const cheapness = Math.max(0, Math.min(1, (P.maxPeTtm - peUsed) / P.maxPeTtm)); // 0..1
  const yieldScore = Math.max(0, Math.min(1, (f.dividendYield ?? 0) / 0.04));
  const rsiCenter = (P.rsiMin + P.rsiMax) / 2;
  const rsiScore = 1 - Math.min(1, Math.abs((t.rsi14 ?? rsiCenter) - rsiCenter) / 10);
  const sma50Dist = t.sma50 ? Math.abs(t.lastClose / t.sma50 - 1) : 1;
  const pullbackScore = 1 - Math.min(1, sma50Dist / P.pullbackBandAboveSma50);
  const trendScore = t.sma50 && t.sma200 ? Math.min(1, (t.sma50 / t.sma200 - 1) / 0.1) : 0;
  return Math.round(
    (cheapness * 0.3 + yieldScore * 0.2 + rsiScore * 0.15 + pullbackScore * 0.2 + trendScore * 0.15) * 100,
  );
}

/**
 * Fundamentals-only prefilter for the runner — lets it skip the technicals
 * fetch for names the value gate already rejects (in a broad universe the vast
 * majority). evaluate() re-checks the gate and remains the authority.
 */
export function valueTaPrefilter(f: Fundamentals): boolean {
  return passesValueGate(f).ok;
}

/**
 * Evaluate one symbol. Returns a sized, stop/target-annotated long candidate
 * when both gates pass and at least one share fits the risk budget; else null.
 * Long-only by design — "steady returns" does not short.
 */
export function evaluateValueTaPullback(
  f: Fundamentals,
  t: Technicals | null,
  ctx: StrategyContext,
): Candidate | null {
  if (t == null) return null;

  const value = passesValueGate(f);
  if (!value.ok || value.peUsed == null) return null;
  if (!passesTechnicalGate(t, f.high52w)) return null;

  // ── Entry: patient limit just below the last close ──
  const entry = round2(t.lastClose * P.limitDiscount);
  if (entry <= 0) return null;

  // ── Stop: ATR-based, widened to structure, hard-capped ──
  const atrStopDist = Math.max(t.atr14! * P.atrStopMultiple, entry * P.minStopPct);
  let stop = entry - Math.min(atrStopDist, entry * P.maxStopPct);
  if (t.swingLow10 != null) {
    const structureStop = t.swingLow10 * P.swingLowBuffer;
    // Prefer the swing-low stop when it is below the ATR stop but still inside
    // the max-risk cap — stops belong under structure, not at round numbers.
    if (structureStop < stop && structureStop >= entry * (1 - P.maxStopPct)) {
      stop = structureStop;
    }
  }
  stop = round2(stop);
  const riskPerShare = entry - stop;
  if (riskPerShare <= 0) return null;

  // ── Target: fixed 2:1 reward-to-risk ──
  const target = round2(entry + riskPerShare * P.rewardRiskRatio);

  // ── Sizing: risk dollars ÷ stop distance, capped by budget ──
  // Fallback risk budget (runner normally passes maxRiskPerTradeUsd): 10% of
  // the per-position budget ≈ 1% of the default total exposure cap.
  const riskUsd = ctx.maxRiskPerTradeUsd ?? ctx.perPositionBudgetUsd * 0.1;
  const qtyByRisk = Math.floor(riskUsd / riskPerShare);
  const qtyByBudget = Math.floor(ctx.perPositionBudgetUsd / entry);
  const quantity = Math.min(qtyByRisk, qtyByBudget);
  if (quantity < 1) return null;

  const score = confluenceScore(f, t, value.peUsed);
  const stopPct = (riskPerShare / entry) * 100;

  const fundamentals: FundamentalMetric[] = [
    { label: value.peLabel!, value: value.peUsed.toFixed(1) },
    { label: 'P/B', value: f.pbRatio != null ? f.pbRatio.toFixed(1) : '—' },
    { label: 'Div yield', value: pct(f.dividendYield) },
    { label: 'Mkt cap', value: f.marketCap != null ? `$${Math.round(f.marketCap / 1e9)}B` : '—' },
    { label: 'RSI(14)', value: t.rsi14!.toFixed(0) },
    { label: 'vs SMA50', value: `${(((t.lastClose / t.sma50!) - 1) * 100).toFixed(1)}%` },
    { label: 'vs SMA200', value: `${(((t.lastClose / t.sma200!) - 1) * 100).toFixed(1)}%` },
    { label: 'ATR(14)', value: `${((t.atr14! / t.lastClose) * 100).toFixed(1)}%` },
    { label: 'Stop / Target', value: `$${stop} / $${target} (2:1)` },
    { label: 'Confluence score', value: score },
  ];

  return {
    symbol: f.symbol,
    direction: 'buy',
    thesis:
      `${f.symbol}: quality value name (${value.peLabel} ${value.peUsed.toFixed(1)}, ` +
      `div ${pct(f.dividendYield)}, cap $${Math.round((f.marketCap ?? 0) / 1e9)}B) pulled back to its rising ` +
      `50-day average in an established uptrend (RSI ${t.rsi14!.toFixed(0)}, ` +
      `${(((t.lastClose / t.sma200!) - 1) * 100).toFixed(0)}% above SMA200). ` +
      `Limit $${entry}, stop $${stop} (−${stopPct.toFixed(1)}%), target $${target} (2:1 R:R). ` +
      `Confluence score ${score}/100.`,
    suggestedLimitPrice: entry,
    suggestedQuantity: quantity,
    suggestedStopPrice: stop,
    suggestedTargetPrice: target,
    fundamentals,
    score,
  };
}

/**
 * The same rules, phrased for the Claude/MCP analyst path — dropped into the
 * system prompt's <criteria> block so both agent modes trade one strategy.
 * The analyst computes indicators from get_equity_historicals daily bars.
 */
export const VALUE_TA_CRITERIA_PROMPT = [
  'STRATEGY: Value-TA Pullback — long-only, low-risk, steady returns. Propose a symbol ONLY when',
  'BOTH gates pass. When data for a gate is unavailable, the gate FAILS (never assume).',
  '',
  'VALUE GATE (all required):',
  `- Market cap ≥ $${P.minMarketCapUsd / 1e9}B.`,
  `- P/E (TTM) in (0, ${P.maxPeTtm}] — or forward P/E in (0, ${P.maxForwardPe}] if TTM is unavailable.`,
  `- P/B ≤ ${P.maxPbRatio} when reported.`,
  `- Dividend yield ≥ ${P.minDividendYield * 100}% OR clearly positive free cash flow.`,
  '',
  'TECHNICAL GATE (all required; compute from ≥200 daily bars via get_equity_historicals):',
  '- Uptrend: last close > 200-day SMA AND 50-day SMA > 200-day SMA.',
  `- Pullback: last close within −${P.pullbackBandBelowSma50 * 100}% to +${P.pullbackBandAboveSma50 * 100}% of the 50-day SMA.`,
  `- RSI(14) between ${P.rsiMin} and ${P.rsiMax}.`,
  `- ATR(14) ≤ ${P.maxAtrPct * 100}% of price; 20-day avg dollar volume ≥ $${P.minAvgDollarVolume / 1e6}M.`,
  `- Last close no higher than ${P.max52wHighPct * 100}% of the 52-week high (do not chase).`,
  '',
  'ORDER CONSTRUCTION (every proposal):',
  `- suggestedLimitPrice: ~${(1 - P.limitDiscount) * 100}% below last close.`,
  `- suggestedStopPrice: ${P.atrStopMultiple}×ATR(14) below entry, moved just under the 10-day swing low`,
  `  when that is close; total risk always between ${P.minStopPct * 100}% and ${P.maxStopPct * 100}% of entry.`,
  `- suggestedTargetPrice: entry + ${P.rewardRiskRatio}× the entry-to-stop distance (${P.rewardRiskRatio}:1 reward-to-risk).`,
  '- suggestedQuantity: risk-based — (risk budget ÷ per-share stop distance), capped by the per-position budget.',
  '- Include the key numbers (P/E, yield, RSI, distance to SMA50/200, stop %, target) in `fundamentals`.',
  '',
  'Propose NOTHING when no symbol clears both gates — an empty proposals array is a good outcome.',
].join('\n');
