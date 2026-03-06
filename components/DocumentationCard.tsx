'use client';

import { useState } from 'react';
import { 
  BookOpen, 
  ExternalLink, 
  FileText, 
  Github, 
  Search,
  ChevronDown,
  ChevronUp,
  Zap,
  Settings,
  TrendingUp,
  Code,
  HelpCircle,
  Shield,
  Clock,
  Activity,
  Target,
  BarChart3,
  Calendar,
  Bell,
  Database,
  Layers
} from 'lucide-react';

interface DocCategory {
  id: string;
  label: string;
  icon: React.ElementType;
  docs: DocItem[];
}

interface DocItem {
  title: string;
  description: string;
  url: string;
  tags?: string[];
}

const DOC_CATEGORIES: DocCategory[] = [
  {
    id: 'trading',
    label: 'Trading',
    icon: TrendingUp,
    docs: [
      {
        title: 'Trading Strategy Guide',
        description: 'Comprehensive guide to trading strategies and methodologies',
        url: 'https://github.com/mschiumo/juno-mission-control/blob/main/docs/TRADING_STRATEGY_GUIDE.md',
        tags: ['strategy', 'trading', 'methodology']
      },
      {
        title: 'Trading Rules',
        description: 'Trading rules and guidelines for consistent performance',
        url: 'https://github.com/mschiumo/juno-mission-control/blob/main/docs/TRADING_RULES.md',
        tags: ['rules', 'guidelines', 'discipline']
      },
      {
        title: 'Gap Scanner 5000',
        description: 'Using the pre-market gap scanner for trade ideas',
        url: 'https://github.com/mschiumo/juno-mission-control/blob/main/docs/GAP_SCANNER_5000.md',
        tags: ['scanner', 'gaps', 'pre-market']
      },
      {
        title: 'Trade Deduplication',
        description: 'How trade deduplication works in the system',
        url: 'https://github.com/mschiumo/juno-mission-control/blob/main/docs/TRADE_DEDUPLICATION.md',
        tags: ['trades', 'deduplication', 'data']
      },
      {
        title: 'TraderVue Integration',
        description: 'TraderVue feature specification and goals',
        url: 'https://github.com/mschiumo/juno-mission-control/blob/main/docs/TRADERVUE_FEATURE_SPEC.md',
        tags: ['tradervue', 'integration', 'analytics']
      }
    ]
  },
  {
    id: 'setup',
    label: 'Setup & Config',
    icon: Settings,
    docs: [
      {
        title: 'Environment Setup',
        description: 'Initial setup and environment configuration',
        url: 'https://github.com/mschiumo/juno-mission-control/blob/main/SETUP.md',
        tags: ['env', 'setup', 'config']
      },
      {
        title: 'Calendar Setup',
        description: 'Google Calendar sync and event management setup',
        url: 'https://github.com/mschiumo/juno-mission-control/blob/main/CALENDAR_SETUP.md',
        tags: ['calendar', 'google', 'setup']
      },
      {
        title: 'Cron Migration Guide',
        description: 'Scheduled tasks and cron job migration instructions',
        url: 'https://github.com/mschiumo/juno-mission-control/blob/main/docs/CRON_MIGRATION.md',
        tags: ['cron', 'scheduled', 'automation']
      },
      {
        title: 'Cron Fixes',
        description: 'Common cron job issues and fixes',
        url: 'https://github.com/mschiumo/juno-mission-control/blob/main/CRON_FIXES.md',
        tags: ['cron', 'fixes', 'troubleshooting']
      },
      {
        title: 'Upstash Setup',
        description: 'Redis/Upstash configuration instructions',
        url: 'https://github.com/mschiumo/juno-mission-control/blob/main/UPSTASH_SETUP.md',
        tags: ['redis', 'upstash', 'database']
      }
    ]
  },
  {
    id: 'guides',
    label: 'User Guides',
    icon: HelpCircle,
    docs: [
      {
        title: 'Activity Logging',
        description: 'When and how to log work activities',
        url: 'https://github.com/mschiumo/juno-mission-control/blob/main/docs/ACTIVITY_LOGGING.md',
        tags: ['logging', 'activity', 'tracking']
      },
      {
        title: 'Dashboard Reports',
        description: 'Understanding and using dashboard reports',
        url: 'https://github.com/mschiumo/juno-mission-control/blob/main/docs/DASHBOARD_REPORTS.md',
        tags: ['dashboard', 'reports', 'analytics']
      },
      {
        title: 'Strava Integration',
        description: 'Connecting and using Strava fitness tracking',
        url: 'https://github.com/mschiumo/juno-mission-control/blob/main/docs/STRAVA_INTEGRATION.md',
        tags: ['strava', 'fitness', 'integration']
      }
    ]
  },
  {
    id: 'development',
    label: 'Development',
    icon: Code,
    docs: [
      {
        title: 'Project README',
        description: 'Project overview and getting started guide',
        url: 'https://github.com/mschiumo/juno-mission-control/blob/main/README.md',
        tags: ['readme', 'overview', 'getting-started']
      },
      {
        title: 'VPS to Mac Mini Migration',
        description: 'Guide for migrating from VPS to Mac Mini',
        url: 'https://github.com/mschiumo/juno-mission-control/blob/main/docs/MIGRATION_VPS_TO_MACMINI.md',
        tags: ['migration', 'vps', 'mac-mini']
      },
      {
        title: 'Intergram Setup',
        description: 'Intergram chat integration setup',
        url: 'https://github.com/mschiumo/juno-mission-control/blob/main/docs/INTERGRAM_SETUP.md',
        tags: ['intergram', 'chat', 'integration']
      },
      {
        title: 'Market Data Fix',
        description: 'Market data issues and fixes summary',
        url: 'https://github.com/mschiumo/juno-mission-control/blob/main/docs/MARKET_DATA_FIX_SUMMARY.md',
        tags: ['market-data', 'fixes', 'data']
      }
    ]
  },
  {
    id: 'reference',
    label: 'Reference',
    icon: BookOpen,
    docs: [
      {
        title: 'Document Library',
        description: 'Complete index of all documentation',
        url: 'https://github.com/mschiumo/juno-mission-control/blob/main/docs/DOCUMENT_LIBRARY.md',
        tags: ['index', 'library', 'all-docs']
      },
      {
        title: 'Agent Identity',
        description: 'Agent identity and configuration guide',
        url: 'https://github.com/mschiumo/juno-mission-control/blob/main/IDENTITY.md',
        tags: ['agents', 'identity', 'configuration']
      },
      {
        title: 'Agent Soul',
        description: 'Core agent personality and behavior',
        url: 'https://github.com/mschiumo/juno-mission-control/blob/main/SOUL.md',
        tags: ['agents', 'soul', 'personality']
      },
      {
        title: 'Status Guide',
        description: 'System status and health checks',
        url: 'https://github.com/mschiumo/juno-mission-control/blob/main/STATUS.md',
        tags: ['status', 'health', 'monitoring']
      }
    ]
  }
];

