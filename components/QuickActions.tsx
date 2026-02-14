'use client';

import { useState } from 'react';
import { 
  Zap, 
  Mail, 
  Calendar, 
  FileText, 
  Github, 
  MessageSquare,
  Music,
  Coffee
} from 'lucide-react';

interface QuickAction {
  id: string;
  name: string;
  icon: React.ReactNode;
  color: string;
  href?: string;
  onClick?: () => void;
}

const quickActions: QuickAction[] = [
  {
    id: '1',
    name: 'New Email',
    icon: <Mail className="w-5 h-5" />,
    color: '#ea4335',
    href: 'https://mail.google.com'
  },
  {
    id: '2',
    name: 'Calendar',
    icon: <Calendar className="w-5 h-5" />,
    color: '#4285f4',
    href: 'https://calendar.google.com'
  },
  {
    id: '3',
    name: 'Notes',
    icon: <FileText className="w-5 h-5" />,
    color: '#fbbc04',
    href: '#'
  },
  {
    id: '4',
    name: 'GitHub',
    icon: <Github className="w-5 h-5" />,
    color: '#8b949e',
    href: 'https://github.com'
  },
  {
    id: '5',
    name: 'Messages',
    icon: <MessageSquare className="w-5 h-5" />,
    color: '#34a853',
    href: '#'
  },
  {
    id: '6',
    name: 'Music',
    icon: <Music className="w-5 h-5" />,
    color: '#ff6b35',
    href: 'https://music.youtube.com'
  },
  {
    id: '7',
    name: 'Break',
    icon: <Coffee className="w-5 h-5" />,
    color: '#d29922',
    onClick: () => alert('Take a 5-minute break! ☕')
  },
  {
    id: '8',
    name: 'All Apps',
    icon: <Zap className="w-5 h-5" />,
    color: '#a371f7',
    href: '#'
  }
];

export default function QuickActions() {
  const [showAll, setShowAll] = useState(false);

  const displayedActions = showAll ? quickActions : quickActions.slice(0, 6);

  const handleAction = (action: QuickAction) => {
    if (action.onClick) {
      action.onClick();
    } else if (action.href && action.href !== '#') {
      window.open(action.href, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-[#ff6b35]/10 rounded-lg">
            <Zap className="w-5 h-5 text-[#ff6b35]" />
          </div>
          <h2 className="text-lg font-semibold text-white">Quick Actions</h2>
        </div>
        <button
          onClick={() => setShowAll(!showAll)}
          className="text-sm text-[#ff6b35] hover:text-[#ff8c5a] transition-colors"
        >
          {showAll ? 'Show Less' : 'Show All'}
        </button>
      </div>

      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
        {displayedActions.map((action) => (
          <button
            key={action.id}
            onClick={() => handleAction(action)}
            className="group flex flex-col items-center gap-2 p-3 rounded-lg bg-[#0d1117] border border-[#30363d] hover:border-[#ff6b35]/50 transition-all hover:-translate-y-0.5"
          >
            <div 
              className="p-2 rounded-lg transition-colors"
              style={{ 
                backgroundColor: `${action.color}20`,
                color: action.color 
              }}
            >
              {action.icon}
            </div>
            <span className="text-xs text-[#8b949e] group-hover:text-white transition-colors">
              {action.name}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
