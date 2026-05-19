'use client';

import { useEffect, useState } from 'react';
import { ShieldCheck, Quote } from 'lucide-react';

const QUOTES: { text: string; author: string }[] = [
  { text: 'The market is a device for transferring money from the impatient to the patient.', author: 'Warren Buffett' },
  { text: "It's not whether you're right or wrong that's important, but how much money you make when you're right and how much you lose when you're wrong.", author: 'George Soros' },
  { text: 'Markets can remain irrational longer than you can remain solvent.', author: 'John Maynard Keynes' },
  { text: 'Losers average losers.', author: 'Paul Tudor Jones' },
  { text: 'Amateurs think about how much money they can make. Professionals think about how much money they could lose.', author: 'Jack Schwager' },
  { text: "I'm only rich because I know when I'm wrong.", author: 'George Soros' },
  { text: 'The goal of a successful trader is to make the best trades. Money is secondary.', author: 'Alexander Elder' },
  { text: 'Risk comes from not knowing what you are doing.', author: 'Warren Buffett' },
  { text: 'The trend is your friend until the end when it bends.', author: 'Ed Seykota' },
  { text: 'Discipline is the bridge between goals and accomplishment.', author: 'Jim Rohn' },
  { text: 'Every battle is won before it is ever fought — by preparation.', author: 'Sun Tzu' },
  { text: "Don't focus on making money; focus on protecting what you have.", author: 'Paul Tudor Jones' },
];

function quoteForDay(ymd: string): { text: string; author: string } {
  let hash = 0;
  for (let i = 0; i < ymd.length; i++) hash = (hash * 31 + ymd.charCodeAt(i)) | 0;
  return QUOTES[Math.abs(hash) % QUOTES.length];
}

const RULES = [
  "Don't double trade",
  "Don't force entries",
  "Don't exit early or trail too tightly on runners",
  "Remain neutral, even after wins or losses",
  "After 3R total loss, stop trading for the day",
  "If up 3R on the day, preserve AT LEAST 1R of profit",
];

// US market holidays for 2026. Kept inline (not imported from lib/cron-helpers)
// because that module pulls in server-only deps. Keep in sync.
const US_MARKET_HOLIDAYS = new Set([
  '2026-01-01', '2026-01-19', '2026-02-16', '2026-04-03', '2026-05-25',
  '2026-06-19', '2026-07-03', '2026-09-07', '2026-11-26', '2026-12-25',
]);

const TRIGGER_HOUR = 9;
const TRIGGER_MINUTE = 15;
const STORAGE_PREFIX = 'trading_rules_ack_';

type EtParts = { weekday: string; hour: number; minute: number; ymd: string };

function getEtParts(date: Date): EtParts {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
    weekday: 'short', hour12: false,
  });
  const parts = fmt.formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  let hour = parseInt(get('hour'), 10);
  if (hour === 24) hour = 0;
  return {
    weekday: get('weekday'),
    hour,
    minute: parseInt(get('minute'), 10),
    ymd: `${get('year')}-${get('month')}-${get('day')}`,
  };
}

function isTradingDay(et: EtParts): boolean {
  if (et.weekday === 'Sat' || et.weekday === 'Sun') return false;
  return !US_MARKET_HOLIDAYS.has(et.ymd);
}

export default function TradingRulesModal() {
  const [show, setShow] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);

  useEffect(() => {
    const et = getEtParts(new Date());
    if (!isTradingDay(et)) return;

    const storageKey = `${STORAGE_PREFIX}${et.ymd}`;
    if (localStorage.getItem(storageKey)) return;

    const minutesNow = et.hour * 60 + et.minute;
    const triggerMinutes = TRIGGER_HOUR * 60 + TRIGGER_MINUTE;
    const msUntil = Math.max(0, (triggerMinutes - minutesNow) * 60 * 1000);

    const timer = setTimeout(() => setShow(true), msUntil);
    return () => clearTimeout(timer);
  }, []);

  function persistDismissal() {
    const et = getEtParts(new Date());
    localStorage.setItem(`${STORAGE_PREFIX}${et.ymd}`, new Date().toISOString());
    setShow(false);
  }

  function handleAcknowledge() {
    if (!acknowledged) return;
    persistDismissal();
  }

  if (!show) return null;

  const quote = quoteForDay(getEtParts(new Date()).ymd);

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[60] p-4">
      <div className="bg-[#161b22] border border-[#30363d] rounded-xl w-full max-w-lg overflow-hidden">
        <div className="bg-gradient-to-r from-[#1a1f2e] to-[#161b22] border-b border-[#30363d] p-6">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-[#F97316]/10 rounded-xl">
              <ShieldCheck className="w-6 h-6 text-[#F97316]" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Trading Rules</h2>
              <p className="text-sm text-[#8b949e]">
                Review before the open. Acknowledge to continue.
              </p>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-5">
          <div className="flex items-start gap-3 p-4 bg-[#F97316]/5 border border-[#F97316]/20 rounded-lg">
            <Quote className="w-4 h-4 text-[#F97316] flex-shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-sm text-[#e6edf3] italic leading-relaxed">
                &ldquo;{quote.text}&rdquo;
              </p>
              <p className="text-xs text-[#8b949e] mt-1.5">— {quote.author}</p>
            </div>
          </div>

          <ol className="space-y-2">
            {RULES.map((rule, i) => (
              <li
                key={i}
                className="flex items-start gap-3 p-3 bg-[#0d1117] border border-[#21262d] rounded-lg"
              >
                <span className="text-xs font-bold text-[#F97316] bg-[#F97316]/10 w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 tabular-nums">
                  {i + 1}
                </span>
                <span className="text-sm text-[#e6edf3] leading-relaxed">{rule}</span>
              </li>
            ))}
          </ol>

          <label className="flex items-start gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
              className="w-4 h-4 mt-0.5 rounded border-[#30363d] bg-[#0d1117] accent-[#F97316] flex-shrink-0"
            />
            <span className="text-sm text-[#c9d1d9] leading-snug">
              I&apos;ve reviewed my rules and commit to following them today.
            </span>
          </label>

          <button
            onClick={handleAcknowledge}
            disabled={!acknowledged}
            className="w-full py-3 rounded-lg text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:bg-[#21262d] disabled:text-[#484f58] bg-[#F97316] hover:bg-[#ea580c] text-white"
          >
            Start Trading
          </button>

          <button
            onClick={persistDismissal}
            className="block mx-auto text-xs text-[#8b949e] hover:text-[#c9d1d9] transition-colors"
          >
            Not trading today — dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
