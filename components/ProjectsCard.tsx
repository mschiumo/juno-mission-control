'use client';

import { useState, useEffect } from 'react';
import { 
  FolderKanban, 
  Target, 
  TrendingUp, 
  Clock,
  CheckCircle2,
  Circle,
  AlertCircle,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Loader2,
  ExternalLink,
  GitBranch,
  FileText,
  BarChart3,
  Calendar
} from 'lucide-react';

interface Project {
  id: string;
  name: string;
  description: string;
  status: 'active' | 'paused' | 'completed' | 'planned';
  progress: number;
  startDate: string;
  targetDate?: string;
  category: string;
  milestones: Milestone[];
  recentActivity: ActivityItem[];
  metrics: {
    tasksCompleted: number;
    tasksTotal: number;
    hoursInvested: number;
    lastWorked: string;
  };
}

interface Milestone {
  id: string;
  title: string;
  completed: boolean;
  dueDate?: string;
}

interface ActivityItem {
  id: string;
  type: 'task' | 'note' | 'milestone' | 'commit';
  description: string;
  timestamp: string;
}

interface ProjectsDataResponse {
  success: boolean;
  projects: Project[];
  stats: {
    totalProjects: number;
    activeProjects: number;
    completedThisMonth: number;
    overallProgress: number;
  };
}

const SAMPLE_PROJECTS: Project[] = [
  {
    id: '1',
    name: 'Real World Solutions Book',
    description: 'A practical guide combining AI tools with human expertise for real-world problem solving.',
    status: 'active',
    progress: 35,
    startDate: '2026-01-15',
    targetDate: '2026-06-30',
    category: 'Writing',
    milestones: [
      { id: 'm1', title: 'Outline complete', completed: true },
      { id: 'm2', title: 'Chapter 1-3 drafts', completed: true },
      { id: 'm3', title: 'Chapter 4-6 drafts', completed: false, dueDate: '2026-03-15' },
      { id: 'm4', title: 'First edit pass', completed: false, dueDate: '2026-04-30' },
      { id: 'm5', title: 'Final manuscript', completed: false, dueDate: '2026-06-15' }
    ],
    recentActivity: [
      { id: 'a1', type: 'milestone', description: 'Completed Chapter 3 outline', timestamp: '2026-03-02T14:30:00Z' },
      { id: 'a2', type: 'task', description: 'Added case studies section', timestamp: '2026-03-01T10:15:00Z' },
      { id: 'a3', type: 'note', description: 'Research on AI implementation patterns', timestamp: '2026-02-28T16:45:00Z' }
    ],
    metrics: {
      tasksCompleted: 12,
      tasksTotal: 25,
      hoursInvested: 48,
      lastWorked: '2026-03-02T14:30:00Z'
    }
  },
  {
    id: '2',
    name: 'Content Automation',
    description: 'Automated content pipeline for blog posts, social media, and newsletters.',
    status: 'active',
    progress: 60,
    startDate: '2026-01-01',
    targetDate: '2026-04-15',
    category: 'Automation',
    milestones: [
      { id: 'm1', title: 'Research phase', completed: true },
      { id: 'm2', title: 'Workflow design', completed: true },
      { id: 'm3', title: 'Core automation built', completed: true },
      { id: 'm4', title: 'Integration testing', completed: false, dueDate: '2026-03-20' },
      { id: 'm5', title: 'Launch', completed: false, dueDate: '2026-04-15' }
    ],
    recentActivity: [
      { id: 'a1', type: 'commit', description: 'Added RSS feed parser', timestamp: '2026-03-03T09:00:00Z' },
      { id: 'a2', type: 'task', description: 'Configured webhook triggers', timestamp: '2026-03-02T11:20:00Z' },
      { id: 'a3', type: 'milestone', description: 'Core automation completed', timestamp: '2026-02-28T15:00:00Z' }
    ],
    metrics: {
      tasksCompleted: 18,
      tasksTotal: 22,
      hoursInvested: 72,
      lastWorked: '2026-03-03T09:00:00Z'
    }
  },
  {
    id: '3',
    name: 'Trading Dashboard',
    description: 'Comprehensive trading journal and analytics platform for tracking investments.',
    status: 'active',
    progress: 78,
    startDate: '2026-02-01',
    category: 'Development',
    milestones: [
      { id: 'm1', title: 'MVP design', completed: true },
      { id: 'm2', title: 'Trade import functionality', completed: true },
      { id: 'm3', title: 'Analytics dashboard', completed: true },
      { id: 'm4', title: 'Watchlist features', completed: true },
      { id: 'm5', title: 'Advanced reporting', completed: false, dueDate: '2026-03-30' }
    ],
    recentActivity: [
      { id: 'a1', type: 'commit', description: 'Fixed timezone consistency', timestamp: '2026-03-03T04:00:00Z' },
      { id: 'a2', type: 'task', description: 'Added favorites to watchlist', timestamp: '2026-03-02T20:30:00Z' },
      { id: 'a3', type: 'task', description: 'Implemented position calculator', timestamp: '2026-03-01T14:00:00Z' }
    ],
    metrics: {
      tasksCompleted: 31,
      tasksTotal: 35,
      hoursInvested: 96,
      lastWorked: '2026-03-03T04:00:00Z'
    }
  }
];

