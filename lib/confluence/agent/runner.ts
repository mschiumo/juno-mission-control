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
import { getProposalsByStatus, saveProposal } from '@/lib/db/confluence/proposals';
import { getActiveOrders, getAllOrders } from '@/lib/db/confluence/orders';
import { getSystemState } from '@/lib/db/confluence/system-state';
import { appendAudit } from '@/lib/db/confluence/audit';
import { getFundamentalsProvider, type Fundamentals } from '@/lib/confluence/fundamentals';
import { getTechnicalsProvider, type Technicals } from '@/lib/confluence/technicals';
import { chunk, formatSkip, MCP_SYMBOL_BATCH_SIZE } from '@/lib/confluence/batching';
import { ConfluenceNotConfigured } from '@/lib/confluence/robinhood/mcp-client';
import type { Candidate, SizedOutCandidate, StrategyContext } from './strategy';
import { getStrategy, type StrategyDefinition } from './strategies';
import { analyzeWithClaude } from './claude-analyst';
import { resolveUniverse, type ResolvedUniverse } from '@/lib/confluence/universe';
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

/**
 * Deterministic path: a screening funnel, not a per-symbol pipeline.
 *
 *   fundamentals (batched, whole universe) → strategy prefilter (value gate)
 *   → technicals (batched, value-passers only) → evaluate → rank.
 *
 * Batching (10 symbols/MCP call) plus the prefilter is what lets a ~250-name
 * universe finish without rate-limiting: most names fail the value gate on
 * fundamentals alone, so their technicals are never fetched. A failed chunk
 * skips only its own symbols — never the run — and every skip is recorded as
 * 'SYM:reason' (a plain string, so existing metadata consumers keep working).
 */
async function deterministicCandidates(
  strat: StrategyDefinition,
  ctx: StrategyContext,
  resolved: ResolvedUniverse,
): Promise<{
  candidates: Candidate[];
  providerName: string;
  technicalsProviderName?: string;
  universeSize: number;
  skippedSymbols: string[];
  /** Count of fundamentals-holders that cleared the prefilter (when the strategy has one). */
  valueGatePassed?: number;
  /** Gate-passers dropped only because sizing rounded to zero shares. */
  sizedOut: SizedOutCandidate[];
}> {
  const provider = getFundamentalsProvider();
  const technicalsProvider = strat.needsTechnicals ? getTechnicalsProvider() : null;
  const universe = resolved.symbols;
  const skippedSymbols: string[] = [];
  const skipped = new Set<string>();
  const skip = (symbol: string, reason: string) => {
    skipped.add(symbol);
    skippedSymbols.push(formatSkip(symbol, reason));
  };

  // ── Stage 1: fundamentals for the whole universe, batched when supported.
  const fundamentals = new Map<string, Fundamentals>();
  if (provider.getFundamentalsBatch) {
    for (const batch of chunk(universe, MCP_SYMBOL_BATCH_SIZE)) {
      try {
        const got = await provider.getFundamentalsBatch(batch);
        // Re-key by the universe's own symbol strings so later lookups match.
        for (const symbol of batch) {
          const f = got.get(symbol) ?? got.get(symbol.toUpperCase());
          if (f) fundamentals.set(symbol, f);
        }
      } catch (err) {
        // Misconfiguration is systemic — fail the run with the crisp message
        // instead of grinding through every chunk to fail generically.
        if (err instanceof ConfluenceNotConfigured) throw err;
        for (const symbol of batch) skip(symbol, 'fundamentals_failed');
      }
    }
  } else {
    for (const symbol of universe) {
      try {
        const f = await provider.getFundamentals(symbol);
        if (f) fundamentals.set(symbol, f);
      } catch {
        skip(symbol, 'fundamentals_failed');
      }
    }
  }

  // ── Stage 2: value-gate prefilter. Symbols with no fundamentals data, and
  // names the cheap gate rejects, are simply not candidates — not "skipped".
  const holders = universe.filter((s) => fundamentals.has(s));
  const valuePassers = strat.prefilter
    ? holders.filter((s) => strat.prefilter!(fundamentals.get(s)!))
    : holders;
  const valueGatePassed = strat.prefilter ? valuePassers.length : undefined;

  // ── Stage 3: technicals, only for the value-passers.
  const technicals = new Map<string, Technicals>();
  if (technicalsProvider) {
    if (technicalsProvider.getTechnicalsBatch) {
      for (const batch of chunk(valuePassers, MCP_SYMBOL_BATCH_SIZE)) {
        try {
          const got = await technicalsProvider.getTechnicalsBatch(batch);
          for (const symbol of batch) {
            const t = got.get(symbol) ?? got.get(symbol.toUpperCase());
            if (t) technicals.set(symbol, t);
          }
        } catch (err) {
          if (err instanceof ConfluenceNotConfigured) throw err;
          for (const symbol of batch) skip(symbol, 'technicals_failed');
        }
      }
    } else {
      for (const symbol of valuePassers) {
        try {
          const t = await technicalsProvider.getTechnicals(symbol);
          if (t) technicals.set(symbol, t);
        } catch {
          skip(symbol, 'technicals_failed');
        }
      }
    }
  }

  // ── Stage 4: evaluate the survivors, then rank — the best-scored setups win
  // the run's proposal budget, not the first alphabetical passers.
  const candidates: Candidate[] = [];
  // Gate-passers whose sizing rounded to zero shares — recorded so a too-small
  // risk budget doesn't masquerade as "no setups found".
  const sizedOut: SizedOutCandidate[] = [];
  const evalCtx: StrategyContext = { ...ctx, onSizedOut: (info) => sizedOut.push(info) };
  for (const symbol of valuePassers) {
    if (skipped.has(symbol)) continue;
    // One symbol's failure must not abort the run and discard candidates
    // already found — skip it and record the skip.
    try {
      const c = strat.evaluate(fundamentals.get(symbol)!, technicals.get(symbol) ?? null, evalCtx);
      if (c) candidates.push(c);
    } catch {
      skip(symbol, 'evaluate_failed');
    }
  }

  // Every symbol failing is systemic (dead token, provider outage) — that must
  // surface as a failed run, not a quiet zero-proposal success.
  if (universe.length > 0 && skipped.size === universe.length) {
    throw new Error(`All ${universe.length} universe symbols failed to load from ${provider.name} — check provider config/token.`);
  }
  candidates.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  return {
    candidates,
    providerName: provider.name,
    technicalsProviderName: technicalsProvider?.name,
    universeSize: universe.length,
    skippedSymbols,
    valueGatePassed,
    sizedOut,
  };
}

