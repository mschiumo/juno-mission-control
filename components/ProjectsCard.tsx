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
  Award
} from 'lucide-react';

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
  isOnline: boolean;
}

interface AgentStatusResponse {
  success: boolean;
  data: Agent[];
  count: number;
  activeCount: number;
  workingCount: number;
  isMockData?: boolean;
  error?: string;
}

export default function ProjectsCard() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedAgents, setExpandedAgents] = useState<Set<string>>(new Set());
  const [isMockData, setIsMockData] = useState(false);

  // Fetch agent status on mount and every 10 seconds
  useEffect(() => {
    fetchAgentStatus();
    const interval = setInterval(fetchAgentStatus, 10000);
    return () => clearInterval(interval);
  }, []);

  const fetchAgentStatus = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/agent-status');
      const data: AgentStatusResponse = await response.json();
      
      if (data.success) {
        setAgents(data.data);
        setIsMockData(data.isMockData || false);
        setLastUpdated(new Date());
        
        // Auto-expand lead agent
        if (data.data.length > 0 && expandedAgents.size === 0) {
          const leadAgent = data.data.find(a => a.role === 'lead');
          if (leadAgent) {
            setExpandedAgents(new Set([leadAgent.id]));
          }
        }
      } else {
        setError((data as any).error || 'Failed to fetch agent status');
      }
    } catch (error) {
      console.error('Failed to fetch agent status:', error);
      setError('Network error');
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

  const formatTaskDuration = (startedAt?: string) => {
    if (!startedAt) return '';
    const start = new Date(startedAt);
    const now = new Date();
    const diffMs = now.getTime() - start.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);

    if (diffHours > 0) {
      return `${diffHours}h ${diffMins % 60}m`;
    }
    return `${diffMins}m`;
  };

  const getModelColor = (model: string) => {
    switch (model) {
      case 'kimi':
        return {
          bg: 'bg-orange-500/10',
          border: 'border-orange-500/30',
          text: 'text-orange-500',
          badge: 'bg-orange-500',
          glow: 'shadow-orange-500/20'
        };
      case 'sonnet':
        return {
          bg: 'bg-purple-500/10',
          border: 'border-purple-500/30',
          text: 'text-purple-500',
          badge: 'bg-purple-500',
          glow: 'shadow-purple-500/20'
        };
      case 'gpt4':
        return {
          bg: 'bg-green-500/10',
          border: 'border-green-500/30',
          text: 'text-green-500',
          badge: 'bg-green-500',
          glow: 'shadow-green-500/20'
        };
      default:
        return {
          bg: 'bg-gray-500/10',
          border: 'border-gray-500/30',
          text: 'text-gray-500',
          badge: 'bg-gray-500',
          glow: 'shadow-gray-500/20'
        };
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'working':
        return {
          bg: 'bg-blue-500/10',
          text: 'text-blue-400',
          border: 'border-blue-500/30',
          dot: 'bg-blue-500 animate-pulse'
        };
      case 'idle':
        return {
          bg: 'bg-gray-500/10',
          text: 'text-gray-400',
          border: 'border-gray-500/30',
          dot: 'bg-gray-500'
        };
      case 'completed':
        return {
          bg: 'bg-green-500/10',
          text: 'text-green-400',
          border: 'border-green-500/30',
          dot: 'bg-green-500'
        };
      case 'failed':
        return {
          bg: 'bg-red-500/10',
          text: 'text-red-400',
          border: 'border-red-500/30',
          dot: 'bg-red-500'
        };
      default:
        return {
          bg: 'bg-gray-500/10',
          text: 'text-gray-400',
          border: 'border-gray-500/30',
          dot: 'bg-gray-500'
        };
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'working':
        return <Loader2 className="w-4 h-4 animate-spin" />;
      case 'completed':
        return <CheckCircle2 className="w-4 h-4" />;
      case 'failed':
        return <XCircle className="w-4 h-4" />;
      default:
        return <Activity className="w-4 h-4" />;
    }
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'lead':
        return 'VP Operations';
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

  // Stats
  const onlineCount = agents.filter(a => a.isOnline).length;
  const workingCount = agents.filter(a => a.currentTask?.status === 'working').length;
  const totalPrs = agents.reduce((sum, a) => sum + a.stats.activePrs, 0);
  const totalCompletedToday = agents.reduce((sum, a) => sum + a.stats.completedToday, 0);

  return (
    <div className="bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden">
      {/* Header */}
      <div className="p-6 border-b border-[#30363d]">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-gradient-to-br from-[#ff6b35]/20 to-[#ff8c5a]/10 rounded-xl border border-[#ff6b35]/20">
              <Users className="w-6 h-6 text-[#ff6b35]" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                AI Agency
                <span className="px-2 py-0.5 text-[10px] font-medium bg-[#30363d] text-[#8b949e] rounded-full">
                  Org Chart
                </span>
              </h2>
              <p className="text-sm text-[#8b949e] mt-0.5">
                {onlineCount} active • {workingCount} working • {totalPrs} open PRs
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {isMockData && (
              <span className="px-2 py-1 text-[10px] font-medium bg-amber-500/10 text-amber-400 rounded-full border border-amber-500/20">
                Demo Mode
              </span>
            )}
            <button
              onClick={fetchAgentStatus}
              disabled={loading}
              className="p-2 hover:bg-[#30363d] rounded-lg transition-colors disabled:opacity-50"
              title="Refresh agent status"
            >
              <RefreshCw className={`w-4 h-4 text-[#8b949e] hover:text-[#ff6b35] ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-4 gap-3 mt-4">
          <div className="bg-[#0d1117] rounded-lg p-3 border border-[#30363d]">
            <div className="flex items-center gap-2">
              <Bot className="w-4 h-4 text-[#8b949e]" />
              <span className="text-xs text-[#8b949e]">Agents</span>
            </div>
            <p className="text-xl font-bold text-white mt-1">{agents.length}</p>
          </div>
          <div className="bg-[#0d1117] rounded-lg p-3 border border-[#30363d]">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-blue-400" />
              <span className="text-xs text-[#8b949e]">Working</span>
            </div>
            <p className="text-xl font-bold text-white mt-1">{workingCount}</p>
          </div>
          <div className="bg-[#0d1117] rounded-lg p-3 border border-[#30363d]">
            <div className="flex items-center gap-2">
              <GitPullRequest className="w-4 h-4 text-purple-400" />
              <span className="text-xs text-[#8b949e]">Open PRs</span>
            </div>
            <p className="text-xl font-bold text-white mt-1">{totalPrs}</p>
          </div>
          <div className="bg-[#0d1117] rounded-lg p-3 border border-[#30363d]">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-green-400" />
              <span className="text-xs text-[#8b949e]">Completed</span>
            </div>
            <p className="text-xl font-bold text-white mt-1">{totalCompletedToday}</p>
          </div>
        </div>
      </div>

      {/* Org Chart Content */}
      <div className="p-6">
        {error ? (
          <div className="text-center py-12">
            <XCircle className="w-12 h-12 mx-auto mb-3 text-red-500" />
            <p className="text-sm text-red-400 mb-2">{error}</p>
            <button 
              onClick={fetchAgentStatus}
              className="px-4 py-2 bg-[#ff6b35] text-white rounded-lg text-sm font-medium hover:bg-[#ff8c5a] transition-colors"
            >
              Retry
            </button>
          </div>
        ) : loading && agents.length === 0 ? (
          <div className="text-center py-12">
            <Loader2 className="w-10 h-10 animate-spin mx-auto mb-3 text-[#ff6b35]" />
            <p className="text-sm text-[#8b949e]">Loading agency structure...</p>
          </div>
        ) : agents.length === 0 ? (
          <div className="text-center py-12">
            <Bot className="w-12 h-12 mx-auto mb-3 text-[#8b949e] opacity-50" />
            <p className="text-[#8b949e]">No agents configured</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Lead Agent */}
            {leadAgent && (
              <div className="relative">
                <AgentCard 
                  agent={leadAgent} 
                  isExpanded={expandedAgents.has(leadAgent.id)}
                  onToggle={() => toggleAgentExpanded(leadAgent.id)}
                  modelColors={getModelColor(leadAgent.model)}
                  statusColors={leadAgent.currentTask ? getStatusColor(leadAgent.currentTask.status) : getStatusColor('idle')}
                  formatLastActivity={formatLastActivity}
                  formatTaskDuration={formatTaskDuration}
                  getStatusIcon={getStatusIcon}
                  getRoleLabel={getRoleLabel}
                  isLead
                />
                
                {/* Connection Line */}
                <div className="absolute left-1/2 -translate-x-1/2 w-0.5 h-6 bg-gradient-to-b from-[#30363d] to-[#30363d] -bottom-6" />
              </div>
            )}

            {/* Specialists Grid */}
            {(specialistAgents.length > 0 || placeholderAgents.length > 0) && (
              <div className="pt-6">
                {/* Horizontal Connector */}
                <div className="relative mb-6">
                  <div className="absolute left-[calc(12.5%+16px)] right-[calc(12.5%+16px)] h-0.5 bg-[#30363d] top-0" />
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[...specialistAgents, ...placeholderAgents].map((agent, index, arr) => (
                      <div key={agent.id} className="relative">
                        {/* Vertical connector */}
                        <div className="absolute left-1/2 -translate-x-1/2 w-0.5 h-6 bg-[#30363d] -top-6" />
                        <AgentCard 
                          agent={agent} 
                          isExpanded={expandedAgents.has(agent.id)}
                          onToggle={() => toggleAgentExpanded(agent.id)}
                          modelColors={getModelColor(agent.model)}
                          statusColors={agent.currentTask ? getStatusColor(agent.currentTask.status) : getStatusColor('idle')}
                          formatLastActivity={formatLastActivity}
                          formatTaskDuration={formatTaskDuration}
                          getStatusIcon={getStatusIcon}
                          getRoleLabel={getRoleLabel}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Communication Flow Legend */}
        <div className="mt-8 pt-6 border-t border-[#30363d]">
          <h3 className="text-xs font-semibold text-[#8b949e] uppercase tracking-wider mb-4">
            Communication Flow
          </h3>
          <div className="flex items-center justify-center gap-4 flex-wrap">
            <div className="flex items-center gap-2 px-3 py-2 bg-[#0d1117] rounded-lg border border-[#30363d]">
              <div className="w-2 h-2 rounded-full bg-orange-500" />
              <span className="text-xs text-[#8b949e]">Kimi Models</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-2 bg-[#0d1117] rounded-lg border border-[#30363d]">
              <div className="w-2 h-2 rounded-full bg-purple-500" />
              <span className="text-xs text-[#8b949e]">Sonnet Models</span>
            </div>
            <div className="flex items-center gap-1 text-[#8b949e]">
              <ArrowRight className="w-4 h-4" />
              <span className="text-xs">Task Assignment Flow</span>
            </div>
          </div>
          
          {/* Workflow Diagram */}
          <div className="mt-4 flex items-center justify-center gap-3 text-xs">
            <div className="px-3 py-1.5 bg-blue-500/10 border border-blue-500/30 rounded-lg text-blue-400">
              Juno Receives Task
            </div>
            <ArrowRight className="w-4 h-4 text-[#30363d]" />
            <div className="px-3 py-1.5 bg-purple-500/10 border border-purple-500/30 rounded-lg text-purple-400">
              Assigns to Specialist
            </div>
            <ArrowRight className="w-4 h-4 text-[#30363d]" />
            <div className="px-3 py-1.5 bg-green-500/10 border border-green-500/30 rounded-lg text-green-400">
              Reports Back
            </div>
          </div>
        </div>

        {/* Last Updated */}
        {lastUpdated && (
          <div className="mt-4 text-center">
            <span className="text-[10px] text-[#8b949e]">
              Last updated: {lastUpdated.toLocaleString('en-US', {
                month: '2-digit',
                day: '2-digit',
                hour: 'numeric',
                minute: '2-digit',
                hour12: true
              })}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// Agent Card Component
interface AgentCardProps {
  agent: Agent;
  isExpanded: boolean;
  onToggle: () => void;
  modelColors: {
    bg: string;
    border: string;
    text: string;
    badge: string;
    glow: string;
  };
  statusColors: {
    bg: string;
    text: string;
    border: string;
    dot: string;
  };
  formatLastActivity: (timestamp: string) => string;
  formatTaskDuration: (startedAt?: string) => string;
  getStatusIcon: (status: string) => React.ReactNode;
  getRoleLabel: (role: string) => string;
  isLead?: boolean;
}

function AgentCard({ 
  agent, 
  isExpanded, 
  onToggle, 
  modelColors, 
  statusColors,
  formatLastActivity,
  formatTaskDuration,
  getStatusIcon,
  getRoleLabel,
  isLead 
}: AgentCardProps) {
  return (
    <div 
      className={`
        relative bg-[#0d1117] rounded-xl border transition-all duration-300
        ${isLead ? 'border-[#ff6b35]/30 shadow-lg shadow-[#ff6b35]/5' : 'border-[#30363d] hover:border-[#30363d]/80'}
        ${agent.isOnline ? '' : 'opacity-75'}
      `}
    >
      {/* Online Indicator */}
      <div className={`
        absolute top-3 right-3 w-2.5 h-2.5 rounded-full
        ${agent.isOnline ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : 'bg-gray-500'}
      `} />

      {/* Card Header */}
      <div 
        className="p-4 cursor-pointer"
        onClick={onToggle}
      >
        <div className="flex items-start gap-3">
          {/* Avatar */}
          <div className={`
            flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center text-lg font-bold
            ${modelColors.bg} ${modelColors.text} border ${modelColors.border}
            ${isLead ? 'ring-2 ring-[#ff6b35]/20' : ''}
          `}>
            {agent.avatar}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0 pr-6">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-white truncate">{agent.displayName}</h3>
              <span className={`
                text-[10px] px-2 py-0.5 rounded-full font-medium
                ${modelColors.bg} ${modelColors.text} border ${modelColors.border}
              `}>
                {agent.modelVersion}
              </span>
            </div>
            <p className="text-xs text-[#8b949e] mt-0.5">{getRoleLabel(agent.role)}</p>
            
            {/* Status Badge */}
            {agent.currentTask && (
              <div className="flex items-center gap-2 mt-2">
                <span className={`
                  flex items-center gap-1.5 text-[10px] px-2 py-1 rounded-full font-medium
                  ${statusColors.bg} ${statusColors.text} border ${statusColors.border}
                `}>
                  <span className={`w-1.5 h-1.5 rounded-full ${statusColors.dot}`} />
                  {agent.currentTask.status.charAt(0).toUpperCase() + agent.currentTask.status.slice(1)}
                </span>
                {agent.currentTask.progress > 0 && (
                  <span className="text-[10px] text-[#8b949e]">
                    {agent.currentTask.progress}%
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Expand Icon */}
          <div className="absolute top-4 right-8">
            {isExpanded ? (
              <ChevronDown className="w-4 h-4 text-[#8b949e]" />
            ) : (
              <ChevronRight className="w-4 h-4 text-[#8b949e]" />
            )}
          </div>
        </div>

        {/* Progress Bar (if working) */}
        {agent.currentTask && agent.currentTask.status === 'working' && (
          <div className="mt-3">
            <div className="h-1.5 bg-[#21262d] rounded-full overflow-hidden">
              <div 
                className={`h-full rounded-full ${modelColors.badge} transition-all duration-500`}
                style={{ width: `${agent.currentTask.progress}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Expanded Details */}
      {isExpanded && (
        <div className="px-4 pb-4 border-t border-[#30363d] pt-4">
          {/* Current Task */}
          {agent.currentTask ? (
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-2">
                <Target className="w-3.5 h-3.5 text-[#8b949e]" />
                <span className="text-xs font-medium text-[#8b949e] uppercase tracking-wide">
                  Current Task
                </span>
              </div>
              <div className="bg-[#161b22] rounded-lg p-3 border border-[#30363d]">
                <h4 className="font-medium text-white text-sm">{agent.currentTask.title}</h4>
                <p className="text-xs text-[#8b949e] mt-1">{agent.currentTask.description}</p>
                
                <div className="flex items-center gap-4 mt-3 text-[10px] text-[#8b949e]">
                  {agent.currentTask.startedAt && (
                    <div className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      <span>{formatTaskDuration(agent.currentTask.startedAt)} elapsed</span>
                    </div>
                  )}
                  <div className="flex items-center gap-1">
                    {getStatusIcon(agent.currentTask.status)}
                    <span>{agent.currentTask.progress}% complete</span>
                  </div>
                </div>

                {agent.currentTask.prUrl && (
                  <a 
                    href={agent.currentTask.prUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 mt-3 text-xs text-[#ff6b35] hover:text-[#ff8c5a] transition-colors"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <GitPullRequest className="w-3.5 h-3.5" />
                    View PR
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            </div>
          ) : (
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-2">
                <Target className="w-3.5 h-3.5 text-[#8b949e]" />
                <span className="text-xs font-medium text-[#8b949e] uppercase tracking-wide">
                  Current Task
                </span>
              </div>
              <div className="bg-[#161b22] rounded-lg p-4 border border-[#30363d] text-center">
                <Sparkles className="w-5 h-5 mx-auto mb-2 text-[#8b949e] opacity-50" />
                <p className="text-xs text-[#8b949e]">No active task</p>
              </div>
            </div>
          )}

          {/* Stats Grid */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-[#161b22] rounded-lg p-3 border border-[#30363d]">
              <div className="flex items-center gap-1.5 mb-1">
                <GitPullRequest className="w-3.5 h-3.5 text-purple-400" />
                <span className="text-[10px] text-[#8b949e]">Active PRs</span>
              </div>
              <p className="text-lg font-bold text-white">{agent.stats.activePrs}</p>
            </div>
            <div className="bg-[#161b22] rounded-lg p-3 border border-[#30363d]">
              <div className="flex items-center gap-1.5 mb-1">
                <Award className="w-3.5 h-3.5 text-green-400" />
                <span className="text-[10px] text-[#8b949e]">Completed</span>
              </div>
              <p className="text-lg font-bold text-white">{agent.stats.completedToday}</p>
            </div>
          </div>

          {/* Specialties */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-3.5 h-3.5 text-[#8b949e]" />
              <span className="text-xs font-medium text-[#8b949e] uppercase tracking-wide">
                Specialties
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {agent.specialty.map((spec, idx) => (
                <span 
                  key={idx}
                  className="text-[10px] px-2 py-1 bg-[#21262d] text-[#8b949e] rounded-md border border-[#30363d]"
                >
                  {spec}
                </span>
              ))}
            </div>
          </div>

          {/* Footer Info */}
          <div className="mt-4 pt-3 border-t border-[#30363d] flex items-center justify-between text-[10px] text-[#8b949e]">
            <span>Active {formatLastActivity(agent.stats.lastActivity)}</span>
            <span className="font-mono">ID: {agent.id}</span>
          </div>
        </div>
      )}
    </div>
  );
}
