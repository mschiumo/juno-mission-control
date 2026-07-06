'use client';

/**
 * Agents → Review: the Performance Review module (Milestone R).
 *
 * Every number shown here was computed server-side by the pure metrics
 * engine over the trades table — the weekly-review agent only narrates.
 * Sections: scorecard dashboard (with manual-vs-agentic comparison), CSV
 * import (+ parse reports), violations scorecard, weekly reviews, risk
 * config.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  BookOpenText,
  FileUp,
  RefreshCw,
  Scale,
  SlidersHorizontal,
  Sparkles,
} from 'lucide-react';
import type {
  ImportBatch,
  ReviewMetrics,
  ReviewOpenPosition,
  RiskConfig,
  RoundTrip,
  RuleViolation,
  WeeklyReview,
} from '@/types/confluence-review';

type Section = 'dashboard' | 'import' | 'violations' | 'weekly' | 'config';

const SECTIONS: { id: Section; label: string; icon: typeof BarChart3 }[] = [
  { id: 'dashboard', label: 'Scorecard', icon: BarChart3 },
  { id: 'import', label: 'Import', icon: FileUp },
  { id: 'violations', label: 'Violations', icon: AlertTriangle },
  { id: 'weekly', label: 'Weekly reviews', icon: BookOpenText },
  { id: 'config', label: 'Risk config', icon: SlidersHorizontal },
];

interface MetricsResponse {
  config: RiskConfig;
  metrics: { all: ReviewMetrics; manual: ReviewMetrics; agentic: ReviewMetrics };
  trades: RoundTrip[];
  openPositions: ReviewOpenPosition[];
  symbolPl: { asOfDate?: string; rows: { symbol: string; plYtd: number }[] };
}

function usd2(n: number | undefined): string {
  if (n == null) return '—';
  return n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
}
function signed(n: number | undefined): string {
  if (n == null) return '—';
  return `${n >= 0 ? '+' : ''}${usd2(n)}`;
}
function pct(n: number | undefined): string {
  return n == null ? '—' : `${(n * 100).toFixed(1)}%`;
}
function num(n: number | undefined, digits = 2): string {
  return n == null ? '—' : n.toFixed(digits);
}
function pnlColor(n: number | undefined): string {
  if (n == null) return 'var(--text-secondary)';
  return n >= 0 ? 'var(--positive)' : 'var(--negative)';
}
const SOURCE_LABEL: Record<string, string> = {
  manual_tos: 'Manual (ToS)',
  agentic_rh: 'Agentic (RH)',
  all: 'Combined',
};

function Kpi({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="card" style={{ padding: '0.9rem 1rem' }}>
      <div className="text-[10px] uppercase tracking-wide mb-1" style={{ color: 'var(--text-tertiary)' }}>{label}</div>
      <div className="text-lg font-semibold tabular-nums" style={{ color: color ?? 'var(--text-primary)' }}>{value}</div>
      {sub && <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{sub}</div>}
    </div>
  );
}

function severityStyle(severity: RuleViolation['severity']): { background: string; color: string } {
  if (severity === 'critical') return { background: 'var(--negative-dim)', color: 'var(--negative)' };
  if (severity === 'warning') return { background: 'var(--warning-dim)', color: 'var(--warning)' };
  return { background: 'var(--surface-3)', color: 'var(--text-secondary)' };
}

export default function ReviewPanel() {
  const [section, setSection] = useState<Section>('dashboard');
  const [data, setData] = useState<MetricsResponse | null>(null);
  const [violations, setViolations] = useState<RuleViolation[]>([]);
  const [batches, setBatches] = useState<ImportBatch[]>([]);
  const [reviews, setReviews] = useState<WeeklyReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<{ kind: 'error' | 'ok'; msg: string } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const [m, v, b, w] = await Promise.all([
        fetch(`/api/confluence/review/metrics?_t=${Date.now()}`).then((r) => r.json()),
        fetch(`/api/confluence/review/violations?_t=${Date.now()}`).then((r) => r.json()),
        fetch(`/api/confluence/review/import?_t=${Date.now()}`).then((r) => r.json()),
        fetch(`/api/confluence/review/weekly?_t=${Date.now()}`).then((r) => r.json()),
      ]);
      if (m.success) setData(m);
      if (v.success) setViolations(v.violations);
      if (b.success) setBatches(b.batches);
      if (w.success) setReviews(w.reviews);
    } catch (e) {
      console.error('Failed to load review data:', e);
    } finally {
      setBusy(false);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const importFile = useCallback(
    async (file: File) => {
      setBusy(true);
      setBanner(null);
      try {
        const csv = await file.text();
        const res = await fetch('/api/confluence/review/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ csv, fileName: file.name }),
        }).then((r) => r.json());
        if (res.success) {
          setBanner({
            kind: 'ok',
            msg: `Imported ${res.batch.rowCounts.fills} fills → ${res.roundTrips} round trips, ${res.violations} violation(s).`,
          });
          await load();
        } else {
          setBanner({ kind: 'error', msg: res.error ?? 'Import failed.' });
          await load(); // rejected batches still show in the report list
        }
      } catch (e) {
        setBanner({ kind: 'error', msg: `Import failed: ${String(e)}` });
      } finally {
        setBusy(false);
      }
    },
    [load],
  );

  const syncAgentic = useCallback(async () => {
    setBusy(true);
    setBanner(null);
    try {
      const res = await fetch('/api/confluence/review/sync-agentic', { method: 'POST' }).then((r) => r.json());
      if (res.success) {
        setBanner({ kind: 'ok', msg: `Synced ${res.added} agentic fill(s) → ${res.roundTrips} round trips.` });
        await load();
      } else {
        setBanner({ kind: 'error', msg: res.error ?? 'Sync failed.' });
      }
    } finally {
      setBusy(false);
    }
  }, [load]);

  const runWeekly = useCallback(async () => {
    setBusy(true);
    setBanner(null);
    try {
      const res = await fetch('/api/confluence/review/weekly', { method: 'POST' }).then((r) => r.json());
      if (res.success) {
        setBanner({ kind: 'ok', msg: `Weekly review written for week of ${res.review.weekStart}.` });
        await load();
      } else {
        setBanner({ kind: 'error', msg: res.error ?? 'Weekly review failed.' });
      }
    } finally {
      setBusy(false);
    }
  }, [load]);

  if (loading) {
    return <div className="p-8 text-center" style={{ color: 'var(--text-tertiary)' }}>Loading review…</div>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-1.5 flex-wrap">
          {SECTIONS.map((s) => {
            const active = section === s.id;
            const Icon = s.icon;
            return (
              <button
                key={s.id}
                onClick={() => setSection(s.id)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] font-medium"
                style={{
                  background: active ? 'var(--surface-3)' : 'transparent',
                  color: active ? 'var(--text-primary)' : 'var(--text-tertiary)',
                  border: '1px solid',
                  borderColor: active ? 'var(--border-default)' : 'transparent',
                }}
              >
                <Icon className="w-3.5 h-3.5" /> {s.label}
              </button>
            );
          })}
        </div>
        <button className="btn-ghost flex items-center gap-1.5 px-2.5 py-1.5 text-xs disabled:opacity-50" onClick={load} disabled={busy}>
          <RefreshCw className={`w-3.5 h-3.5 ${busy ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {banner && (
        <div
          className="rounded-lg px-3 py-2 text-[12px]"
          style={{
            background: banner.kind === 'ok' ? 'var(--positive-dim)' : 'var(--negative-dim)',
            color: banner.kind === 'ok' ? 'var(--positive)' : 'var(--negative)',
          }}
        >
          {banner.msg}
        </div>
      )}

      {section === 'dashboard' && data && <Dashboard data={data} onSyncAgentic={syncAgentic} busy={busy} />}
      {section === 'import' && (
        <ImportSection batches={batches} busy={busy} fileInput={fileInput} onFile={importFile} />
      )}
      {section === 'violations' && <ViolationsSection violations={violations} />}
      {section === 'weekly' && <WeeklySection reviews={reviews} busy={busy} onRun={runWeekly} />}
      {section === 'config' && data && <ConfigSection config={data.config} busy={busy} onSaved={load} setBanner={setBanner} />}
    </div>
  );
}

// ---- Scorecard dashboard + comparison ---------------------------------------

function MetricsColumn({ m }: { m: ReviewMetrics }) {
  return (
    <div className="flex flex-col gap-2 text-[12px]" style={{ color: 'var(--text-secondary)' }}>
      <div className="text-[11px] uppercase tracking-wide font-semibold" style={{ color: 'var(--text-tertiary)' }}>
        {SOURCE_LABEL[m.source]}
      </div>
      {m.trades === 0 ? (
        <div style={{ color: 'var(--text-tertiary)' }}>No round trips.</div>
      ) : (
        <>
          <Row k="Round trips" v={`${m.trades} (${m.wins}W / ${m.losses}L${m.scratches ? ` / ${m.scratches} scratch` : ''})`} />
          <Row k="Win rate" v={pct(m.winRate)} />
          <Row k="Payoff ratio" v={num(m.payoffRatio)} />
          <Row k="Expectancy / trade" v={signed(m.expectancy)} color={pnlColor(m.expectancy)} />
          <Row k="Net P/L" v={signed(m.netPl)} color={pnlColor(m.netPl)} />
          <Row k="Gross / fees" v={`${signed(m.grossPl)} / ${usd2(m.fees)}`} />
          <Row k="Fee drag" v={m.feeDragPct != null ? pct(m.feeDragPct) : '—'} />
          <Row k="Largest loss (R)" v={`${num(m.largestLossR)}R`} color={pnlColor(m.largestLossR)} />
          <Row k="Tail losses" v={`${m.tailLosses.length}`} color={m.tailLosses.length ? 'var(--negative)' : undefined} />
          <Row k="Churn events" v={`${m.churnEvents.length}`} color={m.churnEvents.length ? 'var(--warning)' : undefined} />
          <Row k="Breadth / sessions" v={`${m.breadth} symbols / ${m.sessions}`} />
        </>
      )}
    </div>
  );
}

function Row({ k, v, color }: { k: string; v: string; color?: string }) {
  return (
    <div className="flex items-center justify-between gap-3" style={{ borderBottom: '1px solid var(--border-subtle)', paddingBottom: 4 }}>
      <span style={{ color: 'var(--text-tertiary)' }}>{k}</span>
      <span className="tabular-nums font-medium" style={{ color: color ?? 'var(--text-secondary)' }}>{v}</span>
    </div>
  );
}

function Dashboard({ data, onSyncAgentic, busy }: { data: MetricsResponse; onSyncAgentic: () => void; busy: boolean }) {
  const { metrics, trades, openPositions, symbolPl } = data;
  const all = metrics.all;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Win rate" value={pct(all.winRate)} sub={`${all.wins}W / ${all.losses}L of ${all.trades}`} />
        <Kpi label="Payoff ratio" value={num(all.payoffRatio)} sub={`avg win ${usd2(all.avgWin)} / avg loss ${usd2(all.avgLoss)}`} />
        <Kpi label="Expectancy" value={signed(all.expectancy)} color={pnlColor(all.expectancy)} sub="per round trip" />
        <Kpi label="Net P/L" value={signed(all.netPl)} color={pnlColor(all.netPl)} sub={`gross ${signed(all.grossPl)} − fees ${usd2(all.fees)}`} />
      </div>

      {/* R distribution */}
      <div className="card">
        <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>R-multiple distribution</h3>
        <div className="flex items-end gap-2" style={{ height: 90 }}>
          {all.rDistribution.map((b) => {
            const max = Math.max(1, ...all.rDistribution.map((x) => x.count));
            const negative = b.bucket.includes('-') || b.bucket.startsWith('<');
            return (
              <div key={b.bucket} className="flex flex-col items-center gap-1 flex-1 min-w-0">
                <div className="text-[10px] tabular-nums" style={{ color: 'var(--text-tertiary)' }}>{b.count || ''}</div>
                <div
                  className="w-full rounded-t"
                  style={{
                    height: `${(b.count / max) * 56}px`,
                    minHeight: b.count > 0 ? 4 : 1,
                    background: b.count === 0 ? 'var(--surface-3)' : negative ? 'var(--negative)' : 'var(--positive)',
                    opacity: b.count === 0 ? 0.4 : 0.85,
                  }}
                />
                <div className="text-[9px] whitespace-nowrap" style={{ color: 'var(--text-tertiary)' }}>{b.bucket}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Manual vs agentic comparison */}
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Scale className="w-4 h-4" style={{ color: 'var(--accent-light)' }} />
            <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Manual vs. agentic — same scorecard</h3>
          </div>
          <button className="btn-ghost px-2.5 py-1.5 text-xs disabled:opacity-50" onClick={onSyncAgentic} disabled={busy}>
            Sync agentic fills
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <MetricsColumn m={metrics.manual} />
          <MetricsColumn m={metrics.agentic} />
        </div>
      </div>

      {/* Per-symbol table */}
      <div className="card">
        <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Per-symbol (all sources)</h3>
        {all.perSymbol.length === 0 ? (
          <p className="text-[13px] py-4 text-center" style={{ color: 'var(--text-tertiary)' }}>
            Import a statement or sync agentic fills to build the scorecard.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]" style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ color: 'var(--text-tertiary)' }} className="text-left">
                  <th className="py-2 pr-3 font-medium">Symbol</th>
                  <th className="py-2 pr-3 font-medium">Trips</th>
                  <th className="py-2 pr-3 font-medium">W / L</th>
                  <th className="py-2 pr-3 font-medium">Net P/L</th>
                  <th className="py-2 pr-3 font-medium">Fees</th>
                  <th className="py-2 pr-3 font-medium">Sessions</th>
                  <th className="py-2 font-medium">Max churn</th>
                </tr>
              </thead>
              <tbody>
                {all.perSymbol.map((s) => (
                  <tr key={s.symbol} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                    <td className="py-2 pr-3 font-semibold" style={{ color: 'var(--text-primary)' }}>{s.symbol}</td>
                    <td className="py-2 pr-3 tabular-nums" style={{ color: 'var(--text-secondary)' }}>{s.trades}</td>
                    <td className="py-2 pr-3 tabular-nums" style={{ color: 'var(--text-secondary)' }}>{s.wins} / {s.losses}</td>
                    <td className="py-2 pr-3 tabular-nums" style={{ color: pnlColor(s.netPl) }}>{signed(s.netPl)}</td>
                    <td className="py-2 pr-3 tabular-nums" style={{ color: 'var(--text-secondary)' }}>{usd2(s.fees)}</td>
                    <td className="py-2 pr-3 tabular-nums" style={{ color: 'var(--text-secondary)' }}>{s.sessions}</td>
                    <td className="py-2 tabular-nums" style={{ color: s.maxSessionChurn > 2 ? 'var(--warning)' : 'var(--text-secondary)' }}>{s.maxSessionChurn}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Recent round trips */}
      <div className="card">
        <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
          Round trips{openPositions.length > 0 ? ` · ${openPositions.length} open position(s) excluded` : ''}
        </h3>
        {trades.length === 0 ? (
          <p className="text-[13px] py-4 text-center" style={{ color: 'var(--text-tertiary)' }}>No paired trades yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]" style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ color: 'var(--text-tertiary)' }} className="text-left">
                  <th className="py-2 pr-3 font-medium">Closed</th>
                  <th className="py-2 pr-3 font-medium">Source</th>
                  <th className="py-2 pr-3 font-medium">Symbol</th>
                  <th className="py-2 pr-3 font-medium">Dir</th>
                  <th className="py-2 pr-3 font-medium">Qty</th>
                  <th className="py-2 pr-3 font-medium">Entry → exit</th>
                  <th className="py-2 pr-3 font-medium">Net P/L</th>
                  <th className="py-2 font-medium">R</th>
                </tr>
              </thead>
              <tbody>
                {trades.slice(0, 50).map((t) => (
                  <tr key={t.id} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                    <td className="py-2 pr-3 tabular-nums" style={{ color: 'var(--text-secondary)' }}>{t.etDate}</td>
                    <td className="py-2 pr-3" style={{ color: 'var(--text-tertiary)' }}>{t.source === 'manual_tos' ? 'ToS' : 'RH'}</td>
                    <td className="py-2 pr-3 font-semibold" style={{ color: 'var(--text-primary)' }}>{t.symbol}</td>
                    <td className="py-2 pr-3 uppercase" style={{ color: t.direction === 'long' ? 'var(--positive)' : 'var(--negative)' }}>{t.direction}</td>
                    <td className="py-2 pr-3 tabular-nums" style={{ color: 'var(--text-secondary)' }}>{t.qty}</td>
                    <td className="py-2 pr-3 tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                      {t.avgEntry.toFixed(4)} → {t.avgExit.toFixed(4)}
                    </td>
                    <td className="py-2 pr-3 tabular-nums" style={{ color: pnlColor(t.netPl) }}>{signed(t.netPl)}</td>
                    <td className="py-2 tabular-nums" style={{ color: pnlColor(t.rMultiple) }}>{t.rMultiple != null ? `${t.rMultiple.toFixed(2)}R` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {symbolPl.asOfDate && (
        <div className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
          Statement P/L YTD context imported as of {symbolPl.asOfDate}: {symbolPl.rows.length} symbols, total{' '}
          {signed(symbolPl.rows.reduce((s, r) => s + r.plYtd, 0))}.
        </div>
      )}
    </div>
  );
}

// ---- Import -------------------------------------------------------------------

function ImportSection({
  batches,
  busy,
  fileInput,
  onFile,
}: {
  batches: ImportBatch[];
  busy: boolean;
  fileInput: React.RefObject<HTMLInputElement | null>;
  onFile: (f: File) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="card">
        <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Import a ThinkOrSwim Account Statement</h3>
        <p className="text-[12px] mb-3" style={{ color: 'var(--text-tertiary)' }}>
          ThinkOrSwim → Monitor → Account Statement → export CSV. Re-importing the same file is a no-op (hash dedupe);
          a parse failure rejects the whole file — no partial imports.
        </p>
        <input
          ref={fileInput}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
            e.target.value = '';
          }}
        />
        <button
          className="btn-primary inline-flex items-center gap-1.5 px-3 py-2 text-xs disabled:opacity-50"
          onClick={() => fileInput.current?.click()}
          disabled={busy}
        >
          <FileUp className="w-3.5 h-3.5" /> Choose statement CSV…
        </button>
      </div>

      <div className="card">
        <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Import history</h3>
        {batches.length === 0 ? (
          <p className="text-[13px] py-4 text-center" style={{ color: 'var(--text-tertiary)' }}>No imports yet.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {batches.map((b) => (
              <div key={b.id} className="rounded-lg px-3 py-2 text-[12px]" style={{ background: 'var(--surface-2)', border: '1px solid var(--border-subtle)' }}>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
                    {b.fileName ?? b.fileHash.slice(0, 12)}
                  </span>
                  <span
                    className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase"
                    style={b.status === 'imported' ? { background: 'var(--positive-dim)', color: 'var(--positive)' } : { background: 'var(--negative-dim)', color: 'var(--negative)' }}
                  >
                    {b.status}
                  </span>
                </div>
                <div className="mt-1" style={{ color: 'var(--text-tertiary)' }}>
                  {b.status === 'imported'
                    ? `${b.rowCounts.fills} fills (${b.rowCounts.duplicates} dup) · ${b.rowCounts.orderHistoryRows} order rows · ${b.rowCounts.plRows} P/L symbols · sessions ${b.sessionDates.join(', ') || '—'}`
                    : b.error}
                </div>
                {b.warnings.length > 0 && (
                  <ul className="mt-1 list-disc pl-4" style={{ color: 'var(--warning)' }}>
                    {b.warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---- Violations -----------------------------------------------------------------

function ViolationsSection({ violations }: { violations: RuleViolation[] }) {
  return (
    <div className="card">
      <h3 className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Rule violations</h3>
      <p className="text-[12px] mb-3" style={{ color: 'var(--text-tertiary)' }}>
        Manual-account violations are observed after import (nothing is blocked — those trades happen outside the
        system). The same rules are enforced pre-trade on the agentic account.
      </p>
      {violations.length === 0 ? (
        <p className="text-[13px] py-4 text-center" style={{ color: 'var(--text-tertiary)' }}>No violations recorded. Clean sheet.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {violations.map((v) => (
            <div key={v.id} className="rounded-lg px-3 py-2 text-[12px]" style={{ background: 'var(--surface-2)', border: '1px solid var(--border-subtle)' }}>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase" style={severityStyle(v.severity)}>
                  {v.severity}
                </span>
                <span className="font-mono text-[11px]" style={{ color: 'var(--text-tertiary)' }}>{v.rule}</span>
                <span style={{ color: 'var(--text-tertiary)' }}>{v.source === 'manual_tos' ? 'Manual (ToS)' : 'Agentic (RH)'}</span>
                {v.etDate && <span className="tabular-nums" style={{ color: 'var(--text-tertiary)' }}>{v.etDate}</span>}
              </div>
              <div className="mt-1" style={{ color: 'var(--text-secondary)' }}>{v.detail}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---- Weekly reviews -----------------------------------------------------------------

function WeeklySection({ reviews, busy, onRun }: { reviews: WeeklyReview[]; busy: boolean; onRun: () => void }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-[12px]" style={{ color: 'var(--text-tertiary)' }}>
          Written every Saturday by the review agent — it narrates numbers the metrics engine computed; it never does
          its own arithmetic and has no tools.
        </p>
        <button className="btn-ghost inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs disabled:opacity-50" onClick={onRun} disabled={busy}>
          <Sparkles className="w-3.5 h-3.5" /> Run now
        </button>
      </div>
      {reviews.length === 0 ? (
        <div className="card text-center py-10" style={{ color: 'var(--text-tertiary)' }}>No weekly reviews yet.</div>
      ) : (
        reviews.map((r) => {
          const m = r.metrics;
          const tracked = (mm?: ReviewMetrics) =>
            mm ? `${pct(mm.winRate)} win · ${num(mm.payoffRatio)} payoff · ${num(mm.largestLossR)}R worst` : 'no trades';
          return (
            <div key={r.weekStart} className="card">
              <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
                <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Week of {r.weekStart}</h3>
                <span className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
                  {m.violationsThisWeek} violation(s){r.model ? ` · ${r.model}` : ''}
                </span>
              </div>
              <div className="text-[11px] mb-3 flex flex-col gap-0.5" style={{ color: 'var(--text-tertiary)' }}>
                <span>Manual: {tracked(m.manual)}</span>
                <span>Agentic: {tracked(m.agentic)}</span>
              </div>
              <p className="text-[13px] whitespace-pre-wrap leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{r.narrative}</p>
            </div>
          );
        })
      )}
    </div>
  );
}

// ---- Risk config -----------------------------------------------------------------

const CONFIG_FIELDS: { key: keyof RiskConfig; label: string; hint: string; step?: string }[] = [
  { key: 'riskUnitUsd', label: 'Risk unit ($)', hint: '1R — the observed modal stop-out size' },
  { key: 'maxRMultiple', label: 'Max R multiple', hint: 'losses beyond maxR × risk unit are tail losses; agentic stops must fit inside it', step: '0.1' },
  { key: 'churnThreshold', label: 'Churn threshold', hint: 'max round trips per symbol per session' },
  { key: 'probationWindowSessions', label: 'Probation window (sessions)', hint: 'trailing sessions a symbol must prove itself over' },
  { key: 'breadthCap', label: 'Breadth cap', hint: 'max distinct symbols in play' },
];

function ConfigSection({
  config,
  busy,
  onSaved,
  setBanner,
}: {
  config: RiskConfig;
  busy: boolean;
  onSaved: () => Promise<void>;
  setBanner: (b: { kind: 'error' | 'ok'; msg: string } | null) => void;
}) {
  const [draft, setDraft] = useState<Record<string, string>>(
    Object.fromEntries(CONFIG_FIELDS.map((f) => [f.key, String(config[f.key])])),
  );
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    setBanner(null);
    try {
      const body: Record<string, number> = {};
      for (const f of CONFIG_FIELDS) {
        const v = parseFloat(draft[f.key]);
        if (!Number.isFinite(v) || v <= 0) {
          setBanner({ kind: 'error', msg: `${f.label} must be a positive number.` });
          setSaving(false);
          return;
        }
        body[f.key] = v;
      }
      const res = await fetch('/api/confluence/review/risk-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then((r) => r.json());
      if (res.success) {
        setBanner({ kind: 'ok', msg: 'Risk config saved (appended to history); R-multiples and violations recomputed.' });
        await onSaved();
      } else {
        setBanner({ kind: 'error', msg: res.error ?? 'Save failed.' });
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card">
      <h3 className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Risk framework</h3>
      <p className="text-[12px] mb-4" style={{ color: 'var(--text-tertiary)' }}>
        Read by both rules paths: enforced pre-trade on the agentic account, observed post-import on the manual one.
        Changes append to history — rows are never updated.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {CONFIG_FIELDS.map((f) => (
          <label key={f.key} className="flex flex-col gap-1 text-[12px]">
            <span className="font-medium" style={{ color: 'var(--text-secondary)' }}>{f.label}</span>
            <input
              type="number"
              step={f.step ?? '1'}
              min="0"
              value={draft[f.key]}
              onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
              className="input px-2.5 py-1.5 rounded-lg text-[13px] tabular-nums"
              style={{ background: 'var(--surface-2)', border: '1px solid var(--border-default)', color: 'var(--text-primary)' }}
            />
            <span style={{ color: 'var(--text-tertiary)' }}>{f.hint}</span>
          </label>
        ))}
      </div>
      <div className="mt-4">
        <button className="btn-primary px-3 py-2 text-xs disabled:opacity-50" onClick={save} disabled={busy || saving}>
          {saving ? 'Saving…' : 'Save config'}
        </button>
      </div>
    </div>
  );
}