/**
 * Symbols the agent must not re-propose right now: anything with a pending
 * proposal, an active order, or an open position (net filled shares in the
 * order log). Expired/rejected proposals deliberately DON'T block — a setup
 * that's still valid after its old proposal died should come back.
 */
async function symbolsInPlay(userId: string): Promise<Set<string>> {
  const inPlay = new Set<string>();
  for (const p of await getProposalsByStatus(userId, 'pending')) inPlay.add(p.symbol.toUpperCase());
  for (const o of await getActiveOrders(userId)) inPlay.add(o.symbol.toUpperCase());
  // Open positions = non-zero net filled quantity per symbol.
  const net = new Map<string, number>();
  for (const o of await getAllOrders(userId)) {
    if (!(o.filledQuantity > 0)) continue;
    const sign = o.side === 'buy' ? 1 : -1;
    const sym = o.symbol.toUpperCase();
    net.set(sym, (net.get(sym) ?? 0) + sign * o.filledQuantity);
  }
  for (const [sym, qty] of net) if (qty !== 0) inPlay.add(sym);
  return inPlay;
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

    // Which symbols this run screens — env list or the Massive-built universe.
    // Recorded in metadata (incl. any fallback) so a run is always auditable.
    const resolved = await resolveUniverse();
    const universeMeta = {
      universeSource: resolved.source,
      ...(resolved.builtAt ? { universeBuiltAt: resolved.builtAt } : {}),
      ...(resolved.fallbackReason ? { universeFallbackReason: resolved.fallbackReason } : {}),
    };

    const strat = getStrategy();
    if (mode === 'claude') {
      candidates = await analyzeWithClaude({ perPositionBudgetUsd });
      universeSize = resolved.symbols.length;
      metaSource = {
        mode: 'claude',
        model: process.env.CONFLUENCE_AGENT_MODEL || 'claude-opus-4-8',
        strategy: strat.id,
        ...universeMeta,
      };
    } else {
      const ctx: StrategyContext = { perPositionBudgetUsd, maxRiskPerTradeUsd };
      const det = await deterministicCandidates(strat, ctx, resolved);
      candidates = det.candidates;
      universeSize = det.universeSize;
      metaSource = {
        mode: 'deterministic',
        provider: det.providerName,
        technicalsProvider: det.technicalsProviderName,
        strategy: strat.id,
        ...universeMeta,
        ...(det.skippedSymbols.length ? { skippedSymbols: det.skippedSymbols } : {}),
        ...(det.valueGatePassed != null ? { valueGatePassed: det.valueGatePassed } : {}),
        ...(det.sizedOut.length ? { sizedOutSymbols: det.sizedOut } : {}),
      };
    }

    // Don't re-propose what's already in play (pending / working / held).
    const inPlay = await symbolsInPlay(userId);
    const skippedInPlay = candidates
      .filter((c) => inPlay.has(c.symbol.toUpperCase()))
      .map((c) => c.symbol.toUpperCase());
    const fresh = candidates.filter((c) => !inPlay.has(c.symbol.toUpperCase()));
    if (skippedInPlay.length > 0) {
      metaSource = { ...metaSource, alreadyInPlay: skippedInPlay };
    }

    let generated = 0;
    for (const candidate of fresh.slice(0, max)) {
      const proposal: Proposal = {
        id: crypto.randomUUID(),
        runId: run.id,
        createdAt: new Date().toISOString(),
        symbol: candidate.symbol,
        direction: candidate.direction,
        thesis: candidate.thesis,
        strategyId: strat.id,
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
