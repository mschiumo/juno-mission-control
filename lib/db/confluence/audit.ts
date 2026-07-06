/**
 * audit_log — append-only, immutable trail for ConfluenceTrading.
 *
 * Stored as a Redis LIST under `confluence:audit:${userId}` and only ever
 * appended to (RPUSH). There is no update or delete path — mirroring the
 * canonical schema's block_audit_mutation triggers. Every proposal → decision →
 * order transition adds one record, with before/after state for changes.
 */

import { getRedisClient } from '@/lib/redis';
import type { AuditEvent } from '@/types/confluence';

function auditKey(userId: string): string {
  return `confluence:audit:${userId}`;
}

/**
 * Append one event. id/occurredAt are stamped here so the record is
 * authoritative. Best-effort: a failed audit write is logged but never throws,
 * so it cannot itself block or reverse an execution decision (the order of
 * operations always audits *after* the state change).
 */
export async function appendAudit(
  userId: string,
  event: Omit<AuditEvent, 'id' | 'occurredAt'>,
): Promise<void> {
  try {
    const redis = await getRedisClient();
    const record: AuditEvent = {
      ...event,
      id: crypto.randomUUID(),
      occurredAt: new Date().toISOString(),
    };
    await redis.rPush(auditKey(userId), JSON.stringify(record));
  } catch (error) {
    console.error('Error appending ConfluenceTrading audit event:', error);
  }
}

/** Read the audit trail, most-recent first. `limit` caps the newest N (default 200). */
export async function getAuditLog(userId: string, limit = 200): Promise<AuditEvent[]> {
  try {
    const redis = await getRedisClient();
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
