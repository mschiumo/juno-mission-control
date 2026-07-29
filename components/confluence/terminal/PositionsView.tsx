'use client';

/**
 * Positions tab — the full open-trades surface for the agentic account.
 * Everything is live from Robinhood (positions + quotes) joined with the
 * app's ledger (approved stops/targets, entry fills). One card per position:
 * a stop → entry → last → target price ladder, exit coverage, P&L, and the
 * plan the human approved. Read-only — exits are managed from Orders.
 */

import { RefreshCw } from 'lucide-react';
import type { LivePosition } from '@/types/confluence';
import { ProgressBar } from './atoms';
import {
  daysHeld,
  maskAcct,
  money,
  pctColors,
  pctToTarget,
  positionDayPnl,
  positionMarketValue,
  positionPnl,
  positionRisk,
  priceLadder,
  shortDate,
  signedMoney,
  signedPct,
} from './format';

interface Props {
  positions: LivePosition[];
  /** Why positions are empty (paper mode, no account, broker down). */
  note?: string;
  account?: string;
  busy: boolean;
  onRefresh: () => void;
}

function pnlColor(usd: number | null | undefined): string {
  if (usd == null) return 'var(--ct-faint)';
  return usd >= 0 ? 'var(--ct-pos)' : 'var(--ct-neg)';
}

/** Small eyebrow + value + sub-line stat cell inside a position card. */
function Stat({ label, value, sub, valueColor, subColor }: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  valueColor?: string;
  subColor?: string;
}) {
  return (
    <div className="flex flex-col" style={{ gap: 3, minWidth: 0 }}>
      <span className="ct-eyebrow" style={{ fontSize: 9, fontWeight: 500, letterSpacing: '0.09em' }}>{label}</span>
      <span className="ct-num" style={{ fontSize: 13.5, fontWeight: 600, color: valueColor ?? 'var(--ct-text)' }}>{value}</span>
      {sub != null && (
        <span className="ct-num" style={{ fontSize: 10.5, fontWeight: 500, color: subColor ?? 'var(--ct-label)' }}>{sub}</span>
      )}
    </div>
  );
}

/**
 * The four price levels on one 0–100 track: stop (left rail), entry tick,
 * last-price dot, target (right rail). Fill runs entry → last, green above
 * water, red below. Falls back to the plain %-to-target bar when the position
 * has no stop to anchor the left rail.
 */
function PriceLadder({ position }: { position: LivePosition }) {
  const ladder = priceLadder(position);
  if (!ladder) {
    const pct = pctToTarget(position);
    if (pct == null) return null;
    const colors = pctColors(pct);
    return (
      <div className="flex flex-col" style={{ gap: 6 }}>
        <ProgressBar pct={pct} fill={colors.fill} height={5} />
        <div className="flex justify-between ct-num" style={{ fontSize: 10.5, fontWeight: 500 }}>
          <span style={{ color: 'var(--ct-label)' }}>entry {money(position.avgCost)}</span>
          <span style={{ color: colors.text }}>{pct}% to target</span>
        </div>
      </div>
    );
  }

  const { entry, last } = ladder;
  const underwater = last != null && last < entry;
  const fillFrom = last == null ? entry : Math.min(entry, last);
  const fillWidth = last == null ? 0 : Math.abs(last - entry);
  return (
    <div className="flex flex-col" style={{ gap: 7 }}>
      <div style={{ position: 'relative', height: 14 }}>
        {/* track */}
        <div style={{ position: 'absolute', top: 4, left: 0, right: 0, height: 6, borderRadius: 999, background: 'var(--ct-track)' }} />
        {/* entry → last fill */}
        {fillWidth > 0 && (
          <div
            style={{
              position: 'absolute',
              top: 4,
              left: `${fillFrom}%`,
              width: `${fillWidth}%`,
              height: 6,
              borderRadius: 999,
              background: underwater ? 'var(--ct-neg)' : 'var(--ct-pos)',
              opacity: 0.85,
            }}
          />
        )}
        {/* entry tick */}
        <div
          title={`entry ${money(position.avgCost)}`}
          style={{ position: 'absolute', top: 1, left: `calc(${entry}% - 1px)`, width: 2, height: 12, borderRadius: 1, background: 'var(--ct-dim)' }}
        />
        {/* last-price dot */}
        {last != null && (
          <div
            title={`last ${money(position.lastPrice)}`}
            style={{
              position: 'absolute',
              top: 3,
              left: `calc(${last}% - 4px)`,
              width: 8,
              height: 8,
              borderRadius: 99,
              background: 'var(--ct-text)',
              boxShadow: `0 0 6px ${underwater ? 'rgba(248,113,113,0.6)' : 'rgba(52,211,153,0.6)'}`,
            }}
          />
        )}
      </div>
      <div className="flex justify-between ct-num" style={{ fontSize: 10.5, fontWeight: 500 }}>
        <span style={{ color: 'var(--ct-neg)' }}>
          stop {money(position.stop?.stopPrice ?? position.planStop)}
          {!position.stop && position.planStop != null ? ' · plan' : ''}
        </span>
        <span style={{ color: 'var(--ct-label)' }}>entry {money(position.avgCost)}</span>
        <span style={{ color: 'var(--ct-pos)' }}>target {money(position.target)}</span>
      </div>
    </div>
  );
}

