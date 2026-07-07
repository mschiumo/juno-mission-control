import { describe, expect, it } from 'vitest';
import { listStrategies } from '@/lib/confluence/agent/strategies';
import { STRATEGY_META, strategyMeta } from '@/lib/confluence/strategies-meta';

describe('strategy display identity', () => {
  it('every registered strategy has display meta (badge, name, unique color)', () => {
    const colors = new Set<string>();
    const shorts = new Set<string>();
    for (const s of listStrategies()) {
      const meta = STRATEGY_META[s.id];
      expect(meta, `missing STRATEGY_META for '${s.id}'`).toBeDefined();
      expect(meta.short.length).toBeGreaterThan(0);
      expect(colors.has(meta.color), `duplicate color for '${s.id}'`).toBe(false);
      expect(shorts.has(meta.short), `duplicate badge label for '${s.id}'`).toBe(false);
      colors.add(meta.color);
      shorts.add(meta.short);
    }
  });

  it('unknown/untagged proposals degrade gracefully', () => {
    expect(strategyMeta(undefined)).toBeNull();
    expect(strategyMeta('never-registered')?.short).toBe('?');
  });
});
