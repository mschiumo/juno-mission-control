'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import {
  TrendingUp, BarChart2, BookOpen, Target, Zap,
  Calendar, ArrowRight, CheckCircle, LineChart,
  Activity, Shield, ChevronRight, LogIn,
  Sparkles, Brain, Lightbulb, TrendingDown, Download,
  Bell, Newspaper, Sunrise, Star, SlidersHorizontal, Mail, Instagram,
} from 'lucide-react';

import { TIER_PRICING, ANNUAL_DISCOUNT, PLATINUM_COMING_SOON } from '@/lib/entitlements';
import FeatureCarousel from '@/components/landing/FeatureCarousel';
import ComparePlans from '@/components/landing/ComparePlans';

const SUPPORT_EMAIL = 'confluencetradingsupport@gmail.com';

/* ─── Hero trade-plan chart geometry ───
   The price chops sideways, pulls back to the entry at (208,141) — where
   the EMA and VWAP converge (the "confluence" moment, echoing the logo) —
   then breaks out through the target. All three paths draw in on load. */
const HERO_PRICE =
  'M 0,160 L 16,155 L 30,161 L 46,150 L 60,157 L 76,146 L 92,152 L 106,144 ' +
  'L 122,150 L 138,137 L 154,144 L 170,133 L 186,138 L 200,146 L 208,141 ' +
  'L 230,124 L 244,130 L 266,108 L 280,114 L 306,90 L 320,97 L 348,74 ' +
  'L 362,80 L 392,56 L 406,62 L 434,44 L 452,49 L 476,38';
const HERO_EMA =
  'M 0,176 C 50,172 110,164 160,152 C 185,146 200,143 208,141 ' +
  'C 250,131 300,114 350,94 C 400,74 440,60 476,52';
const HERO_VWAP =
  'M 0,116 C 50,122 110,130 160,138 C 185,140 200,141 208,141 ' +
  'C 255,133 310,118 360,100 C 415,79 450,68 476,62';

/* one-shot hero animations (document timeline — hero is visible on load);
   data-loop opts them out under prefers-reduced-motion, leaving end states */
const heroDraw = (delay: string, dur = '1.3s') => ({
  animation: `draw ${dur} cubic-bezier(.4,.6,.3,1) ${delay} both`,
} as CSSProperties);
const heroFade = (delay: string, dur = '.5s') => ({
  animation: `fadeIn ${dur} ease-out ${delay} both`,
} as CSSProperties);

/* ─── Gap scanner rows ─── */
const GAPS = [
  { ticker: 'NVDA', gap: '+6.8%', price: '$148.20', vol: '82M',  catalyst: 'Earnings Beat',    pos: true  },
  { ticker: 'META', gap: '+4.1%', price: '$560.40', vol: '34M',  catalyst: 'Rev. Guidance Up', pos: true  },
  { ticker: 'AAPL', gap: '-2.3%', price: '$187.80', vol: '18M',  catalyst: 'Revenue Miss',     pos: false },
  { ticker: 'SPY',  gap: '+1.2%', price: '$512.40', vol: '56M',  catalyst: 'Macro Rally',      pos: true  },
  { ticker: 'TSLA', gap: '-4.7%', price: '$175.60', vol: '61M',  catalyst: 'Deliveries Miss',  pos: false },
];

/* ─── Morning briefing mock data ─── */
const BRIEFING_INDICES = [
  { name: 'SPY', value: '$514.80', chg: '+0.62%', pos: true  },
  { name: 'QQQ', value: '$441.25', chg: '+0.94%', pos: true  },
  { name: 'VIX', value: '13.20',   chg: '-4.10%', pos: false },
  { name: 'BTC', value: '$71,240', chg: '+2.30%', pos: true  },
];

const BRIEFING_MOVERS = [
  { ticker: 'NVDA', chg: '+6.8%', pos: true  },
  { ticker: 'SMCI', chg: '+5.1%', pos: true  },
  { ticker: 'COIN', chg: '+3.4%', pos: true  },
  { ticker: 'TSLA', chg: '-3.2%', pos: false },
];

const BRIEFING_NEWS = [
  { headline: 'CPI cools to 2.6% y/y — futures extend gains',   cat: 'Macro',    catColor: '#58a6ff', pos: true  },
  { headline: 'NVDA beats and raises full-year guidance',       cat: 'Earnings', catColor: '#39c5cf', pos: true  },
  { headline: 'Two Fed speakers signal patience on rate cuts',  cat: 'Fed',      catColor: '#bc8cff', pos: null  },
] as { headline: string; cat: string; catColor: string; pos: boolean | null }[];

/* ─── Feature cards data ─── */
const FEATURES = [
  /* ── Before the bell ── */
  {
    icon: Sunrise,
    title: 'Market Briefings',
    desc: 'AI-generated morning briefings with indices, big movers, news highlights, and upcoming events — in your inbox before the bell.',
    tags: ['Daily Email', 'AI Summary', 'PDF'],
    bg: 'bg-[#d29922]/10',
    color: 'text-[#d29922]',
  },
  {
    icon: Zap,
    title: 'Gap Scanner',
    desc: 'Pre-market scanner surfaces opening gaps ranked by gap size, volume, and catalyst — then keeps scanning after the open.',
    tags: ['Pre-market', 'Intraday', 'Catalysts'],
    bg: 'bg-[#f0883e]/10',
    color: 'text-[#f0883e]',
  },
  {
    icon: Bell,
    title: 'Intraday Alerts',
    desc: 'Movers in the 1H, 2H, and 4H windows are scored by move size, relative volume, and spread tightness — the top ten ring the bell.',
    tags: ['Scored', 'Top 10', 'Chime'],
    bg: 'bg-[#f85149]/10',
    color: 'text-[#f85149]',
  },
  /* ── Stay informed ── */
  {
    icon: Newspaper,
    title: 'News Screener',
    desc: 'Live market news tagged by sentiment and category — Fed, macro, M&A, earnings, AI, and crypto — with a high-priority digest.',
    tags: ['Sentiment', 'High-Impact', 'Live'],
    bg: 'bg-[#39c5cf]/10',
    color: 'text-[#39c5cf]',
  },
  {
    icon: Calendar,
    title: 'Market Events',
    desc: 'Stay informed about earnings dates, FOMC meetings, CPI releases, and high-impact market catalysts.',
    tags: ['Earnings', 'FOMC', 'Catalysts'],
    bg: 'bg-[#79c0ff]/10',
    color: 'text-[#79c0ff]',
  },
  {
    icon: Star,
    title: 'Daily Favorites',
    desc: 'A lightweight watchlist auto-seeded every weekday morning. Add entry, stop, and target to graduate a ticker into a full trade plan.',
    tags: ['Auto-Seeded', 'Premarket', 'Quick Add'],
    bg: 'bg-[#e3b341]/10',
    color: 'text-[#e3b341]',
  },
  /* ── Plan & execute ── */
  {
    icon: TrendingUp,
    title: 'Watchlist',
    desc: 'Build and manage your watchlist with price targets, support/resistance levels, and setup notes.',
    tags: ['Watchlist', 'Targets', 'Setups'],
    bg: 'bg-[#bc8cff]/10',
    color: 'text-[#bc8cff]',
  },
  {
    icon: Target,
    title: 'Risk & Trade Management',
    desc: 'See every trade before you take it — entry, stop, and target mapped on one screen, with your dollar risk and exact share size computed for you. Never over-size a position again.',
    tags: ['Entry/Stop/Target', 'Risk $', 'Share Size'],
    bg: 'bg-[#58a6ff]/10',
    color: 'text-[#58a6ff]',
  },
  {
    icon: BookOpen,
    title: 'Trade Journal',
    desc: 'Log every trade with strategy tags, emotional state, risk parameters, and detailed notes for post-analysis.',
    tags: ['Journal', 'Notes', 'Tags'],
    bg: 'bg-[#F97316]/10',
    color: 'text-[#F97316]',
  },
  /* ── Review & improve ── */
  {
    icon: LineChart,
    title: 'P&L Analytics',
    desc: 'Visualize performance with equity curves, strategy breakdowns, and detailed win/loss statistics.',
    tags: ['Charts', 'Metrics', 'Trends'],
    bg: 'bg-[#3fb950]/10',
    color: 'text-[#3fb950]',
  },
  {
    icon: SlidersHorizontal,
    title: 'Profit Projection',
    desc: 'Model best-, base-, and worst-case scenarios from your entry, stop, and target — see the R-multiples before you commit capital.',
    tags: ['Scenarios', 'R-Multiples', 'Planning'],
    bg: 'bg-[#db61a2]/10',
    color: 'text-[#db61a2]',
  },
  {
    icon: Sparkles,
    title: 'AI Insights',
    desc: 'Get personalized, AI-generated reports that analyze your habits, consistency, and emotional patterns to improve your trading.',
    tags: ['AI-Powered', 'Patterns', 'Reports'],
    bg: 'bg-[#8957e5]/10',
    color: 'text-[#8957e5]',
  },
];