const QUICK_LINKS = [
  {
    title: 'GitHub Repository',
    description: 'Source code, PRs, and issues',
    url: 'https://github.com/mschiumo/juno-mission-control',
    icon: Github
  },
  {
    title: 'Report an Issue',
    description: 'Submit bugs or feature requests',
    url: 'https://github.com/mschiumo/juno-mission-control/issues',
    icon: Shield
  }
];

const QUICK_TIPS = [
  'All changes go through Pull Requests',
  'Use the Trading tab to track your strategies',
  'Set up daily habits in the Dashboard',
  'Goals can have multiple action items',
  'Check the Gap Scanner before market open',
  'Log activities consistently for better tracking'
];

export default function DocumentationCard() {
  const [activeTab, setActiveTab] = useState('trading');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedCategories, setExpandedCategories] = useState<string[]>(['trading']);

  const toggleCategory = (categoryId: string) => {
    setExpandedCategories(prev => 
      prev.includes(categoryId) 
        ? prev.filter(id => id !== categoryId)
        : [...prev, categoryId]
    );
  };

  const activeCategory = DOC_CATEGORIES.find(cat => cat.id === activeTab);

  const filteredCategories = DOC_CATEGORIES.map(category => ({
    ...category,
    docs: category.docs.filter(doc => 
      doc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      doc.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      doc.tags?.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()))
    )
  })).filter(category => category.docs.length > 0);

  const allDocs = DOC_CATEGORIES.flatMap(cat => cat.docs);
  const totalDocs = allDocs.length;

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-gradient-to-br from-[#ff6b35] to-[#ff8c5a] rounded-xl">
              <BookOpen className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Documentation</h1>
              <p className="text-sm text-[#8b949e]">
                {totalDocs} guides across {DOC_CATEGORIES.length} categories
              </p>
            </div>
          </div>
          
          {/* Search Bar */}
          <div className="relative w-full md:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8b949e]" />
            <input
              type="text"
              placeholder="Search documentation..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-[#0d1117] border border-[#30363d] rounded-lg text-sm text-white placeholder-[#8b949e] focus:outline-none focus:border-[#ff6b35] focus:ring-1 focus:ring-[#ff6b35]/30 transition-all"
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Sidebar Navigation */}
        <div className="lg:col-span-1 space-y-4">
          {/* Category Tabs */}
          <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-2">
            <div className="space-y-1">
              {DOC_CATEGORIES.map((category) => (
                <button
                  key={category.id}
                  onClick={() => {
                    setActiveTab(category.id);
                    if (!expandedCategories.includes(category.id)) {
                      setExpandedCategories(prev => [...prev, category.id]);
                    }
                    setSearchQuery('');
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                    activeTab === category.id && !searchQuery
                      ? 'bg-[#ff6b35] text-white'
                      : 'text-[#8b949e] hover:text-white hover:bg-[#30363d]/50'
                  }`}
                >
                  <category.icon className="w-4 h-4" />
                  <span className="flex-1 text-left">{category.label}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    activeTab === category.id && !searchQuery
                      ? 'bg-white/20 text-white'
                      : 'bg-[#30363d] text-[#8b949e]'
                  }`}>
                    {category.docs.length}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Quick Links */}
          <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-4">
            <h3 className="text-sm font-semibold text-white mb-3">Quick Links</h3>
            <div className="space-y-2">
              {QUICK_LINKS.map((link) => (
                <a
                  key={link.title}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-[#30363d]/50 transition-colors group"
                >
                  <div className="p-1.5 bg-[#0d1117] rounded-lg group-hover:bg-[#ff6b35]/10 transition-colors">
                    <link.icon className="w-4 h-4 text-[#8b949e] group-hover:text-[#ff6b35]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white group-hover:text-[#ff6b35] transition-colors truncate">
                      {link.title}
                    </p>
                    <p className="text-xs text-[#8b949e] truncate">{link.description}</p>
                  </div>
                  <ExternalLink className="w-3 h-3 text-[#8b949e] opacity-0 group-hover:opacity-100 transition-opacity" />
                </a>
              ))}
            </div>
          </div>

          {/* Quick Tips */}
          <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <Zap className="w-4 h-4 text-[#ff6b35]" />
              <h3 className="text-sm font-semibold text-white">Quick Tips</h3>
            </div>
            <ul className="space-y-2">
              {QUICK_TIPS.map((tip, index) => (
                <li key={index} className="flex items-start gap-2 text-xs text-[#8b949e]">
                  <span className="text-[#ff6b35] mt-0.5">•</span>
                  <span>{tip}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Main Content */}
        <div className="lg:col-span-3">
          <div className="space-y-4">
            {searchQuery ? (
              // Search Results
              <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-white">
                    Search Results
                  </h2>
                  <button
                    onClick={() => setSearchQuery('')}
                    className="text-xs text-[#ff6b35] hover:underline"
                  >
                    Clear search
                  </button>
                </div>
                {filteredCategories.length === 0 ? (
                  <div className="text-center py-8">
                    <Search className="w-12 h-12 mx-auto mb-3 text-[#8b949e] opacity-50" />
                    <p className="text-[#8b949e]">No results found for &quot;{searchQuery}&quot;</p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {filteredCategories.map((category) => (
                      <div key={category.id}>
                        <h3 className="text-sm font-medium text-[#ff6b35] mb-3 flex items-center gap-2">
                          <category.icon className="w-4 h-4" />
                          {category.label}
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {category.docs.map((doc) => (
                            <DocCard key={doc.title} doc={doc} />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              // Category View with Accordions
              DOC_CATEGORIES.map((category) => (
                <div 
                  key={category.id}
                  className={`bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden transition-all ${
                    activeTab === category.id ? 'ring-1 ring-[#ff6b35]/30' : ''
                  }`}
                >
                  {/* Category Header */}
                  <button
                    onClick={() => toggleCategory(category.id)}
                    className="w-full flex items-center justify-between p-4 hover:bg-[#21262d] transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${
                        activeTab === category.id 
                          ? 'bg-[#ff6b35]/10' 
                          : 'bg-[#0d1117]'
                      }`}>
                        <category.icon className={`w-5 h-5 ${
                          activeTab === category.id ? 'text-[#ff6b35]' : 'text-[#8b949e]'
                        }`} />
                      </div>
                      <div className="text-left">
                        <h2 className={`font-semibold ${
                          activeTab === category.id ? 'text-white' : 'text-[#c9d1d9]'
                        }`}>
                          {category.label}
                        </h2>
                        <p className="text-xs text-[#8b949e]">
                          {category.docs.length} document{category.docs.length !== 1 ? 's' : ''}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {activeTab === category.id && (
                        <span className="text-xs px-2 py-1 bg-[#ff6b35]/20 text-[#ff6b35] rounded-full">
                          Active
                        </span>
                      )}
                      {expandedCategories.includes(category.id) ? (
                        <ChevronUp className="w-5 h-5 text-[#8b949e]" />
                      ) : (
                        <ChevronDown className="w-5 h-5 text-[#8b949e]" />
                      )}
                    </div>
                  </button>

                  {/* Category Content */}
                  {expandedCategories.includes(category.id) && (
                    <div className="p-4 pt-0 border-t border-[#30363d]">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
                        {category.docs.map((doc) => (
                          <DocCard key={doc.title} doc={doc} />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function DocCard({ doc }: { doc: DocItem }) {
  return (
    <a
      href={doc.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex flex-col p-4 bg-[#0d1117] border border-[#30363d] rounded-xl hover:border-[#ff6b35]/50 hover:bg-[#161b22] transition-all"
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <h3 className="font-medium text-white group-hover:text-[#ff6b35] transition-colors line-clamp-1">
          {doc.title}
        </h3>
        <ExternalLink className="w-4 h-4 text-[#8b949e] opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
      </div>
      <p className="text-sm text-[#8b949e] line-clamp-2 mb-3 flex-1">
        {doc.description}
      </p>
      {doc.tags && doc.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {doc.tags.slice(0, 3).map((tag) => (
            <span 
              key={tag}
              className="text-[10px] px-2 py-0.5 bg-[#30363d] text-[#8b949e] rounded-full"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </a>
  );
}
