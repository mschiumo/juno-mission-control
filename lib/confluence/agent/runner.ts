/**
 * The analysis agent runner (Milestone 2 scaffolding).
 *
 * Opens an agent_run, screens the fundamentals universe through the (pluggable)
 * strategy, and writes any candidates as `pending` proposals tagged with the
 * run id — then closes the run. It PLACES NO ORDERS: its output is proposals for
 * the user to decide.
 *
 * The LLM/heuristic lives only in the strategy (currently a placeholder the user
 * replaces with their criteria). Everything downstream of a `pending` proposal
 * remains the deterministic, human-gated execution path.
 */

import { saveRun } from '@/lib/db/confluence/agent-runs';
import { saveProposal } from '@/lib/db/confluence/proposals';
import { getSystemState } from '@/lib/db/confluence/system-state';
import { appendAudit } from '@/lib/db/confluence/audit';
import { getFundamentalsProvider } from '@/lib/confluence/fundamentals';
import { defaultStrategy } from './strategy';
import type { AgentRun, Proposal } from '@/types/confluence';

export interface RunOptions {
  cadence: string; // 'nightly' | 'weekly' | 'manual'
  maxProposals?: number;
  /** How long agent proposals stay actionable before auto-expiring. */
  proposalTtlDays?: number;
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
    const provider = getFundamentalsProvider();
    const universe = await provider.getUniverse();
    // Keep the toy sizing comfortably under the per-position cap.
    const ctx = { perPositionBudgetUsd: Math.min(state.perPositionCapUsd, 1000) };

    const max = opts.maxProposals ?? 10;
    const ttlDays = opts.proposalTtlDays ?? 7;
    const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000).toISOString();

    let generated = 0;
    for (const symbol of universe) {
      if (generated >= max) break;
      const data = await provider.getFundamentals(symbol);
      if (!data) continue;
      const candidate = defaultStrategy(data, ctx);
      if (!candidate) continue;

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
    run.universeSize = universe.length;
    run.metadata = { provider: provider.name, strategy: 'placeholder' };
    await saveRun(run, userId);
  } catch (e) {
    run.status = 'failed';
    run.error = e instanceof Error ? e.message : 'Unknown agent run error';
    run.finishedAt = new Date().toISOString();
    await saveRun(run, userId);
  }

  return run;
}