/* ─── Scroll-animation helpers ───
   With a view() timeline animation-delay is a no-op, so siblings
   stagger by shifting animation-range instead (see globals.css). */
const range = (r: string) => ({ animationRange: r } as CSSProperties);

/* ══════════════════════════════════════════════════════════════════
   COMPONENT
══════════════════════════════════════════════════════════════════ */

/**
 * Founder section — a face and a name where the "who built this?" question
 * forms, right before pricing. The portrait ships in /public as a true
 * grayscale asset; the CSS filter is belt-and-suspenders so any future
 * replacement photo renders black-and-white too. Hidden only if the image
 * genuinely fails (checked via naturalWidth on mount to dodge the
 * loads-before-hydration race).
 */
function FounderSection() {
  const [photoFailed, setPhotoFailed] = useState(false);
  return (
    <section
      className="px-6 border-t border-[#30363d] bg-[#161b22]/20"
      style={{ display: photoFailed ? 'none' : undefined }}
    >
      <div className="max-w-4xl mx-auto py-24 flex flex-col md:flex-row items-center gap-10">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/founder.jpg"
          alt="Michael J. Schiuma, founder of ConfluenceTrading"
          onError={() => setPhotoFailed(true)}
          ref={(el) => {
            if (el && el.complete && el.naturalWidth === 0) setPhotoFailed(true);
          }}
          className="w-44 h-44 md:w-52 md:h-52 rounded-2xl object-cover shrink-0 border border-[#30363d]"
          style={{ filter: 'grayscale(1)', objectPosition: 'center 20%' }}
        />
        <div className="text-center md:text-left">
          <p className="text-sm text-[#F97316] font-semibold uppercase tracking-widest mb-3">
            Built by a trader
          </p>
          <h2 className="text-3xl font-bold text-white mb-1">Michael J. Schiuma</h2>
          <p className="text-sm text-[#8b949e] mb-5">Founder, ConfluenceTrading</p>
          <p className="text-[#c9d1d9] leading-relaxed mb-4">
            &ldquo;I built ConfluenceTrading as a solution to my own issues with trading
            psychology. Everyone can become a trader, but only the disciplined become great
            traders. With ConfluenceTrading, the tools are there for you. I stand by that,
            because I use them in my own sessions, every market day. Discipline isn&apos;t a
            personality trait; it&apos;s a system. This is mine, and now it&apos;s yours.&rdquo;
          </p>
          <p className="text-sm text-[#8b949e]">
            Questions land in my inbox —{' '}
            <a href={`mailto:${SUPPORT_EMAIL}`} className="text-[#F97316] hover:underline">
              write to me directly
            </a>
            .
          </p>
        </div>
      </div>
    </section>
  );
}

