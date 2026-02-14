'use client';

import { BookOpen, ExternalLink, FileText, Github, Activity, Target, TrendingUp, CheckSquare } from 'lucide-react';

const DOC_LINKS = [
  {
    title: 'Document Library',
    description: 'Central index of all docs, rules, and systems',
    url: 'https://github.com/mschiumo/juno-mission-control/blob/main/DOCUMENT_LIBRARY.md',
    icon: BookOpen
  },
  {
    title: 'Activity Logging Rules',
    description: 'When and how to log all work',
    url: 'https://github.com/mschiumo/juno-mission-control/blob/main/docs/ACTIVITY_LOGGING.md',
    icon: Activity
  },
  {
    title: 'GitHub Repository',
    description: 'Source code, PRs, and issues',
    url: 'https://github.com/mschiumo/juno-mission-control',
    icon: Github
  }
];

const QUICK_LINKS = [
  { label: 'Dashboard', tab: '', icon: TrendingUp },
  { label: 'Tasks', tab: 'tasks', icon: CheckSquare },
  { label: 'Trading', tab: 'trading', icon: TrendingUp },
  { label: 'Goals', tab: 'goals', icon: Target },
  { label: 'Activity', tab: 'activity', icon: Activity }
];

interface DocumentationCardProps {
  className?: string;
}

export default function DocumentationCard({ className }: DocumentationCardProps) {
  const navigateToTab = (tab: string) => {
    if (tab) {
      window.location.href = `/?tab=${tab}`;
    } else {
      window.location.href = '/';
    }
  };

  return (
    <div className={`bg-[#161b22] border border-[#30363d] rounded-lg p-6 ${className || ''}`}>
      <div className="flex items-center gap-3 mb-5">
        <div className="p-2 bg-[#ff6b35]/10 rounded-lg">
          <BookOpen className="w-5 h-5 text-[#ff6b35]" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-white">Documentation</h2>
          <p className="text-xs text-[#8b949e]">Rules, systems, and reference</p>
        </div>
      </div>

      {/* Quick Navigation */}
      <div className="mb-5">
        <h3 className="text-sm font-medium text-white mb-3">Quick Navigation</h3>
        <div className="grid grid-cols-5 gap-2">
          {QUICK_LINKS.map((link) => (
            <button
              key={link.label}
              onClick={() => navigateToTab(link.tab)}
              className="flex flex-col items-center gap-1 p-2 bg-[#0d1117] rounded-lg hover:bg-[#30363d] transition-colors"
            >
              <link.icon className="w-4 h-4 text-[#8b949e]" />
              <span className="text-[10px] text-[#8b949e]">{link.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Documentation Links */}
      <div className="space-y-2">
        <h3 className="text-sm font-medium text-white mb-3">Reference Docs</h3>
        
        {DOC_LINKS.map((doc) => (
          <a
            key={doc.title}
            href={doc.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 p-3 bg-[#0d1117] rounded-lg hover:bg-[#21262d] transition-colors group"
          >
            <div className="p-2 bg-[#ff6b35]/10 rounded-lg group-hover:bg-[#ff6b35]/20 transition-colors">
              <doc.icon className="w-4 h-4 text-[#ff6b35]" />
            </div>
            
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-medium text-white group-hover:text-[#ff6b35] transition-colors">
                  {doc.title}
                </h4>
                <ExternalLink className="w-3 h-3 text-[#8b949e] opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              <p className="text-xs text-[#8b949e] truncate">{doc.description}</p>
            </div>
          </a>
        ))}
      </div>

      {/* Quick Tips */}
      <div className="mt-5 p-3 bg-[#0d1117] rounded-lg border border-[#30363d]">
        <div className="flex items-center gap-2 mb-2">
          <FileText className="w-4 h-4 text-[#8b949e]" />
          <span className="text-xs font-medium text-white">Quick Tips</span>
        </div>
        <ul className="text-xs text-[#8b949e] space-y-1 list-disc list-inside">
          <li>All changes go through PRs</li>
          <li>Log all significant work to Activity Log</li>
          <li>Cron jobs auto-post to dashboard</li>
          <li>Check DOCUMENT_LIBRARY.md for all rules</li>
        </ul>
      </div>
    </div>
  );
}
