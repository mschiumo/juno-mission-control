'use client';

import React, { useState, useEffect } from 'react';
import { 
  Brain, 
  Clock, 
  BookOpen, 
  Lightbulb, 
  ListTodo, 
  Plus, 
  X, 
  ChevronDown, 
  ChevronUp,
  Tag,
  AlertCircle,
  Calendar,
  RefreshCw,
  Edit3,
  Trash2
} from 'lucide-react';

// Memory Entry Types
interface MemoryEntry {
  id: string;
  type: 'journal' | 'insight' | 'context' | 'learning';
  content: string;
  timestamp: string;
  tags?: string[];
  importance?: 'low' | 'medium' | 'high';
  title?: string;
  projectStatus?: 'active' | 'paused' | 'completed' | 'archived';
}

type TabId = 'journal' | 'insights' | 'context';

// Mock data for demonstration
const MOCK_MEMORY_DATA: MemoryEntry[] = [
  // Journal entries
  {
    id: '1',
    type: 'journal',
    title: 'Trading Strategy Discussion',
    content: 'Discussed position sizing rules and risk management. User prefers to risk max 1% per trade. Emphasized importance of stop-loss discipline. Reviewed gap scanner results from this morning.',
    timestamp: '2026-03-04T09:30:00Z',
    tags: ['trading', 'risk-management'],
    importance: 'high'
  },
  {
    id: '2',
    type: 'journal',
    title: 'Dashboard Feature Planning',
    content: 'Brainstormed new memory section for the dashboard. User wants to track conversation summaries, key insights, and running context. Dark theme preferred with orange accents.',
    timestamp: '2026-03-03T16:45:00Z',
    tags: ['dashboard', 'feature-planning'],
    importance: 'medium'
  },
  {
    id: '3',
    type: 'journal',
    title: 'Morning Market Brief',
    content: 'Reviewed pre-market gap up stocks. SPY showing strength. User watching AAPL, NVDA, TSLA for potential entries. Discussed economic calendar events for the week.',
    timestamp: '2026-03-03T09:15:00Z',
    tags: ['market', 'morning-routine'],
    importance: 'medium'
  },
  {
    id: '4',
    type: 'journal',
    title: 'Goal Setting Session',
    content: 'Set quarterly goals for trading consistency. Target: 60% win rate, 2:1 reward/risk ratio. User wants to focus on quality over quantity of trades.',
    timestamp: '2026-03-02T20:00:00Z',
    tags: ['goals', 'trading'],
    importance: 'high'
  },
  {
    id: '5',
    type: 'journal',
    title: 'Weekend Review',
    content: 'Analyzed last week\'s trades. 4 wins, 2 losses. Biggest takeaway: need to stick to plan and avoid FOMO entries. User recognized impatience as key weakness.',
    timestamp: '2026-03-01T18:30:00Z',
    tags: ['review', 'psychology'],
    importance: 'high'
  },
  // Insights
  {
    id: '6',
    type: 'insight',
    content: 'User prefers dark theme with orange accents (#ff6b35)',
    timestamp: '2026-03-04T10:00:00Z',
    tags: ['ui', 'preference'],
    importance: 'medium'
  },
  {
    id: '7',
    type: 'insight',
    content: 'Trading is the top priority - check market data first thing in morning',
    timestamp: '2026-03-03T09:00:00Z',
    tags: ['trading', 'priority'],
    importance: 'high'
  },
  {
    id: '8',
    type: 'insight',
    content: 'User likes concise summaries - avoid walls of text',
    timestamp: '2026-03-02T14:20:00Z',
    tags: ['communication', 'preference'],
    importance: 'medium'
  },
  {
    id: '9',
    type: 'insight',
    content: 'EST timezone for all time displays',
    timestamp: '2026-03-01T12:00:00Z',
    tags: ['ui', 'timezone'],
    importance: 'low'
  },
  {
    id: '10',
    type: 'insight',
    content: 'User prefers Telegram for notifications over email',
    timestamp: '2026-02-28T16:00:00Z',
    tags: ['communication', 'preference'],
    importance: 'medium'
  },
  // Context / Running Projects
  {
    id: '11',
    type: 'context',
    title: 'Trading Journal Enhancement',
    content: 'Building out comprehensive trading journal with calendar view, P&L tracking, and analytics. Currently integrating with Polygon.io for market data.',
    timestamp: '2026-03-04T08:00:00Z',
    tags: ['trading', 'development'],
    importance: 'high',
    projectStatus: 'active'
  },
  {
    id: '12',
    type: 'context',
    title: 'Dashboard Memory Section',
    content: 'Creating new Memory card to replace Activity Log. Will include conversation journals, key insights, and running project context.',
    timestamp: '2026-03-04T05:30:00Z',
    tags: ['dashboard', 'feature'],
    importance: 'high',
    projectStatus: 'active'
  },
  {
    id: '13',
    type: 'context',
    title: 'Goal Tracking System',
    content: 'Kanban-style goal board with quarterly targets. Need to add progress indicators and milestone tracking.',
    timestamp: '2026-03-01T10:00:00Z',
    tags: ['goals', 'productivity'],
    importance: 'medium',
    projectStatus: 'active'
  },
  {
    id: '14',
    type: 'context',
    title: 'Habit Tracker v2',
    content: 'Evening check-in feature with streak tracking. Currently testing daily habit completion flow.',
    timestamp: '2026-02-28T09:00:00Z',
    tags: ['habits', 'productivity'],
    importance: 'medium',
    projectStatus: 'paused'
  },
  // Learning notes
  {
    id: '15',
    type: 'learning',
    content: 'Avoid scheduling heavy cron jobs during market hours - user prefers responsive dashboard during trading',
    timestamp: '2026-03-03T11:00:00Z',
    tags: ['performance', 'lesson-learned'],
    importance: 'medium'
  },
  {
    id: '16',
    type: 'learning',
    content: 'User got frustrated with too many notifications - keep alerts to max 3-4 per day',
    timestamp: '2026-03-01T15:30:00Z',
    tags: ['ux', 'lesson-learned'],
    importance: 'high'
  }
];