export default function LandingPage() {
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('monthly');
  /* KPI count-up — the only JS animation. setInterval, not rAF: rAF is
     throttled in some embedded/background contexts and silently never
     ticks. Resting state is the final value, so if this never runs the
     KPIs still read correctly. */
  useEffect(() => {
    const card = document.getElementById('equity-card');
    if (!card || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const countUp = (root: HTMLElement) => {
      const els = Array.from(root.querySelectorAll<HTMLElement>('[data-count]'));
      const D = 2200, t0 = Date.now();
      const fmt = (el: HTMLElement, p: number) => {
        const to = parseFloat(el.dataset.count || '0');
        const dp = +(el.dataset.countDp || 0);
        const v  = (to * p).toLocaleString('en-US',
                     { minimumFractionDigits: dp, maximumFractionDigits: dp });
        el.textContent = (el.dataset.countPre || '') + v + (el.dataset.countSuf || '');
      };
      const id = setInterval(() => {
        const k = Math.min(1, (Date.now() - t0) / D);
        const p = 1 - Math.pow(1 - k, 3); // easeOutCubic
        els.forEach(el => fmt(el, p));
        if (k >= 1) {
          clearInterval(id);
          // landing flash — text-shadow (not transform) so inline spans work
          els.forEach(el => el.animate(
            [
              { textShadow: '0 0 0 rgba(53,208,127,0)' },
              { textShadow: '0 0 16px rgba(53,208,127,.95)' },
              { textShadow: '0 0 0 rgba(53,208,127,0)' },
            ],
            { duration: 700, easing: 'ease-out' },
          ));
        }
      }, 32);
    };

    const io = new IntersectionObserver((es, obs) => {
      es.forEach(e => { if (e.isIntersecting) { countUp(card); obs.disconnect(); } });
    }, { threshold: 0.15 });
    io.observe(card);
    return () => io.disconnect();
  }, []);

  // Root uses overflow-x-clip, not -hidden: hidden would make this div a
  // scroll container and hijack every view() animation timeline inside it.
  return (
    <div className="min-h-screen bg-[#0d1117] text-[#e6edf3] overflow-x-clip">

      {/* ═══ NAVBAR ═══ */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-[#30363d] bg-[#0d1117]/90 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-[#161b22] border border-[#30363d] flex items-center justify-center">
              <svg viewBox="0 0 48 48" fill="none" className="w-5 h-5">
                <line x1="7" y1="13" x2="24" y2="24" stroke="white" strokeWidth="2.8" strokeLinecap="round"/>
                <line x1="7" y1="35" x2="24" y2="24" stroke="white" strokeWidth="2.8" strokeLinecap="round"/>
                <line x1="24" y1="24" x2="41" y2="24" stroke="white" strokeWidth="2.8" strokeLinecap="round"/>
                <circle cx="24" cy="24" r="2.5" fill="white"/>
              </svg>
            </div>
            <span className="font-bold text-white text-base">Confluence Trading</span>
          </div>

          <div className="hidden md:flex items-center gap-8">
            <a href="#features"    className="text-sm text-[#8b949e] hover:text-white transition-colors">Features</a>
            <a href="#analytics"   className="text-sm text-[#8b949e] hover:text-white transition-colors">Analytics</a>
            <a href="#market-intel" className="text-sm text-[#8b949e] hover:text-white transition-colors">Market Intel</a>
            <a href="#how-it-works" className="text-sm text-[#8b949e] hover:text-white transition-colors">How It Works</a>
            <a href="#pricing" className="text-sm text-[#8b949e] hover:text-white transition-colors">Pricing</a>
            <a href="#contact" className="text-sm text-[#8b949e] hover:text-white transition-colors">Contact</a>
          </div>

          <div className="flex items-center gap-3">
            <Link href="/login" className="hidden sm:flex items-center gap-1.5 px-4 py-2 text-sm text-[#8b949e] hover:text-white transition-colors">
              <LogIn className="w-3.5 h-3.5" />
              Sign In
            </Link>
            <Link href="/signup" className="px-4 py-2 text-sm font-semibold bg-[#F97316] hover:bg-[#ea6c0a] text-white rounded-lg transition-colors">
              Sign Up Free
            </Link>
          </div>
        </div>
      </nav>

      {/* ═══ HERO ═══ */}
      <section className="pt-28 pb-20 px-6 relative overflow-hidden">
        {/* ambient glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[500px] bg-[#F97316]/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute top-40 left-1/4 w-[400px] h-[300px] bg-[#3fb950]/3 rounded-full blur-3xl pointer-events-none" />

        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">

          {/* Text */}
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-[#30363d] bg-[#161b22] text-xs text-[#8b949e] mb-6">
              <span className="w-1.5 h-1.5 rounded-full bg-[#3fb950] animate-pulse" />
              Trading Journal, Alerts &amp; Market Intelligence
            </div>

            <h1 className="text-5xl lg:text-6xl font-bold text-white leading-tight mb-6">
              Trade with{' '}
              <span className="text-[#F97316]">Precision.</span>
              <br />
              Journal with{' '}
              <span className="text-[#F97316]">Purpose.</span>
            </h1>

            <p className="text-lg text-[#8b949e] leading-relaxed mb-8 max-w-lg">
              A comprehensive trading command center for disciplined traders. Track every trade,
              analyze your patterns, and sharpen your edge with real-time market intelligence.
            </p>

            <div className="flex flex-wrap items-center gap-4 mb-10">
              <Link href="/signup" className="flex items-center gap-2 px-6 py-3 bg-[#F97316] hover:bg-[#ea6c0a] text-white font-semibold rounded-xl transition-colors shadow-lg shadow-[#F97316]/20">
                Start for Free
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link href="/login" className="px-6 py-3 border border-[#30363d] text-[#e6edf3] hover:border-[#F97316]/60 hover:text-[#F97316] font-medium rounded-xl transition-colors">
                Sign In
              </Link>
            </div>

            <div className="flex flex-wrap items-center gap-5 text-sm text-[#8b949e]">
              {['No credit card required', 'Free to get started', 'Real-time market data'].map(item => (
                <div key={item} className="flex items-center gap-1.5">
                  <CheckCircle className="w-3.5 h-3.5 text-[#3fb950]" />
                  {item}
                </div>
              ))}
            </div>
          </div>

          {/* Chart mockup */}
          <div className="relative">
            <div className="rounded-2xl border border-[#30363d] bg-[#161b22] overflow-hidden shadow-2xl shadow-black/50">
              {/* Header — the card is a trade plan, not a generic chart window */}
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#30363d]">
                <div className="flex items-center gap-2.5">
                  <div className="w-6 h-6 rounded-md bg-[#F97316]/10 flex items-center justify-center">
                    <TrendingUp className="w-3.5 h-3.5 text-[#F97316]" />
                  </div>
                  <span className="text-xs font-semibold text-white">NVDA — Trade Plan</span>
                  <span className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-[#3fb950]/15 text-[#3fb950] tracking-wider">LONG</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="px-2 py-0.5 rounded bg-[#F97316]/10 text-[#F97316] font-mono font-semibold">+2.4R</span>
                  <span className="text-[#8b949e] font-mono">$151.84</span>
                </div>
              </div>

              {/* Trade-plan SVG — entry/stop/target levels, EMA+VWAP converging
                  at the entry (the confluence moment), breakout to target */}
              <div className="px-4 pt-4 pb-2">
                <svg viewBox="0 0 480 230" className="w-full h-[200px]">
                  <defs>
                    <linearGradient id="heroGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3fb950" stopOpacity="0.16" />
                      <stop offset="100%" stopColor="#3fb950" stopOpacity="0" />
                    </linearGradient>
                  </defs>

                  {/* level lines + labels (static baseline — always visible) */}
                  <line x1="0" y1="100" x2="480" y2="100" stroke="#21262d" strokeWidth="1" />
                  <line x1="0" y1="58"  x2="480" y2="58"  stroke="#3fb950" strokeWidth="1" strokeDasharray="5 4" opacity="0.35" />
                  <line x1="0" y1="140" x2="480" y2="140" stroke="#8b949e" strokeWidth="1" strokeDasharray="5 4" opacity="0.30" />
                  <line x1="0" y1="185" x2="480" y2="185" stroke="#f85149" strokeWidth="1" strokeDasharray="5 4" opacity="0.35" />
                  <text x="4" y="54"  fill="#3fb950" fontSize="8" fontFamily="monospace" opacity="0.9">TARGET 151.10</text>
                  <text x="4" y="136" fill="#8b949e" fontSize="8" fontFamily="monospace" opacity="0.9">ENTRY 142.50</text>
                  <text x="4" y="181" fill="#f85149" fontSize="8" fontFamily="monospace" opacity="0.9">STOP 138.20</text>

                  {/* risk / reward zones from the entry forward, priced in R */}
                  <g data-loop style={heroFade('.9s')}>
                    <rect x="208" y="58"  width="272" height="82" fill="#3fb950" opacity="0.06" />
                    <rect x="208" y="140" width="272" height="45" fill="#f85149" opacity="0.05" />
                    <text x="472" y="74"  textAnchor="end" fill="#3fb950" fontSize="9" fontFamily="monospace" fontWeight="bold" opacity="0.9">+2.4R</text>
                    <text x="472" y="178" textAnchor="end" fill="#f85149" fontSize="9" fontFamily="monospace" fontWeight="bold" opacity="0.7">-1R</text>
                  </g>

                  {/* area under price */}
                  <path d={`${HERO_PRICE} L 476,230 L 0,230 Z`} fill="url(#heroGrad)" data-loop style={heroFade('.9s', '.8s')} />

                  {/* VWAP + EMA — converge exactly at the entry point */}
                  <path d={HERO_VWAP} stroke="#58a6ff" strokeWidth="1.3" fill="none" opacity="0.5"
                        strokeDasharray="1400" data-loop style={heroDraw('.7s')} />
                  <path d={HERO_EMA} stroke="#F97316" strokeWidth="1.6" fill="none" opacity="0.8"
                        strokeLinecap="round" strokeDasharray="1400" data-loop style={heroDraw('.55s')} />
                  {/* price */}
                  <path d={HERO_PRICE} stroke="#3fb950" strokeWidth="2.2" fill="none"
                        strokeLinecap="round" strokeLinejoin="round" strokeDasharray="1400"
                        data-loop style={heroDraw('.2s', '1.5s')} />

                  {/* entry marker — the confluence moment */}
                  <g data-loop style={heroFade('1.5s')}>
                    <circle cx="208" cy="141" r="4.5" fill="#F97316" data-loop
                            style={{ transformBox: 'fill-box', transformOrigin: 'center', animation: 'dotRing var(--lp-pulse) 1.9s infinite' } as CSSProperties} />
                    <circle cx="208" cy="141" r="4.5" fill="#F97316" />
                    <rect x="218" y="150" width="92" height="15" rx="3" fill="#F97316" opacity="0.14" />
                    <text x="224" y="160.5" fill="#F97316" fontSize="7.5" fontFamily="monospace" fontWeight="bold">CONFLUENCE ✓</text>
                  </g>

                  {/* live price dot at target */}
                  <g data-loop style={heroFade('1.8s')}>
                    <circle cx="476" cy="40" r="4" fill="#3fb950" data-loop
                            style={{ transformBox: 'fill-box', transformOrigin: 'center', animation: 'dotRing var(--lp-pulse) 2.2s infinite' } as CSSProperties} />
                    <circle cx="476" cy="40" r="4" fill="#3fb950" />
                    <rect x="428" y="24" width="42" height="15" rx="3" fill="#3fb950" opacity="0.15" />
                    <text x="449" y="35" textAnchor="middle" fill="#3fb950" fontSize="8" fontFamily="monospace" fontWeight="bold">151.84</text>
                  </g>
                </svg>
              </div>

              {/* Stats row */}
              <div className="grid grid-cols-3 divide-x divide-[#30363d] border-t border-[#30363d]">
                {[
                  { label: 'Win Rate',  value: '68.4%', color: 'text-[#3fb950]' },
                  { label: 'Avg R/R',   value: '2.3:1', color: 'text-[#58a6ff]' },
                  { label: 'Total P&L', value: '+$4,280', color: 'text-[#3fb950]' },
                ].map(s => (
                  <div key={s.label} className="px-4 py-3 text-center">
                    <p className="text-[10px] text-[#8b949e] mb-0.5">{s.label}</p>
                    <p className={`text-sm font-bold ${s.color}`}>{s.value}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Floating today P&L badge */}
            <div className="hidden lg:flex absolute -left-10 top-1/3 items-center gap-2.5 bg-[#161b22] border border-[#30363d] rounded-xl p-3 shadow-xl">
              <div className="w-9 h-9 rounded-lg bg-[#3fb950]/10 flex items-center justify-center">
                <TrendingUp className="w-4 h-4 text-[#3fb950]" />
              </div>
              <div>
                <p className="text-white font-bold text-sm">+$847</p>
                <p className="text-[#8b949e] text-xs">Today&apos;s P&amp;L</p>
              </div>
            </div>

            {/* Floating win streak badge */}
            <div className="hidden lg:flex absolute -right-6 bottom-28 items-center gap-2.5 bg-[#161b22] border border-[#30363d] rounded-xl p-3 shadow-xl">
              <div className="w-9 h-9 rounded-lg bg-[#F97316]/10 flex items-center justify-center">
                <Target className="w-4 h-4 text-[#F97316]" />
              </div>
              <div>
                <p className="text-white font-bold text-sm">3 Wins</p>
                <p className="text-[#8b949e] text-xs">0 Losses Today</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ FEATURES ═══ */}
      <section id="features" className="py-24 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-10">
            <p className="text-sm text-[#F97316] font-semibold uppercase tracking-widest mb-3">Everything You Need</p>
            <h2 className="text-4xl font-bold text-white mb-4">Built for Disciplined Traders</h2>
            <p className="text-[#8b949e] max-w-2xl mx-auto text-lg">
              From the morning briefing to the post-trade review — every feature is designed to help
              you trade with consistency, track your performance, and continuously improve your edge.
            </p>
          </div>

          <FeatureCarousel />

          {/* ═══ SUPPORTED BROKERS — sliding logo strip ═══ */}
          <div className="mt-12 overflow-hidden">
            <p className="text-center text-[11px] text-[#8b949e] font-semibold uppercase tracking-[0.15em] mb-6">
              Works with your broker · powered by SnapTrade
            </p>
            <div className="broker-marquee overflow-hidden">
              <div className="broker-marquee-track">
                {[0, 1].map(copy => (
                  <div key={copy} className="flex shrink-0 items-center" aria-hidden={copy === 1}>
                    {([
                      ['schwab.png', 'Charles Schwab'],
                      ['robinhood.png', 'Robinhood'],
                      ['fidelity.png', 'Fidelity'],
                      ['etrade.png', 'E*TRADE'],
                      ['webull.png', 'Webull'],
                      ['interactive-brokers.png', 'Interactive Brokers'],
                      ['vanguard.png', 'Vanguard'],
                      ['thinkorswim.png', 'thinkorswim'],
                      ['tastytrade.png', 'tastytrade'],
                      ['coinbase.png', 'Coinbase'],
                    ] as [string, string][]).map(([file, name]) => (
                      <div
                        key={name}
                        className="group flex items-center gap-2.5 px-8 opacity-90 hover:opacity-100 transition-opacity duration-300"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={`/brokers/${file}`}
                          alt={`${name} logo`}
                          className="w-7 h-7 rounded-lg"
                        />
                        <span className="text-sm font-medium text-[#8b949e] group-hover:text-white whitespace-nowrap transition-colors duration-300">
                          {name}
                        </span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ ANALYTICS SHOWCASE ═══ */}
      <section id="analytics" className="py-24 px-6 bg-[#161b22]/20">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-12 items-center">

            {/* Text */}
            <div className="lg:col-span-2" data-reveal="left" style={range('entry 6% entry 62%')}>
              <p className="text-sm text-[#F97316] font-semibold uppercase tracking-widest mb-3">Performance Analytics</p>
              <h2 className="text-4xl font-bold text-white mb-4">See Your Edge Clearly</h2>
              <p className="text-[#8b949e] leading-relaxed mb-8">
                Visual analytics reveal patterns in your trading behavior. Understand which setups work,
                when you trade best, and where your edge lies.
              </p>

              <div className="space-y-4">
                {[
                  { label: 'Equity Curve',      desc: 'Track account growth over time' },
                  { label: 'Strategy Breakdown', desc: 'P&L segmented by setup type' },
                  { label: 'Emotional Analysis', desc: 'Correlate state of mind with P&L' },
                  { label: 'Win Rate Heatmap',   desc: 'Identify your best trading days' },
                ].map((item, i) => (
                  <div key={item.label} className="flex items-start gap-3" data-reveal="sm" style={range(`entry ${14 + i * 5}% cover ${26 + i * 5}%`)}>
                    <div className="w-5 h-5 mt-0.5 rounded-full bg-[#F97316]/10 flex items-center justify-center flex-shrink-0">
                      <ChevronRight className="w-3 h-3 text-[#F97316]" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-white">{item.label}</p>
                      <p className="text-xs text-[#8b949e]">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Equity curve card */}
            <div className="lg:col-span-3">
              <div id="equity-card" className="rounded-2xl border border-[#30363d] bg-[#161b22] overflow-clip shadow-2xl" data-reveal="right" style={range('entry 6% entry 60%')}>
                <div className="px-6 py-4 border-b border-[#30363d] flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-white">Equity Curve</p>
                    <p className="text-xs text-[#8b949e]">Account Growth — Year to Date</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xl font-bold text-[#3fb950]" data-count="12840" data-count-pre="+$" style={{ fontVariantNumeric: 'tabular-nums' }}>+$12,840</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-[#3fb950]/10 text-[#3fb950] font-semibold" data-count="28.4" data-count-dp="1" data-count-pre="+" data-count-suf="%" style={{ fontVariantNumeric: 'tabular-nums' }}>+28.4%</span>
                  </div>
                </div>

                <div className="p-6">
                  <svg viewBox="0 0 600 200" className="w-full h-[180px]">
                    <defs>
                      <linearGradient id="equityGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#3fb950" stopOpacity="0.25" />
                        <stop offset="100%" stopColor="#3fb950" stopOpacity="0" />
                      </linearGradient>
                    </defs>

                    {/* Grid */}
                    <g style={{ animation: 'fadeIn .6s ease-out both', animationTimeline: 'view()', animationRange: 'entry 10% cover 26%' } as CSSProperties}>
                      {[40, 80, 120, 160].map(y => (
                        <line key={y} x1="0" y1={y} x2="600" y2={y} stroke="#21262d" strokeWidth="1" />
                      ))}
                      {[
                        { y: 42,  label: '$58k' },
                        { y: 82,  label: '$52k' },
                        { y: 122, label: '$47k' },
                        { y: 162, label: '$45k' },
                      ].map(item => (
                        <text key={item.y} x="4" y={item.y} fill="#484f58" fontSize="9" fontFamily="monospace">{item.label}</text>
                      ))}
                    </g>

                    {/* Area */}
                    <path d="M 0,180 L 30,175 L 60,170 L 90,165 L 120,172 L 150,158 L 180,148 L 210,155 L 240,140 L 270,128 L 300,118 L 330,125 L 360,108 L 390,96 L 420,84 L 450,72 L 480,60 L 510,50 L 540,45 L 570,42 L 600,38 L 600,200 L 0,200 Z"
                          fill="url(#equityGrad)"
                          style={{ transformBox: 'fill-box', transformOrigin: '50% 100%', animation: 'areaIn .85s cubic-bezier(.16,.84,.3,1) both', animationTimeline: 'view()', animationRange: 'entry 14% cover 30%' } as CSSProperties} />
                    {/* Line — stroke-dasharray must be ≥ path length for the draw effect */}
                    <path d="M 0,180 L 30,175 L 60,170 L 90,165 L 120,172 L 150,158 L 180,148 L 210,155 L 240,140 L 270,128 L 300,118 L 330,125 L 360,108 L 390,96 L 420,84 L 450,72 L 480,60 L 510,50 L 540,45 L 570,42 L 600,38"
                          stroke="#3fb950" strokeWidth="2.5" fill="none"
                          strokeLinecap="round" strokeLinejoin="round" strokeDasharray="1400"
                          data-loop
                          style={{ animation: 'draw 1.1s cubic-bezier(.35,.6,.3,1) both, lineGlow var(--lp-pulse) ease-in-out infinite', animationTimeline: 'view(), auto', animationRange: 'entry 12% cover 34%, normal' } as CSSProperties} />
                    {/* End dot — pulsing ring under a solid copy of the same circle */}
                    <circle cx="600" cy="38" r="5" fill="#3fb950" data-loop
                            style={{ transformBox: 'fill-box', transformOrigin: 'center', animation: 'dotRing var(--lp-pulse) infinite' } as CSSProperties} />
                    <circle cx="600" cy="38" r="5" fill="#3fb950" />
                    <circle cx="600" cy="38" r="10" fill="#3fb950" opacity="0.15" />
                  </svg>
                </div>

                <div className="grid grid-cols-4 divide-x divide-[#30363d] border-t border-[#30363d]">
                  {/* Avg Loss counts as -$ prefix + positive magnitude, matching the design */}
                  {[
                    { label: 'Total Trades', value: '247',   count: '247' },
                    { label: 'Win Rate',     value: '68.4%', count: '68.4', dp: '1', suf: '%' },
                    { label: 'Avg Win',      value: '+$218', count: '218', pre: '+$' },
                    { label: 'Avg Loss',     value: '-$94',  count: '94',  pre: '-$' },
                  ].map((s, i) => (
                    <div key={s.label} className="px-3 py-3 text-center" data-reveal="sm" style={range(`entry ${26 + i * 4}% cover ${38 + i * 4}%`)}>
                      <p className="text-[10px] text-[#8b949e] mb-0.5">{s.label}</p>
                      <p className="text-sm font-bold text-white" data-count={s.count} data-count-dp={s.dp} data-count-pre={s.pre} data-count-suf={s.suf} style={{ fontVariantNumeric: 'tabular-nums' }}>{s.value}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ GAP SCANNER & INTRADAY ALERTS SHOWCASE ═══ */}
      <section id="market-intel" className="py-24 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-12 items-center">

            {/* Gap Scanner card */}
            <div className="relative lg:col-span-3 order-2 lg:order-1">
              <div className="relative rounded-2xl border border-[#30363d] bg-[#161b22] overflow-clip shadow-2xl" data-reveal="left" style={range('entry 6% entry 60%')}>
                {/* Scan bar overlay */}
                <div
                  className="pointer-events-none absolute inset-x-0"
                  data-loop
                  style={{
                    top: 120,
                    height: 66,
                    background: 'linear-gradient(rgba(232,134,58,0), rgba(232,134,58,.10) 42%, rgba(232,134,58,.26) 50%, rgba(232,134,58,.10) 58%, rgba(232,134,58,0))',
                    animation: 'sweep var(--lp-sweep) linear infinite',
                  }}
                />
                <div className="px-6 py-4 border-b border-[#30363d] flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-[#F97316]" />
                    <p className="text-sm font-semibold text-white">Gap Scanner</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#3fb950] animate-pulse" />
                    <span className="text-xs text-[#8b949e]">Live · 04:32 AM ET</span>
                  </div>
                </div>

                {/* Scan window pills */}
                <div className="px-5 py-2.5 border-b border-[#30363d] flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    {['Pre-Mkt', '1H', '2H', '4H'].map((w, i) => (
                      <span
                        key={w}
                        className={`px-2.5 py-1 text-[11px] font-semibold rounded-md border ${
                          i === 0
                            ? 'bg-[#F97316]/15 text-[#F97316] border-[#F97316]/30'
                            : 'bg-[#0d1117] text-[#8b949e] border-[#30363d]'
                        }`}
                      >
                        {w}
                      </span>
                    ))}
                  </div>
                  <span className="hidden sm:block text-[10px] text-[#8b949e] uppercase tracking-wider">Scan Windows</span>
                </div>

                {/* Table header */}
                <div className="grid grid-cols-5 px-5 py-2 border-b border-[#30363d] text-[10px] text-[#8b949e] font-semibold uppercase tracking-wider">
                  <span>Ticker</span>
                  <span className="text-center">Gap %</span>
                  <span className="text-center">Pre-Mkt</span>
                  <span className="text-center">Volume</span>
                  <span className="text-right">Catalyst</span>
                </div>

                {/* Table rows — row 1 (NVDA) combines its reveal with an ambient
                    flash: two animations on one node need matched timeline lists */}
                {GAPS.map((g, i) => (
                  <div
                    key={g.ticker}
                    className={`grid grid-cols-5 px-5 py-3 items-center text-sm ${i < GAPS.length - 1 ? 'border-b border-[#21262d]' : ''} hover:bg-[#1c2128] transition-colors`}
                    {...(i === 0 ? { 'data-loop': true } : { 'data-reveal': 'sm' })}
                    style={i === 0
                      ? ({
                          animation: 'riseSm .55s ease-out both, rowFlash var(--lp-pulse) ease-in-out infinite',
                          animationTimeline: 'view(), auto',
                          animationRange: 'entry 14% cover 26%, normal',
                        } as CSSProperties)
                      : range(`entry ${14 + i * 4}% cover ${26 + i * 4}%`)}
                  >
                    <span className="font-mono font-bold text-white">{g.ticker}</span>
                    <span className={`text-center font-mono font-semibold ${g.pos ? 'text-[#3fb950]' : 'text-[#f85149]'}`}>{g.gap}</span>
                    <span className="text-center font-mono text-[#8b949e]">{g.price}</span>
                    <span className="text-center text-[#8b949e]">{g.vol}</span>
                    <div className="flex justify-end">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${g.pos ? 'bg-[#3fb950]/10 text-[#3fb950]' : 'bg-[#f85149]/10 text-[#f85149]'}`}>
                        {g.catalyst}
                      </span>
                    </div>
                  </div>
                ))}

                <div className="px-5 py-3 border-t border-[#30363d] flex items-center justify-between">
                  <span className="text-xs text-[#8b949e]">Showing top 5 of 34 gaps detected</span>
                  <span className="text-xs text-[#F97316] cursor-pointer hover:underline">View all gaps →</span>
                </div>
              </div>

              {/* Floating intraday alert badge — reveal, idle float, and glow live
                  on separate nested nodes so the loop transform never overwrites
                  the settled reveal transform */}
              <div className="hidden lg:block absolute -top-6 -right-5 z-10" data-reveal="pop" style={range('entry 20% cover 30%')}>
                <div data-loop style={{ animation: 'floatY 5s ease-in-out infinite' }}>
                  <div
                    className="flex items-center gap-2.5 bg-[#161b22] border border-[#F97316]/30 rounded-xl p-3 shadow-xl"
                    data-loop
                    style={{ animation: 'bellGlow var(--lp-pulse) ease-in-out infinite' }}
                  >
                    <div className="relative w-9 h-9 rounded-lg bg-[#F97316]/10 flex items-center justify-center">
                      <Bell className="w-4 h-4 text-[#F97316]" data-loop style={{ animation: 'bellSwing 3.6s ease-in-out infinite', transformOrigin: '50% 15%' }} />
                      <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#f85149] text-white text-[9px] font-bold flex items-center justify-center" data-loop style={{ animation: 'livePulse var(--lp-pulse) ease-out infinite' }}>3</span>
                    </div>
                    <div>
                      <p className="text-white font-bold text-sm">Intraday Alert — 2H Window</p>
                      <p className="text-[#8b949e] text-xs">NVDA +4.2% on 3.1× rel. volume</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Text */}
            <div className="lg:col-span-2 order-1 lg:order-2">
              <p className="text-sm text-[#F97316] font-semibold uppercase tracking-widest mb-3">Pre-Market &amp; Intraday Intelligence</p>
              <h2 className="text-4xl font-bold text-white mb-4">Never Miss a Move</h2>
              <p className="text-[#8b949e] leading-relaxed mb-8">
                The gap scanner runs automatically before market open, surfacing high-probability setups
                ranked by gap size, volume, and catalyst quality. After the bell, intraday scans sweep the
                1H, 2H, and 4H windows — and ring the alert bell when a mover scores high enough to matter.
              </p>
              <div className="space-y-3">
                {[
                  'Automatic pre-market gap detection',
                  'Intraday scans at 1H, 2H & 4H after the open',
                  'Alerts scored by move, relative volume & spread',
                  'One-click add to your Daily Favorites',
                ].map(item => (
                  <div key={item} className="flex items-center gap-2.5 text-sm text-[#8b949e]">
                    <CheckCircle className="w-4 h-4 text-[#3fb950] flex-shrink-0" />
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ AI INSIGHTS SHOWCASE ═══ */}
      <section className="py-24 px-6 bg-[#161b22]/20">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-12 items-center">

            {/* Text */}
            <div className="lg:col-span-2">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-[#8957e5]/25 bg-[#8957e5]/10 text-xs text-[#8957e5] font-semibold mb-4">
                <Sparkles className="w-3.5 h-3.5" />
                AI-Powered
              </div>
              <h2 className="text-4xl font-bold text-white mb-4">Your Personal Trading Coach</h2>
              <p className="text-[#8b949e] leading-relaxed mb-8">
                AI analyzes your journal entries, trade data, and behavioral patterns to deliver
                personalized weekly and monthly reports — surfacing what&apos;s working, what needs
                fixing, and the habits holding you back.
              </p>
              <div className="space-y-3">
                {[
                  'Identifies recurring emotional patterns',
                  'Spots strengths you should double down on',
                  'Pinpoints specific areas to improve',
                  'Tracks consistency and habit formation',
                  'Downloadable PDF infographic reports',
                ].map(item => (
                  <div key={item} className="flex items-center gap-2.5 text-sm text-[#8b949e]">
                    <CheckCircle className="w-4 h-4 text-[#8957e5] flex-shrink-0" />
                    {item}
                  </div>
                ))}
              </div>
            </div>

            {/* Mock report card */}
            <div className="lg:col-span-3">
              <div className="rounded-2xl border border-[#30363d] bg-[#161b22] overflow-hidden shadow-2xl">
                {/* Report header */}
                <div className="px-6 py-4 border-b border-[#30363d] flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-[#8957e5]" />
                    <p className="text-sm font-semibold text-white">Week 13, 2026 Report</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button className="flex items-center gap-1.5 px-2.5 py-1 bg-[#21262d] border border-[#30363d] text-[#8b949e] text-xs rounded-md">
                      <Download className="w-3 h-3" />
                      PDF
                    </button>
                  </div>
                </div>

                <div className="p-6 space-y-4">
                  {/* Key Takeaway */}
                  <div className="p-4 bg-[#F97316]/10 border border-[#F97316]/20 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <Lightbulb className="w-4 h-4 text-[#F97316]" />
                      <span className="text-[10px] font-semibold text-[#F97316] uppercase tracking-wide">Key Takeaway</span>
                    </div>
                    <p className="text-sm text-[#c9d1d9] leading-relaxed">
                      Your win rate jumps 23% on trades where you journal beforehand — make pre-trade journaling non-negotiable.
                    </p>
                  </div>

                  {/* Two-column grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Strengths */}
                    <div className="bg-[#0d1117] border border-[#30363d] rounded-lg p-4 border-l-[3px] border-l-[#3fb950]">
                      <div className="flex items-center gap-1.5 mb-3">
                        <TrendingUp className="w-3.5 h-3.5 text-[#3fb950]" />
                        <span className="text-[10px] font-semibold text-[#3fb950] uppercase tracking-wide">What&apos;s Working</span>
                      </div>
                      <ul className="space-y-2">
                        {[
                          'Disciplined stop-loss execution on all 8 trades',
                          'Momentum setups producing 3.2R average',
                        ].map((s, i) => (
                          <li key={i} className="flex items-start gap-2 text-xs text-[#8b949e]">
                            <span className="mt-1 w-1.5 h-1.5 rounded-full bg-[#3fb950] flex-shrink-0" />
                            {s}
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Improvements */}
                    <div className="bg-[#0d1117] border border-[#30363d] rounded-lg p-4 border-l-[3px] border-l-[#f85149]">
                      <div className="flex items-center gap-1.5 mb-3">
                        <TrendingDown className="w-3.5 h-3.5 text-[#f85149]" />
                        <span className="text-[10px] font-semibold text-[#f85149] uppercase tracking-wide">Areas to Improve</span>
                      </div>
                      <ul className="space-y-2">
                        {[
                          'Overtrading on Fridays — 3 of 4 losses came EOW',
                          'Revenge trades after morning losses cost $420',
                        ].map((s, i) => (
                          <li key={i} className="flex items-start gap-2 text-xs text-[#8b949e]">
                            <span className="mt-1 w-1.5 h-1.5 rounded-full bg-[#f85149] flex-shrink-0" />
                            {s}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  {/* Patterns */}
                  <div className="bg-[#0d1117] border border-[#30363d] rounded-lg p-4 border-l-[3px] border-l-[#8957e5]">
                    <div className="flex items-center gap-1.5 mb-3">
                      <Brain className="w-3.5 h-3.5 text-[#8957e5]" />
                      <span className="text-[10px] font-semibold text-[#8957e5] uppercase tracking-wide">Behavioral Patterns</span>
                    </div>
                    <ul className="space-y-2">
                      <li className="flex items-start gap-2 text-xs text-[#8b949e]">
                        <span className="mt-1 w-1.5 h-1.5 rounded-full bg-[#8957e5] flex-shrink-0" />
                        Anxiety-tagged entries correlate with 60% smaller position sizes — confidence building needed
                      </li>
                    </ul>
                  </div>
                </div>

                {/* Footer */}
                <div className="px-6 py-3 border-t border-[#30363d]">
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="w-3 h-3 text-[#8957e5]" />
                    <span className="text-[10px] text-[#484f58]">AI-generated analysis based on your journal & trade data</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ BRIEFINGS & NEWS SHOWCASE ═══ */}
      <section className="py-24 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-12 items-center">

            {/* Briefing card */}
            <div className="relative lg:col-span-3 order-2 lg:order-1">
              <div className="rounded-2xl border border-[#30363d] bg-[#161b22] overflow-clip shadow-2xl" data-reveal="left" style={range('entry 6% entry 58%')}>
                {/* Header */}
                <div className="px-6 py-4 border-b border-[#30363d] flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sunrise className="w-4 h-4 text-[#d29922]" />
                    <p className="text-sm font-semibold text-white">Morning Market Briefing</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="hidden sm:block text-xs text-[#8b949e]">Weekdays · 8:00 AM ET</span>
                    <button className="flex items-center gap-1.5 px-2.5 py-1 bg-[#21262d] border border-[#30363d] text-[#8b949e] text-xs rounded-md">
                      <Download className="w-3 h-3" />
                      PDF
                    </button>
                  </div>
                </div>

                <div className="p-6 space-y-4">
                  {/* AI sentiment summary */}
                  <div className="p-4 bg-[#3fb950]/10 border border-[#3fb950]/20 rounded-lg" data-reveal="sm" style={range('entry 14% cover 26%')}>
                    <div className="flex items-center gap-2 mb-2">
                      <TrendingUp className="w-4 h-4 text-[#3fb950]" />
                      <span className="text-[10px] font-semibold text-[#3fb950] uppercase tracking-wide">Bullish Bias</span>
                    </div>
                    <p className="text-sm text-[#c9d1d9] leading-relaxed">
                      Futures point higher as CPI cools and yields ease — semis lead pre-market with NVDA gapping up on raised guidance.
                    </p>
                  </div>

                  {/* Indices snapshot */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {BRIEFING_INDICES.map((ix, i) => (
                      <div key={ix.name} className="bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2.5" data-reveal="pop" style={range(`entry ${20 + i * 3}% cover ${30 + i * 3}%`)}>
                        <p className="text-[10px] text-[#8b949e] font-mono mb-0.5">{ix.name}</p>
                        <p className="text-sm font-bold text-white font-mono">{ix.value}</p>
                        <p className={`text-xs font-mono ${ix.pos ? 'text-[#3fb950]' : 'text-[#f85149]'}`}>{ix.chg}</p>
                      </div>
                    ))}
                  </div>

                  {/* Big movers */}
                  <div className="bg-[#0d1117] border border-[#30363d] rounded-lg p-4" data-reveal="sm" style={range('entry 30% cover 40%')}>
                    <div className="flex items-center gap-1.5 mb-3">
                      <Activity className="w-3.5 h-3.5 text-[#F97316]" />
                      <span className="text-[10px] font-semibold text-[#F97316] uppercase tracking-wide">Big Movers</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {BRIEFING_MOVERS.map((m, i) => (
                        <span
                          key={m.ticker}
                          className={`px-2.5 py-1 rounded-md text-xs font-mono font-semibold ${m.pos ? 'bg-[#3fb950]/10 text-[#3fb950]' : 'bg-[#f85149]/10 text-[#f85149]'}`}
                          data-reveal="pop"
                          style={{ animationDuration: '.45s', ...range(`entry ${34 + i * 2}% cover ${44 + i * 2}%`) }}
                        >
                          {m.ticker} {m.chg}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* News highlights */}
                  <div className="bg-[#0d1117] border border-[#30363d] rounded-lg p-4" data-reveal="sm" style={range('entry 38% cover 48%')}>
                    <div className="flex items-center gap-1.5 mb-3">
                      <Newspaper className="w-3.5 h-3.5 text-[#39c5cf]" />
                      <span className="text-[10px] font-semibold text-[#39c5cf] uppercase tracking-wide">News Highlights</span>
                    </div>
                    <ul className="space-y-2.5">
                      {BRIEFING_NEWS.map((n, i) => (
                        <li key={n.headline} className="flex items-center justify-between gap-3" data-reveal="sm" style={{ animationDuration: '.5s', ...range(`entry ${42 + i * 3}% cover ${54 + i * 3}%`) }}>
                          <div className="flex items-center gap-2 min-w-0">
                            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${n.pos === true ? 'bg-[#3fb950]' : n.pos === false ? 'bg-[#f85149]' : 'bg-[#8b949e]'}`} />
                            <span className="text-xs text-[#c9d1d9] sm:truncate">{n.headline}</span>
                          </div>
                          <span
                            className="text-[10px] px-2 py-0.5 rounded-full flex-shrink-0 border"
                            style={{ color: n.catColor, borderColor: `${n.catColor}40`, backgroundColor: `${n.catColor}14` }}
                          >
                            {n.cat}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* Footer */}
                <div className="px-6 py-3 border-t border-[#30363d] flex items-center justify-between gap-3">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Sparkles className="w-3 h-3 text-[#d29922] flex-shrink-0" />
                    <span className="text-[10px] text-[#484f58] truncate">AI-generated · emailed daily &amp; available on-demand in app</span>
                  </div>
                  <div className="hidden sm:flex items-center gap-1.5 flex-shrink-0">
                    <Calendar className="w-3 h-3 text-[#79c0ff]" />
                    <span className="text-[10px] text-[#8b949e]">Today: CPI 8:30 · FOMC Minutes 2:00</span>
                  </div>
                </div>
              </div>

              {/* Floating news screener mini-card — reveal on the outer node,
                  idle float on the card so the loop transform never overwrites
                  the settled reveal transform */}
              <div className="hidden lg:block absolute -right-7 -bottom-7 z-10 w-[230px]" data-reveal="pop" style={range('entry 34% cover 46%')}>
                <div className="flex flex-col gap-2 bg-[#161b22] border border-[#30363d] rounded-xl p-3.5 shadow-xl" data-loop style={{ animation: 'floatY 6.5s ease-in-out infinite' }}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Newspaper className="w-3.5 h-3.5 text-[#39c5cf]" />
                      <span className="text-xs font-semibold text-white">News Screener</span>
                    </div>
                    <span className="flex items-center gap-1 text-[9px] text-[#8b949e]">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#3fb950]" data-loop style={{ animation: 'livePulse var(--lp-pulse) ease-out infinite' }} />
                      LIVE
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {['Fed', 'Macro', 'M&A', 'Earnings', 'AI', 'Crypto'].map(c => (
                      <span key={c} className="px-1.5 py-0.5 text-[9px] rounded bg-[#0d1117] border border-[#30363d] text-[#8b949e]">{c}</span>
                    ))}
                  </div>
                  {/* Refresh bar */}
                  <div style={{ height: 2, background: '#1e2427', borderRadius: 2, overflow: 'hidden' }}>
                    <div className="h-full w-full" data-loop style={{ background: 'var(--lp-accent)', boxShadow: '0 0 8px rgba(53,208,127,.7)', transformOrigin: 'left', animation: 'barGrow var(--lp-sweep) linear infinite' }} />
                  </div>
                  <p className="text-[9px] text-[#484f58]">Sentiment-tagged · refreshes every 15 min</p>
                </div>
              </div>
            </div>

            {/* Text */}
            <div className="lg:col-span-2 order-1 lg:order-2">
              <p className="text-sm text-[#F97316] font-semibold uppercase tracking-widest mb-3">Market Intelligence</p>
              <h2 className="text-4xl font-bold text-white mb-4">Start Every Session Informed</h2>
              <p className="text-[#8b949e] leading-relaxed mb-8">
                Every weekday morning an AI-generated briefing lands in your inbox — indices, overnight
                movers, news highlights, and the day&apos;s events, distilled into one sentiment-tagged
                summary. Through the session, the news screener keeps the headlines that matter in front of you.
              </p>
              <div className="space-y-3">
                {[
                  'Morning briefing emailed at 8:00 AM ET',
                  'Indices, movers, events & AI market sentiment',
                  'News tagged bullish / bearish across 6 categories',
                  'High-priority digest with downloadable PDF',
                ].map(item => (
                  <div key={item} className="flex items-center gap-2.5 text-sm text-[#8b949e]">
                    <CheckCircle className="w-4 h-4 text-[#d29922] flex-shrink-0" />
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ HOW IT WORKS ═══ */}
      <section id="how-it-works" className="py-24 px-6 bg-[#161b22]/20">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-sm text-[#F97316] font-semibold uppercase tracking-widest mb-3">Simple Process</p>
            <h2 className="text-4xl font-bold text-white mb-4">How It Works</h2>
            <p className="text-[#8b949e] max-w-xl mx-auto">Start in minutes. Your trades, your data, your edge.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 relative">
            {/* Connector line (desktop) */}
            <div className="hidden lg:block absolute top-14 left-[calc(12.5%+1rem)] right-[calc(12.5%+1rem)] h-px bg-gradient-to-r from-[#30363d] via-[#F97316]/30 to-[#30363d]" />

            {[
              {
                step: '01',
                title: 'Start Informed',
                desc: 'Wake up to your AI market briefing, scan pre-market gaps, and stack your Daily Favorites before the bell.',
                icon: Sunrise,
                items: ['AI morning briefing', 'Pre-market gap scan', 'Auto-seeded Daily Favorites', 'High-impact news & events'],
              },
              {
                step: '02',
                title: 'Log Your Trades',
                desc: 'Enter trades with strategy, risk parameters, entry/exit prices, and emotional state at execution.',
                icon: BookOpen,
                items: ['Strategy tags', 'Risk/Reward ratio', 'Emotional state', 'Notes & screenshots'],
              },
              {
                step: '03',
                title: 'Analyze Performance',
                desc: 'Visual analytics reveal patterns — which setups work, when you perform best, hidden weaknesses.',
                icon: BarChart2,
                items: ['Equity curve', 'Win rate by setup', 'P&L breakdown', 'Drawdown analysis'],
              },
              {
                step: '04',
                title: 'Sharpen Your Edge',
                desc: 'Data-driven improvements to your discipline. Focus on what works, eliminate what doesn\'t.',
                icon: Target,
                items: ['Pattern recognition', 'Rule adherence', 'Habit tracking', 'Daily check-ins'],
              },
            ].map(step => (
              <div key={step.step} className="relative p-6 rounded-2xl border border-[#30363d] bg-[#161b22]">
                <div className="absolute -top-3 left-6 px-3 py-0.5 bg-[#F97316] text-white text-[10px] font-bold rounded-full uppercase tracking-wider">
                  Step {step.step}
                </div>

                <div className="mt-5 mb-4 w-12 h-12 rounded-xl bg-[#0d1117] border border-[#30363d] flex items-center justify-center">
                  <step.icon className="w-6 h-6 text-[#F97316]" />
                </div>

                <h3 className="text-xl font-semibold text-white mb-2">{step.title}</h3>
                <p className="text-sm text-[#8b949e] leading-relaxed mb-5">{step.desc}</p>

                <ul className="space-y-2">
                  {step.items.map(item => (
                    <li key={item} className="flex items-center gap-2 text-sm text-[#8b949e]">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#F97316] flex-shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>



      {/* ═══ PRICING ═══ */}
      <section id="pricing" className="py-24 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-sm text-[#F97316] font-semibold uppercase tracking-widest mb-3">Pricing</p>
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-4">Costs less than one bad trade.</h2>
            <p className="text-[#8b949e] max-w-xl mx-auto text-lg">
              One avoided mistake pays for the year. Start free — journal forever on Silver, and
              try everything in Gold for 7 days. No card required.
            </p>
          </div>

          {/* Billing cycle toggle */}
          <div className="flex items-center justify-center gap-2 mb-10">
            <button
              onClick={() => setBillingCycle('monthly')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                billingCycle === 'monthly' ? 'bg-[#F97316] text-white' : 'bg-[#161b22] text-[#8b949e] border border-[#30363d]'
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setBillingCycle('annual')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                billingCycle === 'annual' ? 'bg-[#F97316] text-white' : 'bg-[#161b22] text-[#8b949e] border border-[#30363d]'
              }`}
            >
              Annual <span className={billingCycle === 'annual' ? 'text-white/90' : 'text-[#3fb950]'}>· save {Math.round(ANNUAL_DISCOUNT * 100)}%</span>
            </button>
          </div>

          {/* Tier cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-14 max-w-5xl mx-auto">
            {([
              {
                tier: 'silver' as const,
                name: 'Silver',
                tagline: 'Free forever',
                desc: 'Everything you need to trade with discipline — journal, plan risk, and know your numbers. At no cost.',
                features: [
                  'Trading journal — import your broker statements in one click',
                  'Risk-first trade planning — exact entry, stop & target with dollar risk and share size',
                  'Performance analytics — equity curve, win rate & strategy breakdown',
                  'Market news screener — headlines tagged by sentiment & category',
                  'Profit projection — stress-test your win rate and R:R before risking capital',
                  'Docs & trading guides',
                ],
                popular: false,
              },
              {
                tier: 'gold' as const,
                name: 'Gold',
                tagline: 'Your journal builds itself',
                desc: 'Connect your broker and every trade logs itself — then AI coaches what it finds.',
                features: [
                  'Everything in Silver',
                  'Auto-synced journal — trades, P&L and balances flow in from your broker',
                  'Pre-market gap scanner & live market data, all session long',
                  'AI morning briefing in your inbox before the bell',
                  'AI coaching reports — surface your patterns, strengths & leaks',
                  'Trading goals that track themselves from your real results',
                ],
                popular: true,
              },
              {
                tier: 'platinum' as const,
                name: 'Platinum',
                tagline: 'The diversified trader',
                desc: 'Trade short and long term in one terminal: an agent scouts swing setups you approve, while your long-term portfolio syncs in with its own weekly AI review.',
                features: [
                  'Everything in Gold',
                  'Long-term portfolio, synced — positions, dividends & deposits beside your trading',
                  'Weekly AI portfolio review — concentration, income & repositioning flags',
                  'AI-identified swing-trade setups, with the reasoning attached',
                  'You approve every order — review, adjust, or reject each proposal',
                  'Full trade-lifecycle visibility — orders, fills, stops & progress in one terminal',
                  'Guided onboarding — strategies, guardrails & brokerage wiring',
                ],
                popular: false,
              },
            ]).map(plan => (
              <div
                key={plan.tier}
                className={`relative p-7 rounded-2xl flex flex-col transition-transform duration-300 hover:-translate-y-1.5 ${
                  plan.popular
                    ? 'border-2 border-[#F97316] bg-gradient-to-b from-[#F97316]/12 via-[#161b22] to-[#161b22] shadow-[0_0_70px_rgba(249,115,22,0.18)] lg:scale-[1.04]'
                    : 'border border-[#30363d] bg-gradient-to-b from-[#1c2128] to-[#161b22] hover:border-[#8b949e]/40'
                }`}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-[#F97316] text-white text-[10px] font-bold rounded-full uppercase tracking-wider inline-flex items-center gap-1 whitespace-nowrap">
                    <Star className="w-3 h-3" /> Most traders pick Gold
                  </div>
                )}
                {plan.tier === 'platinum' && PLATINUM_COMING_SOON && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-[#d29922] text-[#1a1206] text-[10px] font-bold rounded-full uppercase tracking-wider whitespace-nowrap">
                    Coming soon
                  </div>
                )}
                <h3 className="text-xl font-bold text-white">{plan.name}</h3>
                <p className="text-xs text-[#F97316] font-semibold uppercase tracking-wide mt-0.5 mb-3">{plan.tagline}</p>
                <p className="text-sm text-[#8b949e] leading-relaxed mb-5 min-h-[40px]">{plan.desc}</p>
                <div className="mb-6">
                  {plan.tier === 'silver' ? (
                    <>
                      <span className="text-5xl font-extrabold tracking-tight text-white">$0</span>
                      <span className="text-sm text-[#8b949e] ml-1.5">forever</span>
                    </>
                  ) : (
                    <>
                      <span className="text-5xl font-extrabold tracking-tight text-white">
                        ${(() => {
                          const v = billingCycle === 'monthly'
                            ? TIER_PRICING[plan.tier].monthly
                            : TIER_PRICING[plan.tier].annual / 12;
                          return Number.isInteger(v) ? v : v.toFixed(2);
                        })()}
                      </span>
                      <span className="text-sm text-[#8b949e] ml-1.5">/ month</span>
                      <p className={`text-[11px] mt-1.5 ${billingCycle === 'annual' ? 'text-[#3fb950]' : 'text-[#484f58]'}`}>
                        {billingCycle === 'annual'
                          ? `Billed $${TIER_PRICING[plan.tier].annual.toFixed(2)}/yr · save $${(TIER_PRICING[plan.tier].monthly * 12 - TIER_PRICING[plan.tier].annual).toFixed(2)}`
                          : `or $${TIER_PRICING[plan.tier].annual.toFixed(2)}/yr — ${Math.round(ANNUAL_DISCOUNT * 100)}% off`}
                      </p>
                    </>
                  )}
                </div>
                <ul className="space-y-2.5 mb-7 flex-1">
                  {plan.features.map(f => (
                    <li key={f} className="flex items-start gap-2.5 text-sm text-[#8b949e]">
                      <CheckCircle className="w-4 h-4 text-[#3fb950] flex-shrink-0 mt-0.5" />
                      {f}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/signup"
                  className={`w-full py-3 rounded-xl text-sm font-semibold text-center transition-colors ${
                    plan.popular
                      ? 'bg-[#F97316] hover:bg-[#fb8c3c] text-white'
                      : 'bg-[#21262d] hover:bg-[#30363d] text-white border border-[#30363d]'
                  }`}
                >
                  {plan.tier === 'silver'
                    ? 'Create free account'
                    : plan.tier === 'gold'
                      ? 'Start 7-day free trial'
                      : PLATINUM_COMING_SOON
                        ? 'Coming soon — start with Gold'
                        : 'Start with the free trial'}
                </Link>
                {plan.tier === 'platinum' && (
                  <p className="mt-3 text-[10px] text-[#8b949e] leading-snug">
                    Agents currently execute through a dedicated Robinhood connection set up during
                    onboarding; journaling works with any supported broker.
                  </p>
                )}
              </div>
            ))}
          </div>

          {/* Trust row */}
          <p className="text-center text-[11px] text-[#8b949e] uppercase tracking-[0.15em] mb-14">
            Cancel in two clicks &nbsp;·&nbsp; No card for the free trial &nbsp;·&nbsp; Export your data any time
          </p>

          {/* Compare plans table — per the Compare Plans design handoff */}
          <ComparePlans />
          <div className="max-w-4xl mx-auto">
            <p className="text-center text-[11px] text-[#484f58] mt-4 max-w-2xl mx-auto leading-relaxed">
              ConfluenceTrading is a journaling and analytics tool — nothing in the product is
              financial or investment advice. Trading involves substantial risk of loss; all
              trading decisions are your own. See our{' '}
              <Link href="/terms" className="text-[#8b949e] hover:text-[#F97316] underline">
                Terms &amp; Conditions
              </Link>{' '}
              and risk disclosure.
            </p>
          </div>
        </div>
      </section>

      {/* ═══ CTA ═══ */}
      <section className="py-24 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="relative p-7 sm:p-12 rounded-3xl border border-[#F97316]/25 overflow-hidden text-center">
            {/* gradient bg */}
            <div className="absolute inset-0 bg-gradient-to-b from-[#F97316]/8 via-[#F97316]/4 to-transparent pointer-events-none" />
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[200px] bg-[#F97316]/6 rounded-full blur-3xl pointer-events-none" />

            <div className="relative">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-[#F97316]/25 bg-[#F97316]/10 text-xs text-[#F97316] mb-6">
                <Zap className="w-3.5 h-3.5" />
                Free to get started · No credit card required
              </div>

              <h2 className="text-4xl md:text-5xl font-bold text-white mb-4">
                Ready to Trade with Discipline?
              </h2>
              <p className="text-lg text-[#8b949e] mb-10 max-w-2xl mx-auto">
                Join traders who start every session with an AI briefing, never miss a gap or an
                intraday move, and journal every trade with data-driven discipline.
              </p>

              <div className="flex flex-wrap items-center justify-center gap-4">
                <Link href="/signup" className="flex items-center gap-2 px-8 py-4 bg-[#F97316] hover:bg-[#ea6c0a] text-white font-bold rounded-xl transition-colors text-lg shadow-xl shadow-[#F97316]/25">
                  Create Free Account
                  <ArrowRight className="w-5 h-5" />
                </Link>
                <Link href="/login" className="px-8 py-4 border border-[#30363d] hover:border-[#F97316]/50 text-[#8b949e] hover:text-[#F97316] font-medium rounded-xl transition-colors text-lg">
                  Sign In
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ FOUNDER ═══ */}
      <FounderSection />

      {/* ═══ CONTACT — quiet strip, deliberately understated next to the CTA ═══ */}
      <section id="contact" className="px-6 border-t border-[#30363d] bg-[#161b22]/20">
        <div className="max-w-5xl mx-auto py-24 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="text-center md:text-left">
            <p className="text-xs text-[#8b949e] font-semibold uppercase tracking-widest mb-1.5">Questions?</p>
            <h2 className="text-xl font-bold text-white">Get in touch</h2>
            <p className="text-sm text-[#8b949e] mt-1">
              Terms, plans, or anything else — we read every message.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row items-center gap-3">
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="inline-flex max-w-full items-center gap-2.5 px-4 sm:px-5 py-3 rounded-xl border border-[#30363d] bg-[#0d1117] text-xs sm:text-sm text-[#c9d1d9] hover:border-[#F97316]/50 hover:text-white transition-colors font-mono"
            >
              <Mail className="w-4 h-4 shrink-0 text-[#F97316]" />
              <span className="break-all text-left">{SUPPORT_EMAIL}</span>
            </a>
            <a
              href="https://www.instagram.com/confluencetrade"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex max-w-full items-center gap-2.5 px-4 sm:px-5 py-3 rounded-xl border border-[#30363d] bg-[#0d1117] text-xs sm:text-sm text-[#c9d1d9] hover:border-[#F97316]/50 hover:text-white transition-colors font-mono"
            >
              <Instagram className="w-4 h-4 shrink-0 text-[#F97316]" />
              <span className="text-left">@confluencetrade</span>
            </a>
          </div>
        </div>
      </section>

      {/* ═══ FOOTER ═══ */}
      <footer className="border-t border-[#30363d] bg-[#161b22]">
        <div className="max-w-7xl mx-auto px-6 py-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-[#0d1117] border border-[#30363d] flex items-center justify-center">
              <svg viewBox="0 0 48 48" fill="none" className="w-4 h-4">
                <line x1="7" y1="13" x2="24" y2="24" stroke="white" strokeWidth="2.8" strokeLinecap="round"/>
                <line x1="7" y1="35" x2="24" y2="24" stroke="white" strokeWidth="2.8" strokeLinecap="round"/>
                <line x1="24" y1="24" x2="41" y2="24" stroke="white" strokeWidth="2.8" strokeLinecap="round"/>
                <circle cx="24" cy="24" r="2.5" fill="white"/>
              </svg>
            </div>
            <span className="text-sm font-semibold text-white">Confluence Trading</span>
            <span className="hidden sm:inline text-[#8b949e] text-sm">— Your disciplined trading command center</span>
          </div>
          <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-4">
            <Link href="/terms" className="text-xs text-[#8b949e] hover:text-[#F97316] transition-colors">
              Terms &amp; Conditions
            </Link>
            <Link href="/privacy" className="text-xs text-[#8b949e] hover:text-[#F97316] transition-colors">
              Privacy
            </Link>
            <a
              href="https://www.instagram.com/confluencetrade"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-[#8b949e] hover:text-[#F97316] transition-colors"
            >
              <Instagram className="w-3.5 h-3.5" />
              @confluencetrade
            </a>
            <a href={`mailto:${SUPPORT_EMAIL}`} className="text-xs text-[#8b949e] hover:text-[#F97316] transition-colors">
              {SUPPORT_EMAIL}
            </a>
            <p className="text-xs text-[#8b949e]">© {new Date().getFullYear()} Confluence Trading. All rights reserved.</p>
          </div>
        </div>
        <div className="max-w-7xl mx-auto px-6 pb-6 -mt-2">
          <p className="text-[11px] text-[#484f58] leading-relaxed text-center md:text-left">
            Disclaimer: ConfluenceTrading is a trading journal and analytics tool. Nothing in this
            product constitutes financial, investment, tax, or legal advice, and no content should
            be relied on as a recommendation to buy or sell any security. Trading involves
            substantial risk of loss and is not suitable for every investor. All trading decisions
            and their outcomes are solely your responsibility.
          </p>
        </div>
      </footer>

    </div>
  );
}
