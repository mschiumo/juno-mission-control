'use client';

import { useState, useEffect } from 'react';
import { 
  Brain, 
  Calendar, 
  ChevronLeft, 
  ChevronRight, 
  Clock,
  MessageSquare,
  Sparkles,
  Target,
  Lightbulb,
  BookOpen,
  RefreshCw,
  Loader2,
  FileText
} from 'lucide-react';

interface JournalEntry {
  id: string;
  date: string;
  summary: string;
  projectsWorked: ProjectProgress[];
  keyLearnings: string[];
  conversations: ConversationSnippet[];
  tags: string[];
}

interface ProjectProgress {
  name: string;
  progressDelta: number;
  description: string;
}

interface ConversationSnippet {
  time: string;
  userMessage: string;
  aiResponse: string;
  topic: string;
}

interface MemoryDataResponse {
  success: boolean;
  entries: JournalEntry[];
  today?: JournalEntry;
  stats: {
    totalConversations: number;
    totalLearnings: number;
    activeProjects: number;
    daysTracked: number;
  };
}

export default function MemoryCard() {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState({
    totalConversations: 0,
    totalLearnings: 0,
    activeProjects: 0,
    daysTracked: 0
  });

  useEffect(() => {
    fetchMemoryData();
  }, []);

  const fetchMemoryData = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/memory');
      const data: MemoryDataResponse = await response.json();
      
      if (data.success) {
        setEntries(data.entries);
        setStats(data.stats);
      } else {
        setError('Failed to fetch memory data');
      }
    } catch (error) {
      console.error('Failed to fetch memory data:', error);
      setError('Network error');
      setEntries(getMockEntries());
    } finally {
      setLoading(false);
    }
  };

  const getMockEntries = (): JournalEntry[] => {
    const today = new Date();
    return [
      {
        id: '1',
        date: today.toISOString().split('T')[0],
        summary: 'Today we focused on dashboard improvements and trading features. Fixed timezone bugs and implemented the new favorites feature for the watchlist.',
        projectsWorked: [
          { name: 'Trading Dashboard', progressDelta: 15, description: 'Fixed timezone consistency issues' },
          { name: 'Watchlist Features', progressDelta: 20, description: 'Implemented favorites and duplicate validation' }
        ],
        keyLearnings: [
          'EST timezone consistency is critical for trading data accuracy',
          'Pre-commit TypeScript checks prevent production syntax errors'
        ],
        conversations: [
          {
            time: '09:30',
            userMessage: 'Can you help fix the timezone bug in trading?',
            aiResponse: 'I found the issue - we need to use getNowInEST() instead of toISOString() for all trade timestamps.',
            topic: 'Trading Bug Fix'
          },
          {
            time: '14:15',
            userMessage: 'Let\'s add favorites to the watchlist',
            aiResponse: 'I\'ll implement a favorites section at the top with yellow highlighting and duplicate validation.',
            topic: 'Watchlist Enhancement'
          }
        ],
        tags: ['trading', 'timezone', 'watchlist', 'bugfix']
      },
      {
        id: '2',
        date: new Date(today.getTime() - 86400000).toISOString().split('T')[0],
        summary: 'Worked on the Real World Solutions book outline and content automation workflows. Discussed chapter structure and publishing timeline.',
        projectsWorked: [
          { name: 'Real World Solutions Book', progressDelta: 10, description: 'Completed chapter 3 outline' },
          { name: 'Content Automation', progressDelta: 5, description: 'Reviewed automation workflows' }
        ],
        keyLearnings: [
          'Story-driven technical content resonates better with readers',
          'Automation should enhance, not replace, human creativity'
        ],
        conversations: [
          {
            time: '10:00',
            userMessage: 'Let\'s outline chapter 3 of the book',
            aiResponse: 'Chapter 3 should focus on practical implementation with real-world examples. I\'ve drafted an outline with case studies.',
            topic: 'Book Writing'
          }
        ],
        tags: ['writing', 'book', 'content', 'automation']
      },
      {
        id: '3',
        date: new Date(today.getTime() - 172800000).toISOString().split('T')[0],
        summary: 'Explored AI agent architecture and team coordination patterns. Discussed how subagents should report progress and handle task delegation.',
        projectsWorked: [
          { name: 'AI Team Architecture', progressDelta: 25, description: 'Defined agent communication protocols' }
        ],
        keyLearnings: [
          'Clear handoff protocols prevent task duplication',
          'Progress reporting should be lightweight but informative'
        ],
        conversations: [
          {
            time: '16:00',
            userMessage: 'How should subagents report progress?',
            aiResponse: 'They should send brief updates to Redis with task status, progress percentage, and any blockers. The lead agent can then aggregate for user reports.',
            topic: 'AI Team Design'
          }
        ],
        tags: ['ai', 'architecture', 'team', 'agents']
      }
    ];
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date(today.getTime() - 86400000);
    
    if (dateStr === today.toISOString().split('T')[0]) return 'Today';
    if (dateStr === yesterday.toISOString().split('T')[0]) return 'Yesterday';
    
    return date.toLocaleDateString('en-US', { 
      weekday: 'long', 
      month: 'short', 
      day: 'numeric' 
    });
  };

  const navigateDate = (direction: 'prev' | 'next') => {
    const newDate = new Date(selectedDate);
    if (direction === 'prev') {
      newDate.setDate(newDate.getDate() - 1);
    } else {
      newDate.setDate(newDate.getDate() + 1);
    }
    setSelectedDate(newDate);
  };

  const selectedEntry = entries.find(
    e => e.date === selectedDate.toISOString().split('T')[0]
  );

  return (
    <div className="space-y-6">
      {/* Header Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-[#161b22] rounded-xl p-4 border border-[#30363d]">
          <div className="flex items-center gap-2 mb-2">
            <MessageSquare className="w-4 h-4 text-blue-400" />
            <span className="text-xs text-[#8b949e]">Conversations</span>
          </div>
          <p className="text-2xl font-bold text-white">{stats.totalConversations}</p>
        </div>
        <div className="bg-[#161b22] rounded-xl p-4 border border-[#30363d]">
          <div className="flex items-center gap-2 mb-2">
            <Lightbulb className="w-4 h-4 text-yellow-400" />
            <span className="text-xs text-[#8b949e]">Learnings</span>
          </div>
          <p className="text-2xl font-bold text-white">{stats.totalLearnings}</p>
        </div>
        <div className="bg-[#161b22] rounded-xl p-4 border border-[#30363d]">
          <div className="flex items-center gap-2 mb-2">
            <Target className="w-4 h-4 text-green-400" />
            <span className="text-xs text-[#8b949e]">Active Projects</span>
          </div>
          <p className="text-2xl font-bold text-white">{stats.activeProjects || 3}</p>
        </div>
        <div className="bg-[#161b22] rounded-xl p-4 border border-[#30363d]">
          <div className="flex items-center gap-2 mb-2">
            <Calendar className="w-4 h-4 text-purple-400" />
            <span className="text-xs text-[#8b949e]">Days Tracked</span>
          </div>
          <p className="text-2xl font-bold text-white">{stats.daysTracked || entries.length}</p>
        </div>
      </div>

      {/* Main Memory Card */}
      <div className="bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden">
        {/* Card Header */}
        <div className="p-6 border-b border-[#30363d]">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-gradient-to-br from-purple-500/20 to-pink-500/10 rounded-xl border border-purple-500/20">
                <Brain className="w-6 h-6 text-purple-400" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  Memory Journal
                  <span className="px-2 py-0.5 text-[10px] font-medium bg-[#30363d] text-[#8b949e] rounded-full">
                    AI-Powered
                  </span>
                </h2>
                <p className="text-sm text-[#8b949e] mt-0.5">
                  Daily snapshot of our conversations and progress
                </p>
              </div>
            </div>
            
            <button
              onClick={fetchMemoryData}
              disabled={loading}
              className="p-2 hover:bg-[#30363d] rounded-lg transition-colors disabled:opacity-50"
              title="Refresh memory data"
            >
              <RefreshCw className={`w-4 h-4 text-[#8b949e] hover:text-purple-400 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Date Navigation */}
        <div className="px-6 py-4 border-b border-[#30363d] bg-[#0d1117]/50">
          <div className="flex items-center justify-between">
            <button
              onClick={() => navigateDate('prev')}
              className="p-2 hover:bg-[#30363d] rounded-lg transition-colors"
            >
              <ChevronLeft className="w-5 h-5 text-[#8b949e]" />
            </button>
            
            <div className="text-center">
              <p className="text-lg font-semibold text-white">{formatDate(selectedDate.toISOString().split('T')[0])}</p>
              <p className="text-xs text-[#8b949e]">{selectedDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
            </div>
            
            <button
              onClick={() => navigateDate('next')}
              className="p-2 hover:bg-[#30363d] rounded-lg transition-colors"
            >
              <ChevronRight className="w-5 h-5 text-[#8b949e]" />
            </button>
          </div>
        </div>

        {/* Journal Content */}
        <div className="p-6">
          {loading ? (
            <div className="text-center py-12">
              <Loader2 className="w-10 h-10 animate-spin mx-auto mb-3 text-purple-400" />
              <p className="text-sm text-[#8b949e]">Loading memory data...</p>
            </div>
          ) : selectedEntry ? (
            <div className="space-y-6">
              {/* Daily Summary */}
              <div className="bg-gradient-to-r from-purple-500/10 to-pink-500/10 rounded-xl p-5 border border-purple-500/20">
                <div className="flex items-center gap-2 mb-3">
                  <Sparkles className="w-4 h-4 text-purple-400" />
                  <span className="text-xs font-medium text-purple-400 uppercase tracking-wide">Daily Summary</span>
                </div>
                <p className="text-[#e6edf3] leading-relaxed">{selectedEntry.summary}</p>
              </div>

              {/* Projects Worked On */}
              {selectedEntry.projectsWorked.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <Target className="w-4 h-4 text-green-400" />
                    <span className="text-xs font-medium text-[#8b949e] uppercase tracking-wide">Projects Worked On</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {selectedEntry.projectsWorked.map((project, idx) => (
                      <div key={idx} className="bg-[#0d1117] rounded-lg p-4 border border-[#30363d]">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="font-medium text-white">{project.name}</h4>
                          <span className="text-xs px-2 py-1 bg-green-500/10 text-green-400 rounded-full">
                            +{project.progressDelta}%
                          </span>
                        </div>
                        <p className="text-sm text-[#8b949e]">{project.description}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Key Learnings */}
              {selectedEntry.keyLearnings.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <Lightbulb className="w-4 h-4 text-yellow-400" />
                    <span className="text-xs font-medium text-[#8b949e] uppercase tracking-wide">Key Learnings</span>
                  </div>
                  <div className="space-y-2">
                    {selectedEntry.keyLearnings.map((learning, idx) => (
                      <div key={idx} className="flex items-start gap-3 bg-[#0d1117] rounded-lg p-4 border border-[#30363d]">
                        <div className="w-6 h-6 rounded-full bg-yellow-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <span className="text-xs font-bold text-yellow-400">{idx + 1}</span>
                        </div>
                        <p className="text-[#e6edf3] text-sm">{learning}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Conversation Snippets */}
              {selectedEntry.conversations.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <MessageSquare className="w-4 h-4 text-blue-400" />
                    <span className="text-xs font-medium text-[#8b949e] uppercase tracking-wide">Conversation Highlights</span>
                  </div>
                  <div className="space-y-3">
                    {selectedEntry.conversations.map((conv, idx) => (
                      <div key={idx} className="bg-[#0d1117] rounded-lg p-4 border border-[#30363d]">
                        <div className="flex items-center gap-3 mb-3">
                          <div className="flex items-center gap-1.5 text-xs text-[#8b949e]">
                            <Clock className="w-3 h-3" />
                            <span>{conv.time}</span>
                          </div>
                          <span className="text-[#484f58]">•</span>
                          <span className="text-xs text-purple-400">{conv.topic}</span>
                        </div>
                        <div className="space-y-2">
                          <div className="flex gap-3">
                            <div className="w-6 h-6 rounded-full bg-[#ff6b35] flex items-center justify-center flex-shrink-0 text-[10px] font-bold text-white">
                              U
                            </div>
                            <p className="text-sm text-[#8b949e] italic">"{conv.userMessage}"</p>
                          </div>
                          <div className="flex gap-3">
                            <div className="w-6 h-6 rounded-full bg-purple-500 flex items-center justify-center flex-shrink-0 text-[10px] font-bold text-white">
                              J
                            </div>
                            <p className="text-sm text-[#e6edf3]">{conv.aiResponse}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Tags */}
              <div className="pt-4 border-t border-[#30363d]">
                <div className="flex flex-wrap gap-2">
                  {selectedEntry.tags.map((tag, idx) => (
                    <span 
                      key={idx}
                      className="text-xs px-3 py-1.5 bg-[#21262d] text-[#8b949e] rounded-full border border-[#30363d] hover:border-purple-500/30 hover:text-purple-400 transition-colors cursor-pointer"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-12">
              <FileText className="w-12 h-12 mx-auto mb-3 text-[#8b949e] opacity-50" />
              <p className="text-[#8b949e] mb-2">No journal entry for this date</p>
              <p className="text-sm text-[#8b949e]/70">Conversations and progress will be recorded here</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
