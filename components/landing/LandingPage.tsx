'use client';

import Link from 'next/link';
import {
  TrendingUp, BarChart2, BookOpen, Target, Zap,
  Calendar, ArrowRight, CheckCircle, LineChart,
  Activity, Shield, ChevronRight, LogIn,
} from 'lucide-react';

/* ─── Candlestick data (pre-calculated, trending upward) ─── */
const CANDLES = [
  { x: 25,  wt: 155, bt: 160, bb: 172, wb: 178, bull: true  },
  { x: 55,  wt: 148, bt: 153, bb: 163, wb: 169, bull: true  },
  { x: 85,  wt: 144, bt: 148, bb: 162, wb: 168, bull: false },
  { x: 115, wt: 135, bt: 140, bb: 155, wb: 162, bull: true  },
  { x: 145, wt: 125, bt: 130, bb: 145, wb: 153, bull: true  },
  { x: 175, wt: 122, bt: 128, bb: 140, wb: 148, bull: false },
  { x: 205, wt: 108, bt: 114, bb: 132, wb: 140, bull: true  },
  { x: 235, wt:  95, bt: 100, bb: 120, wb: 128, bull: true  },
  { x: 265, wt:  97, bt: 103, bb: 115, wb: 122, bull: false },
  { x: 295, wt:  82, bt:  88, bb: 106, wb: 114, bull: true  },
  { x: 325, wt:  70, bt:  76, bb:  96, wb: 104, bull: true  },
  { x: 355, wt:  72, bt:  78, bb:  90, wb:  98, bull: false },
  { x: 385, wt:  58, bt:  64, bb:  82, wb:  90, bull: true  },
  { x: 415, wt:  48, bt:  54, bb:  72, wb:  80, bull: true  },
  { x: 445, wt:  40, bt:  46, bb:  64, wb:  72, bull: true  },
];
const VOL = [12, 18, 8, 22, 15, 10, 25, 20, 14, 16, 28, 11, 19, 24, 17];

/* ─── Gap scanner rows ─── */
const GAPS = [
  { ticker: 'NVDA', gap: '+6.8%', price: '$148.20', vol: '82M',  catalyst: 'Earnings Beat',    pos: true  },
  { ticker: 'META', gap: '+4.1%', price: '$560.40', vol: '34M',  catalyst: 'Rev. Guidance Up', pos: true  },
  { ticker: 'AAPL', gap: '-2.3%', price: '$187.80', vol: '18M',  catalyst: 'Revenue Miss',     pos: false },
  { ticker: 'SPY',  gap: '+1.2%', price: '$512.40', vol: '56M',  catalyst: 'Macro Rally',      pos: true  },
  { ticker: 'TSLA', gap: '-4.7%', price: '$175.60', vol: '61M',  catalyst: 'Deliveries Miss',  pos: false },
];

/* ─── Feature cards data ─── */
const FEATURES = [
  {
    icon: BookOpen,
    title: 'Trade Journal',
    desc: 'Log every trade with strategy tags, emotional state, risk parameters, and detailed notes for post-analysis.',
    tags: ['Journal', 'Notes', 'Tags'],
    bg: 'bg-[#F97316]/10',
    color: 'text-[#F97316]',
  },
  {
    icon: LineChart,
    title: 'P&L Analytics',
    desc: 'Visualize performance with equity curves, strategy breakdowns, and detailed win/loss statistics.',
    tags: ['Charts', 'Metrics', 'Trends'],
    bg: 'bg-[#3fb950]/10',
    color: 'text-[#3fb950]',
  },
  {
    icon: Zap,
    title: 'Gap Scanner',
    desc: 'Pre-market gap scanner automatically identifies opening gap opportunities with volume and catalyst data.',
    tags: ['Pre-market', 'Gaps', 'Volume'],
    bg: 'bg-[#f0883e]/10',
    color: 'text-[#f0883e]',
  },
  {
    icon: Target,
    title: 'Position Calculator',
    desc: 'Calculate optimal position sizes based on account risk, stop loss, and target levels to protect your capital.',
    tags: ['Risk Mgmt', 'Sizing', 'R/R'],
    bg: 'bg-[#58a6ff]/10',
    color: 'text-[#58a6ff]',
  },
  {
    icon: TrendingUp,
    title: 'Watchlist',
    desc: 'Build and manage your watchlist with price targets, support/resistance levels, and setup notes.',
    tags: ['Watchlist', 'Targets', 'Setups'],
    bg: 'bg-[#bc8cff]/10',
    color: 'text-[#bc8cff]',
  },
  {
    icon: Calendar,
    title: 'Market Events',
    desc: 'Stay informed about earnings dates, FOMC meetings, CPI releases, and high-impact market catalysts.',
    tags: ['Earnings', 'FOMC', 'Catalysts'],
    bg: 'bg-[#79c0ff]/10',
    color: 'text-[#79c0ff]',
  },
];

