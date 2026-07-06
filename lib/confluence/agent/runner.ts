/**
 * The analysis agent runner (Milestone 2).
 *
 * Opens an agent_run, gathers candidate trades, writes them as `pending`
 * proposals tagged with the run id, then closes the run. It PLACES NO ORDERS:
 * its output is proposals for the user to decide.
 *
 * Two modes (CONFLUENCE_AGENT_MODE):
 *  - 'deterministic' (default) — a FundamentalsProvider feeds the code strategy.
 *    Runs credential-free with the mock provider, so paper mode always works.
 *  - 'claude' — the real agent: a Claude MCP-client call reads fundamentals via
 *    the read-only Robinhood MCP connector and returns candidates. The LLM lives
 *    ONLY here; everything downstream of a `pending` proposal stays deterministic
 *    and human-gated.
 */

import { saveRun } from '@/lib/db/confluence/agent-runs';
import { saveProposal } from '@/lib/db/confluence/proposals';
import { getSystemState } from '@/lib/db/confluence/system-state';
import { appendAudit } from '@/lib/db/confluence/audit';
import { getFundamentalsProvider } from '@/lib/confluence/fundamentals';
import { getTechnicalsProvider } from '@/lib/confluence/technicals';
import type { Candidate, StrategyContext } from './strategy';
import { getStrategy, type StrategyDefinition } from './strategies';
import { analyzeWithClaude } from './claude-analyst';
import { getAgentUniverse } from './universe';
import type { AgentRun, Proposal } from '@/types/confluence';

export interface RunOptions {
  cadence: string; // 'nightly' | 'weekly' | 'manual'
  maxProposals?: number;
  /** How long agent proposals stay actionable before auto-expiring. */
  proposalTtlDays?: number;
}

function agentMode(): 'deterministic' | 'claude' {
  return (process.env.CONFLUENCE_AGENT_MODE || 'deterministic').toLowerCase() === 'claude'
    ? 'claude'
    : 'deterministic';
}

/** Deterministic path: provider fundamentals (+ technicals) → code strategy → candidates. */
async function deterministicCandidates(
  strat: StrategyDefinition,
  ctx: StrategyContext,
): Promise<{
  candidates: Candidate[];
  providerName: string;
  technicalsProviderName?: string;
  universeSize: number;
  skippedSymbols: string[];
}> {
  const provider = getFundamentalsProvider();
  const technicalsProvider = strat.needsTechnicals ? getTechnicalsProvider() : null;
  const universe = await provider.getUniverse();
  const candidates: Candidate[] = [];
  const skippedSymbols: string[] = [];
  // Evaluate the whole universe, then rank — the best-scored setups win the
  // run's proposal budget, not the first alphabetical passers.
  for (const symbol of universe) {
    // One symbol's transient provider failure must not abort the run and
    // discard candidates already found — skip it and record the skip.
    try {
      const data = await provider.getFundamentals(symbol);
      if (!data) continue;
      const technicals = technicalsProvider ? await technicalsProvider.getTechnicals(symbol) : null;
      const c = strat.evaluate(data, technicals, ctx);
      if (c) candidates.push(c);
    } catch {
      skippedSymbols.push(symbol);
    }
  }
  // Every symbol failing is systemic (dead token, provider outage) — that must
  // surface as a failed run, not a quiet zero-proposal success.
  if (universe.length > 0 && skippedSymbols.length === universe.length) {
    throw new Error(`All ${universe.length} universe symbols failed to load from ${provider.name} — check provider config/token.`);
  }
  candidates.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  return {
    candidates,
    providerName: provider.name,
    technicalsProviderName: technicalsProvider?.name,
    universeSize: universe.length,
    skippedSymbols,
  };
}

export async function runAgent(userId: string, opts: RunOptions): Promise<AgentRun> {
  const startedAt = new Date().toISOString();
  const run: AgentRun = {
    id: crypto.randomUUID(),
    startedAt,
    cadence: opts.cadence,
    proposalsGenerated: 0,
    status: 'running',
    metadata: {},
  };
  await saveRun(run, userId);

  try {
    const state = await getSystemState(userId);
    // Keep sizing comfortably under the per-position cap.
    const perPositionBudgetUsd = Math.min(state.perPositionCapUsd, 1000);
    // Risk-based sizing budget: default 1% of the total exposure cap per trade,
    // overridable with CONFLUENCE_RISK_PER_TRADE_USD.
    const riskOverride = Number(process.env.CONFLUENCE_RISK_PER_TRADE_USD);
    const maxRiskPerTradeUsd =
      Number.isFinite(riskOverride) && riskOverride > 0
        ? riskOverride
        : state.totalExposureCapUsd * 0.01;
    const max = opts.maxProposals ?? 10;
    const ttlDays = opts.proposalTtlDays ?? 7;
    const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000).toISOString();

    const mode = agentMode();
    let candidates: Candidate[];
    let metaSource: Record<string, unknown>;
    let universeSize: number;

    const strat = getStrategy();
    if (mode === 'claude') {
      candidates = await analyzeWithClaude({ perPositionBudgetUsd });
      const uni = getAgentUniverse();
      universeSize = uni.length;
      metaSource = {
        mode: 'claude',
        model: process.env.CONFLUENCE_AGENT_MODEL || 'claude-opus-4-8',
        strategy: strat.id,
      };
    } else {
      const ctx: StrategyContext = { perPositionBudgetUsd, maxRiskPerTradeUsd };
      const det = await deterministicCandidates(strat, ctx);
      candidates = det.candidates;
      universeSize = det.universeSize;
      metaSource = {
        mode: 'deterministic',
        provider: det.providerName,
        technicalsProvider: det.technicalsProviderName,
        strategy: strat.id,
        ...(det.skippedSymbols.length ? { skippedSymbols: det.skippedSymbols } : {}),
      };
    }

    let generated = 0;
    for (const candidate of candidates.slice(0, max)) {
      const proposal: Proposal = {
        id: crypto.randomUUID(),
        runId: run.id,
        createdAt: new Date().toISOString(),
        symbol: candidate.symbol,
        direction: candidate.direction,
        thesis: candidate.thesis,
        suggestedLimitPrice: candidate.suggestedLimitPrice,
        suggestedQuantity: candidate.suggestedQuantity,
        suggestedStopPrice: candidate.suggestedStopPrice,
        suggestedTargetPrice: candidate.suggestedTargetPrice,
        fundamentals: candidate.fundamentals,
        status: 'pending',
        expiresAt,
      };
      await saveProposal(proposal, userId);
      await appendAudit(userId, {
        actor: 'agent',
        actorId: run.id,
        eventType: 'proposal.created',
        entityType: 'proposal',
        entityId: proposal.id,
        after: { symbol: proposal.symbol, direction: proposal.direction, limitPrice: proposal.suggestedLimitPrice, runId: run.id },
        note: `Agent proposed ${proposal.direction} ${proposal.symbol} @ $${proposal.suggestedLimitPrice}`,
      });
      generated++;
    }

    run.status = 'completed';
    run.finishedAt = new Date().toISOString();
    run.proposalsGenerated = generated;
    run.universeSize = universeSize;
    run.metadata = metaSource;
    await saveRun(run, userId);
  } catch (e) {
    run.status = 'failed';
    run.error = e instanceof Error ? e.message : 'Unknown agent run error';
    run.finishedAt = new Date().toISOString();
    await saveRun(run, userId);
  }

  return run;
}
