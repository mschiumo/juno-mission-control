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
  BookOpen,
} from 'lucide-react';

type TradingSubTab = 'overview' | 'market' | 'projection' | 'trade-management';

interface TourStep {
  subtab: TradingSubTab;
  /** value of the data-tour attribute to spotlight; omit for centered modal */
  targetDataTour?: string;
  /** which side of the spotlight box to anchor the tooltip */
  tooltipSide?: 'top' | 'bottom' | 'left' | 'right';
  icon: React.ReactNode;
  title: string;
  description: string;
  tip?: string;
}

const STEPS: TourStep[] = [
  {
    subtab: 'overview',
    icon: <LayoutDashboard className="w-8 h-8 text-[#F97316]" />,
    title: 'Welcome to Your Trading Hub',
    description:
      'The Trading tab is your all-in-one workspace for tracking, analyzing, and planning trades. This quick tour highlights the most important features — it only takes a minute.',
    tip: 'Use the tabs at the top to switch between sections at any time.',
  },
  {
    subtab: 'overview',
    targetDataTour: 'trading-nav',
    tooltipSide: 'bottom',
    icon: <LayoutDashboard className="w-8 h-8 text-[#F97316]" />,
    title: 'Four Sections, One Tab',
    description:
      'Overview shows your P&L calendar and trade journal. Market gives you the live gap scanner. Trade Management has the position calculator and watchlist. Profit Projection lets you model your strategy.',
    tip: 'Click any tab to jump to that section — we\'ll walk through each one.',
  },
  {
    subtab: 'overview',
    targetDataTour: 'trading-calendar',
    tooltipSide: 'bottom',
    icon: <BookOpen className="w-8 h-8 text-[#F97316]" />,
    title: 'P&L Calendar',
    description:
      'Each day is color-coded: green for winners, red for losers. Click any day to see every trade from that session, write journal notes, rate your emotional state, and log lessons learned.',
    tip: 'Consistent journaling is the fastest way to find patterns in your trading.',
  },
  {
    subtab: 'overview',
    targetDataTour: 'trading-import',
    tooltipSide: 'bottom',
    icon: <Upload className="w-8 h-8 text-[#F97316]" />,
    title: 'Import from ThinkorSwim',
    description:
      'Export Today\'s Trade Activity from TOS and drop the CSV here. Juno pairs your buys with sells, calculates P&L, and flags trades that might already be in your journal so you can merge or skip them.',
    tip: 'Merged trades keep your notes and emotions — brokerage numbers always win for the financials.',
  },
  {
    subtab: 'trade-management',
    targetDataTour: 'position-calculator',
    tooltipSide: 'right',
    icon: <Calculator className="w-8 h-8 text-[#F97316]" />,
    title: 'Position Calculator',
    description:
      'Enter your account size, max risk per trade, and stop-loss distance — the calculator tells you exactly how many shares to buy. The watchlist on the right lets you pin tickers you\'re watching.',
    tip: 'Hit "Trading Mode" for a distraction-free fullscreen layout during the session.',
  },
  {
    subtab: 'market',
    targetDataTour: 'gap-scanner',
    tooltipSide: 'right',
    icon: <TrendingUp className="w-8 h-8 text-[#F97316]" />,
    title: 'Live Gap Scanner',
    description:
      'Stocks gapping ≥ 2% with significant volume refresh every 15 seconds. Star any ticker to pin it to your watchlist. Review this list pre-market to build your trade plan for the day.',
    tip: 'Sort by gap % or volume to find the highest-conviction setups quickly.',
  },
  {
    subtab: 'projection',
    targetDataTour: 'profit-projection',
    tooltipSide: 'top',
    icon: <BarChart2 className="w-8 h-8 text-[#F97316]" />,
    title: 'Profit Projection',
    description:
      'Enter your win rate, average R:R, and trades per day to see projected monthly P&L, max drawdown, and Sharpe ratio. Stress-test your strategy before risking real capital.',
    tip: 'Small improvements in win rate compound dramatically over hundreds of trades.',
  },
];

const TOOLTIP_WIDTH = 340;
const TOOLTIP_OFFSET = 16; // gap between spotlight border and tooltip

interface TargetRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface TradingTourProps {
  activeSubTab: TradingSubTab;
  onNavigate: (subtab: TradingSubTab) => void;
  onComplete: () => void;
}

