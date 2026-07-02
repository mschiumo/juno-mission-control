/**
 * proposals storage — an IMMUTABLE snapshot of the agent's suggestion.
 *
 * One JSON blob per user under `confluence:proposals:${userId}`. The agent (and
 * the manual/seed path) create `pending` proposals; the only mutation after
 * creation is the decision (status + decidedAt/decidedBy). Edited order
 * parameters are NOT written back here — they live on the order row and the diff
 * is captured in the audit log.
 */

import { getRedisClient } from '@/lib/redis';
import type { Proposal, ProposalStatus } from '@/types/confluence';

function proposalsKey(userId: string): string {
  return `confluence:proposals:${userId}`;
}

export async function getAllProposals(userId: string): Promise<Proposal[]> {
  try {
    const redis = await getRedisClient();
    const data = await redis.get(proposalsKey(userId));
    if (!data) return [];
    return (JSON.parse(data).proposals as Proposal[]) || [];
  } catch (error) {
    console.error('Error getting proposals from Redis:', error);
    return [];
  }
}

export async function getProposalsByStatus(userId: string, status: ProposalStatus): Promise<Proposal[]> {
  const all = await getAllProposals(userId);
  return all.filter((p) => p.status === status);
}

export async function getProposalById(id: string, userId: string): Promise<Proposal | null> {
  const all = await getAllProposals(userId);
  return all.find((p) => p.id === id) || null;
}

/** Create a proposal (or overwrite by id — used only at creation time). */
export async function saveProposal(proposal: Proposal, userId: string): Promise<Proposal> {
  const redis = await getRedisClient();
  const existing = await getAllProposals(userId);
  const index = existing.findIndex((p) => p.id === proposal.id);
  if (index >= 0) {
    existing[index] = proposal;
  } else {
    existing.push(proposal);
  }
  await redis.set(proposalsKey(userId), JSON.stringify({ proposals: existing }));
  return proposal;
}

/**
 * Record a decision on a proposal. This is the ONLY post-creation mutation:
 * it changes status and (for approve/reject) stamps decidedAt/decidedBy. The
 * agent's suggested_* fields are never touched — they remain the immutable
 * snapshot of what was proposed.
 */
export async function decideProposal(
  id: string,
  userId: string,
  next: { status: ProposalStatus; decidedBy?: string; decidedAt?: string },
): Promise<Proposal | null> {
  const redis = await getRedisClient();
  const existing = await getAllProposals(userId);
  const index = existing.findIndex((p) => p.id === id);
  if (index === -1) return null;
  existing[index] = {
    ...existing[index],
    status: next.status,
    decidedAt: next.decidedAt ?? existing[index].decidedAt,
    decidedBy: next.decidedBy ?? existing[index].decidedBy,
  };
  await redis.set(proposalsKey(userId), JSON.stringify({ proposals: existing }));
  return existing[index];
}

export async function deleteProposal(id: string, userId: string): Promise<boolean> {
  const redis = await getRedisClient();
  const existing = await getAllProposals(userId);
  const filtered = existing.filter((p) => p.id !== id);
  if (filtered.length === existing.length) return false;
  await redis.set(proposalsKey(userId), JSON.stringify({ proposals: filtered }));
  return true;
}
