'use client';

import { useState, useEffect } from 'react';
import { 
  Users, 
  Bot, 
  Activity, 
  GitPullRequest, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  Loader2,
  ChevronDown,
  ChevronRight,
  Zap,
  TrendingUp,
  ExternalLink,
  RefreshCw,
  Sparkles,
  ArrowRight,
  Target,
  Award,
  GitBranch,
  CircleDot,
  FileDiff,
  Cpu,
  UserCog,
  MessageSquare,
  BarChart3
} from 'lucide-react';

interface PR {
  url: string;
  title: string;
  number: number;
  branch: string;
  status: 'open' | 'draft' | 'ready';
  author: string;
  createdAt: string;
}

interface AgentTask {
  id: string;
  title: string;
  description: string;
  status: 'idle' | 'working' | 'completed' | 'failed';
  prUrl?: string;
  startedAt?: string;
  progress: number;
}

interface AgentStats {
  activePrs: number;
  completedToday: number;
  totalCompleted: number;
  lastActivity: string;
}

interface Agent {
  id: string;
  name: string;
  displayName: string;
  role: 'lead' | 'specialist' | 'placeholder';
  reportsTo: string | null;
  model: 'kimi' | 'sonnet' | 'gpt4' | 'other';
  modelVersion: string;
  specialty: string[];
  avatar: string;
  currentTask: AgentTask | null;
  stats: AgentStats;
  prs: PR[];
  isOnline: boolean;
  responsibilities: string[];
  recentWork: WorkItem[];
}

interface WorkItem {
  id: string;
  type: 'task' | 'pr' | 'commit' | 'review';
  title: string;
  timestamp: string;
  status: string;
  url?: string;
}

interface AgentStatusResponse {
  success: boolean;
  data: Agent[];
  count: number;
  activeCount: number;
  workingCount: number;
  prs?: PR[];
  isMockData?: boolean;
  error?: string;
}

