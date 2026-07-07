'use client';

/**
 * Agents → Strategy: what ruleset the agent is running and exactly what it
 * enforces. The breakdown text is generated server-side from the live params,
 * so this panel can never drift from the code. Read-only today — the strategy
 * is selected via CONFLUENCE_STRATEGY; per-strategy toggles land here later.
 */

import { useEffect, useState } from 'react';
import { Target } from 'lucide-react';
import { strategyMeta, type StrategyMeta } from '@/lib/confluence/strategies-meta';

interface StrategyInfo {
  id: string;
  label: string;
  needsTechnicals: boolean;
  active: boolean;
  meta: StrategyMeta | null;
  breakdown?: { title: string; rules: string[] }[];
}

export function StrategyBadge({ id, size = 'sm' }: { id?: string; size?: 'sm' | 'md' }) {
  const meta = strategyMeta(id);
  if (!meta) return null;
  return (
    <span
      className={`rounded font-semibold ${size === 'sm' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-[11px]'}`}
      style={{ background: meta.colorDim, color: meta.color, border: `1px solid ${meta.color}40` }}
      title={`${meta.name} — ${meta.tagline}`}
    >
      {meta.short}
    </span>
  );
}

export default function StrategyPanel() {
  const [strategies, setStrategies] = useState<StrategyInfo[]>([]);
  const [configuredVia, setConfiguredVia] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/confluence/strategy')
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          setStrategies(d.strategies ?? []);
          setConfiguredVia(d.configuredVia ?? '');
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="p-8 text-center" style={{ color: 'var(--text-secondary)' }}>Loading strategy…</div>;
  }

  const active = strategies.find((s) => s.active);
  const others = strategies.filter((s) => !s.active);

  return (
    <div className="flex flex-col gap-4">
      {active && (
        <div className="card" style={{ borderColor: active.meta?.color ?? 'var(--border-default)' }}>
          <div className="flex items-start justify-between gap-3 mb-1">
            <div className="flex items-center gap-2.5">
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background: active.meta?.colorDim ?? 'var(--surface-2)' }}
              >
                <Target className="w-4.5 h-4.5" style={{ color: active.meta?.color ?? 'var(--text-secondary)' }} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {active.meta?.name ?? active.label}
                  </span>
                  <StrategyBadge id={active.id} size="md" />
                  <span
                    className="px-1.5 py-0.5 rounded text-[10px] font-semibold"
                    style={{ background: 'var(--positive-dim)', color: 'var(--positive)' }}
                  >
                    ACTIVE
                  </span>
                </div>
                <p className="text-[12px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                  {active.meta?.tagline}
                </p>
              </div>
            </div>
          </div>
          <p className="text-[11px] mb-4" style={{ color: 'var(--text-secondary)' }}>
            Selected via {configuredVia || 'default'} · rules below are generated from the live strategy parameters —
            what you read here is exactly what the code enforces.
          </p>

          {active.breakdown && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {active.breakdown.map((section) => (
                <div
                  key={section.title}
                  className="rounded-lg p-3.5"
                  style={{ background: 'var(--surface-2)', border: '1px solid var(--border-subtle)' }}
                >
                  <div className="text-[12px] font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                    {section.title}
                  </div>
                  <ul className="flex flex-col gap-1.5">
                    {section.rules.map((rule) => (
                      <li key={rule} className="text-[12px] flex gap-2" style={{ color: 'var(--text-secondary)' }}>
                        <span style={{ color: active.meta?.color ?? 'var(--accent)' }}>›</span>
                        <span>{rule}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {others.length > 0 && (
        <div className="card">
          <div className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
            Registered strategies
          </div>
          <p className="text-[12px] mb-3" style={{ color: 'var(--text-secondary)' }}>
            Per-strategy toggling is planned — today the active strategy is chosen with the
            <code className="mx-1">CONFLUENCE_STRATEGY</code> env var.
          </p>
          <div className="flex flex-col gap-2">
            {others.map((s) => (
              <div
                key={s.id}
                className="flex items-center gap-3 rounded-lg px-3 py-2.5"
                style={{ background: 'var(--surface-2)', border: '1px solid var(--border-subtle)' }}
              >
                <StrategyBadge id={s.id} size="md" />
                <div className="min-w-0">
                  <div className="text-[13px] font-medium" style={{ color: 'var(--text-primary)' }}>
                    {s.meta?.name ?? s.label}
                  </div>
                  <div className="text-[11px] truncate" style={{ color: 'var(--text-secondary)' }}>
                    {s.meta?.tagline ?? s.label}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