/** Exit-coverage pill: live stop, resting take-profit, plan-only, or naked. */
function CoveragePill({ position }: { position: LivePosition }) {
  if (position.atTarget) {
    return (
      <span
        className="ct-pill animate-pulse"
        style={{ background: 'var(--ct-pos)', color: '#06130a', fontWeight: 700, boxShadow: '0 0 10px rgba(52,211,153,0.5)' }}
        title={`Last ${money(position.lastPrice)} ≥ target ${money(position.target)} — approved take-profit level reached`}
      >
        AT TARGET
      </span>
    );
  }
  if (position.takeProfit) {
    return (
      <span
        className="ct-pill"
        style={{ background: 'var(--ct-info-bg)', color: 'var(--ct-info)' }}
        title="Take-profit limit resting at the approved target — the protective stop was cancelled to free the shares"
      >
        TP {money(position.takeProfit.limitPrice)} × {position.takeProfit.quantity}
      </span>
    );
  }
  if (position.stop?.stopPrice != null) {
    return (
      <span
        className="ct-pill"
        style={{ background: 'var(--ct-pos-bg)', color: 'var(--ct-pos-text)' }}
        title="Protective stop working at the broker"
      >
        Stop armed × {position.stop.quantity}
      </span>
    );
  }
  if (position.planStop != null) {
    return (
      <span
        className="ct-pill"
        style={{ background: 'rgba(245,166,35,0.13)', color: '#fcd34d' }}
        title={`The approved plan stops at ${money(position.planStop)}, but no stop order is working at the broker`}
      >
        Stop not live
      </span>
    );
  }
  return (
    <span
      className="ct-pill"
      style={{ background: 'var(--ct-neg-bg)', color: 'var(--ct-neg-text)', fontWeight: 700 }}
      title="No stop coverage — this position has no working or planned protective stop"
    >
      NO STOP
    </span>
  );
}

