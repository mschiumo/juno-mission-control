import type {
  CryptoAgentRun,
  CryptoAuditEvent,
  CryptoOrder,
  CryptoPosition,
  CryptoProposal,
  RiskState,
} from '@/types/crypto-trader';
import { newId, readJson, writeJson } from './store';

/**
 * Redis-backed collections for proposals, orders, positions, agent runs, and the
 * append-only audit log. Whole-list JSON documents per user, same as the
 * confluence feature — volumes are small (single owner, bounded history).
 */

const KEYS = {
  proposals: (userId: string) => `crypto:proposals:${userId}`,
  orders: (userId: string) => `crypto:orders:${userId}`,
  positions: (userId: string) => `crypto:positions:${userId}`,
  runs: (userId: string) => `crypto:agent-runs:${userId}`,
  audit: (userId: string) => `crypto:audit:${userId}`,
  risk: (userId: string) => `crypto:risk:${userId}`,
} as const;

const MAX_AUDIT_EVENTS = 1000;
const MAX_RUNS = 100;

// --- Proposals ---

export async function listProposals(userId: string): Promise<CryptoProposal[]> {
  const doc = await readJson<{ proposals: CryptoProposal[] }>(KEYS.proposals(userId), { proposals: [] });
  return doc.proposals;
}

export async function saveProposals(userId: string, proposals: CryptoProposal[]): Promise<void> {
  await writeJson(KEYS.proposals(userId), { proposals });
}

export async function upsertProposal(userId: string, proposal: CryptoProposal): Promise<void> {
  const proposals = await listProposals(userId);
  const idx = proposals.findIndex((p) => p.id === proposal.id);
  if (idx >= 0) proposals[idx] = proposal;
  else proposals.unshift(proposal);
  await saveProposals(userId, proposals.slice(0, 200));
}

/** Flip pending proposals past their expiry to `expired`. Returns the fresh list. */
export async function expireStaleProposals(userId: string): Promise<CryptoProposal[]> {
  const proposals = await listProposals(userId);
  const now = Date.now();
  let changed = false;
  for (const p of proposals) {
    if (p.status === 'pending' && new Date(p.expiresAt).getTime() < now) {
      p.status = 'expired';
      p.decidedAt = new Date().toISOString();
      p.decidedBy = 'system';
      changed = true;
    }
  }
  if (changed) await saveProposals(userId, proposals);
  return proposals;
}

// --- Orders ---

export async function listOrders(userId: string): Promise<CryptoOrder[]> {
  const doc = await readJson<{ orders: CryptoOrder[] }>(KEYS.orders(userId), { orders: [] });
  return doc.orders;
}

export async function upsertOrder(userId: string, order: CryptoOrder): Promise<void> {
  const orders = await listOrders(userId);
  const idx = orders.findIndex((o) => o.id === order.id);
  if (idx >= 0) orders[idx] = order;
  else orders.unshift(order);
  await writeJson(KEYS.orders(userId), { orders: orders.slice(0, 500) });
}

// --- Positions ---

export async function listPositions(userId: string): Promise<CryptoPosition[]> {
  const doc = await readJson<{ positions: CryptoPosition[] }>(KEYS.positions(userId), { positions: [] });
  return doc.positions;
}

export async function upsertPosition(userId: string, position: CryptoPosition): Promise<void> {
  const positions = await listPositions(userId);
  const idx = positions.findIndex((p) => p.id === position.id);
  if (idx >= 0) positions[idx] = position;
  else positions.unshift(position);
  await writeJson(KEYS.positions(userId), { positions: positions.slice(0, 300) });
}

export async function openPositions(userId: string): Promise<CryptoPosition[]> {
  return (await listPositions(userId)).filter((p) => p.status === 'open');
}

// --- Agent runs ---

export async function listRuns(userId: string): Promise<CryptoAgentRun[]> {
  const doc = await readJson<{ runs: CryptoAgentRun[] }>(KEYS.runs(userId), { runs: [] });
  return doc.runs;
}

export async function upsertRun(userId: string, run: CryptoAgentRun): Promise<void> {
  const runs = await listRuns(userId);
  const idx = runs.findIndex((r) => r.id === run.id);
  if (idx >= 0) runs[idx] = run;
  else runs.unshift(run);
  await writeJson(KEYS.runs(userId), { runs: runs.slice(0, MAX_RUNS) });
}

// --- Audit log (append-only) ---

export async function listAuditEvents(userId: string): Promise<CryptoAuditEvent[]> {
  const doc = await readJson<{ events: CryptoAuditEvent[] }>(KEYS.audit(userId), { events: [] });
  return doc.events;
}

export async function appendAudit(
  userId: string,
  event: Omit<CryptoAuditEvent, 'id' | 'occurredAt'>,
): Promise<void> {
  try {
    const events = await listAuditEvents(userId);
    events.unshift({ ...event, id: newId('evt'), occurredAt: new Date().toISOString() });
    await writeJson(KEYS.audit(userId), { events: events.slice(0, MAX_AUDIT_EVENTS) });
  } catch (error) {
    // The audit trail must never take down the trade path.
    console.error('crypto audit append failed:', error);
  }
}

// --- Daily risk counters (circuit breaker memory) ---

function utcDay(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function getRiskState(userId: string): Promise<RiskState> {
  const stored = await readJson<RiskState | null>(KEYS.risk(userId), null);
  const today = utcDay();
  if (!stored || stored.date !== today) {
    // New UTC day: counters reset, but a recent loss still enforces its cooldown.
    return {
      date: today,
      realizedPnlUsd: 0,
      tradesToday: 0,
      consecutiveLosses: stored?.consecutiveLosses ?? 0,
      lastLossAt: stored?.lastLossAt,
    };
  }
  return stored;
}

export async function recordRealizedPnl(userId: string, pnlUsd: number): Promise<RiskState> {
  const state = await getRiskState(userId);
  state.realizedPnlUsd += pnlUsd;
  state.tradesToday += 1;
  if (pnlUsd < 0) {
    state.consecutiveLosses += 1;
    state.lastLossAt = new Date().toISOString();
  } else {
    state.consecutiveLosses = 0;
  }
  await writeJson(KEYS.risk(userId), state);
  return state;
}
