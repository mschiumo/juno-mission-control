'use client';

import { useState, useEffect, useCallback } from 'react';
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
} from 'lucide-react';

type TradingSubTab = 'overview' | 'market' | 'performance' | 'projection' | 'trade-management';
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

interface TourStep {
  subtab: TradingSubTab;
  targetDataTour?: string;
  tooltipSide?: TooltipSide;
  preview?: React.ReactNode;
  icon: React.ReactNode;
  title: string;
  description: string;
  tip?: string;
}

const STEPS: TourStep[] = [
  {
    subtab: 'overview',
    icon: <LayoutDashboard className="w-9 h-9 text-[#F97316]" />,
    title: 'Welcome to Your Trading Hub',
    description:
      'The Trading tab is your all-in-one workspace for tracking, analyzing, and planning trades. This quick tour will walk you through the most important features — it only takes a minute.',
    tip: 'Use the tabs at the top to switch between sections at any time.',
  },
  {
    subtab: 'overview',
    targetDataTour: 'trading-nav',
    tooltipSide: 'bottom',
    icon: <LayoutDashboard className="w-9 h-9 text-[#F97316]" />,
    title: 'Five Sections, One Tab',
    description:
      'Overview shows your P&L calendar and trade journal. Market gives you a live gap scanner. Trade Management has the position calculator and watchlist. Performance tracks your stats and AI journal insights. Profit Projection lets you model your strategy.',
    tip: "Click any tab to jump to that section — we'll show you each one.",
  },
  {
    subtab: 'overview',
    targetDataTour: 'trading-import',
    tooltipSide: 'left',
    icon: <Upload className="w-9 h-9 text-[#F97316]" />,
    title: 'Import from ThinkorSwim',
    description:
      "Export Today's Trade Activity from TOS and drop the CSV here. Confluence Trading pairs buys with sells, calculates P&L, and flags trades that already exist in your journal so you can merge or skip them.",
    tip: 'Merged trades keep your notes — brokerage numbers always win for the financials.',
  },
  {
    subtab: 'trade-management',
    icon: <Calculator className="w-9 h-9 text-[#F97316]" />,
    title: 'Position Calculator',
    description:
      "Enter your ticker, dollar risk, entry price, and stop — the calculator instantly tells you how many shares to buy. Never over-size a position again.",
    tip: 'Hit "Trading Mode" for a distraction-free fullscreen layout during the session.',
    preview: <CalcPreview />,
  },
  {
    subtab: 'trade-management',
    targetDataTour: 'trading-mode',
    tooltipSide: 'bottom',
    icon: <Maximize2 className="w-9 h-9 text-[#F97316]" />,
    title: 'Trading Mode',
    description:
      'Enter a distraction-free fullscreen workspace designed for the live session. Trading Mode shows your active trades strip and watchlist side-by-side — no tabs, no clutter.',
    tip: 'Press Esc at any time to exit Trading Mode and return to the full dashboard.',
  },
  {
    subtab: 'market',
    targetDataTour: 'gap-scanner',
    tooltipSide: 'right',
    icon: <TrendingUp className="w-9 h-9 text-[#F97316]" />,
    title: 'Live Gap Scanner',
    description:
      'Stocks gapping ≥ 2% with significant volume refresh every 15 seconds. Star any ticker to pin it to your watchlist. Review this list pre-market to build your trade plan for the day.',
    tip: 'Sort by gap % or volume to find the highest-conviction setups quickly.',
  },
  {
    subtab: 'performance',
    targetDataTour: 'journal-insights',
    tooltipSide: 'top',
    icon: <Brain className="w-9 h-9 text-[#F97316]" />,
    title: 'AI Journal Insights',
    description:
      'Generate an AI-powered analysis of your trade journal. The report surfaces what\'s working, areas to improve, and behavioral patterns across your entries — so you can spot recurring mistakes and double down on winning habits.',
    tip: 'Generate a report weekly to track how your patterns evolve over time.',
  },
  {
    subtab: 'projection',
    targetDataTour: 'profit-projection',
    tooltipSide: 'top',
    icon: <BarChart2 className="w-9 h-9 text-[#F97316]" />,
    title: 'Profit Projection',
    description:
      'Enter your win rate, average R:R, and trades per day to see projected monthly P&L, max drawdown, and Sharpe ratio. Stress-test your strategy before risking real capital.',
    tip: 'Small improvements in win rate compound dramatically over hundreds of trades.',
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

export default function TradingTour({ activeSubTab, onNavigate, onComplete }: TradingTourProps) {
  const [step, setStep] = useState(0);
  const [visible, setVisible] = useState(false);
  const [targetRect, setTargetRect] = useState<TargetRect | null>(null);

  const current = STEPS[step];
  const isFirst = step === 0;
  const isLast = step === STEPS.length - 1;

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 50);
    return () => clearTimeout(t);
  }, []);

  const locateTarget = useCallback(() => {
    if (!current.targetDataTour) {
      setTargetRect(null);
      return;
    }
    const el = document.querySelector<HTMLElement>(`[data-tour="${current.targetDataTour}"]`);
    if (!el) {
      setTargetRect(null);
      return;
    }
    // Scroll to top so elements are measured at their natural page position
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setTimeout(() => {
      const r = el.getBoundingClientRect();
      setTargetRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    }, 320);
  }, [current.targetDataTour]);

  useEffect(() => {
    setTargetRect(null);
    if (current.subtab !== activeSubTab) {
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
      const w = current.preview ? Math.min(720, vw - 32) : Math.min(TOOLTIP_WIDTH, vw - 32);
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
    const side = current.tooltipSide ?? 'bottom';
    const vh = window.innerHeight;
    const CARD_H = 360;

    // Wide elements need special treatment — there's no clean side to anchor.
    const isWide = width > vw * 0.75;
    const isTall = height > vh * 0.35;
    if (isWide) {
      const sBottom = top + height + PAD;
      if (!isTall) {
        // Wide but short (e.g. nav bar) — place the card below it, centered
        return {
          position: 'fixed',
          top: sBottom + GAP,
          left: '50%',
          transform: 'translateX(-50%)',
          width: Math.min(TOOLTIP_WIDTH, vw - 32),
          zIndex: 10004,
        };
      } else {
        // Wide and tall (e.g. calendar grid) — place above, or pin to top
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

    const style: React.CSSProperties = { position: 'fixed', width: TOOLTIP_WIDTH, zIndex: 10004 };

    const sTop = top - PAD;
    const sLeft = left - PAD;
    const sRight = left + width + PAD;
    const sBottom = top + height + PAD;
    const cx = left + width / 2;
    const cy = top + height / 2;

    if (side === 'bottom') {
      style.top = Math.min(sBottom + GAP, vh - CARD_H - 8);
      style.left = Math.max(8, Math.min(cx - TOOLTIP_WIDTH / 2, vw - TOOLTIP_WIDTH - 8));
    } else if (side === 'top') {
      style.top = Math.max(8, sTop - GAP - CARD_H);
      style.left = Math.max(8, Math.min(cx - TOOLTIP_WIDTH / 2, vw - TOOLTIP_WIDTH - 8));
    } else if (side === 'right') {
      style.top = Math.max(8, Math.min(cy - CARD_H / 2, vh - CARD_H - 8));
      style.left = Math.min(sRight + GAP, vw - TOOLTIP_WIDTH - 8);
    } else {
      style.top = Math.max(8, Math.min(cy - CARD_H / 2, vh - CARD_H - 8));
      style.left = Math.max(8, sLeft - GAP - TOOLTIP_WIDTH);
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
          style={{ position: 'fixed', inset: `0 0 auto 0`, height: sTop, background: OVERLAY, zIndex: 10001, pointerEvents: 'auto', cursor: 'default' }}
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
  const side = current.tooltipSide;
  // Don't render the card until position is known — prevents flash to wrong spot
  const cardReady = !current.targetDataTour || hasTarget;

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
            Tour · {step + 1} of {STEPS.length}
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
        <div className="px-8 py-7">
          <div className="flex items-start gap-5">
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
          {STEPS.map((_, i) => (
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
