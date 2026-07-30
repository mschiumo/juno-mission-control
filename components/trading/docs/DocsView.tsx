'use client';

import { useCallback, useEffect, useMemo, useState, ComponentType } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  Rocket,
  BookOpen,
  Upload,
  Settings,
  TrendingUp,
  BarChart3,
  Target,
  Calculator,
  Sparkles,
  ClipboardCheck,
  LifeBuoy,
  Search,
  ChevronRight,
  ChevronLeft,
  GraduationCap,
  Link2,
  LucideIcon,
} from 'lucide-react';
import { GettingStartedArticle, JournalArticle, ImportingArticle, BrokerageSyncArticle } from './ArticlesCore';
import { TradeManagementArticle, MarketArticle, ProjectionArticle } from './ArticlesTools';
import { PerformanceArticle, GoalsArticle } from './ArticlesAnalytics';
import { AgentsArticle, ReviewArticle, FaqArticle } from './ArticlesAgents';

/**
 * The Docs sub-tab: a complete user manual for the Trading platform. Articles
 * are plain components (see Articles*.tsx); this shell provides the sidebar,
 * search, deep-linking (?subtab=docs&doc=<id>), and prev/next navigation.
 */

interface DocArticle {
  id: string;
  title: string;
  blurb: string;
  icon: LucideIcon;
  keywords: string;
  ownerOnly?: boolean;
  Component: ComponentType;
}

interface DocGroup {
  label: string;
  articles: DocArticle[];
}

const GROUPS: DocGroup[] = [
  {
    label: 'Getting Started',
    articles: [
      {
        id: 'getting-started',
        title: 'Platform Overview',
        blurb: 'What lives where, how navigation works, and your first week on the platform.',
        icon: Rocket,
        keywords: 'welcome overview quick start tour navigation deep links profile intro begin new user onboarding',
        Component: GettingStartedArticle,
      },
    ],
  },
  {
    label: 'Core Workflow',
    articles: [
      {
        id: 'journal',
        title: 'The Trading Journal',
        blurb: 'The calendar, daily journal entries, and managing your trade list.',
        icon: BookOpen,
        keywords: 'journal calendar daily entry prompts trades table edit delete notes followed plan month pnl',
        Component: JournalArticle,
      },
      {
        id: 'importing',
        title: 'Importing Trades & Broker Data',
        blurb: 'Getting thinkorswim statements and CSVs in — trades, balances, and fees.',
        icon: Upload,
        keywords: 'import csv thinkorswim tos schwab account statement broker brokerage connect sync export template excel fees balances',
        Component: ImportingArticle,
      },
      {
        id: 'brokerage-sync',
        title: 'Brokerage Sync (SnapTrade)',
        blurb: 'What SnapTrade is, how the connection works, and how synced trades differ from imports.',
        icon: Link2,
        keywords: 'snaptrade brokerage connect broker sync live data robinhood schwab fidelity webull etrade tastytrade interactive brokers read only connection portal authorization refresh disconnect provenance security oauth',
        ownerOnly: true,
        Component: BrokerageSyncArticle,
      },
      {
        id: 'trade-management',
        title: 'Trade Management',
        blurb: 'Daily favorites, the position calculator, the watchlist workflow, and Trading Mode.',
        icon: Settings,
        keywords: 'trade management watchlist daily favorites position calculator size risk stop target active potential closed trading mode fullscreen',
        Component: TradeManagementArticle,
      },
    ],
  },
  {
    label: 'Market',
    articles: [
      {
        id: 'market',
        title: 'Market Tools',
        blurb: 'The morning briefing, market events, the gap scanner, and the news screener.',
        icon: TrendingUp,
        keywords: 'market briefing events fomc earnings gap scanner premarket news sentiment screener rules',
        Component: MarketArticle,
      },
    ],
  },
  {
    label: 'Analytics',
    articles: [
      {
        id: 'performance',
        title: 'Performance & Analytics',
        blurb: 'The equity curve, every metric explained, broker fees, and AI journal insights.',
        icon: BarChart3,
        keywords: 'performance equity curve nlv starting balance win rate profit factor drawdown streak fees statistics day of week journal insights report pdf',
        Component: PerformanceArticle,
      },
      {
        id: 'goals',
        title: 'Trading Goals',
        blurb: 'Auto-tracked targets, guardrails, pacing, and the eleven goal metrics.',
        icon: Target,
        keywords: 'goals targets guardrails pace metrics net profit green days max daily loss plan adherence journaling consistency archive',
        Component: GoalsArticle,
      },
      {
        id: 'projection',
        title: 'Profit Projection',
        blurb: 'What your stats compound to per day, week, month, and year.',
        icon: Calculator,
        keywords: 'profit projection expectancy calculator win rate risk reward compound yearly',
        Component: ProjectionArticle,
      },
    ],
  },
  {
    label: 'Agentic Trading',
    articles: [
      {
        id: 'agents',
        title: 'Agents',
        blurb: 'The agentic terminal: proposals, orders, strategy, and the safety model.',
        icon: Sparkles,
        keywords: 'agents agentic terminal proposals approve reject orders kill switch arm paper live exposure caps strategy audit confluence',
        ownerOnly: true,
        Component: AgentsArticle,
      },
      {
        id: 'review',
        title: 'Performance Review',
        blurb: 'One scorecard for manual and agentic trading: R-multiples, violations, weekly reviews.',
        icon: ClipboardCheck,
        keywords: 'review scorecard r multiple expectancy payoff violations weekly risk config churn round trips',
        ownerOnly: true,
        Component: ReviewArticle,
      },
    ],
  },
  {
    label: 'Help',
    articles: [
      {
        id: 'faq',
        title: 'FAQ & Troubleshooting',
        blurb: 'Quick answers: imports, options, NLV differences, privacy, and more.',
        icon: LifeBuoy,
        keywords: 'faq help troubleshooting questions excel options nlv mismatch blank journal owner mobile export data privacy',
        Component: FaqArticle,
      },
    ],
  },
];