export default function TradingTour({ activeSubTab, onNavigate, onComplete }: TradingTourProps) {
  const [step, setStep] = useState(0);
  const [visible, setVisible] = useState(false);
  const [targetRect, setTargetRect] = useState<TargetRect | null>(null);

  const current = STEPS[step];
  const isFirst = step === 0;
  const isLast = step === STEPS.length - 1;

  // Fade in on first mount
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 50);
    return () => clearTimeout(t);
  }, []);

  // When step changes: switch tab if needed, then find + scroll to target element
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
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    // Wait for scroll to settle before measuring
    setTimeout(() => {
      const r = el.getBoundingClientRect();
      setTargetRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    }, 350);
  }, [current.targetDataTour]);

  useEffect(() => {
    setTargetRect(null);
    if (current.subtab !== activeSubTab) {
      onNavigate(current.subtab);
      // Give the tab content time to render before measuring
      const t = setTimeout(locateTarget, 500);
      return () => clearTimeout(t);
    } else {
      const t = setTimeout(locateTarget, 150);
      return () => clearTimeout(t);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  function dismiss() {
    setVisible(false);
    setTimeout(onComplete, 300);
  }

  function next() {
    if (isLast) {
      dismiss();
    } else {
      setStep((s) => s + 1);
    }
  }

  function prev() {
    if (!isFirst) setStep((s) => s - 1);
  }

  // ── Tooltip positioning ────────────────────────────────────────────────────
  function tooltipStyle(): React.CSSProperties {
    if (!targetRect) {
      // Centered modal fallback
      return {
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: TOOLTIP_WIDTH,
        zIndex: 10002,
      };
    }

    const { top, left, width, height } = targetRect;
    const side = current.tooltipSide ?? 'bottom';
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const TOOLTIP_HEIGHT_EST = 280;
    const style: React.CSSProperties = { position: 'fixed', width: TOOLTIP_WIDTH, zIndex: 10002 };

    if (side === 'bottom') {
      style.top = Math.min(top + height + TOOLTIP_OFFSET, vh - TOOLTIP_HEIGHT_EST - 8);
      style.left = Math.max(8, Math.min(left + width / 2 - TOOLTIP_WIDTH / 2, vw - TOOLTIP_WIDTH - 8));
    } else if (side === 'top') {
      style.top = Math.max(8, top - TOOLTIP_HEIGHT_EST - TOOLTIP_OFFSET);
      style.left = Math.max(8, Math.min(left + width / 2 - TOOLTIP_WIDTH / 2, vw - TOOLTIP_WIDTH - 8));
    } else if (side === 'right') {
      style.top = Math.max(8, Math.min(top + height / 2 - TOOLTIP_HEIGHT_EST / 2, vh - TOOLTIP_HEIGHT_EST - 8));
      style.left = Math.min(left + width + TOOLTIP_OFFSET, vw - TOOLTIP_WIDTH - 8);
    } else {
      // left
      style.top = Math.max(8, Math.min(top + height / 2 - TOOLTIP_HEIGHT_EST / 2, vh - TOOLTIP_HEIGHT_EST - 8));
      style.left = Math.max(8, left - TOOLTIP_WIDTH - TOOLTIP_OFFSET);
    }

    return style;
  }

  return (
    <div
      className={`transition-opacity duration-300 ${visible ? 'opacity-100' : 'opacity-0'}`}
      style={{ position: 'fixed', inset: 0, zIndex: 10000, pointerEvents: 'none' }}
    >
      {/* Dark overlay — full screen backdrop */}
      <div
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.72)', pointerEvents: 'auto' }}
        onClick={dismiss}
      />

      {/* Spotlight cutout — sits on top of backdrop, cut out by the shadow */}
      {targetRect && (
        <div
          style={{
            position: 'fixed',
            top: targetRect.top - 6,
            left: targetRect.left - 6,
            width: targetRect.width + 12,
            height: targetRect.height + 12,
            borderRadius: 10,
            boxShadow: '0 0 0 9999px rgba(0,0,0,0.72)',
            border: '2px solid #F97316',
            pointerEvents: 'none',
            zIndex: 10001,
          }}
        />
      )}

      {/* Tooltip card */}
      <div
        style={{ ...tooltipStyle(), pointerEvents: 'auto' }}
        className="bg-[#161b22] border border-[#30363d] rounded-2xl shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[#30363d] bg-[#0d1117]/60">
          <span className="text-xs font-medium text-[#8b949e] uppercase tracking-wider">
            Tour · {step + 1} of {STEPS.length}
          </span>
          <button
            onClick={dismiss}
            className="p-1 rounded-md text-[#8b949e] hover:text-white hover:bg-[#30363d] transition-colors"
            aria-label="Skip tour"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5">
          <div className="flex items-start gap-4">
            <div className="shrink-0 w-12 h-12 rounded-xl bg-[#F97316]/10 border border-[#F97316]/20 flex items-center justify-center">
              {current.icon}
            </div>
            <div className="space-y-2 min-w-0">
              <h2 className="text-base font-bold text-white leading-snug">{current.title}</h2>
              <p className="text-sm text-[#8b949e] leading-relaxed">{current.description}</p>
            </div>
          </div>

          {current.tip && (
            <div className="mt-4 bg-[#F97316]/5 border border-[#F97316]/20 rounded-xl px-4 py-2.5">
              <p className="text-xs text-[#F97316] font-medium leading-relaxed">
                Tip: {current.tip}
              </p>
            </div>
          )}
        </div>

        {/* Progress dots */}
        <div className="flex justify-center gap-1.5 pb-1">
          {STEPS.map((_, i) => (
            <button
              key={i}
              onClick={() => setStep(i)}
              className={`rounded-full transition-all ${
                i === step ? 'w-5 h-2 bg-[#F97316]' : 'w-2 h-2 bg-[#30363d] hover:bg-[#8b949e]'
              }`}
              aria-label={`Go to step ${i + 1}`}
            />
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-[#30363d]">
          <button
            onClick={prev}
            disabled={isFirst}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#8b949e] border border-[#30363d] rounded-lg hover:text-white hover:border-[#8b949e] transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            Back
          </button>

          <button onClick={dismiss} className="text-xs text-[#8b949e] hover:text-white transition-colors">
            Skip tour
          </button>

          <button
            onClick={next}
            className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold bg-[#F97316] text-white rounded-lg hover:bg-[#ea6c0a] transition-colors"
          >
            {isLast ? 'Get Started' : 'Next'}
            {!isLast && <ChevronRight className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>
    </div>
  );
}
