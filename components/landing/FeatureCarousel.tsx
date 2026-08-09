'use client';

/**
 * Feature tour — the landing page's "what you actually get" section.
 *
 * Replaces the old 12-card static grid with a click-through carousel: one
 * feature group per slide, copy on the left, a hand-built product mockup on
 * the right (real screenshots would show either live personal data or empty
 * demo accounts, so the mockups render representative data in the app's real
 * visual language).
 */

import { useCallback, useEffect, useState } from 'react';
import { PLATINUM_COMING_SOON } from '@/lib/entitlements';
import {
  BookOpen,
  Target,
  Crosshair,
  Sunrise,
  LineChart,
  Brain,
  BarChart2,
  Sparkles,
  Check,
  X,
  SlidersHorizontal,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';

/* ── Mockups ─────────────────────────────────────────────────────────── */

const panel = 'bg-[#0d1117] border border-[#30363d] rounded-2xl p-5';
const label = 'text-[10px] font-semibold text-[#8b949e] uppercase tracking-wider';

function JournalMock() {
  // Wed-heavy winning week — enough green to feel real, one red day for honesty.
  const days: { d: number; pnl: number | null }[] = [
    { d: 4, pnl: 420 }, { d: 5, pnl: -180 }, { d: 6, pnl: 260 }, { d: 7, pnl: 640 }, { d: 8, pnl: 115 },
    { d: 11, pnl: 305 }, { d: 12, pnl: 0 }, { d: 13, pnl: 530 }, { d: 14, pnl: -95 }, { d: 15, pnl: 210 },
  ];
  return (
    <div className={panel}>
      <div className="flex items-center justify-between gap-2 mb-3">
        <span className={`${label} truncate min-w-0`}>August · Trading Journal</span>
        <span className="text-[10px] font-bold text-[#3fb950] shrink-0 whitespace-nowrap">+$2,205 MTD</span>
      </div>
      <div className="grid grid-cols-5 gap-1 mb-4">
        {days.map(({ d, pnl }) => (
          <div
            key={d}
            className="rounded-lg px-1 py-2 text-center border min-w-0"
            style={{
              background: pnl === null || pnl === 0 ? '#161b22' : pnl > 0 ? 'rgba(63,185,80,0.10)' : 'rgba(248,81,73,0.10)',
              borderColor: pnl === null || pnl === 0 ? '#30363d' : pnl > 0 ? 'rgba(63,185,80,0.35)' : 'rgba(248,81,73,0.35)',
            }}
          >
            <p className="text-[9px] text-[#8b949e]">{d}</p>
            <p
              className="text-[9px] sm:text-[10px] font-bold whitespace-nowrap"
              style={{ color: pnl === null || pnl === 0 ? '#484f58' : pnl > 0 ? '#3fb950' : '#f85149' }}
            >
              {pnl === 0 ? '—' : `${pnl! > 0 ? '+' : '-'}$${Math.abs(pnl!)}`}
            </p>
          </div>
        ))}
      </div>
      <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-3">
        <p className={label}>Aug 7 — Journal entry</p>
        <p className="text-xs text-[#c9d1d9] mt-1 leading-relaxed">
          Waited for the pullback to VWAP instead of chasing the open. Two trades, both A-setups.
          <span className="text-[#8b949e]"> #patience #vwap-reclaim</span>
        </p>
      </div>
    </div>
  );
}

function RiskMock() {
  return (
    <div className={panel}>
      <div className="flex items-center justify-between mb-4">
        <span className={label}>Position Calculator</span>
        <span className="text-[10px] font-bold text-[#F97316]">NVDA · Long</span>
      </div>
      <div className="flex gap-4">
        {/* Price ladder — the "see your trade" visual */}
        <div className="relative w-16 shrink-0" style={{ height: 172 }}>
          <div className="absolute inset-x-6 inset-y-0 rounded-full bg-[#161b22]" />
          {[
            { label: 'TARGET', price: '151.10', top: '4%', color: '#3fb950' },
            { label: 'ENTRY', price: '142.50', top: '52%', color: '#F97316' },
            { label: 'STOP', price: '138.20', top: '86%', color: '#f85149' },
          ].map((m) => (
            <div key={m.label} className="absolute left-0 right-0" style={{ top: m.top }}>
              <div className="h-[3px] rounded-full" style={{ background: m.color }} />
              <p className="text-[8px] font-bold mt-0.5" style={{ color: m.color }}>
                {m.label}
              </p>
              <p className="text-[9px] text-[#c9d1d9] font-mono leading-none">{m.price}</p>
            </div>
          ))}
        </div>
        <div className="flex-1 space-y-2">
          {[
            ['Account risk', '$250'],
            ['Risk per share', '$4.30'],
            ['Share size', '58 shares'],
            ['Reward : risk', '2.0 : 1'],
          ].map(([k, v], i) => (
            <div key={k} className="flex items-center justify-between bg-[#161b22] border border-[#30363d] rounded-lg px-3 py-2">
              <span className="text-[10px] text-[#8b949e]">{k}</span>
              <span className={`text-xs font-bold font-mono ${i >= 2 ? 'text-[#F97316]' : 'text-white'}`}>{v}</span>
            </div>
          ))}
          <p className="text-[10px] text-[#8b949e] leading-snug pt-1">
            Exact size computed from your dollar risk — never over-size again.
          </p>
        </div>
      </div>
    </div>
  );
}

function MarketMock() {
  const rows = [
    ['NVDA', '+4.2%', '3.1x', 'AI demand surge', true],
    ['PLTR', '+3.1%', '2.4x', 'Contract win', true],
    ['XOM', '-2.6%', '1.9x', 'Crude slide', false],
  ] as const;
  return (
    <div className={panel}>
      <div className="flex items-center gap-2 mb-3">
        <span className={label}>Morning Briefing · 8:00 AM ET</span>
        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-[#3fb950]/15 text-[#3fb950]">BULLISH</span>
      </div>
      <p className="text-xs text-[#c9d1d9] leading-relaxed mb-4">
        Futures point higher ahead of CPI. Tech leads pre-market; yields easing. Watch the 9:45
        reaction window before sizing up.
      </p>
      <p className={`${label} mb-2`}>Gap Scanner · pre-market</p>
      <div className="space-y-1.5">
        {rows.map(([sym, gap, vol, cat, up]) => (
          <div key={sym} className="flex items-center gap-3 bg-[#161b22] border border-[#30363d] rounded-lg px-3 py-2">
            <span className="text-xs font-bold text-white w-12">{sym}</span>
            <span className={`text-xs font-bold flex items-center gap-0.5 ${up ? 'text-[#3fb950]' : 'text-[#f85149]'}`}>
              {up ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
              {gap}
            </span>
            <span className="text-[10px] text-[#8b949e]">{vol} vol</span>
            <span className="hidden sm:block text-[10px] text-[#8b949e] truncate flex-1 text-right">{cat}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PerformanceMock() {
  return (
    <div className={panel}>
      <div className="flex items-center justify-between mb-3">
        <span className={label}>Equity Curve · 90 days</span>
        <span className="text-[10px] font-bold text-[#3fb950]">+18.4%</span>
      </div>
      <svg viewBox="0 0 320 110" className="w-full mb-4">
        <defs>
          <linearGradient id="fc-eq" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#F97316" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#F97316" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path
          d="M0,92 L30,88 L55,90 L80,78 L105,82 L130,66 L155,70 L180,54 L205,60 L230,42 L255,46 L285,28 L320,18"
          fill="none"
          stroke="#F97316"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        <path
          d="M0,92 L30,88 L55,90 L80,78 L105,82 L130,66 L155,70 L180,54 L205,60 L230,42 L255,46 L285,28 L320,18 L320,110 L0,110 Z"
          fill="url(#fc-eq)"
        />
      </svg>
      <div className="grid grid-cols-4 gap-2">
        {[
          ['Win rate', '68%'],
          ['Profit factor', '2.1'],
          ['Avg win', '+1.8R'],
          ['Max DD', '-4.2%'],
        ].map(([k, v]) => (
          <div key={k} className="bg-[#161b22] border border-[#30363d] rounded-lg px-2 py-2 text-center">
            <p className="text-xs font-bold text-white">{v}</p>
            <p className="text-[9px] text-[#8b949e] mt-0.5">{k}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function AIInsightsMock() {
  return (
    <div className={panel}>
      <div className="flex items-center justify-between mb-3">
        <span className={label}>AI Journal Insights · Weekly</span>
        <span className="text-[10px] text-[#8b949e]">Generated Mon 7:00 AM</span>
      </div>
      <div className="bg-[#F97316]/5 border border-[#F97316]/25 rounded-xl p-3 mb-3">
        <p className="text-[10px] font-bold text-[#F97316] uppercase mb-1">Key takeaway</p>
        <p className="text-xs text-[#c9d1d9] leading-relaxed">
          Your best trades all waited for confirmation. The three biggest losses were entries in the
          first 15 minutes — before your own rules allow.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-3">
          <p className="text-[10px] font-bold text-[#3fb950] uppercase mb-1.5">Working</p>
          <p className="text-[11px] text-[#8b949e] leading-snug">Risk fixed at $250 · A-setups only after 9:45</p>
        </div>
        <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-3">
          <p className="text-[10px] font-bold text-[#f85149] uppercase mb-1.5">Costing you</p>
          <p className="text-[11px] text-[#8b949e] leading-snug">Friday over-trading · moving stops on losers</p>
        </div>
      </div>
    </div>
  );
}

function ProjectionMock() {
  const rows = [
    ['Best case', '+$4,840', 92, '#3fb950'],
    ['Base case', '+$2,120', 52, '#F97316'],
    ['Worst case', '-$760', 18, '#f85149'],
  ] as const;
  return (
    <div className={panel}>
      <div className="flex items-center justify-between mb-1">
        <span className={label}>Profit Projection · Monthly</span>
        <span className="text-[10px] text-[#8b949e]">55% win · 2:1 R:R · 3 trades/day</span>
      </div>
      <p className="text-[11px] text-[#8b949e] mb-4">Stress-test the strategy before risking a dollar.</p>
      <div className="space-y-3">
        {rows.map(([k, v, w, color]) => (
          <div key={k}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] text-[#8b949e]">{k}</span>
              <span className="text-xs font-bold font-mono" style={{ color }}>{v}</span>
            </div>
            <div className="h-2.5 rounded-full bg-[#161b22] border border-[#30363d] overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${w}%`, background: color, opacity: 0.85 }} />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center justify-between bg-[#161b22] border border-[#30363d] rounded-lg px-3 py-2">
        <span className="text-[10px] text-[#8b949e]">Expected value / trade</span>
        <span className="text-xs font-bold text-[#3fb950] font-mono">+0.65R</span>
      </div>
    </div>
  );
}

function AgentProposalMock() {
  return (
    <div className={panel}>
      <div className="flex items-center justify-between mb-3">
        <span className={label}>Agent Proposal · Swing</span>
        <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-[#d29922]/15 text-[#d29922] border border-[#d29922]/30">
          AWAITING YOUR APPROVAL
        </span>
      </div>

      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-base font-bold text-white">AAPL · Long</p>
          <p className="text-[10px] text-[#8b949e]">Proposed overnight · pullback-to-support strategy</p>
        </div>
        <div className="text-right">
          <p className="text-xs font-bold text-[#F97316] font-mono">2.2 : 1</p>
          <p className="text-[9px] text-[#8b949e]">reward : risk</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-3">
        {[
          ['Entry', '226.40', '#F97316'],
          ['Stop', '219.80', '#f85149'],
          ['Target', '241.20', '#3fb950'],
        ].map(([k, v, c]) => (
          <div key={k} className="bg-[#161b22] border border-[#30363d] rounded-lg px-2 py-2 text-center">
            <p className="text-[9px] text-[#8b949e] uppercase">{k}</p>
            <p className="text-xs font-bold font-mono" style={{ color: c }}>{v}</p>
          </div>
        ))}
      </div>

      <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-3 mb-3">
        <p className="text-[10px] font-bold text-[#8b949e] uppercase mb-1">Agent reasoning</p>
        <p className="text-[11px] text-[#c9d1d9] leading-snug">
          Held the 50-day on above-average volume; sector strength confirms. Entry above
          yesterday&apos;s high keeps the setup honest.
        </p>
      </div>

      <p className="text-[10px] text-[#3fb950] flex items-center gap-1.5 mb-3">
        <ShieldCheck className="w-3 h-3" />
        Inside guardrails — position cap 5%, daily loss limit OK
      </p>

      <div className="flex gap-2">
        <button className="flex-1 py-2 rounded-lg bg-[#3fb950]/15 border border-[#3fb950]/40 text-[#3fb950] text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-default">
          <Check className="w-3.5 h-3.5" /> Approve
        </button>
        <button className="flex-1 py-2 rounded-lg bg-[#161b22] border border-[#30363d] text-[#8b949e] text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-default">
          <SlidersHorizontal className="w-3.5 h-3.5" /> Adjust
        </button>
        <button className="flex-1 py-2 rounded-lg bg-[#161b22] border border-[#30363d] text-[#8b949e] text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-default">
          <X className="w-3.5 h-3.5" /> Reject
        </button>
      </div>
      <div className="flex items-center justify-center gap-1.5 mt-2.5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brokers/robinhood.png"
          alt="Robinhood"
          className="w-3.5 h-3.5 rounded-[4px]"
        />
        <p className="text-[9px] text-[#8b949e]">
          Orders reach your Robinhood account only after you approve.
        </p>
      </div>
    </div>
  );
}

function GoalsMock() {
  const goals = [
    { label: 'Win rate ≥ 60%', value: '64%', pct: 78, color: '#3fb950', note: 'On track' },
    { label: 'Risk ≤ $250 per trade', value: '100%', pct: 100, color: '#3fb950', note: '21 / 21 trades' },
    { label: 'Max 3 trades per day', value: '2.1 avg', pct: 62, color: '#F97316', note: '2 overtrades this month' },
  ] as const;
  return (
    <div className={panel}>
      <div className="flex items-center justify-between mb-1">
        <span className={label}>Trading Goals · August</span>
        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-[#3fb950]/15 text-[#3fb950]">2 OF 3 ON TRACK</span>
      </div>
      <p className="text-[11px] text-[#8b949e] mb-4">Progress updates itself from your journal — no manual check-ins.</p>
      <div className="space-y-3.5">
        {goals.map(g => (
          <div key={g.label}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] text-[#c9d1d9]">{g.label}</span>
              <span className="text-xs font-bold font-mono" style={{ color: g.color }}>{g.value}</span>
            </div>
            <div className="h-2 rounded-full bg-[#161b22] border border-[#30363d] overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${g.pct}%`, background: g.color, opacity: 0.85 }} />
            </div>
            <p className="text-[9px] text-[#8b949e] mt-0.5">{g.note}</p>
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center justify-between bg-[#161b22] border border-[#30363d] rounded-lg px-3 py-2">
        <span className="text-[10px] text-[#8b949e]">Discipline streak — every rule kept</span>
        <span className="text-xs font-bold text-[#F97316] font-mono">7 days</span>
      </div>
    </div>
  );
}

/* ── Slides ──────────────────────────────────────────────────────────── */

const SLIDES = [
  {
    slug: 'journal',
    icon: BookOpen,
    kicker: 'Trade Journal',
    title: 'Every trade, remembered honestly',
    desc: 'A P&L calendar with a journal underneath — import broker statements in one click (or let Gold sync them automatically), tag strategy and emotional state, and review what actually happened instead of what you remember.',
    tags: ['P&L calendar', 'Statement import', 'Strategy & emotion tags'],
    mock: <JournalMock />,
  },
  {
    slug: 'agents',
    icon: Sparkles,
    kicker: 'Agents · Platinum',
    title: 'The agent proposes. You decide.',
    desc: 'An AI agent scans a swing-trading universe and stages complete proposals — entry, stop, target, and its reasoning. Working in tandem with your Robinhood connection, orders are placed only after you approve, and hard guardrails are enforced on every one. Track proposals, fills, and stops in one terminal.',
    tags: ['Swing-trade proposals', 'You approve every order', 'Works with Robinhood', 'Hard guardrails'],
    mock: <AgentProposalMock />,
  },
  {
    slug: 'risk',
    icon: Crosshair,
    kicker: 'Risk & Trade Management',
    title: 'See the trade before you take it',
    desc: 'Entry, stop, and target on one screen with your dollar risk and exact share size computed for you. Watchlist, live prices, and a distraction-free trading mode for the session.',
    tags: ['Entry / stop / target', 'Risk $ per trade', 'Share size', 'Trading mode'],
    mock: <RiskMock />,
  },
  {
    slug: 'market',
    icon: Sunrise,
    kicker: 'Market Intelligence',
    title: 'Start informed, stay informed',
    desc: 'An AI morning briefing before the bell, a pre-market gap scanner ranked by gap, volume, and catalyst, plus sentiment-tagged news and the market-events calendar through the session.',
    tags: ['AI briefing', 'Gap scanner', 'News screener', 'Events calendar'],
    mock: <MarketMock />,
  },
  {
    slug: 'performance',
    icon: LineChart,
    kicker: 'Performance Analytics',
    title: 'Know your numbers cold',
    desc: 'Equity curve, win rate, profit factor, drawdown, and strategy-by-strategy breakdowns — updated automatically as trades land in the journal.',
    tags: ['Equity curve', 'Win rate', 'Strategy breakdown', 'Drawdown'],
    mock: <PerformanceMock />,
  },
  {
    slug: 'insights',
    icon: Brain,
    kicker: 'AI Journal Insights',
    title: 'A coach that reads every entry',
    desc: 'Weekly and monthly AI reports across your journal: what is working, what is costing you money, and the behavioral patterns you cannot see from inside the trade.',
    tags: ['Weekly reports', 'Pattern detection', 'Behavioral coaching'],
    mock: <AIInsightsMock />,
  },
  {
    slug: 'goals',
    icon: Target,
    kicker: 'Trading Goals',
    title: 'Goals that keep score for you',
    desc: 'Set the rules you want to trade by — win rate, risk per trade, trade frequency — and they track themselves from your real results. No manual check-ins, no fudging the numbers: your journal is the referee, and every kept rule adds to the discipline streak.',
    tags: ['Self-tracking', 'Auto-updated from your journal', 'Discipline streaks'],
    mock: <GoalsMock />,
  },
  {
    slug: 'projection',
    icon: BarChart2,
    kicker: 'Profit Projection',
    title: 'Stress-test before you size up',
    desc: 'Model best-, base-, and worst-case months from your win rate, R:R, and trade frequency — see the R-multiples and expected value before committing capital.',
    tags: ['Scenario modeling', 'R-multiples', 'Expected value'],
    mock: <ProjectionMock />,
  },
];

export default function FeatureCarousel() {
  const [index, setIndex] = useState(0);

  // Deep link: /?feature=agents opens that slide directly.
  useEffect(() => {
    const slug = new URLSearchParams(window.location.search).get('feature');
    const i = SLIDES.findIndex((s) => s.slug === slug);
    if (i >= 0) setIndex(i);
  }, []);

  const go = useCallback((next: number) => {
    setIndex(((next % SLIDES.length) + SLIDES.length) % SLIDES.length);
  }, []);

  // Arrow-key navigation when the section is in view.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') go(index + 1);
      if (e.key === 'ArrowLeft') go(index - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, go]);

  const slide = SLIDES[index];
  const Icon = slide.icon;

  return (
    <div>
      {/* Slide */}
      <div className="relative overflow-hidden">
        <div
          className="flex transition-transform duration-500 ease-out"
          style={{ transform: `translateX(-${index * 100}%)` }}
        >
          {SLIDES.map((s) => (
            <div key={s.kicker} className="w-full shrink-0 px-1">
              <div className="h-full grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-center rounded-3xl border border-[#30363d] bg-[#161b22]/40 p-6 md:p-10">
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-[#F97316]/25 bg-[#F97316]/10">
                      <s.icon className="w-3.5 h-3.5 text-[#F97316]" />
                      <span className="text-xs font-semibold text-[#F97316]">{s.kicker}</span>
                    </div>
                    {s.slug === 'agents' && PLATINUM_COMING_SOON && (
                      <span className="px-2.5 py-1.5 rounded-full bg-[#d29922]/15 border border-[#d29922]/30 text-[10px] font-bold text-[#d29922] uppercase tracking-wider">
                        Coming soon
                      </span>
                    )}
                  </div>
                  <h3 className="text-2xl md:text-3xl font-bold text-white mb-3">{s.title}</h3>
                  <p className="text-[#8b949e] leading-relaxed mb-5">{s.desc}</p>
                  <div className="flex flex-wrap gap-2">
                    {s.tags.map((t) => (
                      <span
                        key={t}
                        className="px-2.5 py-1 rounded-md bg-[#0d1117] border border-[#30363d] text-[11px] text-[#8b949e]"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
                <div>{s.mock}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-4 mt-6">
        <button
          onClick={() => go(index - 1)}
          aria-label="Previous feature"
          className="p-2.5 rounded-full border border-[#30363d] bg-[#161b22] text-[#8b949e] hover:text-white hover:border-[#F97316]/50 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div className="flex items-center gap-2">
          {SLIDES.map((s, i) => (
            <button
              key={s.kicker}
              onClick={() => go(i)}
              aria-label={`Go to ${s.kicker}`}
              className="transition-all duration-300 rounded-full"
              style={{
                width: i === index ? 22 : 8,
                height: 8,
                background: i === index ? '#F97316' : '#30363d',
              }}
            />
          ))}
        </div>
        <button
          onClick={() => go(index + 1)}
          aria-label="Next feature"
          className="p-2.5 rounded-full border border-[#30363d] bg-[#161b22] text-[#8b949e] hover:text-white hover:border-[#F97316]/50 transition-colors"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
      <p className="text-center text-xs text-[#484f58] mt-3">
        <Icon className="w-3 h-3 inline mr-1" />
        {index + 1} / {SLIDES.length} · {slide.kicker}
      </p>
    </div>
  );
}
