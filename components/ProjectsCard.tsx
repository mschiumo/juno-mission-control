'use client';

import { useState } from 'react';
import { FolderGit2, GitBranch, Clock, MoreHorizontal, Calendar, AlertCircle, Flag } from 'lucide-react';

interface Project {
  id: string;
  name: string;
  description: string;
  status: 'active' | 'completed' | 'paused' | 'planning';
  priority: 'high' | 'medium' | 'low';
  progress: number;
  lastUpdated: string;
  dueDate?: string;
  repo?: string;
  tasks: { total: number; completed: number };
  timeTracked?: number; // hours
}

const projects: Project[] = [
  {
    id: '1',
    name: 'Juno Dashboard',
    description: 'Mission control dashboard rebuild',
    status: 'active',
    priority: 'high',
    progress: 75,
    lastUpdated: '2024-01-15T10:30:00Z',
    dueDate: '2024-02-28',
    repo: 'github.com/mschiumo/juno-mission-control',
    tasks: { total: 12, completed: 9 },
    timeTracked: 45
  },
  {
    id: '2',
    name: 'KeepLiving Shopify',
    description: 'Ecommerce store for mental health merchandise',
    status: 'active',
    priority: 'high',
    progress: 30,
    lastUpdated: '2024-02-14T08:00:00Z',
    dueDate: '2024-03-15',
    tasks: { total: 20, completed: 6 },
    timeTracked: 12
  },
  {
    id: '3',
    name: 'Trading Journal',
    description: 'Automated trading journal and analytics',
    status: 'planning',
    priority: 'medium',
    progress: 10,
    lastUpdated: '2024-02-10T09:00:00Z',
    dueDate: '2024-04-01',
    tasks: { total: 15, completed: 1 },
    timeTracked: 3
  },
  {
    id: '4',
    name: 'Content Calendar',
    description: 'Social media content planning system',
    status: 'paused',
    priority: 'low',
    progress: 40,
    lastUpdated: '2024-01-20T14:20:00Z',
    tasks: { total: 10, completed: 4 }
  }
];

export default function ProjectsCard() {
  const [expandedProject, setExpandedProject] = useState<string | null>(null);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-[#238636] text-[#238636]';
      case 'completed':
        return 'bg-[#8b949e] text-[#8b949e]';
      case 'paused':
        return 'bg-[#d29922] text-[#d29922]';
      default:
        return 'bg-[#58a6ff] text-[#58a6ff]';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'text-[#da3633] bg-[#da3633]/10 border-[#da3633]/30';
      case 'medium':
        return 'text-[#d29922] bg-[#d29922]/10 border-[#d29922]/30';
      case 'low':
        return 'text-[#8b949e] bg-[#8b949e]/10 border-[#8b949e]/30';
      default:
        return 'text-[#8b949e] bg-[#8b949e]/10 border-[#8b949e]/30';
    }
  };

  const getPriorityIcon = (priority: string) => {
    switch (priority) {
      case 'high':
        return <AlertCircle className="w-3 h-3" />;
      case 'medium':
        return <Flag className="w-3 h-3" />;
      case 'low':
        return <Flag className="w-3 h-3 opacity-50" />;
      default:
        return null;
    }
  };

  const formatLastUpdated = (date: string) => {
    const d = new Date(date);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    return `${days} days ago`;
  };

  const getDaysUntilDue = (dueDate?: string) => {
    if (!dueDate) return null;
    const due = new Date(dueDate);
    const now = new Date();
    const diff = due.getTime() - now.getTime();
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    return days;
  };

  const getCountdownColor = (days: number) => {
    if (days < 0) return 'text-[#da3633]';
    if (days <= 7) return 'text-[#d29922]';
    return 'text-[#238636]';
  };

  // Sort by priority (high → medium → low) then by due date
  const sortedProjects = [...projects].sort((a, b) => {
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    }
    // If same priority, sort by due date (earlier first)
    if (a.dueDate && b.dueDate) {
      return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
    }
    return 0;
  });

  return (
    <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-[#ff6b35]/10 rounded-lg">
            <FolderGit2 className="w-5 h-5 text-[#ff6b35]" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">Projects</h2>
            <p className="text-xs text-[#8b949e]">Sorted by priority & due date</p>
          </div>
        </div>
        <span className="text-sm text-[#8b949e]">{projects.filter(p => p.status === 'active').length} active</span>
      </div>

      <div className="space-y-3">
        {sortedProjects.map((project) => {
          const daysUntilDue = getDaysUntilDue(project.dueDate);
          return (
            <div 
              key={project.id}
              className="bg-[#0d1117] rounded-lg border border-[#30363d] overflow-hidden"
            >
              <div 
                className="p-3 cursor-pointer hover:bg-[#21262d] transition-colors"
                onClick={() => setExpandedProject(expandedProject === project.id ? null : project.id)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`w-2 h-2 rounded-full ${getStatusColor(project.status).split(' ')[0]}`}></span>
                      <span className="font-medium text-white truncate">{project.name}</span>
                      {/* Priority Badge */}
                      <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${getPriorityColor(project.priority)}`}>
                        {getPriorityIcon(project.priority)}
                        {project.priority.charAt(0).toUpperCase() + project.priority.slice(1)}
                      </span>
                    </div>
                    <div className="text-xs text-[#8b949e] mt-1">{project.description}</div>
                    
                    {/* Due Date Countdown */}
                    {daysUntilDue !== null && (
                      <div className={`text-xs mt-1 font-medium ${getCountdownColor(daysUntilDue)}`}>
                        {daysUntilDue < 0 
                          ? `⚠️ Overdue by ${Math.abs(daysUntilDue)} days`
                          : daysUntilDue === 0 
                            ? '📅 Due today!'
                            : daysUntilDue === 1
                              ? '📅 Due tomorrow'
                              : `📅 ${daysUntilDue} days until due`
                        }
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-medium uppercase ${getStatusColor(project.status).split(' ')[1]}`}>
                      {project.status}
                    </span>
                    <MoreHorizontal className="w-4 h-4 text-[#8b949e]" />
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="mt-3">
                  <div className="flex items-center justify-between text-xs text-[#8b949e] mb-1">
                    <span>Progress</span>
                    <span>{project.progress}%</span>
                  </div>
                  <div className="h-1.5 bg-[#30363d] rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-[#ff6b35] to-[#ff8c5a] rounded-full transition-all duration-500"
                      style={{ width: `${project.progress}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Expanded Details */}
              {expandedProject === project.id && (
                <div className="px-3 pb-3 border-t border-[#30363d] pt-3">
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="flex items-center gap-2 text-[#8b949e]">
                      <GitBranch className="w-4 h-4" />
                      <span>{project.tasks.completed}/{project.tasks.total} tasks</span>
                    </div>
                    <div className="flex items-center gap-2 text-[#8b949e]">
                      <Clock className="w-4 h-4" />
                      <span>Updated {formatLastUpdated(project.lastUpdated)}</span>
                    </div>
                    {project.dueDate && (
                      <div className="flex items-center gap-2 text-[#8b949e]">
                        <Calendar className="w-4 h-4" />
                        <span>Due: {new Date(project.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                      </div>
                    )}
                    {project.timeTracked && (
                      <div className="flex items-center gap-2 text-[#8b949e]">
                        <Clock className="w-4 h-4" />
                        <span>{project.timeTracked}h tracked</span>
                      </div>
                    )}
                  </div>
                  {project.repo && (
                    <a 
                      href={`https://${project.repo}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 text-xs text-[#ff6b35] hover:underline block"
                    >
                      {project.repo}
                    </a>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
