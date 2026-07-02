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
import { defaultStrategy, type Candidate } from './strategy';
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

/** Deterministic path: provider fundamentals → code strategy → candidates. */
async function deterministicCandidates(
  perPositionBudgetUsd: number,
  max: number,
): Promise<{ candidates: Candidate[]; providerName: string; universeSize: number }> {
  const provider = getFundamentalsProvider();
  const universe = await provider.getUniverse();
  const ctx = { perPositionBudgetUsd };
  const candidates: Candidate[] = [];
  for (const symbol of universe) {
    if (candidates.length >= max) break;
    const data = await provider.getFundamentals(symbol);
    if (!data) continue;
    const c = defaultStrategy(data, ctx);
    if (c) candidates.push(c);
  }
  return { candidates, providerName: provider.name, universeSize: universe.length };
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
    const max = opts.maxProposals ?? 10;
    const ttlDays = opts.proposalTtlDays ?? 7;
    const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000).toISOString();

    const mode = agentMode();
    let candidates: Candidate[];
    let metaSource: Record<string, unknown>;
    let universeSize: number;

    if (mode === 'claude') {
      candidates = await analyzeWithClaude({ perPositionBudgetUsd });
      const uni = getAgentUniverse();
      universeSize = uni.length;
      metaSource = { mode: 'claude', model: process.env.CONFLUENCE_AGENT_MODEL || 'claude-opus-4-8' };
    } else {
      const det = await deterministicCandidates(perPositionBudgetUsd, max);
      candidates = det.candidates;
      universeSize = det.universeSize;
      metaSource = { mode: 'deterministic', provider: det.providerName, strategy: 'placeholder' };
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
