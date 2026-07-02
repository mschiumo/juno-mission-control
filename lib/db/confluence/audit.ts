/**
 * Immutable audit log for ConfluenceTrading.
 *
 * Unlike the JSON-blob domains, the audit trail is stored as a Redis LIST under
 * `confluence:audit:${userId}` and only ever appended to (RPUSH). There is no
 * update or delete path — every proposal → decision → order transition adds one
 * record and none can be rewritten, which is the point of an audit log.
 */

import { getRedisClient } from '@/lib/redis';
import type { AuditEvent } from '@/types/confluence';

function auditKey(userId: string): string {
  return `confluence:audit:${userId}`;
}

/**
 * Append one event. Callers pass everything except id/ts, which are stamped
 * here so the record is authoritative. Best-effort: a failed audit write is
 * logged but never throws, so it cannot itself block or reverse an execution
 * decision (the order of operations always audits *after* the state change).
 */
export async function appendAudit(
  userId: string,
  event: Omit<AuditEvent, 'id' | 'ts' | 'userId'>,
): Promise<void> {
  try {
    const redis = await getRedisClient();
    const record: AuditEvent = {
      ...event,
      id: crypto.randomUUID(),
      userId,
      ts: new Date().toISOString(),
    };
    await redis.rPush(auditKey(userId), JSON.stringify(record));
  } catch (error) {
    console.error('Error appending ConfluenceTrading audit event:', error);
  }
}

/**
 * Read the audit trail, most-recent first. `limit` caps how many of the newest
 * events are returned (default 200).
 */
export async function getAuditLog(userId: string, limit = 200): Promise<AuditEvent[]> {
  try {
    const redis = await getRedisClient();
    // Newest entries are at the tail (RPUSH); grab the last `limit` and reverse.
    const raw = await redis.lRange(auditKey(userId), -limit, -1);
    const events = raw
      .map((s) => {
        try {
          return JSON.parse(s) as AuditEvent;
        } catch {
          return null;
        }
      })
      .filter((e): e is AuditEvent => e !== null);
    return events.reverse();
  } catch (error) {
    console.error('Error reading ConfluenceTrading audit log:', error);
    return [];
  }
}
