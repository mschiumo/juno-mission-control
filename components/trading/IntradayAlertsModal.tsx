'use client';

import { useEffect, useState } from 'react';
import { X, TrendingUp, TrendingDown, Plus, Check, Volume2, VolumeX, Clock } from 'lucide-react';
import type { IntradayAlert, IntradayAlertSnapshot } from '@/types/intraday-alerts';

interface Props {
  open: boolean;
  onClose: () => void;
  snapshot: IntradayAlertSnapshot | null;
  muted: boolean;
  onToggleMute: () => void;
  onAdded: (ticker: string) => void;
}

const DEFAULT_USER_ID = 'default';

function fmtVolume(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return String(v);
}

function fmtTime(iso: string): string {
  try {
    return (
      new Date(iso).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        timeZone: 'America/New_York',
      }) + ' ET'
    );
  } catch {
    return '';
  }
}

export default function IntradayAlertsModal({ open, onClose, snapshot, muted, onToggleMute, onAdded }: Props) {
  const [adding, setAdding] = useState<Record<string, boolean>>({});
  const [added, setAdded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (open) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const alerts = snapshot?.alerts ?? [];

  const handleAdd = async (alert: IntradayAlert) => {
    setAdding((s) => ({ ...s, [alert.symbol]: true }));
    try {
      const res = await fetch('/api/watchlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item: { ticker: alert.symbol }, userId: DEFAULT_USER_ID }),
      });
      if (res.ok) {
        setAdded((s) => ({ ...s, [alert.symbol]: true }));
        onAdded(alert.symbol);
        window.dispatchEvent(new Event('ct:watchlist-updated'));
      }
    } catch {
      /* swallow — row simply stays addable */
    } finally {
      setAdding((s) => ({ ...s, [alert.symbol]: false }));
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center p-4 sm:p-8 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl bg-[#161b22] border border-[#30363d] rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#30363d] bg-[#0d1117]/50 shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="text-base font-semibold text-white">Intraday Alerts</span>
            <span className="text-xs text-[#8b949e]">
              Top {alerts.length}
              {snapshot?.generatedAt ? ` · ${fmtTime(snapshot.generatedAt)}` : ''}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={onToggleMute}
              title={muted ? 'Unmute alert sound' : 'Mute alert sound'}
              className="p-1.5 hover:bg-[#30363d] rounded-lg transition-colors"
            >
              {muted ? <VolumeX className="w-4 h-4 text-[#8b949e]" /> : <Volume2 className="w-4 h-4 text-[#F97316]" />}
            </button>
            <button onClick={onClose} className="p-1.5 hover:bg-[#30363d] rounded-lg transition-colors">
              <X className="w-4 h-4 text-[#8b949e]" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="overflow-y-auto">
          {alerts.length === 0 ? (
            <div className="px-5 py-12 text-center text-[#8b949e]">
              <Clock className="w-6 h-6 mx-auto mb-2 opacity-50" />
              <p className="text-sm">
                {snapshot?.message ?? 'No alerts yet. The scanner runs every 30 minutes during market hours.'}
              </p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-[#0d1117] text-[#8b949e] text-xs z-10">
                <tr className="border-b border-[#30363d]">
                  <th className="text-left font-medium px-4 py-2.5">Ticker</th>
                  <th className="text-center font-medium px-2 py-2.5">TF</th>
                  <th className="text-right font-medium px-2 py-2.5">Move</th>
                  <th className="text-right font-medium px-2 py-2.5">Price</th>
                  <th className="text-right font-medium px-2 py-2.5">Spread</th>
                  <th className="text-right font-medium px-2 py-2.5">Volume</th>
                  <th className="text-right font-medium px-2 py-2.5">RVOL</th>
                  <th className="text-right font-medium px-2 py-2.5">Score</th>
                  <th className="text-right font-medium px-4 py-2.5">Action</th>
                </tr>
              </thead>
              <tbody>
                {alerts.map((a) => {
                  const isAdded = a.alreadyAdded || added[a.symbol];
                  const up = a.direction === 'up';
                  return (
                    <tr key={a.symbol} className="border-b border-[#30363d] last:border-b-0 hover:bg-[#0d1117]/50">
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-white num">{a.symbol}</span>
                          {a.isNew && (
                            <span className="text-[9px] font-bold uppercase tracking-wide text-[#F97316] bg-[#F97316]/15 border border-[#F97316]/30 px-1.5 py-0.5 rounded">
                              New
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-2 py-2.5 text-center">
                        <span className="text-[10px] font-semibold text-[#8b949e] bg-[#0d1117] border border-[#30363d] px-1.5 py-0.5 rounded">
                          {a.windowLabel}
                        </span>
                      </td>
                      <td className={`px-2 py-2.5 text-right num font-medium ${up ? 'text-green-400' : 'text-red-400'}`}>
                        <span className="inline-flex items-center gap-1 justify-end">
                          {up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                          {up ? '+' : ''}
                          {a.movePercent.toFixed(2)}%
                        </span>
                      </td>
                      <td className="px-2 py-2.5 text-right num text-white">${a.price.toFixed(2)}</td>
                      <td className="px-2 py-2.5 text-right num text-[#8b949e]">
                        {a.spreadPercent != null ? `${a.spreadPercent.toFixed(2)}%` : '—'}
                      </td>
                      <td className="px-2 py-2.5 text-right num text-[#8b949e]">{fmtVolume(a.volume)}</td>
                      <td className="px-2 py-2.5 text-right num text-[#8b949e]">
                        {a.rvol != null ? `${a.rvol.toFixed(1)}×` : '—'}
                      </td>
                      <td className="px-2 py-2.5 text-right num font-semibold text-[#F97316]">{a.score.toFixed(0)}</td>
                      <td className="px-4 py-2.5 text-right">
                        <button
                          onClick={() => !isAdded && handleAdd(a)}
                          disabled={isAdded || adding[a.symbol]}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg transition-colors ${
                            isAdded
                              ? 'text-green-400 bg-green-500/10 border border-green-500/20 cursor-default'
                              : 'text-white bg-[#F97316] hover:bg-[#ea580c]'
                          }`}
                        >
                          {isAdded ? (
                            <>
                              <Check className="w-3 h-3" /> Added
                            </>
                          ) : adding[a.symbol] ? (
                            <span className="animate-spin">⟳</span>
                          ) : (
                            <>
                              <Plus className="w-3 h-3" /> Add
                            </>
                          )}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-[#30363d] bg-[#0d1117]/50 shrink-0">
          <p className="text-[11px] text-[#6e7681]">
            Ranked by move size, relative volume, and spread tightness. <span className="text-[#8b949e]">Add</span> sends the ticker to Daily Favorites.
          </p>
        </div>
      </div>
    </div>
  );
}