const SAMPLE_AGENTS: Agent[] = [
  {
    id: 'juno',
    name: 'juno',
    displayName: 'Juno',
    role: 'lead',
    reportsTo: null,
    model: 'kimi',
    modelVersion: 'Kimi K2',
    specialty: ['Operations', 'Coordination', 'Strategy', 'User Interface'],
    avatar: 'J',
    currentTask: {
      id: 'task-1',
      title: 'Dashboard Redesign',
      description: 'Implementing new Memory, Projects, and Team tabs',
      status: 'working',
      prUrl: 'https://github.com/mschiumo/juno-mission-control/pull/155',
      startedAt: new Date(Date.now() - 3600000).toISOString(),
      progress: 65
    },
    stats: {
      activePrs: 2,
      completedToday: 5,
      totalCompleted: 142,
      lastActivity: new Date(Date.now() - 300000).toISOString()
    },
    prs: [],
    isOnline: true,
    responsibilities: [
      'Coordinate all AI agent activities',
      'Report progress to user',
      'Assign tasks to specialists',
      'Review and merge PRs',
      'Strategic planning and architecture'
    ],
    recentWork: [
      { id: 'w1', type: 'task', title: 'Created Memory tab component', timestamp: new Date(Date.now() - 3600000).toISOString(), status: 'completed' },
      { id: 'w2', type: 'task', title: 'Designed Projects tracking interface', timestamp: new Date(Date.now() - 7200000).toISOString(), status: 'completed' },
      { id: 'w3', type: 'pr', title: 'Dashboard feature branch', timestamp: new Date(Date.now() - 1800000).toISOString(), status: 'open', url: 'https://github.com/mschiumo/juno-mission-control/pull/155' }
    ]
  },
  {
    id: 'keepliving-shopify',
    name: 'keepliving-shopify',
    displayName: 'KeepLiving-Shopify',
    role: 'specialist',
    reportsTo: 'juno',
    model: 'sonnet',
    modelVersion: 'Claude Sonnet 4.6',
    specialty: ['E-commerce', 'Shopify', 'Liquid', 'React', 'Store Optimization'],
    avatar: 'K',
    currentTask: {
      id: 'task-2',
      title: 'Store Optimization',
      description: 'Optimizing checkout flow and product pages for better conversion',
      status: 'working',
      prUrl: 'https://github.com/mschiumo/keepliving-shopify/pull/15',
      startedAt: new Date(Date.now() - 7200000).toISOString(),
      progress: 40
    },
    stats: {
      activePrs: 1,
      completedToday: 3,
      totalCompleted: 89,
      lastActivity: new Date(Date.now() - 600000).toISOString()
    },
    prs: [],
    isOnline: true,
    responsibilities: [
      'Shopify theme development',
      'E-commerce conversion optimization',
      'Product page enhancements',
      'Checkout flow improvements',
      'Liquid template customization'
    ],
    recentWork: [
      { id: 'w1', type: 'commit', title: 'Optimized product image loading', timestamp: new Date(Date.now() - 3600000).toISOString(), status: 'committed' },
      { id: 'w2', type: 'task', title: 'Checkout flow analysis', timestamp: new Date(Date.now() - 10800000).toISOString(), status: 'completed' }
    ]
  },
  {
    id: 'content-creator',
    name: 'content-creator',
    displayName: 'Content-Creator',
    role: 'specialist',
    reportsTo: 'juno',
    model: 'sonnet',
    modelVersion: 'Claude Sonnet 4.6',
    specialty: ['Content Writing', 'SEO', 'Social Media', 'Copywriting', 'Blog Posts'],
    avatar: 'C',
    currentTask: {
      id: 'task-3',
      title: 'Blog Post Series',
      description: 'Writing mental health awareness content for the blog',
      status: 'working',
      startedAt: new Date(Date.now() - 1800000).toISOString(),
      progress: 75
    },
    stats: {
      activePrs: 0,
      completedToday: 4,
      totalCompleted: 67,
      lastActivity: new Date(Date.now() - 900000).toISOString()
    },
    prs: [],
    isOnline: true,
    responsibilities: [
      'Blog post creation and editing',
      'SEO optimization for content',
      'Social media content scheduling',
      'Newsletter writing',
      'Content calendar management'
    ],
    recentWork: [
      { id: 'w1', type: 'task', title: 'Drafted mental health article', timestamp: new Date(Date.now() - 3600000).toISOString(), status: 'completed' },
      { id: 'w2', type: 'task', title: 'SEO keywords research', timestamp: new Date(Date.now() - 7200000).toISOString(), status: 'completed' }
    ]
  },
  {
    id: 'trading-analyst',
    name: 'trading-analyst',
    displayName: 'Trading-Analyst',
    role: 'specialist',
    reportsTo: 'juno',
    model: 'kimi',
    modelVersion: 'Kimi K2',
    specialty: ['Trading Analysis', 'Market Data', 'Technical Analysis', 'Risk Management'],
    avatar: 'T',
    currentTask: null,
    stats: {
      activePrs: 0,
      completedToday: 0,
      totalCompleted: 23,
      lastActivity: new Date(Date.now() - 86400000).toISOString()
    },
    prs: [],
    isOnline: false,
    responsibilities: [
      'Market gap scanning and analysis',
      'Trade journal analytics',
      'Risk assessment calculations',
      'Market briefing generation',
      'Watchlist monitoring'
    ],
    recentWork: [
      { id: 'w1', type: 'task', title: 'Morning market briefing', timestamp: new Date(Date.now() - 86400000).toISOString(), status: 'completed' }
    ]
  },
  {
    id: 'code-reviewer',
    name: 'code-reviewer',
    displayName: 'Code-Reviewer',
    role: 'placeholder',
    reportsTo: 'juno',
    model: 'sonnet',
    modelVersion: 'Claude Sonnet 4.6',
    specialty: ['Code Review', 'Testing', 'Quality Assurance', 'Documentation'],
    avatar: 'CR',
    currentTask: null,
    stats: {
      activePrs: 0,
      completedToday: 0,
      totalCompleted: 0,
      lastActivity: new Date(Date.now() - 172800000).toISOString()
    },
    prs: [],
    isOnline: false,
    responsibilities: [
      'PR code reviews',
      'Test coverage analysis',
      'Documentation verification',
      'Best practices enforcement',
      'Performance optimization suggestions'
    ],
    recentWork: []
  }
];

