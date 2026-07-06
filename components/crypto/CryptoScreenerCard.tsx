'use client';

import { useCallback, useEffect, useState } from 'react';
import { Flame, RefreshCw, Shield, ShieldAlert, ExternalLink } from 'lucide-react';
import type { ScreenerResult } from '@/types/crypto-trader';
import { CHAIN_LABELS, fmtAge, fmtPct, fmtPrice, fmtUsd, pctColor } from './format';

type ChainFilter = 'all' | 'solana' | 'ethereum' | 'base';

/**
 * Crypto momentum screener — DEX Screener discovery, code-computed momentum
 * score, RugCheck/GoPlus safety verdicts. The same snapshot feeds the agent.
 */
export default function CryptoScreenerCard() {
  const [results, setResults] = useState<ScreenerResult[]>([]);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chain, setChain] = useState<ChainFilter>('all');
  const [safeOnly, setSafeOnly] = useState(false);

  const load = useCallback(
    async (refresh = false) => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ chain });
        if (safeOnly) params.set('safeOnly', '1');
        if (refresh) params.set('refresh', '1');
        const res = await fetch(`/api/crypto/screener?${params}`);
        const data = await res.json();
        if (!data.success) throw new Error(data.error || 'Screener failed');
        setResults(data.results);
        setGeneratedAt(data.generatedAt);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load screener');
      } finally {
        setLoading(false);
      }
    },
    [chain, safeOnly],
  );

  useEffect(() => {
    load();
  }, [load]);

  const chains: { id: ChainFilter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'solana', label: 'Solana' },
    { id: 'ethereum', label: 'Ethereum' },
    { id: 'base', label: 'Base' },
  ];

  return (
    <div className="bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-[#30363d] flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-[#F97316]/10 rounded-lg">
            <Flame className="w-4 h-4 text-[#F97316]" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">Crypto Momentum Screener</h3>
            <p className="text-xs text-[#8b949e]">
              {generatedAt ? `Snapshot ${new Date(generatedAt).toLocaleTimeString()}` : 'DEX Screener + RugCheck/GoPlus'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {chains.map((c) => (
            <button
              key={c.id}
              onClick={() => setChain(c.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                chain === c.id ? 'bg-[#F97316] text-white' : 'bg-[#0d1117] text-[#8b949e] hover:text-white'
              }`}
            >
              {c.label}
            </button>
          ))}
          <button
            onClick={() => setSafeOnly(!safeOnly)}
            title="Hide tokens with hard safety failures"
            className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1 transition-all ${
              safeOnly ? 'bg-[#3fb950]/20 text-[#3fb950]' : 'bg-[#0d1117] text-[#8b949e] hover:text-white'
            }`}
          >
            <Shield className="w-3 h-3" />
            Safe only
          </button>
          <button
            onClick={() => load(true)}
            disabled={loading}
            className="p-2 hover:bg-[#30363d] rounded-lg transition-colors disabled:opacity-50"
            title="Force refresh"
          >
            <RefreshCw className={`w-4 h-4 text-[#8b949e] ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="overflow-x-auto">
        {error && <div className="p-4 text-sm text-[#f85149]">{error}</div>}
        {!error && loading && results.length === 0 && (
          <div className="p-8 text-center text-sm text-[#8b949e]">Scanning pairs…</div>
        )}
        {!error && !loading && results.length === 0 && (
          <div className="p-8 text-center text-sm text-[#8b949e]">No tokens matched the filters.</div>
        )}
        {results.length > 0 && (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[#8b949e] border-b border-[#30363d]">
                <th className="text-left px-4 py-2 font-medium">Token</th>
                <th className="text-right px-3 py-2 font-medium">Price</th>
                <th className="text-right px-3 py-2 font-medium">1h</th>
                <th className="text-right px-3 py-2 font-medium">24h</th>
                <th className="text-right px-3 py-2 font-medium">Vol 24h</th>
                <th className="text-right px-3 py-2 font-medium">Liquidity</th>
                <th className="text-right px-3 py-2 font-medium">MCap</th>
                <th className="text-right px-3 py-2 font-medium">Age</th>
                <th className="text-right px-3 py-2 font-medium">Momentum</th>
                <th className="text-right px-4 py-2 font-medium">Safety</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r) => (
                <tr key={`${r.token.chainId}:${r.token.tokenAddress}`} className="border-b border-[#21262d] hover:bg-[#0d1117]/60">
                  <td className="px-4 py-2.5">
                    <a
                      href={r.token.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 group"
                    >
                      <span className="px-1.5 py-0.5 rounded bg-[#0d1117] text-[#8b949e] text-[10px] font-mono">
                        {CHAIN_LABELS[r.token.chainId] ?? r.token.chainId}
                      </span>
                      <span className="font-semibold text-white group-hover:text-[#F97316] transition-colors">
                        {r.token.symbol}
                      </span>
                      <ExternalLink className="w-3 h-3 text-[#8b949e] opacity-0 group-hover:opacity-100 transition-opacity" />
                    </a>
                    {r.signals.length > 0 && (
                      <div className="mt-0.5 text-[10px] text-[#8b949e] truncate max-w-[220px]" title={r.signals.join(' · ')}>
                        {r.signals.slice(0, 2).join(' · ')}
                      </div>
                    )}
                  </td>
                  <td className="text-right px-3 py-2.5 text-white font-mono">{fmtPrice(r.token.priceUsd)}</td>
                  <td className="text-right px-3 py-2.5 font-mono" style={{ color: pctColor(r.token.priceChangePct.h1) }}>
                    {fmtPct(r.token.priceChangePct.h1)}
                  </td>
                  <td className="text-right px-3 py-2.5 font-mono" style={{ color: pctColor(r.token.priceChangePct.h24) }}>
                    {fmtPct(r.token.priceChangePct.h24)}
                  </td>
                  <td className="text-right px-3 py-2.5 text-[#c9d1d9] font-mono">{fmtUsd(r.token.volumeUsd.h24)}</td>
                  <td className="text-right px-3 py-2.5 text-[#c9d1d9] font-mono">{fmtUsd(r.token.liquidityUsd)}</td>
                  <td className="text-right px-3 py-2.5 text-[#c9d1d9] font-mono">{fmtUsd(r.token.marketCapUsd)}</td>
                  <td className="text-right px-3 py-2.5 text-[#8b949e]">{fmtAge(r.token.ageHours)}</td>
                  <td className="text-right px-3 py-2.5">
                    <span
                      className="inline-block min-w-[32px] px-1.5 py-0.5 rounded font-mono font-semibold"
                      style={{
                        color: r.momentumScore >= 60 ? '#3fb950' : r.momentumScore >= 40 ? '#d29922' : '#8b949e',
                        background: r.momentumScore >= 60 ? 'rgba(63,185,80,0.1)' : 'transparent',
                      }}
                    >
                      {r.momentumScore}
                    </span>
                  </td>
                  <td className="text-right px-4 py-2.5">
                    <span
                      title={[...r.safety.hardFails, ...r.safety.warnings].join('\n') || 'No issues found'}
                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-mono font-semibold"
                      style={{
                        color: r.safety.hardFails.length ? '#f85149' : r.safety.score >= 70 ? '#3fb950' : '#d29922',
                      }}
                    >
                      {r.safety.hardFails.length ? <ShieldAlert className="w-3 h-3" /> : <Shield className="w-3 h-3" />}
                      {r.safety.score}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