export default function ProjectsCard() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [stats, setStats] = useState({
    totalProjects: 0,
    activeProjects: 0,
    completedThisMonth: 0,
    overallProgress: 0
  });

  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/projects');
      const data: ProjectsDataResponse = await response.json();
      
      if (data.success) {
        setProjects(data.projects);
        setStats(data.stats);
        if (data.projects.length > 0 && !selectedProject) {
          setSelectedProject(data.projects[0]);
        }
      } else {
        // Use sample data
        setProjects(SAMPLE_PROJECTS);
        setStats({
          totalProjects: 3,
          activeProjects: 3,
          completedThisMonth: 0,
          overallProgress: 58
        });
        setSelectedProject(SAMPLE_PROJECTS[0]);
      }
    } catch (error) {
      console.error('Failed to fetch projects:', error);
      setProjects(SAMPLE_PROJECTS);
      setStats({
        totalProjects: 3,
        activeProjects: 3,
        completedThisMonth: 0,
        overallProgress: 58
      });
      setSelectedProject(SAMPLE_PROJECTS[0]);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-500/10 text-green-400 border-green-500/30';
      case 'paused':
        return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30';
      case 'completed':
        return 'bg-blue-500/10 text-blue-400 border-blue-500/30';
      case 'planned':
        return 'bg-gray-500/10 text-gray-400 border-gray-500/30';
      default:
        return 'bg-gray-500/10 text-gray-400 border-gray-500/30';
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'Writing':
        return <FileText className="w-4 h-4" />;
      case 'Automation':
        return <GitBranch className="w-4 h-4" />;
      case 'Development':
        return <BarChart3 className="w-4 h-4" />;
      default:
        return <Target className="w-4 h-4" />;
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    });
  };

  const formatRelativeTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffHours / 24);

    if (diffHours < 1) return 'Just now';
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return formatDate(timestamp);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Left Sidebar - Project List */}
      <div className="lg:col-span-1 space-y-4">
        {/* Stats Cards */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-[#161b22] rounded-xl p-4 border border-[#30363d]">
            <div className="flex items-center gap-2 mb-2">
              <FolderKanban className="w-4 h-4 text-blue-400" />
              <span className="text-xs text-[#8b949e]">Total</span>
            </div>
            <p className="text-2xl font-bold text-white">{stats.totalProjects}</p>
          </div>
          <div className="bg-[#161b22] rounded-xl p-4 border border-[#30363d]">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-4 h-4 text-green-400" />
              <span className="text-xs text-[#8b949e]">Active</span>
            </div>
            <p className="text-2xl font-bold text-white">{stats.activeProjects}</p>
          </div>
        </div>

        {/* Project List */}
        <div className="bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden">
          <div className="p-4 border-b border-[#30363d]">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-white">Projects</h3>
              <button
                onClick={fetchProjects}
                disabled={loading}
                className="p-1.5 hover:bg-[#30363d] rounded-lg transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 text-[#8b949e] ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>
          
          <div className="divide-y divide-[#30363d]">
            {projects.map((project) => (
              <button
                key={project.id}
                onClick={() => setSelectedProject(project)}
                className={`w-full p-4 text-left transition-colors hover:bg-[#0d1117] ${
                  selectedProject?.id === project.id ? 'bg-[#0d1117] border-l-2 border-l-[#ff6b35]' : ''
                }`}
              >
                <div className="flex items-start justify-between mb-2">
                  <h4 className={`font-medium ${selectedProject?.id === project.id ? 'text-[#ff6b35]' : 'text-white'}`}>
                    {project.name}
                  </h4>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full border ${getStatusColor(project.status)}`}>
                    {project.status}
                  </span>
                </div>
                
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[#8b949e]">{getCategoryIcon(project.category)}</span>
                  <span className="text-xs text-[#8b949e]">{project.category}</span>
                </div>
                
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[#8b949e]">{project.progress}%</span>
                    <span className="text-[#8b949e]">{project.metrics.tasksCompleted}/{project.metrics.tasksTotal} tasks</span>
                  </div>
                  <div className="h-1.5 bg-[#21262d] rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-[#ff6b35] to-[#ff8c5a] rounded-full transition-all"
                      style={{ width: `${project.progress}%` }}
                    />
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Right Content - Project Details */}
      <div className="lg:col-span-2">
        {selectedProject ? (
          <div className="bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden">
            {/* Project Header */}
            <div className="p-6 border-b border-[#30363d]">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <h2 className="text-2xl font-bold text-white">{selectedProject.name}</h2>
                    <span className={`text-xs px-2 py-1 rounded-full border ${getStatusColor(selectedProject.status)}`}>
                      {selectedProject.status}
                    </span>
                  </div>
                  <p className="text-[#8b949e]">{selectedProject.description}</p>
                </div>
                
                <div className="flex items-center gap-2">
                  <button className="p-2 hover:bg-[#30363d] rounded-lg transition-colors">
                    <MoreHorizontal className="w-5 h-5 text-[#8b949e]" />
                  </button>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-[#8b949e]">Overall Progress</span>
                  <span className="text-lg font-bold text-white">{selectedProject.progress}%</span>
                </div>
                <div className="h-2 bg-[#21262d] rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-[#ff6b35] to-[#ff8c5a] rounded-full transition-all"
                    style={{ width: `${selectedProject.progress}%` }}
                  />
                </div>
              </div>

              {/* Quick Stats */}
              <div className="grid grid-cols-4 gap-4">
                <div className="bg-[#0d1117] rounded-lg p-3 border border-[#30363d]">
                  <div className="flex items-center gap-1.5 mb-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
                    <span className="text-[10px] text-[#8b949e]">Tasks Done</span>
                  </div>
                  <p className="text-lg font-bold text-white">{selectedProject.metrics.tasksCompleted}</p>
                </div>
                <div className="bg-[#0d1117] rounded-lg p-3 border border-[#30363d]">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Clock className="w-3.5 h-3.5 text-blue-400" />
                    <span className="text-[10px] text-[#8b949e]">Hours</span>
                  </div>
                  <p className="text-lg font-bold text-white">{selectedProject.metrics.hoursInvested}</p>
                </div>
                <div className="bg-[#0d1117] rounded-lg p-3 border border-[#30363d]">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Calendar className="w-3.5 h-3.5 text-purple-400" />
                    <span className="text-[10px] text-[#8b949e]">Started</span>
                  </div>
                  <p className="text-lg font-bold text-white">{formatDate(selectedProject.startDate)}</p>
                </div>
                <div className="bg-[#0d1117] rounded-lg p-3 border border-[#30363d]">
                  <div className="flex items-center gap-1.5 mb-1">
                    <TrendingUp className="w-3.5 h-3.5 text-orange-400" />
                    <span className="text-[10px] text-[#8b949e]">Last Active</span>
                  </div>
                  <p className="text-lg font-bold text-white">{formatRelativeTime(selectedProject.metrics.lastWorked)}</p>
                </div>
              </div>
            </div>

            {/* Milestones */}
            <div className="p-6 border-b border-[#30363d]">
              <div className="flex items-center gap-2 mb-4">
                <Target className="w-4 h-4 text-[#ff6b35]" />
                <span className="text-sm font-medium text-white">Milestones</span>
              </div>
              
              <div className="space-y-3">
                {selectedProject.milestones.map((milestone) => (
                  <div 
                    key={milestone.id}
                    className={`flex items-center gap-3 p-3 rounded-lg border ${
                      milestone.completed 
                        ? 'bg-green-500/5 border-green-500/20' 
                        : 'bg-[#0d1117] border-[#30363d]'
                    }`}
                  >
                    <div className={`flex-shrink-0 ${milestone.completed ? 'text-green-400' : 'text-[#8b949e]'}`}>
                      {milestone.completed ? (
                        <CheckCircle2 className="w-5 h-5" />
                      ) : (
                        <Circle className="w-5 h-5" />
                      )}
                    </div>
                    <div className="flex-1">
                      <p className={`text-sm ${milestone.completed ? 'text-[#8b949e] line-through' : 'text-white'}`}>
                        {milestone.title}
                      </p>
                    </div>
                    
                    {milestone.dueDate && !milestone.completed && (
                      <span className="text-xs text-[#8b949e]">
                        Due {formatDate(milestone.dueDate)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Recent Activity */}
            <div className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <Clock className="w-4 h-4 text-blue-400" />
                <span className="text-sm font-medium text-white">Recent Activity</span>
              </div>
              
              <div className="space-y-3">
                {selectedProject.recentActivity.map((activity) => (
                  <div key={activity.id} className="flex items-start gap-3 text-sm">
                    <span className="text-[#8b949e] whitespace-nowrap">{formatRelativeTime(activity.timestamp)}</span>
                    <span className="text-[#484f58]">•</span>
                    <span className="text-[#e6edf3]">{activity.description}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-12 text-center">
            <FolderKanban className="w-12 h-12 mx-auto mb-3 text-[#8b949e] opacity-50" />
            <p className="text-[#8b949e]">Select a project to view details</p>
          </div>
        )}
      </div>
    </div>
  );
}