function PositionCard({ position }: { position: LivePosition }) {
  const pnl = positionPnl(position);
  const day = positionDayPnl(position);
  const value = positionMarketValue(position);
  const risk = positionRisk(position);
  const pct = pctToTarget(position);
  const held = daysHeld(position);

  return (
    <div
      className="flex flex-col"
      style={{
        padding: '16px 18px',
        borderRadius: 14,
        background: 'var(--ct-surface)',
        border: `1px solid ${position.atTarget ? 'rgba(52,211,153,0.35)' : 'var(--ct-border)'}`,
        boxShadow: position.atTarget ? '0 0 24px rgba(52,211,153,0.07)' : undefined,
        gap: 14,
      }}
    >
      {/* symbol · qty @ entry · coverage — unrealized P&L */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5 flex-wrap min-w-0">
          <span style={{ fontFamily: 'var(--ct-sans)', fontSize: 17, fontWeight: 600, letterSpacing: '-0.015em', color: 'var(--ct-text)' }}>
            {position.symbol}
          </span>
          <span className="ct-num" style={{ fontSize: 11.5, color: 'var(--ct-label)' }}>
            {position.quantity} @ {money(position.avgCost)}
          </span>
          <CoveragePill position={position} />
        </div>
        <div className="flex flex-col items-end flex-none" style={{ gap: 2 }}>
          <span className="ct-num" style={{ fontSize: 16, fontWeight: 600, letterSpacing: '-0.01em', color: pnlColor(pnl?.usd) }}>
            {pnl ? signedMoney(pnl.usd) : '—'}
          </span>
          <span className="ct-num" style={{ fontSize: 11, fontWeight: 500, color: pnlColor(pnl?.usd) }}>
            {pnl ? signedPct(pnl.pct) : 'no quote'}
          </span>
        </div>
      </div>

      <PriceLadder position={position} />

      {/* stat grid */}
      <div
        className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5"
        style={{ gap: '12px 16px', paddingTop: 12, borderTop: '1px solid var(--ct-border-row)' }}
      >
        <Stat
          label="Current"
          value={money(position.lastPrice)}
          sub={day ? `${signedPct(day.pct)} today` : 'today —'}
          subColor={day ? pnlColor(day.usd) : undefined}
        />
        <Stat
          label="Entry"
          value={money(position.entryFillPrice ?? position.avgCost)}
          sub={
            position.entryFilledAt
              ? `${shortDate(position.entryFilledAt)}${held != null ? ` · held ${held}d` : ''}`
              : 'outside the app'
          }
        />
        <Stat
          label="Stop"
          value={
            position.stop?.stopPrice != null
              ? money(position.stop.stopPrice)
              : position.planStop != null
                ? money(position.planStop)
                : 'NONE'
          }
          valueColor="var(--ct-neg)"
          sub={risk != null ? `−${money(risk)} if hit` : 'uncovered'}
          subColor={risk != null ? 'var(--ct-label)' : 'var(--ct-neg-text)'}
        />
        <Stat
          label="Target"
          value={money(position.target)}
          valueColor={position.target != null ? 'var(--ct-pos)' : 'var(--ct-faint)'}
          sub={pct != null ? `${pct}% there` : position.target != null ? 'no quote' : 'untracked'}
          subColor={pct != null ? pctColors(pct).text : undefined}
        />
        <Stat
          label="Value"
          value={money(value)}
          sub={`${position.quantity} ${position.quantity === 1 ? 'share' : 'shares'}`}
        />
      </div>
    </div>
  );
}

export default function PositionsView({ positions, note, account, busy, onRefresh }: Props) {
  const connected = !note;
  const priced = positions.filter((p) => positionPnl(p) != null);
  const totalValue = positions.reduce<number | null>((sum, p) => {
    const v = positionMarketValue(p);
    return v == null ? sum : (sum ?? 0) + v;
  }, null);
  const totalPnlUsd = priced.length > 0 ? priced.reduce((s, p) => s + (positionPnl(p)?.usd ?? 0), 0) : null;
  const totalCost = priced.reduce((s, p) => s + (p.avgCost ?? 0) * p.quantity, 0);
  const totalPnlPct = totalPnlUsd != null && totalCost > 0 ? (totalPnlUsd / totalCost) * 100 : null;
  const dayPnls = positions.map(positionDayPnl).filter((d): d is { usd: number; pct: number } => d != null);
  const totalDayUsd = dayPnls.length > 0 ? dayPnls.reduce((s, d) => s + d.usd, 0) : null;
  const risks = positions.map(positionRisk).filter((r): r is number => r != null);
  const totalRisk = positions.length === 0 ? 0 : risks.length > 0 ? risks.reduce((s, r) => s + r, 0) : null;

  const kpi = (label: string, value: React.ReactNode, sub?: React.ReactNode, valueColor?: string, subColor?: string) => (
    <div style={{ padding: '13px 14px', borderRadius: 14, background: 'var(--ct-surface)', border: '1px solid var(--ct-border)' }}>
      <div className="ct-eyebrow" style={{ fontWeight: 500, letterSpacing: '0.09em', marginBottom: 7 }}>{label}</div>
      <div className="ct-num" style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-0.02em', color: valueColor ?? 'var(--ct-text)' }}>
        {value}
      </div>
      {sub != null && (
        <div className="ct-num" style={{ fontSize: 10.5, fontWeight: 500, marginTop: 3, color: subColor ?? 'var(--ct-label)' }}>{sub}</div>
      )}
    </div>
  );

  return (
    <div className="flex flex-col" style={{ gap: 14 }}>
      {/* header: count + source + refresh */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <span className="flex items-baseline gap-2">
          <span style={{ fontFamily: 'var(--ct-sans)', fontSize: 13, color: 'var(--ct-dim)' }}>
            {positions.length} open {positions.length === 1 ? 'position' : 'positions'}
          </span>
          <span style={{ fontFamily: 'var(--ct-sans)', fontSize: 11.5, color: connected ? 'var(--ct-faint)' : 'var(--ct-neg-text)' }}>
            {connected ? `live · Robinhood · acct ${maskAcct(account)}` : 'reconnecting…'}
          </span>
        </span>
        <button
          className="flex items-center gap-1.5 disabled:opacity-50"
          style={{
            padding: '7px 12px',
            borderRadius: 8,
            border: '1px solid var(--ct-border-strong)',
            color: 'var(--ct-muted)',
            fontFamily: 'var(--ct-sans)',
            fontSize: 12,
            fontWeight: 500,
          }}
          onClick={onRefresh}
          disabled={busy}
          title="Poll the broker for fresh positions, quotes, and order status"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${busy ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4" style={{ gap: 10 }}>
        {kpi('Market value', money(totalValue))}
        {kpi(
          'Unrealized P&L',
          totalPnlUsd != null ? signedMoney(totalPnlUsd) : '—',
          totalPnlPct != null ? signedPct(totalPnlPct) : undefined,
          pnlColor(totalPnlUsd),
          pnlColor(totalPnlUsd),
        )}
        {kpi('Today', totalDayUsd != null ? signedMoney(totalDayUsd) : '—', undefined, pnlColor(totalDayUsd))}
        {kpi(
          'Open risk',
          totalRisk != null ? money(totalRisk) : '—',
          totalRisk != null ? 'if all stops fire' : 'no stops tracked',
          undefined,
          totalRisk == null ? 'var(--ct-neg-text)' : undefined,
        )}
      </div>

      {/* cards */}
      {positions.length === 0 ? (
        <div
          className="text-center"
          style={{ padding: '44px 16px', borderRadius: 12, background: 'var(--ct-surface)', border: '1px solid var(--ct-border)' }}
        >
          <p style={{ fontFamily: 'var(--ct-sans)', fontSize: 13, color: 'var(--ct-faint)' }}>
            {note ?? 'No open positions in the agentic account.'}
          </p>
        </div>
      ) : (
        positions.map((p) => <PositionCard key={p.symbol} position={p} />)
      )}
    </div>
  );
}
