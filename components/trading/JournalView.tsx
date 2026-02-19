'use client';

import { useState, useEffect } from 'react';
import { BookOpen, ChevronDown, ChevronUp, Plus, X, Calendar, Clock, Save, CheckCircle, Bell } from 'lucide-react';

interface JournalPrompt {
  id: string;
  question: string;
  answer: string;
}

interface JournalEntry {
  id: string;
  date: string;
  prompts: JournalPrompt[];
  createdAt: string;
  updatedAt: string;
}

const DEFAULT_PROMPTS = [
  {
    id: 'went-well',
    question: 'What went well today?',
    answer: ''
  },
  {
    id: 'improve',
    question: 'What could you improve?',
    answer: ''
  },
  {
    id: 'followed-plan',
    question: 'Did you follow your trading plan?',
    answer: ''
  }
];

export default function JournalView() {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [prompts, setPrompts] = useState<JournalPrompt[]>(DEFAULT_PROMPTS.map(p => ({ ...p })));
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');

  // Check for openJournal param on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('openJournal') === 'true') {
      setShowModal(true);
      // Clean up URL
      params.delete('openJournal');
      window.history.replaceState({}, '', `${window.location.pathname}?${params.toString()}`);
    }
  }, []);

  useEffect(() => {
    fetchEntries();
  }, []);

  const fetchEntries = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/daily-journal');
      const data = await response.json();
      
      if (data.success && data.entries) {
        setEntries(data.entries);
      }
    } catch (error) {
      console.error('Error fetching journal entries:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveStatus('idle');
    
    try {
      const response = await fetch('/api/daily-journal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: selectedDate,
          prompts
        })
      });
      
      const result = await response.json();
      
      if (result.success) {
        setSaveStatus('success');
        setTimeout(() => {
          setShowModal(false);
          setPrompts(DEFAULT_PROMPTS.map(p => ({ ...p }))); // Reset prompts
          setSaveStatus('idle');
          fetchEntries(); // Refresh list
        }, 1000);
      } else {
        setSaveStatus('error');
      }
    } catch (error) {
      console.error('Error saving journal:', error);
      setSaveStatus('error');
    } finally {
      setIsSaving(false);
    }
  };

  const updatePromptAnswer = (id: string, answer: string) => {
    setPrompts(prev => prev.map(p => 
      p.id === id ? { ...p, answer } : p
    ));
  };

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  if (isLoading) {
    return (
      <div className="p-8 bg-[#161b22] border border-[#30363d] rounded-xl text-center">
        <div className="w-8 h-8 border-2 border-[#F97316]/30 border-t-[#F97316] rounded-full animate-spin mx-auto mb-4" />
        <p className="text-[#8b949e]">Loading journal entries...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <BookOpen className="w-6 h-6 text-[#F97316]" />
          <h2 className="text-xl font-bold text-white">Trading Journal</h2>
        </div>
        
        <div className="flex items-center gap-3">
          <TestNotificationButton />
          
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-[#F97316] hover:bg-[#ea580c] text-white rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Entry
          </button>
        </div>
      </div>

      {/* Journal List */}
      <div className="space-y-3">
        {entries.length === 0 ? (
          <div className="p-8 bg-[#161b22] border border-[#30363d] rounded-xl text-center">
            <BookOpen className="w-12 h-12 text-[#8b949e] mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-white mb-2">No Journal Entries Yet</h3>
            <p className="text-[#8b949e] mb-4">Start tracking your daily trading reflections.</p>
            <button
              onClick={() => setShowModal(true)}
              className="px-4 py-2 bg-[#238636] hover:bg-[#2ea043] text-white rounded-lg transition-colors"
            >
              Create First Entry
            </button>
          </div>
        ) : (
          entries.map((entry) => (
            <div
              key={entry.id}
              className="bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden"
            >
              {/* Collapsible Header */}
              <button
                onClick={() => toggleExpand(entry.id)}
                className="w-full p-4 flex items-center justify-between hover:bg-[#1f242b] transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2 text-[#8b949e]">
                    <Calendar className="w-4 h-4" />
                    <span className="text-sm">{formatDate(entry.date)}</span>
                  </div>
                  
                  <div className="flex items-center gap-2 text-[#8b949e]">
                    <Clock className="w-4 h-4" />
                    <span className="text-sm">
                      {new Date(entry.updatedAt).toLocaleTimeString('en-US', {
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </span>
                  </div>
                </div>
                
                {expandedId === entry.id ? (
                  <ChevronUp className="w-5 h-5 text-[#8b949e]" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-[#8b949e]" />
                )}
              </button>
              
              {/* Expanded Content */}
              {expandedId === entry.id && (
                <div className="px-4 pb-4 border-t border-[#30363d]">
                  <div className="pt-4 space-y-4">
                    {entry.prompts && entry.prompts.length > 0 ? (
                      entry.prompts.map((prompt) => (
                        <div key={prompt.id} className="bg-[#0d1117] rounded-lg p-3">
                          <h4 className="text-sm font-medium text-[#F97316] mb-1">
                            {prompt.question}
                          </h4>
                          <p className="text-white text-sm">
                            {prompt.answer || <span className="text-[#8b949e] italic">No answer provided...</span>}
                          </p>
                        </div>
                      ))
                    ) : (
                      <p className="text-[#8b949e] italic">No prompts answered...</p>
                    )}
                    
                    <div className="text-xs text-[#8b949e] pt-2 border-t border-[#30363d]">
                      Created: {new Date(entry.createdAt).toLocaleString()}
                      <br />
                      Updated: {new Date(entry.updatedAt).toLocaleString()}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-[#161b22] border border-[#30363d] rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-[#30363d] sticky top-0 bg-[#161b22]">
              <h3 className="text-lg font-bold text-white">Daily Journal Entry</h3>
              <button
                onClick={() => setShowModal(false)}
                className="p-2 hover:bg-[#262626] rounded-lg"
              >
                <X className="w-5 h-5 text-[#8b949e]" />
              </button>
            </div>
            
            {/* Content */}
            <div className="p-4 space-y-6">
              <div>
                <label className="block text-sm text-[#8b949e] mb-2">Date</label>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="w-full px-3 py-2 bg-[#0d1117] border border-[#30363d] rounded-lg text-white focus:outline-none focus:border-[#F97316]"
                />
              </div>
              
              {/* Prompts */}
              <div className="space-y-4">
                {prompts.map((prompt) => (
                  <div key={prompt.id}>
                    <label className="block text-sm font-medium text-[#F97316] mb-2">
                      {prompt.question}
                    </label>
                    <textarea
                      value={prompt.answer}
                      onChange={(e) => updatePromptAnswer(prompt.id, e.target.value)}
                      placeholder="Type your answer here..."
                      className="w-full h-20 px-3 py-2 bg-[#0d1117] border border-[#30363d] rounded-lg text-white placeholder-[#8b949e] resize-none focus:outline-none focus:border-[#F97316]"
                    />
                  </div>
                ))}
              </div>

              {saveStatus === 'success' && (
                <div className="flex items-center gap-2 text-[#3fb950]">
                  <CheckCircle className="w-5 h-5" />
                  <span>Journal saved successfully!</span>
                </div>
              )}

              {saveStatus === 'error' && (
                <div className="text-[#f85149]">
                  Failed to save journal. Please try again.
                </div>
              )}
            </div>
            
            {/* Footer */}
            <div className="flex justify-end gap-3 p-4 border-t border-[#30363d] sticky bottom-0 bg-[#161b22]">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-[#8b949e] hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving || !selectedDate}
                className="flex items-center gap-2 px-4 py-2 bg-[#F97316] hover:bg-[#ea580c] text-white rounded-lg disabled:opacity-50"
              >
                {isSaving ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    Save Entry
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Test button component for manual notification trigger
function TestNotificationButton() {
  const [isCreating, setIsCreating] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const createTestNotification = async () => {
    setIsCreating(true);
    setResult(null);
    
    try {
      const response = await fetch('/api/cron/journal-reminder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      const data = await response.json();
      
      if (data.success) {
        setResult('✅ Created! Check bell icon.');
        // Reload page after 2 seconds to show notification
        setTimeout(() => window.location.reload(), 2000);
      } else {
        setResult('❌ Error: ' + data.error);
      }
    } catch (error) {
      setResult('❌ Failed');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={createTestNotification}
        disabled={isCreating}
        className="flex items-center gap-2 px-3 py-2 bg-[#30363d] hover:bg-[#3d444d] text-white rounded-lg transition-colors disabled:opacity-50 text-sm"
      >
        {isCreating ? (
          <>
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Creating...
          </>
        ) : (
          <>
            <Bell className="w-4 h-4" />
            Test Notification
          </>
        )}
      </button>
      
      {result && (
        <span className="text-xs text-[#8b949e]">{result}</span>
      )}
    </div>
  );
}
