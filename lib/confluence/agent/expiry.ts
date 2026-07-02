/**
 * Proposal expiry — swing proposals grow stale, so a pending proposal past its
 * `expiresAt` is moved to `expired` (terminal) and never executes. Emits the
 * canonical proposal.expired audit event.
 *
 * Run from the agent cron (and could be called on-demand). No LLM involved.
 */

import { getProposalsByStatus, decideProposal } from '@/lib/db/confluence/proposals';
import { appendAudit } from '@/lib/db/confluence/audit';

export async function expireStaleProposals(userId: string): Promise<number> {
  const pending = await getProposalsByStatus(userId, 'pending');
  const now = Date.now();
  let expired = 0;
  for (const p of pending) {
    if (p.expiresAt && new Date(p.expiresAt).getTime() < now) {
      await decideProposal(p.id, userId, { status: 'expired' });
      await appendAudit(userId, {
        actor: 'system',
        actorId: 'system',
        eventType: 'proposal.expired',
        entityType: 'proposal',
        entityId: p.id,
        note: `Proposal for ${p.symbol} expired (stale past ${p.expiresAt})`,
      });
      expired++;
    }
  }
  return expired;
}