/* ══════════════════════════════════════════════════════════════════
   COMPONENT
══════════════════════════════════════════════════════════════════ */
export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#0d1117] text-[#e6edf3] overflow-x-hidden">

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
            <a href="#how-it-works" className="text-sm text-[#8b949e] hover:text-white transition-colors">How It Works</a>
            <a href="#pricing"     className="text-sm text-[#8b949e] hover:text-white transition-colors">Pricing</a>
          </div>

          <div className="flex items-center gap-3">
            <Link href="/login" className="hidden sm:flex items-center gap-1.5 px-4 py-2 text-sm text-[#8b949e] hover:text-white transition-colors">
              <LogIn className="w-3.5 h-3.5" />
              Sign In
            </Link>
            <Link href="/signup" className="px-4 py-2 text-sm font-semibold bg-[#F97316] hover:bg-[#ea6c0a] text-white rounded-lg transition-colors">
              Start Free Trial
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
              Trading Journal &amp; Analytics Platform
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
              {/* Window chrome */}
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#30363d]">
                <div className="flex items-center gap-3">
                  <div className="flex gap-1.5">
                    <div className="w-3 h-3 rounded-full bg-[#f85149]" />
                    <div className="w-3 h-3 rounded-full bg-[#d29922]" />
                    <div className="w-3 h-3 rounded-full bg-[#3fb950]" />
                  </div>
                  <span className="text-xs text-[#8b949e] font-mono ml-1">SPY — Daily Chart</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="px-2 py-0.5 rounded bg-[#3fb950]/10 text-[#3fb950] font-mono">+2.48%</span>
                  <span className="text-[#8b949e] font-mono">$512.40</span>
                </div>
              </div>

              {/* Candlestick SVG */}
              <div className="px-4 pt-4 pb-2">
                <svg viewBox="0 0 480 210" className="w-full h-[200px]">
                  {/* Grid lines */}
                  {[40, 80, 120, 160].map(y => (
                    <line key={y} x1="0" y1={y} x2="480" y2={y} stroke="#21262d" strokeWidth="1" />
                  ))}
                  {/* Price labels */}
                  {[
                    { y: 42,  label: '$520' },
                    { y: 82,  label: '$510' },
                    { y: 122, label: '$500' },
                    { y: 162, label: '$490' },
                  ].map(item => (
                    <text key={item.y} x="2" y={item.y} fill="#484f58" fontSize="8" fontFamily="monospace">{item.label}</text>
                  ))}

                  {/* Volume bars */}
                  {CANDLES.map((c, i) => (
                    <rect key={`v${c.x}`} x={c.x - 8} y={210 - VOL[i]} width={16} height={VOL[i]}
                          fill={c.bull ? '#3fb950' : '#f85149'} opacity="0.18" />
                  ))}

                  {/* Candles */}
                  {CANDLES.map(c => (
                    <g key={c.x}>
                      <line x1={c.x} y1={c.wt} x2={c.x} y2={c.wb}
                            stroke={c.bull ? '#3fb950' : '#f85149'} strokeWidth="1.5" />
                      <rect x={c.x - 8} y={c.bt} width={16} height={Math.max(c.bb - c.bt, 2)}
                            fill={c.bull ? '#3fb950' : '#f85149'} rx="1" />
                    </g>
                  ))}

                  {/* EMA 21 */}
                  <path d="M 10,170 C 60,162 100,152 130,142 S 175,130 205,120 S 250,106 280,95 S 330,80 370,70 S 420,56 470,48"
                        stroke="#F97316" strokeWidth="2" fill="none" opacity="0.85" />
                  <rect x="378" y="40" width="44" height="15" rx="3" fill="#F97316" opacity="0.12" />
                  <text x="400" y="51" textAnchor="middle" fill="#F97316" fontSize="8.5" fontFamily="monospace" fontWeight="bold">EMA 21</text>

                  {/* EMA 9 */}
                  <path d="M 10,175 C 50,165 90,150 120,138 S 165,125 200,113 S 248,100 280,88 S 330,74 375,62 S 420,50 470,44"
                        stroke="#58a6ff" strokeWidth="1.5" fill="none" opacity="0.55" strokeDasharray="4 3" />
                  <text x="450" y="40" fill="#58a6ff" fontSize="8" fontFamily="monospace" opacity="0.7">EMA 9</text>
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
                <p className="text-[#8b949e] text-xs">Today's P&amp;L</p>
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

      {/* ═══ STATS BANNER ═══ */}
      <section className="py-10 border-y border-[#30363d] bg-[#161b22]/40">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {[
              { label: 'Strategies Tracked', value: '15+',     icon: BarChart2 },
              { label: 'Live Market Data',   value: 'Real-time', icon: Activity  },
              { label: 'Journal Entries',    value: 'Unlimited', icon: BookOpen  },
              { label: 'Risk Management',    value: 'Built-in',  icon: Shield    },
            ].map(s => (
              <div key={s.label} className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-[#0d1117] border border-[#30363d] flex items-center justify-center flex-shrink-0">
                  <s.icon className="w-5 h-5 text-[#F97316]" />
                </div>
                <div>
                  <p className="text-xl font-bold text-white">{s.value}</p>
                  <p className="text-sm text-[#8b949e]">{s.label}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ FEATURES ═══ */}
      <section id="features" className="py-24 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-sm text-[#F97316] font-semibold uppercase tracking-widest mb-3">Everything You Need</p>
            <h2 className="text-4xl font-bold text-white mb-4">Built for Disciplined Traders</h2>
            <p className="text-[#8b949e] max-w-2xl mx-auto text-lg">
              Every feature designed to help you trade with consistency, track your performance,
              and continuously improve your edge.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map(f => (
              <div key={f.title} className="group p-6 rounded-2xl border border-[#30363d] bg-[#161b22] hover:border-[#F97316]/40 hover:bg-[#1c2128] transition-all duration-300">
                <div className={`w-12 h-12 rounded-xl ${f.bg} flex items-center justify-center mb-4`}>
                  <f.icon className={`w-6 h-6 ${f.color}`} />
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">{f.title}</h3>
                <p className="text-sm text-[#8b949e] leading-relaxed mb-4">{f.desc}</p>
                <div className="flex flex-wrap gap-2">
                  {f.tags.map(tag => (
                    <span key={tag} className="px-2 py-0.5 text-xs rounded-md bg-[#0d1117] border border-[#30363d] text-[#8b949e]">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ ANALYTICS SHOWCASE ═══ */}
      <section id="analytics" className="py-24 px-6 bg-[#161b22]/20">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-12 items-center">

            {/* Text */}
            <div className="lg:col-span-2">
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
                ].map(item => (
                  <div key={item.label} className="flex items-start gap-3">
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
              <div className="rounded-2xl border border-[#30363d] bg-[#161b22] overflow-hidden shadow-2xl">
                <div className="px-6 py-4 border-b border-[#30363d] flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-white">Equity Curve</p>
                    <p className="text-xs text-[#8b949e]">Account Growth — Year to Date</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xl font-bold text-[#3fb950]">+$12,840</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-[#3fb950]/10 text-[#3fb950] font-semibold">+28.4%</span>
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

                    {/* Area */}
                    <path d="M 0,180 L 30,175 L 60,170 L 90,165 L 120,172 L 150,158 L 180,148 L 210,155 L 240,140 L 270,128 L 300,118 L 330,125 L 360,108 L 390,96 L 420,84 L 450,72 L 480,60 L 510,50 L 540,45 L 570,42 L 600,38 L 600,200 L 0,200 Z"
                          fill="url(#equityGrad)" />
                    {/* Line */}
                    <path d="M 0,180 L 30,175 L 60,170 L 90,165 L 120,172 L 150,158 L 180,148 L 210,155 L 240,140 L 270,128 L 300,118 L 330,125 L 360,108 L 390,96 L 420,84 L 450,72 L 480,60 L 510,50 L 540,45 L 570,42 L 600,38"
                          stroke="#3fb950" strokeWidth="2.5" fill="none" />
                    {/* End dot */}
                    <circle cx="600" cy="38" r="5" fill="#3fb950" />
                    <circle cx="600" cy="38" r="10" fill="#3fb950" opacity="0.15" />
                  </svg>
                </div>

                <div className="grid grid-cols-4 divide-x divide-[#30363d] border-t border-[#30363d]">
                  {[
                    { label: 'Total Trades', value: '247' },
                    { label: 'Win Rate',     value: '68.4%' },
                    { label: 'Avg Win',      value: '+$218' },
                    { label: 'Avg Loss',     value: '-$94' },
                  ].map(s => (
                    <div key={s.label} className="px-3 py-3 text-center">
                      <p className="text-[10px] text-[#8b949e] mb-0.5">{s.label}</p>
                      <p className="text-sm font-bold text-white">{s.value}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ GAP SCANNER SHOWCASE ═══ */}
      <section className="py-24 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-12 items-center">

            {/* Gap Scanner card */}
            <div className="lg:col-span-3 order-2 lg:order-1">
              <div className="rounded-2xl border border-[#30363d] bg-[#161b22] overflow-hidden shadow-2xl">
                <div className="px-6 py-4 border-b border-[#30363d] flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-[#F97316]" />
                    <p className="text-sm font-semibold text-white">Pre-Market Gap Scanner</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#3fb950] animate-pulse" />
                    <span className="text-xs text-[#8b949e]">Live · 04:32 AM ET</span>
                  </div>
                </div>

                {/* Table header */}
                <div className="grid grid-cols-5 px-5 py-2 border-b border-[#30363d] text-[10px] text-[#8b949e] font-semibold uppercase tracking-wider">
                  <span>Ticker</span>
                  <span className="text-center">Gap %</span>
                  <span className="text-center">Pre-Mkt</span>
                  <span className="text-center">Volume</span>
                  <span className="text-right">Catalyst</span>
                </div>

                {/* Table rows */}
                {GAPS.map((g, i) => (
                  <div key={g.ticker} className={`grid grid-cols-5 px-5 py-3 items-center text-sm ${i < GAPS.length - 1 ? 'border-b border-[#21262d]' : ''} hover:bg-[#1c2128] transition-colors`}>
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
            </div>

            {/* Text */}
            <div className="lg:col-span-2 order-1 lg:order-2">
              <p className="text-sm text-[#F97316] font-semibold uppercase tracking-widest mb-3">Pre-Market Intelligence</p>
              <h2 className="text-4xl font-bold text-white mb-4">Never Miss an Opening Gap</h2>
              <p className="text-[#8b949e] leading-relaxed mb-8">
                The gap scanner runs automatically before market open, surfacing high-probability setups
                ranked by gap size, volume, and catalyst quality.
              </p>
              <div className="space-y-3">
                {[
                  'Automatic pre-market detection',
                  'Catalyst & news filtering',
                  'Volume relative to 30-day avg',
                  'Integrated with your watchlist',
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

      {/* ═══ HOW IT WORKS ═══ */}
      <section id="how-it-works" className="py-24 px-6 bg-[#161b22]/20">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-sm text-[#F97316] font-semibold uppercase tracking-widest mb-3">Simple Process</p>
            <h2 className="text-4xl font-bold text-white mb-4">How It Works</h2>
            <p className="text-[#8b949e] max-w-xl mx-auto">Start in minutes. Your trades, your data, your edge.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
            {/* Connector line (desktop) */}
            <div className="hidden md:block absolute top-14 left-[calc(33.3%+1rem)] right-[calc(33.3%+1rem)] h-px bg-gradient-to-r from-[#30363d] via-[#F97316]/30 to-[#30363d]" />

            {[
              {
                step: '01',
                title: 'Log Your Trades',
                desc: 'Enter trades with strategy, risk parameters, entry/exit prices, and emotional state at execution.',
                icon: BookOpen,
                items: ['Strategy tags', 'Risk/Reward ratio', 'Emotional state', 'Notes & screenshots'],
              },
              {
                step: '02',
                title: 'Analyze Performance',
                desc: 'Visual analytics reveal patterns — which setups work, when you perform best, hidden weaknesses.',
                icon: BarChart2,
                items: ['Equity curve', 'Win rate by setup', 'P&L breakdown', 'Drawdown analysis'],
              },
              {
                step: '03',
                title: 'Sharpen Your Edge',
                desc: 'Data-driven improvements to your discipline. Focus on what works, eliminate what doesn\'t.',
                icon: Target,
                items: ['Pattern recognition', 'Rule adherence', 'Habit tracking', 'Daily check-ins'],
              },
            ].map((step, i) => (
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
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="text-center mb-14">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-[#F97316]/25 bg-[#F97316]/10 text-xs text-[#F97316] mb-4">
              <Zap className="w-3.5 h-3.5" />
              Limited-time offer
            </div>
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-4">Simple, Transparent Pricing</h2>
            <p className="text-[#8b949e] text-lg max-w-xl mx-auto">
              Everything you need to trade with discipline — no hidden fees, no tiers.
            </p>
          </div>

          {/* Pricing card */}
          <div className="relative max-w-md mx-auto rounded-3xl border border-[#F97316]/40 bg-[#161b22] overflow-hidden shadow-2xl shadow-[#F97316]/10">
            {/* Top gradient glow */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-[#F97316] to-transparent" />

            <div className="p-10">
              {/* Badge */}
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#F97316]/15 border border-[#F97316]/30 text-[#F97316] text-xs font-semibold mb-6">
                Most Popular
              </div>

              <h3 className="text-2xl font-bold text-white mb-2">Pro Trader</h3>
              <p className="text-[#8b949e] text-sm mb-6">Full access to every feature, updated daily.</p>

              {/* Price */}
              <div className="flex items-end gap-3 mb-8">
                <div className="flex items-start">
                  <span className="text-[#8b949e] text-xl font-medium mt-1.5">$</span>
                  <span className="text-6xl font-extrabold text-white leading-none">9.99</span>
                </div>
                <div className="flex flex-col pb-1">
                  <span className="text-[#8b949e] line-through text-lg">$14.99</span>
                  <span className="text-[#8b949e] text-sm">/ month</span>
                </div>
              </div>

              {/* CTA */}
              <Link
                href="/signup"
                className="flex items-center justify-center gap-2 w-full py-4 bg-[#F97316] hover:bg-[#ea6c0a] text-white font-bold rounded-xl transition-colors text-base shadow-lg shadow-[#F97316]/25 mb-8"
              >
                Start Free Trial
                <ArrowRight className="w-4 h-4" />
              </Link>

              {/* Divider */}
              <div className="border-t border-[#30363d] mb-8" />

              {/* Feature list */}
              <ul className="space-y-3.5">
                {[
                  'Unlimited trade journal entries',
                  'Real-time P&L analytics & equity curve',
                  'Pre-market gap scanner with catalysts',
                  'Strategy breakdown & win-rate heatmap',
                  'Position sizing & risk calculator',
                  'Watchlist with live market data',
                  'Emotional analysis & performance tracking',
                  'Market events calendar',
                  'Goal tracking & habit streaks',
                  'Priority support',
                ].map((feature) => (
                  <li key={feature} className="flex items-center gap-3 text-sm text-[#cdd9e5]">
                    <CheckCircle className="w-4 h-4 text-[#F97316] flex-shrink-0" />
                    {feature}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <p className="text-center text-[#8b949e] text-sm mt-6">
            No credit card required to start · Cancel anytime
          </p>
        </div>
      </section>

      {/* ═══ CTA ═══ */}
      <section className="py-24 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="relative p-12 rounded-3xl border border-[#F97316]/25 overflow-hidden text-center">
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
                Join traders who have taken control of their performance with data-driven journaling
                and real-time market analytics.
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
          <p className="text-xs text-[#8b949e]">© {new Date().getFullYear()} Confluence Trading. All rights reserved.</p>
        </div>
      </footer>

    </div>
  );
}
