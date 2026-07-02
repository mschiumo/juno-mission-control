/**
 * ConfluenceTrading agent ingest API (headless, AGENT_SECRET-authenticated).
 *
 * Lets a SCHEDULED CLAUDE AGENT — one that already has the Robinhood MCP
 * connected via OAuth (so no token lives in this app) — report the proposals it
 * produced, without a browser session. Authenticated by
 * `Authorization: Bearer <AGENT_SECRET>` (enforced in middleware.ts and
 * re-checked here). Writes to the OWNER's data only.
 *
 *   GET  /api/confluence/agent/proposals
 *        → context for the run: { universe, perPositionBudgetUsd, paperMode,
 *          pendingSymbols } so the agent screens the right names and avoids dupes.
 *   POST /api/confluence/agent/proposals
 *        body: { cadence?, proposals: [{ symbol, direction, thesis,
 *                suggestedLimitPrice, suggestedQuantity, suggestedStopPrice?,
 *                suggestedTargetPrice?, fundamentals?: [{label,value,hint?}] }] }
 *        → opens an agent_run, writes each as a `pending` proposal, returns
 *          { runId, created }.
 *
 * The agent only PROPOSES. Nothing here places an order — execution stays behind
 * the human gate in the app.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAgentSecret } from '@/lib/auth-session';
import { getUserByEmail } from '@/lib/db/users';
import { OWNER_EMAIL } from '@/lib/owner';
import { getSystemState } from '@/lib/db/confluence/system-state';
import { getProposalsByStatus, saveProposal } from '@/lib/db/confluence/proposals';
import { saveRun } from '@/lib/db/confluence/agent-runs';
import { appendAudit } from '@/lib/db/confluence/audit';
import { getAgentUniverse } from '@/lib/confluence/agent/universe';
import type { AgentRun, FundamentalMetric, Proposal, TradeDirection } from '@/types/confluence';

async function ownerUserId(): Promise<string | null> {
  const user = await getUserByEmail(OWNER_EMAIL);
  return user?.id ?? null;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = requireAgentSecret(request);
  if (denied) return denied;

  const userId = await ownerUserId();
  if (!userId) return NextResponse.json({ success: false, error: 'Owner not found' }, { status: 404 });

  const state = await getSystemState(userId);
  const pending = await getProposalsByStatus(userId, 'pending');
  return NextResponse.json({
    success: true,
    universe: getAgentUniverse(),
    perPositionBudgetUsd: Math.min(state.perPositionCapUsd, 1000),
    totalExposureCapUsd: state.totalExposureCapUsd,
    paperMode: state.paperMode,
    pendingSymbols: [...new Set(pending.map((p) => p.symbol))],
  });
}

interface IncomingProposal {
  symbol?: string;
  direction?: TradeDirection;
  thesis?: string;
  suggestedLimitPrice?: number;
  suggestedQuantity?: number;
  suggestedStopPrice?: number;
  suggestedTargetPrice?: number;
  fundamentals?: FundamentalMetric[];
}

function validate(p: IncomingProposal): string | null {
  if (!p || typeof p !== 'object') return 'Invalid proposal';
  if (!p.symbol || !p.symbol.trim()) return 'symbol is required';
  if (p.direction !== 'buy' && p.direction !== 'sell') return 'direction must be buy or sell';
  if (!p.thesis || !p.thesis.trim()) return 'thesis is required';
  if (!(typeof p.suggestedLimitPrice === 'number' && p.suggestedLimitPrice > 0)) return 'suggestedLimitPrice must be positive';
  if (!(typeof p.suggestedQuantity === 'number' && p.suggestedQuantity > 0)) return 'suggestedQuantity must be positive';
  return null;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = requireAgentSecret(request);
  if (denied) return denied;

  const userId = await ownerUserId();
  if (!userId) return NextResponse.json({ success: false, error: 'Owner not found' }, { status: 404 });

  let body: { cadence?: string; proposals?: IncomingProposal[]; proposalTtlDays?: number };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
  }
  const incoming = Array.isArray(body.proposals) ? body.proposals : [];
  if (incoming.length === 0) {
    return NextResponse.json({ success: false, error: 'proposals array is required' }, { status: 400 });
  }

  // Validate all before writing any.
  for (const p of incoming) {
    const err = validate(p);
    if (err) return NextResponse.json({ success: false, error: err }, { status: 400 });
  }

  const startedAt = new Date().toISOString();
  const run: AgentRun = {
    id: crypto.randomUUID(),
    startedAt,
    cadence: body.cadence?.trim() || 'scheduled',
    proposalsGenerated: 0,
    status: 'running',
    metadata: { source: 'scheduled-claude-agent' },
  };
  await saveRun(run, userId);

  const ttlDays = typeof body.proposalTtlDays === 'number' && body.proposalTtlDays > 0 ? body.proposalTtlDays : 7;
  const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000).toISOString();

  const created: Proposal[] = [];
  for (const p of incoming) {
    const proposal: Proposal = {
      id: crypto.randomUUID(),
      runId: run.id,
      createdAt: new Date().toISOString(),
      symbol: p.symbol!.trim().toUpperCase(),
      direction: p.direction!,
      thesis: p.thesis!.trim(),
      suggestedLimitPrice: p.suggestedLimitPrice,
      suggestedQuantity: p.suggestedQuantity,
      suggestedStopPrice: typeof p.suggestedStopPrice === 'number' ? p.suggestedStopPrice : undefined,
      suggestedTargetPrice: typeof p.suggestedTargetPrice === 'number' ? p.suggestedTargetPrice : undefined,
      fundamentals: Array.isArray(p.fundamentals) ? p.fundamentals : [],
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
      note: `Scheduled agent proposed ${proposal.direction} ${proposal.symbol} @ $${proposal.suggestedLimitPrice}`,
    });
    created.push(proposal);
  }

  run.status = 'completed';
  run.finishedAt = new Date().toISOString();
  run.proposalsGenerated = created.length;
  await saveRun(run, userId);

  return NextResponse.json({ success: true, runId: run.id, created: created.length }, { status: 201 });
}
