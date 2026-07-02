/**
 * agent_runs — observability for each scheduled agent scan.
 *
 * Stored as a capped JSON-blob list per user under `confluence:agent-runs:${userId}`.
 * The analysis agent (Milestone 2) opens a run, writes its proposals with the
 * run_id, then closes the run with counts/status. Milestone 1 doesn't produce
 * runs, but the module exists so proposals can reference a run and the schema is
 * fully represented.
 */

import { getRedisClient } from '@/lib/redis';
import type { AgentRun } from '@/types/confluence';

const MAX_RUNS = 200;

function runsKey(userId: string): string {
  return `confluence:agent-runs:${userId}`;
}

export async function getAllRuns(userId: string): Promise<AgentRun[]> {
  try {
    const redis = await getRedisClient();
    const data = await redis.get(runsKey(userId));
    if (!data) return [];
    return (JSON.parse(data).runs as AgentRun[]) || [];
  } catch (error) {
    console.error('Error getting agent runs from Redis:', error);
    return [];
  }
}

export async function getRunById(id: string, userId: string): Promise<AgentRun | null> {
  const all = await getAllRuns(userId);
  return all.find((r) => r.id === id) || null;
}

export async function saveRun(run: AgentRun, userId: string): Promise<AgentRun> {
  const redis = await getRedisClient();
  const existing = await getAllRuns(userId);
  const index = existing.findIndex((r) => r.id === run.id);
  if (index >= 0) {
    existing[index] = run;
  } else {
    existing.unshift(run); // newest first
  }
  const capped = existing.slice(0, MAX_RUNS);
  await redis.set(runsKey(userId), JSON.stringify({ runs: capped }));
  return run;
}
