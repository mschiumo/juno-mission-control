'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Bot,
  Check,
  ChevronDown,
  ChevronUp,
  CircleDollarSign,
  OctagonX,
  Play,
  Plug,
  Power,
  Wallet,
  X,
} from 'lucide-react';
import type {
  CryptoAuditEvent,
  CryptoOrder,
  CryptoPosition,
  CryptoProposal,
  CryptoSystemState,
  RiskState,
} from '@/types/crypto-trader';
import { fmtPrice, fmtUsd, pctColor } from './format';

interface WalletStatus {
  configured: boolean;
  liveAllowed: boolean;
  address?: string;
  solBalance?: number;
  usdcBalance?: number;
  error?: string;
}

type PositionRow = CryptoPosition & { markPriceUsd: number | null; unrealizedPnlUsd: number | null };

/**
 * Owner-only agent console: kill switch, paper/live/auto-trade controls, risk
 * caps, pending proposals (approve/reject), open positions, orders, audit log.
 */
export default function CryptoAgentPanel() {
  const [state, setState] = useState<CryptoSystemState | null>(null);
  const [liveAllowed, setLiveAllowed] = useState(false);
  const [wallet, setWallet] = useState<WalletStatus | null>(null);
  const [risk, setRisk] = useState<RiskState | null>(null);
  const [proposals, setProposals] = useState<CryptoProposal[]>([]);
  const [positions, setPositions] = useState<PositionRow[]>([]);
  const [orders, setOrders] = useState<CryptoOrder[]>([]);
  const [audit, setAudit] = useState<CryptoAuditEvent[]>([]);
  const [showAudit, setShowAudit] = useState(false);
  const [running, setRunning] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    try {
      const [sysRes, propRes, posRes, ordRes, auditRes, walletRes] = await Promise.all([
        fetch('/api/crypto/system').then((r) => r.json()),
        fetch('/api/crypto/proposals').then((r) => r.json()),
        fetch('/api/crypto/positions').then((r) => r.json()),
        fetch('/api/crypto/orders').then((r) => r.json()),
        fetch('/api/crypto/audit').then((r) => r.json()),
        fetch('/api/crypto/wallet').then((r) => r.json()),
      ]);
      if (sysRes.success) {
        setState(sysRes.state);
        setLiveAllowed(sysRes.liveAllowed);
      }
      if (walletRes.success) setWallet(walletRes.wallet);
      if (propRes.success) setProposals(propRes.proposals);
      if (posRes.success) setPositions(posRes.positions);
      if (ordRes.success) setOrders(ordRes.orders);
      if (auditRes.success) {
        setAudit(auditRes.events);
        setRisk(auditRes.risk);
      }
    } catch {
      setNotice('Failed to load agent state');
    }
  }, []);

  useEffect(() => {
    loadAll();
    const interval = setInterval(loadAll, 30000);
    return () => clearInterval(interval);
  }, [loadAll]);

  async function updateSystem(updates: Partial<CryptoSystemState>) {
    const res = await fetch('/api/crypto/system', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    const data = await res.json();
    if (data.success) {
      setState(data.state);
      setNotice(null);
    } else {
      setNotice(data.error || 'Update failed');
    }
  }

  async function runAgent() {
    setRunning(true);
    setNotice(null);
    try {
      const res = await fetch('/api/crypto/runs', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        const r = data.run;
        setNotice(
          `Run complete: ${r.candidatesScreened} screened → ${r.candidatesPassedSafety} passed safety → ${r.proposalsCreated} proposals${r.autoExecuted ? `, ${r.autoExecuted} auto-executed` : ''}`,
        );
      } else {
        setNotice(data.run?.error || data.error || 'Run failed');
      }
      await loadAll();
    } finally {
      setRunning(false);
    }
  }

  async function decide(proposalId: string, action: 'approve' | 'reject') {
    setBusy(proposalId);
    setNotice(null);
    try {
      const res = await fetch(`/api/crypto/proposals/${proposalId}/${action}`, { method: 'POST' });
      const data = await res.json();
      if (!data.success) setNotice(data.error || `${action} failed`);
      await loadAll();
    } finally {
      setBusy(null);
    }
  }

  async function closePosition(positionId: string) {
    setBusy(positionId);
    setNotice(null);
    try {
      const res = await fetch(`/api/crypto/positions/${positionId}/close`, { method: 'POST' });
      const data = await res.json();
      if (!data.success) setNotice(data.error || 'Close failed');
      await loadAll();
    } finally {
      setBusy(null);
    }
  }

  if (!state) {
    return (
      <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-8 text-center text-sm text-[#8b949e]">
        Loading agent…
      </div>
    );
  }

  const pending = proposals.filter((p) => p.status === 'pending');
  const open = positions.filter((p) => p.status === 'open');
  const dailyPnl = risk?.realizedPnlUsd ?? 0;
  const breakerTripped = state ? dailyPnl <= -state.dailyLossLimitUsd : false;

  const capField = (label: string, key: keyof CryptoSystemState, step = 1) => (
    <label className="flex flex-col gap-1 text-[10px] text-[#8b949e] uppercase tracking-wide">
      {label}
      <input
        type="number"
        step={step}
        min={0}
        defaultValue={state[key] as number}
        key={`${key}:${state[key]}`}
        onBlur={(e) => {
          const value = parseFloat(e.target.value);
          if (Number.isFinite(value) && value >= 0 && value !== state[key]) {
            updateSystem({ [key]: value } as Partial<CryptoSystemState>);
          }
        }}
        className="w-24 px-2 py-1.5 text-xs bg-[#0d1117] border border-[#30363d] rounded-lg text-white font-mono focus:border-[#F97316]/60 focus:outline-none"
      />
    </label>
  );

  return (
    <div className="space-y-4">
      {/* Control bar */}
      <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[#F97316]/10 rounded-lg">
              <Bot className="w-4 h-4 text-[#F97316]" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">Crypto Trading Agent</h3>
              <p className="text-xs text-[#8b949e]">
                Screen → rug gate → Claude ranks → guardrails → {state.paperMode ? 'paper fills' : 'live wallet'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Kill switch — the most prominent control */}
            <button
              onClick={() => updateSystem({ tradingEnabled: !state.tradingEnabled })}
              className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition-all ${
                state.tradingEnabled
                  ? 'bg-[#3fb950]/15 text-[#3fb950] border border-[#3fb950]/40'
                  : 'bg-[#f85149]/15 text-[#f85149] border border-[#f85149]/40'
              }`}
            >
              <Power className="w-3.5 h-3.5" />
              {state.tradingEnabled ? 'TRADING ENABLED' : 'KILL SWITCH ON'}
            </button>

            {/* Paper / live */}
            <button
              onClick={() => updateSystem({ paperMode: !state.paperMode })}
              disabled={state.paperMode && !liveAllowed}
              title={state.paperMode && !liveAllowed ? 'Set CRYPTO_ALLOW_LIVE=true on the server to arm live mode' : ''}
              className={`px-3 py-2 rounded-lg text-xs font-semibold transition-all disabled:opacity-50 ${
                state.paperMode
                  ? 'bg-[#388bfd]/15 text-[#58a6ff] border border-[#388bfd]/40'
                  : 'bg-[#f85149]/15 text-[#f85149] border border-[#f85149]/40'
              }`}
            >
              {state.paperMode ? 'PAPER' : 'LIVE'}
            </button>

            {/* Auto-trade */}
            <button
              onClick={() => updateSystem({ autoTrade: !state.autoTrade })}
              className={`px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                state.autoTrade
                  ? 'bg-[#F97316]/15 text-[#F97316] border border-[#F97316]/40'
                  : 'bg-[#0d1117] text-[#8b949e] border border-[#30363d]'
              }`}
            >
              AUTO-TRADE {state.autoTrade ? 'ON' : 'OFF'}
            </button>

            {/* MCP trading — lets external Claude agents execute through guardrails */}
            <button
              onClick={() => updateSystem({ mcpTradingEnabled: !state.mcpTradingEnabled })}
              title="Allow connected MCP agents to execute/close (still fully guardrailed). Off = they can only propose."
              className={`px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                state.mcpTradingEnabled
                  ? 'bg-[#a371f7]/15 text-[#a371f7] border border-[#a371f7]/40'
                  : 'bg-[#0d1117] text-[#8b949e] border border-[#30363d]'
              }`}
            >
              <Plug className="w-3.5 h-3.5" />
              MCP {state.mcpTradingEnabled ? 'ON' : 'OFF'}
            </button>

            <button
              onClick={runAgent}
              disabled={running}
              className="px-4 py-2 rounded-lg text-xs font-semibold bg-[#F97316] hover:bg-[#F97316]/80 text-white flex items-center gap-2 transition-colors disabled:opacity-50"
            >
              <Play className="w-3.5 h-3.5" />
              {running ? 'Running…' : 'Run Agent'}
            </button>
          </div>
        </div>

        {/* Risk strip */}
        <div className="mt-4 grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="bg-[#0d1117] rounded-lg p-3">
            <div className="text-[10px] text-[#8b949e] uppercase tracking-wide">Daily P&L</div>
            <div className="text-sm font-mono font-semibold" style={{ color: pctColor(dailyPnl) }}>
              {fmtUsd(dailyPnl)}
            </div>
          </div>
          <div className="bg-[#0d1117] rounded-lg p-3">
            <div className="text-[10px] text-[#8b949e] uppercase tracking-wide">Circuit Breaker</div>
            <div className={`text-sm font-semibold flex items-center gap-1 ${breakerTripped ? 'text-[#f85149]' : 'text-[#3fb950]'}`}>
              {breakerTripped && <OctagonX className="w-3.5 h-3.5" />}
              {breakerTripped ? 'TRIPPED' : 'Armed'}
            </div>
          </div>
          <div className="bg-[#0d1117] rounded-lg p-3">
            <div className="text-[10px] text-[#8b949e] uppercase tracking-wide">Open Positions</div>
            <div className="text-sm font-mono font-semibold text-white">
              {open.length}/{state.maxOpenPositions}
            </div>
          </div>
          <div className="bg-[#0d1117] rounded-lg p-3">
            <div className="text-[10px] text-[#8b949e] uppercase tracking-wide">Exposure</div>
            <div className="text-sm font-mono font-semibold text-white">
              {fmtUsd(open.reduce((s, p) => s + p.qtyTokens * p.avgEntryPriceUsd, 0))} / {fmtUsd(state.totalExposureCapUsd)}
            </div>
          </div>
          <div className="bg-[#0d1117] rounded-lg p-3">
            <div className="text-[10px] text-[#8b949e] uppercase tracking-wide">Consecutive Losses</div>
            <div className="text-sm font-mono font-semibold text-white">{risk?.consecutiveLosses ?? 0}</div>
          </div>
        </div>

        {/* Wallet + MCP connectivity */}
        <div className="mt-3 flex items-center gap-4 flex-wrap text-xs">
          <div className="flex items-center gap-2">
            <Wallet className="w-3.5 h-3.5 text-[#8b949e]" />
            {wallet?.configured ? (
              <span className="text-[#c9d1d9]">
                <span className="font-mono">{wallet.address ? `${wallet.address.slice(0, 4)}…${wallet.address.slice(-4)}` : 'wallet'}</span>
                {' · '}
                <span className="font-mono">{wallet.solBalance !== undefined ? `${wallet.solBalance.toFixed(3)} SOL` : '— SOL'}</span>
                {' · '}
                <span className="font-mono">{wallet.usdcBalance !== undefined ? `$${wallet.usdcBalance.toFixed(2)} USDC` : '— USDC'}</span>
              </span>
            ) : (
              <span className="text-[#8b949e]">No trading wallet configured (paper only)</span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <Plug className="w-3.5 h-3.5 text-[#8b949e]" />
            <span className="text-[#8b949e]">
              MCP:{' '}
              <span style={{ color: state.mcpTradingEnabled ? '#a371f7' : '#8b949e' }}>
                {state.mcpTradingEnabled ? 'agents can execute' : 'observe & propose only'}
              </span>
            </span>
          </div>
        </div>

        {/* Caps */}
        <div className="mt-4 flex items-end gap-3 flex-wrap">
          {capField('Per-position $', 'perPositionCapUsd', 10)}
          {capField('Total exposure $', 'totalExposureCapUsd', 50)}
          {capField('Max positions', 'maxOpenPositions')}
          {capField('Daily loss limit $', 'dailyLossLimitUsd', 10)}
          {capField('Min safety score', 'minSafetyScore', 5)}
          {capField('Paper bankroll $', 'paperBankrollUsd', 100)}
        </div>

        {notice && (
          <div className="mt-3 px-3 py-2 rounded-lg bg-[#0d1117] border border-[#30363d] text-xs text-[#d29922]">
            {notice}
          </div>
        )}
      </div>

      {/* Pending proposals */}
      <div className="bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-[#30363d] flex items-center gap-2">
          <CircleDollarSign className="w-4 h-4 text-[#F97316]" />
          <h4 className="text-sm font-semibold text-white">Proposals</h4>
          {pending.length > 0 && (
            <span className="px-1.5 py-0.5 rounded bg-[#F97316]/15 text-[#F97316] text-[10px] font-bold">
              {pending.length} pending
            </span>
          )}
        </div>
        {pending.length === 0 ? (
          <div className="p-4 text-xs text-[#8b949e]">
            No pending proposals. Run the agent or wait for the next cron tick.
          </div>
        ) : (
          <div className="divide-y divide-[#21262d]">
            {pending.map((p) => (
              <div key={p.id} className="p-4 flex items-start justify-between gap-4 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-white text-sm">{p.symbol}</span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#0d1117] text-[#8b949e]">
                      {p.chainId}
                    </span>
                    <span className="text-xs font-mono text-[#c9d1d9]">
                      {fmtUsd(p.notionalUsd)} @ {fmtPrice(p.entryPriceUsd)}
                    </span>
                    <span className="text-[10px] text-[#8b949e]">
                      stop {fmtPrice(p.stopPriceUsd)} · conviction {p.conviction} · safety {p.safetyScore}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-[#8b949e]">{p.thesis}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => decide(p.id, 'approve')}
                    disabled={busy === p.id}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#3fb950]/15 text-[#3fb950] border border-[#3fb950]/40 hover:bg-[#3fb950]/25 flex items-center gap-1 disabled:opacity-50"
                  >
                    <Check className="w-3 h-3" /> Approve
                  </button>
                  <button
                    onClick={() => decide(p.id, 'reject')}
                    disabled={busy === p.id}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#f85149]/10 text-[#f85149] border border-[#f85149]/30 hover:bg-[#f85149]/20 flex items-center gap-1 disabled:opacity-50"
                  >
                    <X className="w-3 h-3" /> Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Open positions */}
      <div className="bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-[#30363d]">
          <h4 className="text-sm font-semibold text-white">Positions</h4>
        </div>
        {open.length === 0 ? (
          <div className="p-4 text-xs text-[#8b949e]">No open positions.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[#8b949e] border-b border-[#30363d]">
                  <th className="text-left px-4 py-2 font-medium">Token</th>
                  <th className="text-right px-3 py-2 font-medium">Cost</th>
                  <th className="text-right px-3 py-2 font-medium">Entry</th>
                  <th className="text-right px-3 py-2 font-medium">Mark</th>
                  <th className="text-right px-3 py-2 font-medium">Stop</th>
                  <th className="text-right px-3 py-2 font-medium">Unrealized</th>
                  <th className="text-right px-3 py-2 font-medium">Realized</th>
                  <th className="text-right px-4 py-2 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {open.map((p) => (
                  <tr key={p.id} className="border-b border-[#21262d]">
                    <td className="px-4 py-2.5">
                      <span className="font-semibold text-white">{p.symbol}</span>
                      <span className="ml-2 text-[10px] text-[#8b949e]">{p.isPaper ? 'paper' : 'live'}</span>
                    </td>
                    <td className="text-right px-3 py-2.5 font-mono text-[#c9d1d9]">{fmtUsd(p.costUsd)}</td>
                    <td className="text-right px-3 py-2.5 font-mono text-[#c9d1d9]">{fmtPrice(p.avgEntryPriceUsd)}</td>
                    <td className="text-right px-3 py-2.5 font-mono text-white">{fmtPrice(p.markPriceUsd)}</td>
                    <td className="text-right px-3 py-2.5 font-mono text-[#8b949e]">{fmtPrice(p.stopPriceUsd)}</td>
                    <td className="text-right px-3 py-2.5 font-mono" style={{ color: pctColor(p.unrealizedPnlUsd) }}>
                      {fmtUsd(p.unrealizedPnlUsd)}
                    </td>
                    <td className="text-right px-3 py-2.5 font-mono" style={{ color: pctColor(p.realizedPnlUsd) }}>
                      {fmtUsd(p.realizedPnlUsd)}
                    </td>
                    <td className="text-right px-4 py-2.5">
                      <button
                        onClick={() => closePosition(p.id)}
                        disabled={busy === p.id}
                        className="px-2.5 py-1 rounded text-[10px] font-semibold bg-[#f85149]/10 text-[#f85149] border border-[#f85149]/30 hover:bg-[#f85149]/20 disabled:opacity-50"
                      >
                        Close
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Recent orders + audit */}
      <div className="bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden">
        <button
          onClick={() => setShowAudit(!showAudit)}
          className="w-full px-4 py-3 flex items-center justify-between text-left"
        >
          <h4 className="text-sm font-semibold text-white">
            Activity <span className="text-[#8b949e] font-normal">({orders.length} orders · {audit.length} events)</span>
          </h4>
          {showAudit ? <ChevronUp className="w-4 h-4 text-[#8b949e]" /> : <ChevronDown className="w-4 h-4 text-[#8b949e]" />}
        </button>
        {showAudit && (
          <div className="border-t border-[#30363d] max-h-80 overflow-y-auto divide-y divide-[#21262d]">
            {audit.length === 0 && <div className="p-4 text-xs text-[#8b949e]">No activity yet.</div>}
            {audit.map((e) => (
              <div key={e.id} className="px-4 py-2 flex items-start gap-3">
                <span className="text-[10px] text-[#8b949e] font-mono whitespace-nowrap pt-0.5">
                  {new Date(e.occurredAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#0d1117] text-[#8b949e] whitespace-nowrap">
                  {e.eventType}
                </span>
                <span className="text-xs text-[#c9d1d9]">{e.note}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
