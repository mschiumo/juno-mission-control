'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { Features } from '@/lib/entitlements';
import {
  X,
  ChevronLeft,
  ChevronRight,
  LayoutDashboard,
  Upload,
  Calculator,
  TrendingUp,
  BarChart2,
  Maximize2,
  Brain,
  LineChart,
  Lightbulb,
  TrendingDown,
  Newspaper,
  Link2,
  Target,
  GraduationCap,
  CalendarDays,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';

type TradingSubTab = 'overview' | 'market' | 'market-news' | 'performance' | 'goals' | 'projection' | 'trade-management' | 'docs';
type TooltipSide = 'top' | 'bottom' | 'left' | 'right';

/** Mini visual mockup shown alongside the step description */
function CalcPreview() {
  const field = (label: string, value: string) => (
    <div className="space-y-0.5">
      <p className="text-[9px] font-semibold text-[#8b949e] uppercase tracking-wide">{label}</p>
      <div className="bg-[#0d1117] border border-[#30363d] rounded px-2 py-1 text-xs text-white font-mono">{value}</div>
    </div>
  );
  return (
    <div className="shrink-0 w-44 bg-[#0d1117] border border-[#30363d] rounded-xl p-3 space-y-2 text-left">
      <div className="flex items-center gap-1.5 pb-1 border-b border-[#30363d]">
        <div className="w-2 h-2 rounded-full bg-[#F97316]" />
        <span className="text-[10px] font-semibold text-[#8b949e] uppercase tracking-wider">Calculator</span>
      </div>
      {field('Ticker', 'AAPL')}
      {field('Risk ($)', '$25.00')}
      {field('Entry', '$185.00')}
      {field('Stop', '$182.50')}
      <div className="pt-1 border-t border-[#30363d]">
        <p className="text-[9px] text-[#8b949e] uppercase tracking-wide mb-0.5">Share Size</p>
        <p className="text-lg font-bold text-[#F97316]">10 shares</p>
      </div>
    </div>
  );
}

/** Mini visual mockup of the AI Journal Insights report */
function JournalInsightsPreview() {
  return (
    <div className="shrink-0 w-48 bg-[#0d1117] border border-[#30363d] rounded-xl p-3 space-y-2 text-left">
      <div className="flex items-center gap-1.5 pb-1 border-b border-[#30363d]">
        <div className="w-2 h-2 rounded-full bg-[#F97316]" />
        <span className="text-[10px] font-semibold text-[#8b949e] uppercase tracking-wider">AI Report</span>
      </div>

      {/* Key Takeaway */}
      <div className="bg-[#F97316]/5 border border-[#F97316]/20 rounded-lg px-2 py-1.5">
        <div className="flex items-center gap-1 mb-0.5">
          <Lightbulb className="w-2.5 h-2.5 text-[#F97316]" />
          <span className="text-[8px] font-bold text-[#F97316] uppercase">Key Takeaway</span>
        </div>
        <p className="text-[9px] text-[#c9d1d9] leading-tight">
          Best wins come from patience at key levels
        </p>
      </div>

      {/* Strengths */}
      <div className="space-y-0.5">
        <div className="flex items-center gap-1">
          <TrendingUp className="w-2.5 h-2.5 text-[#3fb950]" />
          <span className="text-[8px] font-bold text-[#3fb950] uppercase">Strengths</span>
        </div>
        <p className="text-[9px] text-[#8b949e] leading-tight truncate">Strong risk management</p>
        <p className="text-[9px] text-[#8b949e] leading-tight truncate">Consistent entry timing</p>
      </div>

      {/* Improve */}
      <div className="space-y-0.5">
        <div className="flex items-center gap-1">
          <TrendingDown className="w-2.5 h-2.5 text-[#f85149]" />
          <span className="text-[8px] font-bold text-[#f85149] uppercase">Improve</span>
        </div>
        <p className="text-[9px] text-[#8b949e] leading-tight truncate">Holding losers too long</p>
        <p className="text-[9px] text-[#8b949e] leading-tight truncate">Over-trading on Fridays</p>
      </div>

      {/* Patterns */}
      <div className="pt-1 border-t border-[#30363d]">
        <div className="flex items-center gap-1 mb-0.5">
          <Brain className="w-2.5 h-2.5 text-[#8b5cf6]" />
          <span className="text-[8px] font-bold text-[#8b5cf6] uppercase">Patterns</span>
        </div>
        <p className="text-[9px] text-[#8b949e] leading-tight truncate">Revenge trading after losses</p>
      </div>
    </div>
  );
}

/** Mini visual mockup of the Morning Market Briefing report */
function BriefingPreview() {
  const item = (symbol: string, price: string, change: string, up: boolean) => (
    <div className="flex items-center justify-between">
      <span className="text-[9px] font-bold text-white">{symbol}</span>
      <div className="flex items-center gap-1">
        <span className="text-[9px] text-[#8b949e]">{price}</span>
        <div className={`flex items-center gap-0.5 ${up ? 'text-[#3fb950]' : 'text-[#f85149]'}`}>
          {up ? <ArrowUpRight className="w-2 h-2" /> : <ArrowDownRight className="w-2 h-2" />}
          <span className="text-[8px] font-semibold">{change}</span>
        </div>
      </div>
    </div>
  );

  return (
    <div className="shrink-0 w-48 bg-[#0d1117] border border-[#30363d] rounded-xl p-3 space-y-2 text-left">
      {/* Header */}
      <div className="flex items-center gap-1.5 pb-1 border-b border-[#30363d]">
        <div className="w-2 h-2 rounded-full bg-[#F97316]" />
        <span className="text-[10px] font-semibold text-[#8b949e] uppercase tracking-wider">Morning Briefing</span>
      </div>

      {/* Sentiment */}
      <div className="flex items-center gap-1.5">
        <span className="text-[8px] font-bold text-[#8b949e] uppercase">Sentiment</span>
        <span className="px-1.5 py-0.5 rounded text-[8px] font-bold bg-[#3fb950]/15 text-[#3fb950]">Bullish</span>
      </div>

      {/* Market Overview snippet */}
      <div className="bg-[#161b22] rounded-lg px-2 py-1.5">
        <p className="text-[8px] text-[#8b949e] leading-tight">
          Futures point higher ahead of key inflation data. Tech leading pre-market gains&hellip;
        </p>
      </div>

      {/* Indices */}
      <div className="space-y-1">
        <span className="text-[8px] font-bold text-[#8b949e] uppercase">Indices</span>
        {item('SPY', '$542.18', '+0.73%', true)}
        {item('QQQ', '$468.50', '+1.12%', true)}
        {item('IWM', '$198.34', '-0.28%', false)}
      </div>

      {/* Big Mover */}
      <div className="pt-1 border-t border-[#30363d]">
        <div className="flex items-center gap-1 mb-0.5">
          <span className="text-[8px] font-bold text-[#F97316] uppercase">Big Mover</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="px-1 py-0.5 rounded bg-[#3fb950]/15 text-[8px] font-bold text-[#3fb950]">NVDA +4.2%</span>
          <span className="text-[8px] text-[#8b949e] truncate">AI demand surge</span>
        </div>
      </div>
    </div>
  );
}

interface TourStep {
  subtab: TradingSubTab;
  targetDataTour?: string;
  tooltipSide?: TooltipSide;
  preview?: React.ReactNode;
  icon: React.ReactNode;
  title: string;
  description: string;
  tip?: string;
  /** Extra feature requirement beyond the subtab itself (e.g. AI insights). */
  requiresFeature?: keyof Features;
}

/** Which plan feature unlocks each sub-tab the tour can visit. */
const SUBTAB_FEATURE: Record<TradingSubTab, keyof Features> = {
  overview: 'journal',
  market: 'marketFull',
  'market-news': 'marketNews',
  performance: 'performance',
  goals: 'goals',
  projection: 'profitProjection',
  'trade-management': 'tradeManagement',
  docs: 'docs',
};

const STEPS: TourStep[] = [
  {
    subtab: 'overview',
    icon: <LayoutDashboard className="w-9 h-9 text-[#F97316]" />,
    title: 'Welcome to Your Trading Hub',
    description:
      'This is your workspace for journaling trades, managing risk, and finding out what actually works in your trading. The tour only covers what your plan includes, and it takes about a minute.',
    tip: 'You can relaunch this tour any time from the ? icon at the right of the tab bar.',
  },
  {
    subtab: 'overview',
    targetDataTour: 'trading-nav',
    tooltipSide: 'bottom',
    icon: <LayoutDashboard className="w-9 h-9 text-[#F97316]" />,
    title: 'Your Sections',
    description:
      'Journal holds your P&L calendar and daily entries. Trade Management has the risk calculator and watchlist. Performance tracks your stats, Profit Projection models your strategy, and Docs explains everything in depth. Market, Market News, and Goals appear here too when your plan includes them.',
    tip: "Click any tab to jump straight there — we'll visit each one in turn.",
  },
  {
    subtab: 'overview',
    requiresFeature: 'brokerageSync',
    targetDataTour: 'brokerage-sync',
    tooltipSide: 'bottom',
    icon: <Link2 className="w-9 h-9 text-[#F97316]" />,
    title: 'Connect Your Brokerage',
    description:
      'Link your brokerage here and your journal fills itself — trades, fills, and balances sync automatically each day through SnapTrade, which supports Schwab, Robinhood, Fidelity, E*TRADE, Webull, Interactive Brokers and more. While a brokerage is linked it is the single source of your journal, so the numbers always match your statements.',
    tip: 'Disconnecting is one click and restores whatever you had imported by hand beforehand.',
  },
  {
    subtab: 'overview',
    targetDataTour: 'trading-import',
    tooltipSide: 'left',
    icon: <Upload className="w-9 h-9 text-[#F97316]" />,
    title: 'Import Your Trades by Hand',
    description:
      'No brokerage connection needed: export an account statement or trade activity file from your broker — ThinkorSwim, Schwab, or any CSV — and drop it here. Confluence Trading pairs buys with sells, calculates P&L, and flags trades already in your journal so you can merge or skip them. There is a downloadable template in the import window if your broker exports something unusual.',
    tip: 'Merged trades keep your notes — brokerage numbers always win for the financials.',
  },
  {
    subtab: 'overview',
    targetDataTour: 'trading-calendar',
    tooltipSide: 'top',
    icon: <CalendarDays className="w-9 h-9 text-[#F97316]" />,
    title: 'The P&L Calendar',
    description:
      'Every trading day shows its net result, and clicking a day opens that day\u2019s trades alongside your journal entry. Writing two honest sentences a day is what makes the AI coaching and your own reviews worth reading later.',
    tip: 'Tag your setups and emotional state — those tags become the patterns you analyze.',
  },
  {
    subtab: 'trade-management',
    targetDataTour: 'position-calculator',
    tooltipSide: 'right',
    icon: <Calculator className="w-9 h-9 text-[#F97316]" />,
    title: 'Size Every Trade by Risk',
    description:
      'Enter your ticker, dollar risk, entry, and stop — the calculator returns the exact share size, with your reward-to-risk ratio alongside it. Decide what a trade may cost you before you decide how many shares to buy.',
    tip: 'Keep the dollar risk identical across trades; consistency is what makes your stats mean something.',
    preview: <CalcPreview />,
  },
  {
    subtab: 'trade-management',
    targetDataTour: 'trading-mode',
    tooltipSide: 'bottom',
    icon: <Maximize2 className="w-9 h-9 text-[#F97316]" />,
    title: 'Trading Mode',
    description:
      'A distraction-free fullscreen workspace for the live session: active trades and watchlist side by side, no tabs, no clutter.',
    tip: 'Press Esc at any time to exit and return to the full workspace.',
  },
  {
    subtab: 'market',
    targetDataTour: 'market-briefing',
    tooltipSide: 'bottom',
    icon: <Newspaper className="w-9 h-9 text-[#F97316]" />,
    title: 'Daily Market Briefing',
    description:
      'Every weekday before the bell, an AI-generated briefing lands here with overnight futures, index levels, big movers, and the news that matters — one snapshot, 30 seconds to read. Turn on the email in your profile and it arrives in your inbox instead.',
    tip: 'Read it before your first trade; the macro backdrop shapes which setups are worth taking.',
    preview: <BriefingPreview />,
  },
  {
    subtab: 'market',
    targetDataTour: 'gap-scanner',
    tooltipSide: 'right',
    icon: <TrendingUp className="w-9 h-9 text-[#F97316]" />,
    title: 'Live Gap Scanner',
    description:
      'Stocks gapping with significant volume, refreshed continuously through the session. Adjust gap %, volume, and price filters to match your strategy, and star any ticker to pin it to your watchlist.',
    tip: 'Sort by gap % or relative volume to surface the highest-conviction setups first.',
  },
  {
    subtab: 'market-news',
    icon: <Newspaper className="w-9 h-9 text-[#F97316]" />,
    title: 'Market News, Filtered',
    description:
      'Live headlines tagged by sentiment and category — Fed and rates, macro, M&A, earnings, AI, crypto — so you can scan the day\u2019s catalysts without a dozen browser tabs.',
    tip: 'Check the high-impact digest before the open; it is the fastest read on the page.',
  },
  {
    subtab: 'goals',
    icon: <Target className="w-9 h-9 text-[#F97316]" />,
    title: 'Goals That Track Themselves',
    description:
      'Set the rules you want to trade by — win rate, risk per trade, trades per day — and they update from your real journal data. No manual check-ins and no fudging: progress comes from what you actually did.',
    tip: 'Start with one process goal (like risk per trade) rather than a profit target — process is what you control.',
  },
  {
    subtab: 'performance',
    icon: <LineChart className="w-9 h-9 text-[#F97316]" />,
    title: 'Your Numbers, Honestly',
    description:
      'Equity curve, net liquidating value, win rate, profit factor, drawdown, and a breakdown by strategy — all recalculated as trades land in your journal, whether they arrive by brokerage sync or by import.',
    tip: 'Set your starting balance once so percentage returns are accurate from day one.',
  },
  {
    subtab: 'performance',
    requiresFeature: 'journalInsights',
    targetDataTour: 'journal-insights',
    tooltipSide: 'top',
    icon: <Brain className="w-9 h-9 text-[#F97316]" />,
    title: 'AI Journal Insights',
    description:
      'Generate a weekly or monthly report across your journal and trades. It surfaces what is working, what is costing you money, and the behavioral patterns that are invisible from inside a trade.',
    tip: 'Generate one every week — the value is in watching the patterns change over time.',
    preview: <JournalInsightsPreview />,
  },
  {
    subtab: 'projection',
    targetDataTour: 'profit-projection',
    tooltipSide: 'top',
    icon: <BarChart2 className="w-9 h-9 text-[#F97316]" />,
    title: 'Profit Projection',
    description:
      'Enter your win rate, average R:R, and trades per day to model best, base, and worst-case months before you risk capital on a strategy change.',
    tip: 'Small improvements in win rate compound dramatically over hundreds of trades.',
  },
  {
    subtab: 'docs',
    icon: <GraduationCap className="w-9 h-9 text-[#F97316]" />,
    title: 'Docs & Guides',
    description:
      'Every feature explained in depth, plus trading guides on risk, journaling discipline, and getting the most out of the analytics. Start here whenever something is unclear.',
    tip: 'That is the tour — questions any time: confluencetradingsupport@gmail.com.',
  },
];

const TOOLTIP_WIDTH = 540;
const PAD = 10; // spotlight padding around the target element
const GAP = 20; // space between spotlight edge and tooltip card

interface TargetRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const OVERLAY = 'rgba(2,6,12,0.82)';

interface TradingTourProps {
  activeSubTab: TradingSubTab;
  onNavigate: (subtab: TradingSubTab) => void;
  onComplete: () => void;
  /**
   * The signed-in user's plan features. Steps that visit a sub-tab (or demo a
   * feature) outside the plan are skipped so the tour never navigates into a
   * tab the user can't see.
   */
  features: Features;
}

/** Diamond arrow connecting the tooltip to the highlighted element */
function Arrow({ side }: { side: TooltipSide }) {
  const shared: React.CSSProperties = {
    position: 'absolute',
    width: 14,
    height: 14,
    background: '#161b22',
  };

  if (side === 'bottom') {
    return (
      <div
        style={{
          ...shared,
          top: -7,
          left: '50%',
          transform: 'translateX(-50%) rotate(45deg)',
          borderTop: '1px solid #30363d',
          borderLeft: '1px solid #30363d',
        }}
      />
    );
  }
  if (side === 'top') {
    return (
      <div
        style={{
          ...shared,
          bottom: -7,
          left: '50%',
          transform: 'translateX(-50%) rotate(45deg)',
          borderBottom: '1px solid #30363d',
          borderRight: '1px solid #30363d',
        }}
      />
    );
  }
  if (side === 'right') {
    return (
      <div
        style={{
          ...shared,
          left: -7,
          top: '50%',
          transform: 'translateY(-50%) rotate(45deg)',
          borderLeft: '1px solid #30363d',
          borderBottom: '1px solid #30363d',
        }}
      />
    );
  }
  return (
    <div
      style={{
        ...shared,
        right: -7,
        top: '50%',
        transform: 'translateY(-50%) rotate(45deg)',
        borderRight: '1px solid #30363d',
        borderTop: '1px solid #30363d',
      }}
    />
  );
}

export default function TradingTour({ activeSubTab, onNavigate, onComplete, features }: TradingTourProps) {
  // Only tour what the plan includes.
  const steps = useMemo(
    () =>
      STEPS.filter(
        (s) =>
          features[SUBTAB_FEATURE[s.subtab]] &&
          (!s.requiresFeature || features[s.requiresFeature]),
      ),
    [features],
  );
  const [step, setStep] = useState(0);
  const [visible, setVisible] = useState(false);
  const [targetRect, setTargetRect] = useState<TargetRect | null>(null);
  const [locateFailed, setLocateFailed] = useState(false);

  // A plan with no tourable features yields no steps (e.g. a user with no
  // active plan yet) — the empty-steps early return below renders nothing
  // rather than crashing; the clamp guards a plan change mid-tour.
  const current = steps[Math.min(step, Math.max(steps.length - 1, 0))];
  const isFirst = step === 0;
  const isLast = step === steps.length - 1;

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 50);
    return () => clearTimeout(t);
  }, []);

  const locateTarget = useCallback(() => {
    if (!current?.targetDataTour) {
      setTargetRect(null);
      return;
    }
    const el = document.querySelector<HTMLElement>(`[data-tour="${current.targetDataTour}"]`);
    // Missing or display:none targets (e.g. desktop-only controls on mobile) fall back to a centered card
    if (!el || el.offsetParent === null) {
      setTargetRect(null);
      setLocateFailed(true);
      return;
    }
    // Scroll to top so elements are measured at their natural page position
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setTimeout(() => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) {
        setTargetRect(null);
        setLocateFailed(true);
        return;
      }
      setTargetRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    }, 320);
  }, [current?.targetDataTour]);

  useEffect(() => {
    setTargetRect(null);
    setLocateFailed(false);
    if (current && current.subtab !== activeSubTab) {
      onNavigate(current.subtab);
      const t = setTimeout(locateTarget, 480);
      return () => clearTimeout(t);
    }
    const t = setTimeout(locateTarget, 120);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  function dismiss() {
    setVisible(false);
    setTimeout(onComplete, 300);
  }

  function next() {
    if (isLast) dismiss();
    else setStep((s) => s + 1);
  }

  function prev() {
    if (!isFirst) setStep((s) => s - 1);
  }

  // Tooltip card position — anchored to the spotlight box
  function tooltipStyle(): React.CSSProperties {
    const vw = window.innerWidth;

    if (!targetRect) {
      // Centered modal — wider when a preview panel is present
      const w = current?.preview ? Math.min(720, vw - 32) : Math.min(TOOLTIP_WIDTH, vw - 32);
      return {
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: w,
        zIndex: 10004,
      };
    }

    const { top, left, width, height } = targetRect;
    const side = current?.tooltipSide ?? 'bottom';
    const vh = window.innerHeight;
    const CARD_H = 360;

    // Wide elements need special treatment — there's no clean side to anchor.
    const isWide = width > vw * 0.75;
    const isTall = height > vh * 0.35;
    if (isWide) {
      const sBottom = top + height + PAD;
      if (!isTall) {
        return {
          position: 'fixed',
          top: sBottom + GAP,
          left: '50%',
          transform: 'translateX(-50%)',
          width: Math.min(TOOLTIP_WIDTH, vw - 32),
          zIndex: 10004,
        };
      } else {
        return {
          position: 'fixed',
          top: Math.max(80, top - CARD_H - GAP),
          left: '50%',
          transform: 'translateX(-50%)',
          width: Math.min(TOOLTIP_WIDTH, vw - 32),
          zIndex: 10004,
        };
      }
    }

    const tw = Math.min(TOOLTIP_WIDTH, vw - 32);
    const style: React.CSSProperties = { position: 'fixed', width: tw, zIndex: 10004 };

    const sTop = top - PAD;
    const sLeft = left - PAD;
    const sRight = left + width + PAD;
    const sBottom = top + height + PAD;
    const cx = left + width / 2;
    const cy = top + height / 2;

    if (side === 'bottom') {
      style.top = Math.min(sBottom + GAP, vh - CARD_H - 8);
      style.left = Math.max(8, Math.min(cx - tw / 2, vw - tw - 8));
    } else if (side === 'top') {
      style.top = Math.max(8, sTop - GAP - CARD_H);
      style.left = Math.max(8, Math.min(cx - tw / 2, vw - tw - 8));
    } else if (side === 'right') {
      style.top = Math.max(8, Math.min(cy - CARD_H / 2, vh - CARD_H - 8));
      style.left = Math.min(sRight + GAP, vw - tw - 8);
    } else {
      style.top = Math.max(8, Math.min(cy - CARD_H / 2, vh - CARD_H - 8));
      style.left = Math.max(8, sLeft - GAP - tw);
    }

    return style;
  }

  // 4-rect spotlight that leaves the target element fully visible
  function renderSpotlight() {
    if (!targetRect) return null;
    const { top, left, width, height } = targetRect;

    const sTop = top - PAD;
    const sLeft = left - PAD;
    const sRight = left + width + PAD;
    const sBottom = top + height + PAD;

    return (
      <>
        {/* Top */}
        <div
          onClick={dismiss}
          style={{ position: 'fixed', inset: '0 0 auto 0', height: sTop, background: OVERLAY, zIndex: 10001, pointerEvents: 'auto', cursor: 'default' }}
        />
        {/* Bottom */}
        <div
          onClick={dismiss}
          style={{ position: 'fixed', top: sBottom, left: 0, right: 0, bottom: 0, background: OVERLAY, zIndex: 10001, pointerEvents: 'auto', cursor: 'default' }}
        />
        {/* Left */}
        <div
          onClick={dismiss}
          style={{ position: 'fixed', top: sTop, left: 0, width: sLeft, height: sBottom - sTop, background: OVERLAY, zIndex: 10001, pointerEvents: 'auto', cursor: 'default' }}
        />
        {/* Right */}
        <div
          onClick={dismiss}
          style={{ position: 'fixed', top: sTop, left: sRight, right: 0, height: sBottom - sTop, background: OVERLAY, zIndex: 10001, pointerEvents: 'auto', cursor: 'default' }}
        />
        {/* Orange highlight ring */}
        <div
          style={{
            position: 'fixed',
            top: sTop,
            left: sLeft,
            width: sRight - sLeft,
            height: sBottom - sTop,
            borderRadius: 10,
            border: '2px solid #F97316',
            boxShadow: '0 0 0 3px rgba(249,115,22,0.15)',
            zIndex: 10002,
            pointerEvents: 'none',
          }}
        />
      </>
    );
  }

  const hasTarget = !!targetRect;
  if (!current) return null;

  const side = current.tooltipSide;
  // Don't render the card until position is known — prevents flash to wrong spot
  const cardReady = !current.targetDataTour || hasTarget || locateFailed;

  return (
    <div
      className={`transition-opacity duration-300 ${visible ? 'opacity-100' : 'opacity-0'}`}
      style={{ position: 'fixed', inset: 0, zIndex: 10000, pointerEvents: 'none' }}
    >
      {/* Full backdrop when no spotlight target */}
      {!hasTarget && (
        <div
          onClick={dismiss}
          style={{ position: 'fixed', inset: 0, background: OVERLAY, zIndex: 10001, pointerEvents: 'auto' }}
        />
      )}

      {/* 4-rect spotlight */}
      {renderSpotlight()}

      {/* Tooltip card — only rendered once position is known */}
      {cardReady && <div
        style={{ ...tooltipStyle(), pointerEvents: 'auto' }}
        className="bg-[#161b22] border border-[#30363d] rounded-2xl shadow-2xl overflow-visible"
      >
        {/* Arrow toward highlighted element */}
        {hasTarget && side && <Arrow side={side} />}

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#30363d] bg-[#0d1117]/60 rounded-t-2xl">
          <span className="text-xs font-semibold text-[#8b949e] uppercase tracking-widest">
            Tour · {step + 1} of {steps.length}
          </span>
          <button
            onClick={dismiss}
            className="p-1.5 rounded-md text-[#8b949e] hover:text-white hover:bg-[#30363d] transition-colors"
            aria-label="Skip tour"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-5 sm:px-8 sm:py-7">
          <div className="flex flex-col sm:flex-row sm:items-start gap-5">
            {/* Preview mockup (left side, when present) */}
            {current.preview}

            {/* Text content */}
            <div className="flex-1 min-w-0 space-y-4">
              <div className="flex items-start gap-4">
                <div className="shrink-0 w-14 h-14 rounded-2xl bg-[#F97316]/10 border border-[#F97316]/20 flex items-center justify-center">
                  {current.icon}
                </div>
                <div className="space-y-2 min-w-0">
                  <h2 className="text-lg font-bold text-white leading-snug">{current.title}</h2>
                  <p className="text-sm text-[#8b949e] leading-relaxed">{current.description}</p>
                </div>
              </div>

              {current.tip && (
                <div className="bg-[#F97316]/5 border border-[#F97316]/25 rounded-xl px-5 py-3">
                  <p className="text-xs text-[#F97316] font-medium leading-relaxed">
                    Tip: {current.tip}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Progress dots */}
        <div className="flex justify-center gap-2 pb-2">
          {steps.map((_, i) => (
            <button
              key={i}
              onClick={() => setStep(i)}
              className={`rounded-full transition-all ${
                i === step ? 'w-6 h-2.5 bg-[#F97316]' : 'w-2.5 h-2.5 bg-[#30363d] hover:bg-[#8b949e]'
              }`}
              aria-label={`Go to step ${i + 1}`}
            />
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-5 border-t border-[#30363d]">
          <button
            onClick={prev}
            disabled={isFirst}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-[#8b949e] border border-[#30363d] rounded-lg hover:text-white hover:border-[#8b949e] transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="w-4 h-4" />
            Back
          </button>

          <button onClick={dismiss} className="text-sm text-[#8b949e] hover:text-white transition-colors">
            Skip tour
          </button>

          <button
            onClick={next}
            className="flex items-center gap-2 px-5 py-2 text-sm font-semibold bg-[#F97316] text-white rounded-lg hover:bg-[#ea6c0a] transition-colors"
          >
            {isLast ? 'Get Started' : 'Next'}
            {!isLast && <ChevronRight className="w-4 h-4" />}
          </button>
        </div>
      </div>}
    </div>
  );
}
