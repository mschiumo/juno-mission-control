/**
 * Universe resolution — one place that decides which symbols the agent screens.
 *
 * CONFLUENCE_UNIVERSE_SOURCE:
 *   'env' (default) — the CONFLUENCE_UNIVERSE list, exactly as before.
 *   'massive'       — the Redis-cached dynamic universe built from the whole
 *                     US market (see ./massive). If the cache is empty it is
 *                     built inline once; if Massive is unreachable the env
 *                     list is used and the fallback is reported in `source`
 *                     so run metadata never hides what was actually screened.
 */

import { getAgentUniverse } from '@/lib/confluence/agent/universe';
import { readUniverseCache, refreshMassiveUniverse } from './massive';

export type UniverseSource = 'env' | 'massive' | 'env-fallback';

export interface ResolvedUniverse {
  symbols: string[];
  source: UniverseSource;
  /** When the massive cache was built (absent for env). */
  builtAt?: string;
  /** Why the fallback engaged (env-fallback only). */
  fallbackReason?: string;
}

function configuredSource(): 'env' | 'massive' {
  return (process.env.CONFLUENCE_UNIVERSE_SOURCE || 'env').toLowerCase() === 'massive' ? 'massive' : 'env';
}

export async function resolveUniverse(): Promise<ResolvedUniverse> {
  if (configuredSource() === 'env') {
    return { symbols: getAgentUniverse(), source: 'env' };
  }

  const cached = await readUniverseCache();
  if (cached) {
    return { symbols: cached.symbols, source: 'massive', builtAt: cached.builtAt };
  }

  // Cold cache: build once inline (first run after enabling, or Redis flush).
  try {
    const fresh = await refreshMassiveUniverse();
    return { symbols: fresh.symbols, source: 'massive', builtAt: fresh.builtAt };
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'Unknown universe error';
    return { symbols: getAgentUniverse(), source: 'env-fallback', fallbackReason: reason };
  }
}

export { refreshMassiveUniverse, readUniverseCache } from './massive';
export type { UniverseCache, UniverseStats } from './massive';
