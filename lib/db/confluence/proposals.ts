/**
 * Proposal storage for ConfluenceTrading.
 *
 * One JSON blob per user under `confluence:proposals:${userId}`, mirroring the
 * userId-keyed pattern used by active-trades / trading-goals. Proposals are the
 * human gate: the agent only ever writes `pending` ones, and only the approval
 * API flips them to `approved` (which then stages an order elsewhere).
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
    const parsed = JSON.parse(data);
    return (parsed.proposals as Proposal[]) || [];
  } catch (error) {
    console.error('Error getting proposals from Redis:', error);
    return [];
  }
}

export async function getProposalsByStatus(
  userId: string,
  status: ProposalStatus,
): Promise<Proposal[]> {
  const all = await getAllProposals(userId);
  return all.filter((p) => p.status === status);
}

export async function getProposalById(id: string, userId: string): Promise<Proposal | null> {
  const all = await getAllProposals(userId);
  return all.find((p) => p.id === id) || null;
}

/** Create or overwrite a single proposal (matched by id). */
export async function saveProposal(proposal: Proposal, userId: string): Promise<Proposal> {
  const redis = await getRedisClient();
  const existing = await getAllProposals(userId);
  const index = existing.findIndex((p) => p.id === proposal.id);
  const withStamp = { ...proposal, updatedAt: new Date().toISOString() };
  if (index >= 0) {
    existing[index] = withStamp;
  } else {
    existing.push(withStamp);
  }
  await redis.set(proposalsKey(userId), JSON.stringify({ proposals: existing }));
  return withStamp;
}

/**
 * Patch a proposal in place. Never lets an update rewrite identity fields
 * (id/userId/createdAt/source), mirroring updateGoal's guard.
 */
export async function updateProposal(
  id: string,
  updates: Partial<Proposal>,
  userId: string,
): Promise<Proposal | null> {
  const redis = await getRedisClient();
  const existing = await getAllProposals(userId);
  const index = existing.findIndex((p) => p.id === id);
  if (index === -1) return null;
  const current = existing[index];
  existing[index] = {
    ...current,
    ...updates,
    id: current.id,
    userId: current.userId,
    createdAt: current.createdAt,
    source: current.source,
    updatedAt: new Date().toISOString(),
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
