'use client';

import { useState } from 'react';
import { FolderGit2, GitBranch, Clock, MoreHorizontal } from 'lucide-react';

interface Project {
  id: string;
  name: string;
  description: string;
  status: 'active' | 'completed' | 'paused' | 'planning';
  progress: number;
  lastUpdated: string;
  repo?: string;
  tasks: { total: number; completed: number };
}

const projects: Project[] = [
  {
    id: '1',
    name: 'Juno Dashboard',
    description: 'Mission control dashboard rebuild',
    status: 'active',
    progress: 75,
    lastUpdated: '2024-01-15T10:30:00Z',
    repo: 'github.com/mj/juno-dashboard',
    tasks: { total: 12, completed: 9 }
  },
  {
    id: '2',
    name: 'API Integration',
    description: 'Google Calendar & Gmail API setup',
    status: 'active',
    progress: 60,
    lastUpdated: '2024-01-14T16:45:00Z',
    tasks: { total: 8, completed: 5 }
  },
  {
    id: '3',
    name: 'Habit Tracker',
    description: 'Mobile app for habit tracking',
    status: 'planning',
    progress: 15,
    lastUpdated: '2024-01-10T09:00:00Z',
    tasks: { total: 20, completed: 3 }
  },
  {
    id: '4',
    name: 'Personal Website',
    description: 'Portfolio website redesign',
    status: 'paused',
    progress: 40,
    lastUpdated: '2024-01-08T14:20:00Z',
    repo: 'github.com/mj/portfolio',
    tasks: { total: 15, completed: 6 }
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

  const formatLastUpdated = (date: string) => {
    const d = new Date(date);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    return `${days} days ago`;
  };

  return (
    <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-[#ff6b35]/10 rounded-lg">
            <FolderGit2 className="w-5 h-5 text-[#ff6b35]" />
          </div>
          <h2 className="text-lg font-semibold text-white">Projects</h2>
        </div>
        <span className="text-sm text-[#8b949e]">{projects.length} active</span>
      </div>

      <div className="space-y-3">
        {projects.map((project) => (
          <div 
            key={project.id}
            className="bg-[#0d1117] rounded-lg border border-[#30363d] overflow-hidden"
          >
            <div 
              className="p-3 cursor-pointer hover:bg-[#21262d] transition-colors"
              onClick={() => setExpandedProject(expandedProject === project.id ? null : project.id)}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${getStatusColor(project.status).split(' ')[0]}`}></span>
                    <span className="font-medium text-white">{project.name}</span>
                  </div>
                  <div className="text-xs text-[#8b949e] mt-1">{project.description}</div>
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
        ))}
      </div>
    </div>
  );
}
