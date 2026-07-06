import Anthropic from '@anthropic-ai/sdk';
import type {
  CryptoPosition,
  CryptoSystemState,
  RiskState,
  ScreenerResult,
} from '@/types/crypto-trader';

/**
 * LLM analyst — Claude ranks and vetoes pre-screened candidates. Research on
 * live LLM trading agents is unambiguous: the model must be a signal
 * synthesizer over a structured dossier, never the origin of sizes or limits.
 * Every number it returns is clamped in code, and the guardrail layer runs
 * after it regardless of what it says.
 */

export interface AnalystVerdict {
  tokenAddress: string;
  action: 'buy' | 'skip';
  conviction: number; // 0–100
  thesis: string;
  /** Requested size — clamped to perPositionCapUsd in code. */
  suggestedNotionalUsd: number;
  /** Requested stop distance, percent below entry — clamped to 25–60. */
  stopPct: number;
}

const MAX_BUYS_PER_RUN = 3;

function clampVerdict(v: AnalystVerdict, state: CryptoSystemState): AnalystVerdict {
  return {
    ...v,
    conviction: Math.max(0, Math.min(100, Math.round(v.conviction ?? 0))),
    suggestedNotionalUsd: Math.max(
      10,
      Math.min(state.perPositionCapUsd, v.suggestedNotionalUsd || state.perPositionCapUsd / 2),
    ),
    // Memecoin stops tighter than ~25% get chopped by ordinary volatility;
    // wider than 60% is not a stop.
    stopPct: Math.max(25, Math.min(60, v.stopPct || 45)),
  };
}

function dossier(
  candidates: ScreenerResult[],
  positions: CryptoPosition[],
  state: CryptoSystemState,
  risk: RiskState,
): string {
  const open = positions.filter((p) => p.status === 'open');
  return JSON.stringify(
    {
      riskContext: {
        openPositions: open.map((p) => ({ symbol: p.symbol, costUsd: p.costUsd })),
        maxNewPositions: Math.max(0, state.maxOpenPositions - open.length),
        perPositionCapUsd: state.perPositionCapUsd,
        remainingExposureUsd:
          state.totalExposureCapUsd - open.reduce((s, p) => s + p.qtyTokens * p.avgEntryPriceUsd, 0),
        dailyRealizedPnlUsd: risk.realizedPnlUsd,
        consecutiveLosses: risk.consecutiveLosses,
      },
      candidates: candidates.map((c) => ({
        tokenAddress: c.token.tokenAddress,
        symbol: c.token.symbol,
        name: c.token.name,
        chain: c.token.chainId,
        priceUsd: c.token.priceUsd,
        marketCapUsd: c.token.marketCapUsd,
        liquidityUsd: c.token.liquidityUsd,
        ageHours: Math.round(c.token.ageHours * 10) / 10,
        priceChangePct: c.token.priceChangePct,
        volumeUsd: c.token.volumeUsd,
        txns1h: { buys: c.token.txns.h1Buys, sells: c.token.txns.h1Sells },
        momentumScore: c.momentumScore,
        signals: c.signals,
        safetyScore: c.safety.score,
        safetyWarnings: c.safety.warnings,
        boosted: c.token.boosted,
      })),
    },
    null,
    1,
  );
}

const SYSTEM_PROMPT = `You are the analyst for a small, risk-capped crypto momentum bot. You receive a dossier of pre-screened tokens (rug-filtered, momentum-scored in code) plus current risk context.

Your job is to RANK AND VETO, not to originate: pick at most ${MAX_BUYS_PER_RUN} candidates worth buying right now under a volume-momentum-breakout strategy, and skip everything else. Be selective — skipping all candidates is a perfectly good answer, and the historical failure mode of bots like this is overtrading mediocre setups, not missing winners.

What a good setup looks like: short-window volume genuinely accelerating vs baseline, buy-side pressure, price rising but NOT already vertical (avoid +60%+ 1h chases), real liquidity vs position size, market cap small enough to move but not a brand-new micro rug, no concerning safety warnings, and a coherent reason this specific token has attention right now.

Red flags to veto: boosted/promoted tokens with weak organic volume, sell-pressure divergence, safety warnings about holder concentration, extreme extension, dead turnover, or anything you cannot articulate a thesis for in one sentence.

Sizing and stops are advisory only — code clamps them and hard guardrails run after you. Respond with JSON only, matching:
{"verdicts": [{"tokenAddress": string, "action": "buy"|"skip", "conviction": 0-100, "thesis": string (one or two sentences), "suggestedNotionalUsd": number, "stopPct": number (percent below entry, 25-60)}]}
Include a verdict for every candidate.`;

/** Deterministic fallback when no ANTHROPIC_API_KEY is configured. */
function deterministicVerdicts(
  candidates: ScreenerResult[],
  state: CryptoSystemState,
): AnalystVerdict[] {
  return candidates.map((c, i) => ({
    tokenAddress: c.token.tokenAddress,
    action: (i < MAX_BUYS_PER_RUN && c.momentumScore >= 60 ? 'buy' : 'skip') as 'buy' | 'skip',
    conviction: c.momentumScore,
    thesis: `Deterministic: momentum ${c.momentumScore}/100 — ${c.signals.join('; ') || 'baseline signals'}.`,
    suggestedNotionalUsd: state.perPositionCapUsd / 2,
    stopPct: 45,
  }));
}

export async function analyzeCandidates(
  candidates: ScreenerResult[],
  positions: CryptoPosition[],
  state: CryptoSystemState,
  risk: RiskState,
): Promise<{ verdicts: AnalystVerdict[]; mode: 'claude' | 'deterministic' }> {
  if (!candidates.length) return { verdicts: [], mode: 'deterministic' };

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { verdicts: deterministicVerdicts(candidates, state), mode: 'deterministic' };
  }

  const client = new Anthropic({ apiKey });
  const model = process.env.CRYPTO_AGENT_MODEL || 'claude-sonnet-4-6';

  const response = await client.messages.create({
    model,
    max_tokens: 3000,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: dossier(candidates, positions, state, risk) }],
  });

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('');
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Analyst returned no parseable JSON');
  const parsed = JSON.parse(jsonMatch[0]) as { verdicts?: AnalystVerdict[] };

  const known = new Set(candidates.map((c) => c.token.tokenAddress));
  const verdicts = (parsed.verdicts ?? [])
    .filter((v) => known.has(v.tokenAddress)) // model cannot introduce tokens
    .map((v) => clampVerdict(v, state));

  // Enforce the per-run buy cap in code even if the model over-picks.
  let buys = 0;
  for (const v of verdicts) {
    if (v.action === 'buy') {
      buys += 1;
      if (buys > MAX_BUYS_PER_RUN) v.action = 'skip';
    }
  }

  return { verdicts, mode: 'claude' };
}