const ALL_ARTICLES = GROUPS.flatMap((g) => g.articles);

export default function DocsView() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const getDocFromUrl = useCallback((): string => {
    const doc = searchParams.get('doc');
    return doc && ALL_ARTICLES.some((a) => a.id === doc) ? doc : 'getting-started';
  }, [searchParams]);

  const [activeId, setActiveIdState] = useState<string>(getDocFromUrl);
  const [query, setQuery] = useState('');

  // Keep ?doc= in the URL so articles are bookmarkable/shareable.
  const setActiveId = useCallback(
    (id: string) => {
      setActiveIdState(id);
      const params = new URLSearchParams(searchParams);
      if (id === 'getting-started') {
        params.delete('doc');
      } else {
        params.set('doc', id);
      }
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [pathname, router, searchParams],
  );

  // Follow URL changes made elsewhere (e.g. DocLink navigations from inside an article).
  useEffect(() => {
    const fromUrl = getDocFromUrl();
    setActiveIdState((cur) => (cur === fromUrl ? cur : fromUrl));
  }, [getDocFromUrl]);

  const active = ALL_ARTICLES.find((a) => a.id === activeId) ?? ALL_ARTICLES[0];
  const activeIndex = ALL_ARTICLES.indexOf(active);
  const prev = activeIndex > 0 ? ALL_ARTICLES[activeIndex - 1] : null;
  const next = activeIndex < ALL_ARTICLES.length - 1 ? ALL_ARTICLES[activeIndex + 1] : null;

  const q = query.trim().toLowerCase();
  const matches = useMemo(
    () =>
      q
        ? ALL_ARTICLES.filter(
            (a) => a.title.toLowerCase().includes(q) || a.blurb.toLowerCase().includes(q) || a.keywords.includes(q),
          )
        : null,
    [q],
  );

  const ArticleBody = active.Component;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-5 items-start">
      {/* Sidebar */}
      <aside className="lg:sticky lg:top-4 space-y-4">
        <div className="flex items-center gap-2.5 px-1">
          <span
            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}
          >
            <GraduationCap className="w-4.5 h-4.5" />
          </span>
          <div>
            <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              Platform Docs
            </div>
            <div className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
              Guides &amp; tutorials for every feature
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-tertiary)' }} />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search the docs…"
            className="w-full rounded-lg pl-9 pr-3 py-2 text-sm outline-none transition-colors"
            style={{
              background: 'var(--surface-1)',
              border: '1px solid var(--border-default)',
              color: 'var(--text-primary)',
            }}
          />
        </div>

        {/* Nav — search results or grouped list */}
        {matches ? (
          <nav className="space-y-1">
            <div className="section-label px-1" style={{ color: 'var(--text-tertiary)' }}>
              {matches.length === 0 ? 'No matches' : `${matches.length} match${matches.length === 1 ? '' : 'es'}`}
            </div>
            {matches.map((a) => (
              <SidebarItem key={a.id} article={a} active={a.id === active.id} onSelect={() => { setActiveId(a.id); setQuery(''); }} />
            ))}
          </nav>
        ) : (
          <nav className="space-y-4">
            {GROUPS.map((group) => (
              <div key={group.label} className="space-y-1">
                <div className="text-[10px] font-bold uppercase tracking-widest px-1" style={{ color: 'var(--text-tertiary)' }}>
                  {group.label}
                </div>
                {group.articles.map((a) => (
                  <SidebarItem key={a.id} article={a} active={a.id === active.id} onSelect={() => setActiveId(a.id)} />
                ))}
              </div>
            ))}
          </nav>
        )}
      </aside>

      {/* Article */}
      <main className="card p-5 sm:p-8 min-w-0">
        <header className="space-y-2 mb-8 pb-6" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest" style={{ color: 'var(--text-tertiary)' }}>
            <span>Docs</span>
            <ChevronRight className="w-3 h-3" />
            <span>{GROUPS.find((g) => g.articles.includes(active))?.label}</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
            {active.title}
          </h1>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            {active.blurb}
          </p>
        </header>

        <ArticleBody />

        {/* Prev / next */}
        <footer className="mt-10 pt-6 grid grid-cols-1 sm:grid-cols-2 gap-3" style={{ borderTop: '1px solid var(--border-subtle)' }}>
          {prev ? (
            <button
              onClick={() => setActiveId(prev.id)}
              className="flex items-center gap-2 rounded-xl px-4 py-3 text-left transition-colors hover:brightness-125"
              style={{ background: 'var(--surface-1)', border: '1px solid var(--border-default)' }}
            >
              <ChevronLeft className="w-4 h-4 shrink-0" style={{ color: 'var(--text-tertiary)' }} />
              <span className="min-w-0">
                <span className="block text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-tertiary)' }}>
                  Previous
                </span>
                <span className="block text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                  {prev.title}
                </span>
              </span>
            </button>
          ) : (
            <span />
          )}
          {next && (
            <button
              onClick={() => setActiveId(next.id)}
              className="flex items-center justify-end gap-2 rounded-xl px-4 py-3 text-right transition-colors hover:brightness-125 sm:col-start-2"
              style={{ background: 'var(--surface-1)', border: '1px solid var(--border-default)' }}
            >
              <span className="min-w-0">
                <span className="block text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-tertiary)' }}>
                  Next
                </span>
                <span className="block text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                  {next.title}
                </span>
              </span>
              <ChevronRight className="w-4 h-4 shrink-0" style={{ color: 'var(--text-tertiary)' }} />
            </button>
          )}
        </footer>
      </main>
    </div>
  );
}

function SidebarItem({ article, active, onSelect }: { article: DocArticle; active: boolean; onSelect: () => void }) {
  const Icon = article.icon;
  return (
    <button
      onClick={onSelect}
      className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left transition-colors"
      style={{
        background: active ? 'var(--accent-dim)' : 'transparent',
        color: active ? 'var(--accent-light)' : 'var(--text-secondary)',
      }}
    >
      <Icon className="w-3.5 h-3.5 shrink-0" style={{ color: active ? 'var(--accent)' : 'var(--text-tertiary)' }} />
      <span className="text-[13px] font-medium truncate">{article.title}</span>
      {article.ownerOnly && (
        <span
          className="ml-auto shrink-0 text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded"
          style={{ background: 'var(--warning-dim)', color: 'var(--warning)' }}
        >
          Owner
        </span>
      )}
    </button>
  );
}
