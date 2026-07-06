import type {
  CryptoAgentRun,
  CryptoProposal,
  TakeProfitRung,
} from '@/types/crypto-trader';
import { analyzeCandidates } from './analyst';
import { runScreener, DEFAULT_FILTERS } from '../screener';
import { executeApprovedProposal } from '../execution';
import {
  appendAudit,
  expireStaleProposals,
  getRiskState,
  listPositions,
  upsertProposal,
  upsertRun,
} from '@/lib/db/crypto/collections';
import { getSystemState } from '@/lib/db/crypto/system-state';
import { acquireLock, newId, releaseLock } from '@/lib/db/crypto/store';

/**
 * Agent run: screen → hard rug gate → LLM rank/veto → proposals.
 * With autoTrade OFF (default) proposals wait as `pending` for owner approval,
 * exactly like the confluence stock agent. With autoTrade ON, buy verdicts go
 * straight into the guardrail-gated execution path.
 */

const PROPOSAL_TTL_MINUTES = 60;

/** Practitioner-standard memecoin ladder: recover principal at 2x, ride the rest. */
const DEFAULT_LADDER: TakeProfitRung[] = [
  { multiple: 2, sellPct: 50 },
  { multiple: 5, sellPct: 25 },
];
const DEFAULT_TRAILING_STOP_PCT = 50;

export async function runCryptoAgent(
  userId: string,
  trigger: 'manual' | 'cron',
): Promise<CryptoAgentRun> {
  const lock = `crypto:agent-run-lock:${userId}`;
  if (!(await acquireLock(lock, 300))) {
    throw new Error('An agent run is already in progress.');
  }

  const run: CryptoAgentRun = {
    id: newId('run'),
    startedAt: new Date().toISOString(),
    trigger,
    mode: 'deterministic',
    candidatesScreened: 0,
    candidatesPassedSafety: 0,
    proposalsCreated: 0,
    autoExecuted: 0,
  };

  try {
    const state = await getSystemState(userId);
    await expireStaleProposals(userId);

    const snapshot = await runScreener(
      {
        ...DEFAULT_FILTERS,
        minLiquidityUsd: Math.max(DEFAULT_FILTERS.minLiquidityUsd, state.minLiquidityUsd),
        minAgeHours: Math.max(DEFAULT_FILTERS.minAgeHours, state.minTokenAgeHours),
      },
      trigger === 'manual',
    );
    run.candidatesScreened = snapshot.results.length;

    // Hard rug gate — non-negotiable, before the model ever sees a token.
    const safeCandidates = snapshot.results.filter(
      (r) => r.safety.hardFails.length === 0 && r.safety.score >= state.minSafetyScore,
    );
    run.candidatesPassedSafety = safeCandidates.length;

    const positions = await listPositions(userId);
    const risk = await getRiskState(userId);
    const heldTokens = new Set(
      positions.filter((p) => p.status === 'open').map((p) => p.tokenAddress),
    );
    const fresh = safeCandidates.filter((c) => !heldTokens.has(c.token.tokenAddress));

    const { verdicts, mode } = await analyzeCandidates(fresh, positions, state, risk);
    run.mode = mode;

    const byAddress = new Map(fresh.map((c) => [c.token.tokenAddress, c]));
    for (const verdict of verdicts) {
      if (verdict.action !== 'buy') continue;
      const candidate = byAddress.get(verdict.tokenAddress);
      if (!candidate) continue;

      const entry = candidate.token.priceUsd;
      const proposal: CryptoProposal = {
        id: newId('prop'),
        runId: run.id,
        chainId: candidate.token.chainId,
        tokenAddress: candidate.token.tokenAddress,
        pairAddress: candidate.token.pairAddress,
        symbol: candidate.token.symbol,
        name: candidate.token.name,
        direction: 'buy',
        thesis: verdict.thesis,
        strategy: 'momentum-breakout',
        notionalUsd: verdict.suggestedNotionalUsd,
        entryPriceUsd: entry,
        stopPriceUsd: entry * (1 - verdict.stopPct / 100),
        takeProfitLadder: DEFAULT_LADDER,
        trailingStopPct: DEFAULT_TRAILING_STOP_PCT,
        conviction: verdict.conviction,
        safetyScore: candidate.safety.score,
        signals: candidate.signals,
        status: 'pending',
        expiresAt: new Date(Date.now() + PROPOSAL_TTL_MINUTES * 60000).toISOString(),
        createdAt: new Date().toISOString(),
      };
      await upsertProposal(userId, proposal);
      run.proposalsCreated += 1;
      await appendAudit(userId, {
        actor: 'agent',
        actorId: run.id,
        eventType: 'proposal.created',
        entityType: 'proposal',
        entityId: proposal.id,
        note: `${proposal.symbol} buy $${proposal.notionalUsd} (conviction ${proposal.conviction}) — ${proposal.thesis}`,
      });

      if (state.autoTrade) {
        proposal.status = 'approved';
        proposal.decidedAt = new Date().toISOString();
        proposal.decidedBy = 'auto-trade';
        await upsertProposal(userId, proposal);
        const result = await executeApprovedProposal(userId, proposal, 'agent', run.id);
        if (result.ok) run.autoExecuted += 1;
      }
    }

    run.finishedAt = new Date().toISOString();
    await upsertRun(userId, run);
    await appendAudit(userId, {
      actor: 'agent',
      actorId: run.id,
      eventType: 'agent.run',
      entityType: 'run',
      entityId: run.id,
      note: `${trigger} run (${mode}): ${run.candidatesScreened} screened → ${run.candidatesPassedSafety} safe → ${run.proposalsCreated} proposals, ${run.autoExecuted} auto-executed`,
    });
    return run;
  } catch (error) {
    run.error = error instanceof Error ? error.message : 'unknown error';
    run.finishedAt = new Date().toISOString();
    await upsertRun(userId, run);
    return run;
  } finally {
    await releaseLock(lock);
  }
}