export default function TeamCard() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedAgents, setExpandedAgents] = useState<Set<string>>(new Set());
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);

  useEffect(() => {
    fetchAgentStatus();
    const interval = setInterval(fetchAgentStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchAgentStatus = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/agent-status');
      const data: AgentStatusResponse = await response.json();
      
      if (data.success) {
        // Merge with sample data to get responsibilities
        const mergedAgents = data.data.map(agent => {
          const sample = SAMPLE_AGENTS.find(a => a.id === agent.id);
          return { ...sample, ...agent, responsibilities: sample?.responsibilities || [], recentWork: sample?.recentWork || [] };
        });
        setAgents(mergedAgents);
        setLastUpdated(new Date());
        
        if (!selectedAgent && mergedAgents.length > 0) {
          const leadAgent = mergedAgents.find(a => a.role === 'lead') || mergedAgents[0];
          setSelectedAgent(leadAgent);
          setExpandedAgents(new Set([leadAgent.id]));
        }
      } else {
        setAgents(SAMPLE_AGENTS);
        if (!selectedAgent) {
          setSelectedAgent(SAMPLE_AGENTS[0]);
        }
      }
    } catch (error) {
      console.error('Failed to fetch agent status:', error);
      setAgents(SAMPLE_AGENTS);
      if (!selectedAgent) {
        setSelectedAgent(SAMPLE_AGENTS[0]);
      }
    } finally {
      setLoading(false);
    }
  };

  const toggleAgentExpanded = (agentId: string) => {
    setExpandedAgents(prev => {
      const newSet = new Set(prev);
      if (newSet.has(agentId)) {
        newSet.delete(agentId);
      } else {
        newSet.add(agentId);
      }
      return newSet;
    });
  };

  const formatLastActivity = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  const getModelColor = (model: string) => {
    switch (model) {
      case 'kimi':
        return 'bg-orange-500/10 border-orange-500/30 text-orange-500';
      case 'sonnet':
        return 'bg-purple-500/10 border-purple-500/30 text-purple-500';
      case 'gpt4':
        return 'bg-green-500/10 border-green-500/30 text-green-500';
      default:
        return 'bg-gray-500/10 border-gray-500/30 text-gray-500';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'working':
        return 'bg-blue-500/10 text-blue-400 border-blue-500/30';
      case 'idle':
        return 'bg-gray-500/10 text-gray-400 border-gray-500/30';
      case 'completed':
        return 'bg-green-500/10 text-green-400 border-green-500/30';
      case 'failed':
        return 'bg-red-500/10 text-red-400 border-red-500/30';
      default:
        return 'bg-gray-500/10 text-gray-400 border-gray-500/30';
    }
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'lead':
        return 'Lead Agent';
      case 'specialist':
        return 'Specialist';
      case 'placeholder':
        return 'Coming Soon';
      default:
        return role;
    }
  };

  // Organize agents by hierarchy
  const leadAgent = agents.find(a => a.role === 'lead');
  const specialistAgents = agents.filter(a => a.role === 'specialist');
  const placeholderAgents = agents.filter(a => a.role === 'placeholder');

  const onlineCount = agents.filter(a => a.isOnline).length;
  const workingCount = agents.filter(a => a.currentTask?.status === 'working').length;
  const totalPrs = agents.reduce((sum, a) => sum + a.stats.activePrs, 0);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Left Sidebar - Team List */}
      <div className="lg:col-span-1 space-y-4">
        {/* Stats */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-[#161b22] rounded-xl p-4 border border-[#30363d]">
            <div className="flex items-center gap-2 mb-2">
              <Bot className="w-4 h-4 text-blue-400" />
              <span className="text-xs text-[#8b949e]">Agents</span>
            </div>
            <p className="text-2xl font-bold text-white">{agents.length}</p>
          </div>
          <div className="bg-[#161b22] rounded-xl p-4 border border-[#30363d]">
            <div className="flex items-center gap-2 mb-2">
              <Zap className="w-4 h-4 text-green-400" />
              <span className="text-xs text-[#8b949e]">Active</span>
            </div>
            <p className="text-2xl font-bold text-white">{onlineCount}</p>
          </div>
        </div>

        {/* Team List */}
        <div className="bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden">
          <div className="p-4 border-b border-[#30363d]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-[#ff6b35]" />
                <h3 className="font-semibold text-white">AI Team</h3>
              </div>
              <button
                onClick={fetchAgentStatus}
                disabled={loading}
                className="p-1.5 hover:bg-[#30363d] rounded-lg transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 text-[#8b949e] ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          <div className="divide-y divide-[#30363d]">
            {/* Lead Agent */}
            {leadAgent && (
              <button
                onClick={() => setSelectedAgent(leadAgent)}
                className={`w-full p-4 text-left transition-colors hover:bg-[#0d1117] ${
                  selectedAgent?.id === leadAgent.id ? 'bg-[#0d1117] border-l-2 border-l-[#ff6b35]' : ''
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold ${getModelColor(leadAgent.model)}`}>
                    {leadAgent.avatar}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className={`font-medium ${selectedAgent?.id === leadAgent.id ? 'text-[#ff6b35]' : 'text-white'}`}>
                        {leadAgent.displayName}
                      </h4>
                      {leadAgent.isOnline && (
                        <span className="w-2 h-2 rounded-full bg-green-500" />
                      )}
                    </div>
                    <p className="text-xs text-[#8b949e]">{getRoleLabel(leadAgent.role)}</p>
                    
                    {leadAgent.currentTask && (
                      <div className="mt-2">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full border ${getStatusColor(leadAgent.currentTask.status)}`}>
                          {leadAgent.currentTask.status}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </button>
            )}

            {/* Specialists */}
            {[...specialistAgents, ...placeholderAgents].map((agent) => (
              <button
                key={agent.id}
                onClick={() => setSelectedAgent(agent)}
                className={`w-full p-4 text-left transition-colors hover:bg-[#0d1117] ${
                  selectedAgent?.id === agent.id ? 'bg-[#0d1117] border-l-2 border-l-[#ff6b35]' : ''
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold ${getModelColor(agent.model)}`}>
                    {agent.avatar}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className={`font-medium ${selectedAgent?.id === agent.id ? 'text-[#ff6b35]' : 'text-white'}`}>
                        {agent.displayName}
                      </h4>
                      {agent.isOnline && (
                        <span className="w-2 h-2 rounded-full bg-green-500" />
                      )}
                    </div>
                    <p className="text-xs text-[#8b949e]">{getRoleLabel(agent.role)}</p>
                    
                    {agent.currentTask && (
                      <div className="mt-2">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full border ${getStatusColor(agent.currentTask.status)}`}>
                          {agent.currentTask.status}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Right Content - Agent Details */}
      <div className="lg:col-span-2">
        {selectedAgent ? (
          <div className="bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden">
            {/* Agent Header */}
            <div className="p-6 border-b border-[#30363d]">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4">
                  <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-bold ${getModelColor(selectedAgent.model)}`}>
                    {selectedAgent.avatar}
                  </div>
                  <div>
                    <div className="flex items-center gap-3 mb-1">
                      <h2 className="text-2xl font-bold text-white">{selectedAgent.displayName}</h2>
                      <span className={`text-xs px-2 py-1 rounded-full border ${getModelColor(selectedAgent.model)}`}>
                        {selectedAgent.modelVersion}
                      </span>
                      <span className={`text-xs px-2 py-1 rounded-full border ${getStatusColor(selectedAgent.isOnline ? 'working' : 'idle')}`}>
                        {selectedAgent.isOnline ? 'Online' : 'Offline'}
                      </span>
                    </div>
                    <p className="text-[#8b949e]">{getRoleLabel(selectedAgent.role)}</p>
                    
                    <div className="flex flex-wrap gap-2 mt-3">
                      {selectedAgent.specialty.map((spec, idx) => (
                        <span 
                          key={idx}
                          className="text-xs px-2 py-1 bg-[#21262d] text-[#8b949e] rounded-md border border-[#30363d]"
                        >
                          {spec}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="text-right">
                  <p className="text-xs text-[#8b949e]">Last Activity</p>
                  <p className="text-sm text-white">{formatLastActivity(selectedAgent.stats.lastActivity)}</p>
                </div>
              </div>
            </div>

            {/* Current Task */}
            <div className="p-6 border-b border-[#30363d]">
              <div className="flex items-center gap-2 mb-4">
                <Target className="w-4 h-4 text-[#ff6b35]" />
                <span className="text-sm font-medium text-white">Current Task</span>
              </div>

              {selectedAgent.currentTask ? (
                <div className="bg-[#0d1117] rounded-xl p-5 border border-[#30363d]">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-semibold text-white text-lg">{selectedAgent.currentTask.title}</h3>
                      <p className="text-sm text-[#8b949e] mt-1">{selectedAgent.currentTask.description}</p>
                    </div>
                    <span className={`text-xs px-3 py-1 rounded-full border ${getStatusColor(selectedAgent.currentTask.status)}`}>
                      {selectedAgent.currentTask.status}
                    </span>
                  </div>

                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-[#8b949e]">Progress</span>
                      <span className="text-sm font-medium text-white">{selectedAgent.currentTask.progress}%</span>
                    </div>
                    <div className="h-2 bg-[#21262d] rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-[#ff6b35] to-[#ff8c5a] rounded-full transition-all"
                        style={{ width: `${selectedAgent.currentTask.progress}%` }}
                      />
                    </div>
                  </div>

                  {selectedAgent.currentTask.prUrl && (
                    <a 
                      href={selectedAgent.currentTask.prUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-sm text-[#ff6b35] hover:text-[#ff8c5a] transition-colors"
                    >
                      <GitPullRequest className="w-4 h-4" />
                      View Pull Request
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              ) : (
                <div className="bg-[#0d1117] rounded-xl p-8 border border-[#30363d] text-center">
                  <Sparkles className="w-8 h-8 mx-auto mb-3 text-[#8b949e] opacity-50" />
                  <p className="text-[#8b949e]">No active task</p>
                  <p className="text-sm text-[#8b949e]/70 mt-1">Agent is idle and ready for assignment</p>
                </div>
              )}
            </div>

            {/* Responsibilities */}
            <div className="p-6 border-b border-[#30363d]">
              <div className="flex items-center gap-2 mb-4">
                <UserCog className="w-4 h-4 text-blue-400" />
                <span className="text-sm font-medium text-white">Responsibilities</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {selectedAgent.responsibilities.map((resp, idx) => (
                  <div key={idx} className="flex items-start gap-3 bg-[#0d1117] rounded-lg p-3 border border-[#30363d]">
                    <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
                    <span className="text-sm text-[#e6edf3]">{resp}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Stats & Recent Work */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-6">
              {/* Quick Stats */}
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <BarChart3 className="w-4 h-4 text-green-400" />
                  <span className="text-sm font-medium text-white">Statistics</span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-[#0d1117] rounded-lg p-4 border border-[#30363d]">
                    <p className="text-xs text-[#8b949e] mb-1">Active PRs</p>
                    <p className="text-2xl font-bold text-white">{selectedAgent.stats.activePrs}</p>
                  </div>
                  <div className="bg-[#0d1117] rounded-lg p-4 border border-[#30363d]">
                    <p className="text-xs text-[#8b949e] mb-1">Completed Today</p>
                    <p className="text-2xl font-bold text-white">{selectedAgent.stats.completedToday}</p>
                  </div>
                  <div className="bg-[#0d1117] rounded-lg p-4 border border-[#30363d]">
                    <p className="text-xs text-[#8b949e] mb-1">Total Completed</p>
                    <p className="text-2xl font-bold text-white">{selectedAgent.stats.totalCompleted}</p>
                  </div>
                  <div className="bg-[#0d1117] rounded-lg p-4 border border-[#30363d]">
                    <p className="text-xs text-[#8b949e] mb-1">Agent ID</p>
                    <p className="text-sm font-mono text-[#8b949e] truncate">{selectedAgent.id}</p>
                  </div>
                </div>
              </div>

              {/* Recent Work */}
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <Clock className="w-4 h-4 text-purple-400" />
                  <span className="text-sm font-medium text-white">Recent Work</span>
                </div>

                <div className="space-y-2">
                  {selectedAgent.recentWork.length > 0 ? (
                    selectedAgent.recentWork.map((work) => (
                      <div key={work.id} className="flex items-center gap-3 bg-[#0d1117] rounded-lg p-3 border border-[#30363d]">
                        <div className="flex-shrink-0">
                          {work.type === 'task' && <CheckCircle2 className="w-4 h-4 text-green-400" />}
                          {work.type === 'pr' && <GitPullRequest className="w-4 h-4 text-purple-400" />}
                          {work.type === 'commit' && <GitBranch className="w-4 h-4 text-blue-400" />}
                          {work.type === 'review' && <FileDiff className="w-4 h-4 text-orange-400" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-[#e6edf3] truncate">{work.title}</p>
                          <p className="text-xs text-[#8b949e]">{formatLastActivity(work.timestamp)}</p>
                        </div>
                        
                        <span className="text-xs px-2 py-0.5 rounded-full bg-[#21262d] text-[#8b949e]">
                          {work.status}
                        </span>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-[#8b949e] text-center py-4">No recent activity</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-12 text-center">
            <Users className="w-12 h-12 mx-auto mb-3 text-[#8b949e] opacity-50" />
            <p className="text-[#8b949e]">Select an agent to view details</p>
          </div>
        )}
      </div>
    </div>
  );
}
