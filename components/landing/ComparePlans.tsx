'use client';

/**
 * Compare-plans table — implements the "Compare Plans Section" design
 * handoff, adapted to the site's existing tokens: the handoff's #F0862A
 * orange and #35C07A green become the site's #F97316 / #3fb950, hairlines
 * map to the site's border greys, and type stays on the site's font stack
 * (Tailwind font-mono for the captions) instead of importing new faces.
 *
 * The hierarchy is the point: a banded Gold column (the only structural
 * emphasis), three check weights (Silver outline / Gold filled disc /
 * Platinum faint outline), quiet hairline dashes for "not included", and
 * group dividers separating the universal, Gold, and Platinum feature
 * groups. Content is identical to the previous table.
 */

import { PLATINUM_COMING_SOON } from '@/lib/entitlements';

const ROWS: { label: string; silver: boolean; gold: boolean; platinum: boolean; dim?: boolean }[] = [
  { label: 'Trading journal with statement imports', silver: true, gold: true, platinum: true },
  { label: 'Risk-first trade planning — entry, stop & target with risk $ and share size', silver: true, gold: true, platinum: true },
  { label: 'Performance analytics & equity curve', silver: true, gold: true, platinum: true },
  { label: 'Market news screener', silver: true, gold: true, platinum: true },
  { label: 'Profit projection modeling', silver: true, gold: true, platinum: true },
  { label: 'Docs & trading guides', silver: true, gold: true, platinum: true },
  { label: 'Auto-synced journal from your broker', silver: false, gold: true, platinum: true },
  { label: 'Pre-market gap scanner & live market data', silver: false, gold: true, platinum: true },
  { label: 'Daily AI briefing & market recap emails', silver: false, gold: true, platinum: true },
  { label: 'AI coaching reports on your journal', silver: false, gold: true, platinum: true },
  { label: 'Self-tracking trading goals', silver: false, gold: true, platinum: true },
  { label: 'AI-identified swing setups — you approve every order', silver: false, gold: false, platinum: true, dim: true },
  { label: 'Long-term portfolio sync — diversified, short & long term', silver: false, gold: false, platinum: true, dim: true },
  { label: 'Weekly AI portfolio review', silver: false, gold: false, platinum: true, dim: true },
];

/** Row indexes after which a group divider renders (universal | Gold | Platinum). */
const GROUP_BREAKS = new Set([5, 10]);

const CHECK_PATH = 'M3 8.4 L6.4 11.6 L13 4.8';

function Mark({ included, tier }: { included: boolean; tier: 'silver' | 'gold' | 'platinum' }) {
  if (!included) {
    return <span className="inline-block w-3.5 h-[1.5px] rounded-[2px] bg-[#333A42]" aria-label="Not included" />;
  }
  if (tier === 'gold') {
    return (
      <span
        className="inline-flex items-center justify-center w-[22px] h-[22px] rounded-full bg-[#3fb950]"
        aria-label="Included in Gold"
      >
        <svg viewBox="0 0 16 16" className="w-[11px] h-[11px]">
          <path d={CHECK_PATH} fill="none" stroke="#07130D" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    );
  }
  const faint = tier === 'platinum';
  return (
    <span
      className="inline-flex items-center justify-center w-5 h-5 rounded-full"
      style={{ border: `1.5px solid rgba(63,185,80,${faint ? 0.28 : 0.4})` }}
      aria-label={`Included in ${tier}`}
    >
      <svg viewBox="0 0 16 16" className="w-2.5 h-2.5" style={{ opacity: faint ? 0.6 : 0.8 }}>
        <path d={CHECK_PATH} fill="none" stroke="#3fb950" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

const CELL = 'flex items-center justify-center shrink-0';

export default function ComparePlans() {
  return (
    <div className="max-w-4xl mx-auto">
      <div className="overflow-x-auto">
        <div className="relative min-w-[720px]" style={{ padding: '18px 0' }}>
          {/* Gold column band — behind the rows, spanning header through last row.
              right offset = row side padding (20) + platinum cell width (126). */}
          <div
            className="absolute pointer-events-none rounded-2xl"
            style={{
              top: 0,
              bottom: 0,
              right: 146,
              width: 140,
              background:
                'linear-gradient(180deg, rgba(249,115,22,0.10), rgba(249,115,22,0.02) 55%, rgba(249,115,22,0))',
              border: '1px solid rgba(249,115,22,0.26)',
            }}
          />

          {/* Header */}
          <div className="relative flex items-end px-5 pb-5" style={{ borderBottom: '1px solid #30363d' }}>
            <p className="flex-1 min-w-0 text-xl font-semibold tracking-tight text-[#F2F5F8] m-0">Compare plans</p>
            <div className={`${CELL} w-[126px] text-[15px] font-medium text-[#9BA4AE]`}>Silver</div>
            <div className={`${CELL} w-[140px] text-[17px] font-semibold text-[#F97316]`}>Gold</div>
            <div className={`${CELL} w-[126px] flex-col`}>
              <span className="text-[15px] font-medium text-[#9BA4AE]">Platinum</span>
              {PLATINUM_COMING_SOON && (
                <span className="font-mono text-[9.5px] tracking-[0.12em] text-[#5A626B] mt-[5px]">COMING SOON</span>
              )}
            </div>
          </div>

          {/* Rows */}
          {ROWS.map((row, i) => (
            <div key={row.label}>
              <div
                className="relative flex items-center px-5 h-14 transition-colors duration-150 hover:bg-[#161b22]"
                style={{
                  borderBottom:
                    i === ROWS.length - 1 || GROUP_BREAKS.has(i) ? 'none' : '1px solid #21262d',
                }}
              >
                <p
                  className="flex-1 min-w-0 text-[15px] m-0 pr-4"
                  style={{ color: row.dim ? '#8F98A2' : '#C9D1D9' }}
                >
                  {row.label}
                </p>
                <div className={`${CELL} w-[126px]`}>
                  <Mark included={row.silver} tier="silver" />
                </div>
                <div className={`${CELL} w-[140px]`}>
                  <Mark included={row.gold} tier="gold" />
                </div>
                <div className={`${CELL} w-[126px]`}>
                  <Mark included={row.platinum} tier="platinum" />
                </div>
              </div>
              {GROUP_BREAKS.has(i) && (
                <div className="relative" style={{ margin: '14px 0', borderTop: '1px solid #30363d' }} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Footnote */}
      <p
        className="text-center text-sm text-[#7C858F] mx-auto"
        style={{ maxWidth: 660, marginTop: 52, lineHeight: 1.65 }}
      >
        Silver is free forever. Every new account can also try Gold free for 7 days — no credit
        card required. Have a referral code? Redeem it on the Plans page for a free month of Gold.
      </p>
    </div>
  );
}
