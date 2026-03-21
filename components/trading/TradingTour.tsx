'use client';

import { useState, useEffect } from 'react';
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

interface TourStep {
  icon: React.ReactNode;
  title: string;
  description: string;
  tip?: string;
}

const STEPS: TourStep[] = [
  {
    icon: <LayoutDashboard className="w-8 h-8 text-[#F97316]" />,
    title: 'Welcome to Your Trading Hub',
    description:
      'The Trading tab is your all-in-one workspace for tracking, analyzing, and planning trades. It has four sections: Overview, Market, Trade Management, and Profit Projection.',
    tip: 'Use the tabs at the top to switch between sections at any time.',
  },
  {
    icon: <BookOpen className="w-8 h-8 text-[#F97316]" />,
    title: 'Overview — Calendar & Trade Journal',
    description:
      'The Overview shows a color-coded monthly P&L calendar. Green days are winners, red days are losers. Click any day to see every trade, add journal notes, rate your emotions, and log what you learned.',
    tip: 'Consistent journaling is the fastest way to identify patterns in your trading.',
  },
  {
    icon: <Upload className="w-8 h-8 text-[#F97316]" />,
    title: 'Import from ThinkorSwim',
    description:
      "Export your trade activity from TOS (Account Statement → Today's Trade Activity) and drag-drop the CSV into the Overview. Juno automatically pairs buys with sells, calculates P&L, and flags any trades that might already exist in your journal.",
    tip: 'When duplicates are detected, you can merge them (keeping your notes) or keep both entries.',
  },
  {
    icon: <Calculator className="w-8 h-8 text-[#F97316]" />,
    title: 'Trade Management — Size Your Position',
    description:
      'The Position Calculator shows your exact share count based on account size, risk per trade, and stop-loss distance. The Watchlist lets you pin tickers you\'re monitoring. Hit "Trading Mode" for a distraction-free fullscreen layout.',
    tip: 'Always calculate position size before entering — it removes emotion from risk decisions.',
  },
  {
    icon: <TrendingUp className="w-8 h-8 text-[#F97316]" />,
    title: 'Market — Gap Scanner',
    description:
      'The Market tab runs a live gap scanner every 15 seconds. It surfaces stocks gapping ≥ 2% with significant volume — prime candidates for momentum trades. Star a ticker to add it directly to your watchlist.',
    tip: 'Review the gap list during pre-market to build your plan for the day.',
  },
  {
    icon: <BarChart2 className="w-8 h-8 text-[#F97316]" />,
    title: 'Profit Projection — Model Your Strategy',
    description:
      'Enter your win rate, average risk-to-reward, and trades per day to see projected monthly P&L, maximum drawdown, and Sharpe ratio. Use this to stress-test your strategy before risking real capital.',
    tip: "Small improvements in win rate compound dramatically over hundreds of trades.",
  },
];

interface TradingTourProps {
  onComplete: () => void;
}

export default function TradingTour({ onComplete }: TradingTourProps) {
  const [step, setStep] = useState(0);
  const [visible, setVisible] = useState(false);

  // Fade in on mount
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 50);
    return () => clearTimeout(t);
  }, []);

  const current = STEPS[step];
  const isFirst = step === 0;
  const isLast = step === STEPS.length - 1;

  function dismiss() {
    setVisible(false);
    setTimeout(onComplete, 300);
  }

  function next() {
    if (isLast) {
      dismiss();
    } else {
      setStep(s => s + 1);
    }
  }

  function prev() {
    if (!isFirst) setStep(s => s - 1);
  }

  return (
    <div
      className={`fixed inset-0 z-[100] flex items-center justify-center transition-opacity duration-300 ${
        visible ? 'opacity-100' : 'opacity-0'
      }`}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={dismiss}
      />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-lg mx-4 bg-[#161b22] border border-[#30363d] rounded-2xl shadow-2xl overflow-hidden">
        {/* Header bar */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#30363d] bg-[#0d1117]/60">
          <span className="text-xs font-medium text-[#8b949e] uppercase tracking-wider">
            Quick Tour · {step + 1} of {STEPS.length}
          </span>
          <button
            onClick={dismiss}
            className="p-1 rounded-md text-[#8b949e] hover:text-white hover:bg-[#30363d] transition-colors"
            aria-label="Skip tour"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="px-8 py-8">
          <div className="flex flex-col items-center text-center gap-5">
            <div className="w-16 h-16 rounded-2xl bg-[#F97316]/10 border border-[#F97316]/20 flex items-center justify-center">
              {current.icon}
            </div>

            <div className="space-y-3">
              <h2 className="text-xl font-bold text-white">{current.title}</h2>
              <p className="text-sm text-[#8b949e] leading-relaxed max-w-sm">
                {current.description}
              </p>
            </div>

            {current.tip && (
              <div className="w-full bg-[#F97316]/5 border border-[#F97316]/20 rounded-xl px-4 py-3">
                <p className="text-xs text-[#F97316] font-medium">
                  Tip: {current.tip}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Progress dots */}
        <div className="flex justify-center gap-1.5 pb-2">
          {STEPS.map((_, i) => (
            <button
              key={i}
              onClick={() => setStep(i)}
              className={`rounded-full transition-all ${
                i === step
                  ? 'w-5 h-2 bg-[#F97316]'
                  : 'w-2 h-2 bg-[#30363d] hover:bg-[#8b949e]'
              }`}
              aria-label={`Go to step ${i + 1}`}
            />
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-[#30363d]">
          <button
            onClick={prev}
            disabled={isFirst}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#8b949e] border border-[#30363d] rounded-lg hover:text-white hover:border-[#8b949e] transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            Back
          </button>

          <button
            onClick={dismiss}
            className="text-xs text-[#8b949e] hover:text-white transition-colors"
          >
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