export default function MemoryCard() {
  const [activeTab, setActiveTab] = useState<TabId>('journal');
  const [entries, setEntries] = useState<MemoryEntry[]>(MOCK_MEMORY_DATA);
  const [expandedEntry, setExpandedEntry] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newEntryType, setNewEntryType] = useState<MemoryEntry['type']>('insight');
  const [newEntryContent, setNewEntryContent] = useState('');
  const [newEntryTitle, setNewEntryTitle] = useState('');
  const [newEntryImportance, setNewEntryImportance] = useState<MemoryEntry['importance']>('medium');
  const [newEntryTags, setNewEntryTags] = useState('');

  const tabs = [
    { id: 'journal' as const, label: 'Journal', icon: BookOpen },
    { id: 'insights' as const, label: 'Insights', icon: Lightbulb },
    { id: 'context' as const, label: 'Context', icon: ListTodo },
  ];

  const getFilteredEntries = () => {
    if (activeTab === 'journal') {
      return entries.filter(e => e.type === 'journal');
    } else if (activeTab === 'insights') {
      return entries.filter(e => e.type === 'insight' || e.type === 'learning');
    } else {
      return entries.filter(e => e.type === 'context');
    }
  };

  const formatDate = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', {
      timeZone: 'America/New_York',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatDateShort = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    });
  };

  const getImportanceColor = (importance?: string) => {
    switch (importance) {
      case 'high': return 'bg-[#da3633]/20 text-[#da3633] border-[#da3633]/30';
      case 'medium': return 'bg-[#d29922]/20 text-[#d29922] border-[#d29922]/30';
      case 'low': return 'bg-[#8b949e]/20 text-[#8b949e] border-[#8b949e]/30';
      default: return 'bg-[#8b949e]/20 text-[#8b949e] border-[#8b949e]/30';
    }
  };

  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'active': return 'bg-[#238636]/20 text-[#238636]';
      case 'paused': return 'bg-[#d29922]/20 text-[#d29922]';
      case 'completed': return 'bg-[#58a6ff]/20 text-[#58a6ff]';
      case 'archived': return 'bg-[#8b949e]/20 text-[#8b949e]';
      default: return 'bg-[#8b949e]/20 text-[#8b949e]';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'journal': return <BookOpen className="w-4 h-4 text-[#58a6ff]" />;
      case 'insight': return <Lightbulb className="w-4 h-4 text-[#ff6b35]" />;
      case 'learning': return <AlertCircle className="w-4 h-4 text-[#d29922]" />;
      case 'context': return <ListTodo className="w-4 h-4 text-[#238636]" />;
      default: return <Brain className="w-4 h-4 text-[#8b949e]" />;
    }
  };

  const handleAddEntry = () => {
    if (!newEntryContent.trim()) return;

    const newEntry: MemoryEntry = {
      id: Date.now().toString(),
      type: newEntryType,
      content: newEntryContent,
      title: newEntryTitle || undefined,
      timestamp: new Date().toISOString(),
      importance: newEntryImportance,
      tags: newEntryTags.split(',').map(t => t.trim()).filter(Boolean),
      projectStatus: newEntryType === 'context' ? 'active' : undefined
    };

    setEntries([newEntry, ...entries]);
    setShowAddModal(false);
    setNewEntryContent('');
    setNewEntryTitle('');
    setNewEntryTags('');
  };

  const handleDeleteEntry = (id: string) => {
    setEntries(entries.filter(e => e.id !== id));
  };

  const filteredEntries = getFilteredEntries();
  const entryCount = filteredEntries.length;

  // Group journal entries by date
  const groupedJournalEntries = filteredEntries.reduce((groups, entry) => {
    const date = new Date(entry.timestamp).toLocaleDateString('en-US', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    if (!groups[date]) groups[date] = [];
    groups[date].push(entry);
    return groups;
  }, {} as Record<string, MemoryEntry[]>);

  return (
    <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-[#ff6b35]/10 rounded-xl">
            <Brain className="w-5 h-5 text-[#ff6b35]" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">Memory</h2>
            <p className="text-xs text-[#8b949e]">
              {entryCount} {activeTab === 'journal' ? 'journal entries' : activeTab === 'insights' ? 'insights' : 'projects'}
            </p>
          </div>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#ff6b35]/20 text-[#ff6b35] hover:bg-[#ff6b35]/30 rounded-lg transition-colors text-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          Add
        </button>
      </div>

      {/* Tabs */}
      <div className="segmented-control mb-5">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`segment ${activeTab === tab.id ? 'segment-active' : 'segment-inactive'}`}
          >
            <tab.icon className="w-4 h-4" />
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="space-y-3 max-h-[450px] overflow-y-auto pr-1">
        {filteredEntries.length === 0 ? (
          <div className="text-center py-10">
            <Brain className="w-12 h-12 mx-auto mb-3 text-[#8b949e] opacity-50" />
            <p className="text-[#8b949e] mb-1">
              No {activeTab} entries yet
            </p>
            <p className="text-xs text-[#8b949e]/70">
              Click "Add" to create your first entry
            </p>
          </div>
        ) : activeTab === 'journal' ? (
          // Journal View - Grouped by date
          Object.entries(groupedJournalEntries).map(([date, dateEntries]) => (
            <div key={date} className="space-y-2">
              <div className="flex items-center gap-2 text-xs text-[#8b949e] uppercase tracking-wider font-medium pt-2">
                <Calendar className="w-3 h-3" />
                {date}
              </div>
              {dateEntries.map((entry) => (
                <div
                  key={entry.id}
                  className="p-4 bg-[#0d1117] rounded-xl border border-[#30363d] hover:border-[#ff6b35]/30 transition-all"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center bg-[#21262d] rounded-lg">
                      {getTypeIcon(entry.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-medium text-white text-sm">{entry.title}</h3>
                        <div className="flex items-center gap-1">
                          {entry.importance && (
                            <span className={`text-[10px] px-2 py-0.5 rounded-full border ${getImportanceColor(entry.importance)}`}>
                              {entry.importance}
                            </span>
                          )}
                        </div>
                      </div>
                      <p className="text-xs text-[#8b949e] mt-2 leading-relaxed">
                        {entry.content}
                      </p>
                      {entry.tags && entry.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-3">
                          {entry.tags.map((tag, idx) => (
                            <span 
                              key={idx}
                              className="text-[10px] px-2 py-0.5 bg-[#21262d] text-[#8b949e] rounded-full flex items-center gap-1"
                            >
                              <Tag className="w-3 h-3" />
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="flex items-center gap-1 text-[10px] text-[#8b949e]/70 mt-3">
                        <Clock className="w-3 h-3" />
                        {formatDate(entry.timestamp)} EST
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ))
        ) : activeTab === 'insights' ? (
          // Insights View
          <div className="space-y-2">
            {filteredEntries.map((entry) => (
              <div
                key={entry.id}
                className="p-3 bg-[#0d1117] rounded-xl border border-[#30363d] hover:border-[#ff6b35]/30 transition-all group"
              >
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 mt-0.5">
                    {getTypeIcon(entry.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-[#e6edf3] leading-relaxed">
                      {entry.content}
                    </p>
                    <div className="flex items-center justify-between mt-2">
                      <div className="flex items-center gap-2">
                        {entry.importance && (
                          <span className={`text-[10px] px-2 py-0.5 rounded-full ${getImportanceColor(entry.importance)}`}>
                            {entry.importance}
                          </span>
                        )}
                        {entry.tags?.map((tag, idx) => (
                          <span 
                            key={idx}
                            className="text-[10px] px-2 py-0.5 bg-[#21262d] text-[#8b949e] rounded-full"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                      <button
                        onClick={() => handleDeleteEntry(entry.id)}
                        className="opacity-0 group-hover:opacity-100 p-1 hover:bg-[#30363d] rounded transition-all"
                      >
                        <Trash2 className="w-3 h-3 text-[#8b949e] hover:text-[#da3633]" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          // Context/Projects View
          <div className="space-y-2">
            {filteredEntries.map((entry) => (
              <div
                key={entry.id}
                className="p-4 bg-[#0d1117] rounded-xl border border-[#30363d] hover:border-[#ff6b35]/30 transition-all"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      <h3 className="font-medium text-white text-sm">{entry.title}</h3>
                      {entry.projectStatus && (
                        <span className={`text-[10px] px-2 py-0.5 rounded-full ${getStatusColor(entry.projectStatus)}`}>
                          {entry.projectStatus}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[#8b949e] leading-relaxed">
                      {entry.content}
                    </p>
                    <div className="flex items-center gap-2 mt-3">
                      {entry.tags?.map((tag, idx) => (
                        <span 
                          key={idx}
                          className="text-[10px] px-2 py-0.5 bg-[#21262d] text-[#8b949e] rounded-full"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Entry Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">Add Memory Entry</h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-1 hover:bg-[#30363d] rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-[#8b949e]" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Type Selection */}
              <div>
                <label className="text-xs text-[#8b949e] uppercase font-medium mb-2 block">Type</label>
                <div className="flex gap-2">
                  {(['insight', 'context', 'learning'] as const).map((type) => (
                    <button
                      key={type}
                      onClick={() => setNewEntryType(type)}
                      className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                        newEntryType === type
                          ? 'bg-[#ff6b35] text-white'
                          : 'bg-[#0d1117] text-[#8b949e] hover:bg-[#21262d]'
                      }`}
                    >
                      {type.charAt(0).toUpperCase() + type.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Title (optional) */}
              {newEntryType === 'context' && (
                <div>
                  <label className="text-xs text-[#8b949e] uppercase font-medium mb-2 block">Project Name</label>
                  <input
                    type="text"
                    value={newEntryTitle}
                    onChange={(e) => setNewEntryTitle(e.target.value)}
                    placeholder="Enter project name..."
                    className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-sm text-white placeholder-[#8b949e] focus:border-[#ff6b35] focus:outline-none"
                  />
                </div>
              )}

              {/* Content */}
              <div>
                <label className="text-xs text-[#8b949e] uppercase font-medium mb-2 block">Content</label>
                <textarea
                  value={newEntryContent}
                  onChange={(e) => setNewEntryContent(e.target.value)}
                  placeholder="What should I remember..."
                  rows={4}
                  className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-sm text-white placeholder-[#8b949e] focus:border-[#ff6b35] focus:outline-none resize-none"
                />
              </div>

              {/* Importance */}
              <div>
                <label className="text-xs text-[#8b949e] uppercase font-medium mb-2 block">Importance</label>
                <div className="flex gap-2">
                  {(['low', 'medium', 'high'] as const).map((level) => (
                    <button
                      key={level}
                      onClick={() => setNewEntryImportance(level)}
                      className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors capitalize ${
                        newEntryImportance === level
                          ? level === 'high' ? 'bg-[#da3633]/30 text-[#da3633] border border-[#da3633]/50'
                            : level === 'medium' ? 'bg-[#d29922]/30 text-[#d29922] border border-[#d29922]/50'
                            : 'bg-[#8b949e]/30 text-[#8b949e] border border-[#8b949e]/50'
                          : 'bg-[#0d1117] text-[#8b949e] hover:bg-[#21262d]'
                      }`}
                    >
                      {level}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tags */}
              <div>
                <label className="text-xs text-[#8b949e] uppercase font-medium mb-2 block">Tags (comma separated)</label>
                <input
                  type="text"
                  value={newEntryTags}
                  onChange={(e) => setNewEntryTags(e.target.value)}
                  placeholder="trading, ui, priority..."
                  className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-sm text-white placeholder-[#8b949e] focus:border-[#ff6b35] focus:outline-none"
                />
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 py-2 px-4 bg-[#30363d] text-[#8b949e] rounded-lg text-sm font-medium hover:bg-[#484f58] transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddEntry}
                  disabled={!newEntryContent.trim()}
                  className="flex-1 py-2 px-4 bg-[#ff6b35] text-white rounded-lg text-sm font-medium hover:bg-[#ff8c5a] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Save Entry
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
