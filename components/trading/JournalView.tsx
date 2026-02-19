'use client';

import { useState, useEffect } from 'react';
import { BookOpen, ChevronDown, ChevronUp, Plus, X, Calendar, Clock, Save } from 'lucide-react';

interface JournalEntry {
  id: string;
  date: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export default function JournalView() {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [selectedDate, setSelectedDate] = useState(
003e(new Date().toISOString().split('T')[0]);
  const [content, setContent] = useState('');
  const [isSaving, setIsSaving] = useState(false);

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
    
    try {
      const response = await fetch('/api/daily-journal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: selectedDate,
          content
        })
      });
      
      const result = await response.json();
      
      if (result.success) {
        setShowModal(false);
        setContent('');
        fetchEntries(); // Refresh list
      }
    } catch (error) {
      console.error('Error saving journal:', error);
    } finally {
      setIsSaving(false);
    }
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
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BookOpen className="w-6 h-6 text-[#F97316]" />
          <h2 className="text-xl font-bold text-white">Trading Journal</h2>
        </div>
        
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-[#F97316] hover:bg-[#ea580c] text-white rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Entry
        </button>
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
                    <div>
                      <h4 className="text-sm font-medium text-[#8b949e] mb-2">Daily Reflection</h4>
                      <p className="text-white whitespace-pre-wrap">
                        {entry.content || <span className="text-[#8b949e] italic">No content added...</span>}
                      </p>
                    </div>
                    
                    <div className="text-xs text-[#8b949e]">
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
          <div className="bg-[#161b22] border border-[#30363d] rounded-xl w-full max-w-lg">
            <!-- Header -->
            <div className="flex items-center justify-between p-4 border-b border-[#30363d]">
              <h3 className="text-lg font-bold text-white">Daily Journal Entry</h3>
              <button
                onClick={() => setShowModal(false)}
                className="p-2 hover:bg-[#262626] rounded-lg"
              >
                <X className="w-5 h-5 text-[#8b949e]" />
              </button>
            </div>
            
            <!-- Content -->
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm text-[#8b949e] mb-2">Date</label>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="w-full px-3 py-2 bg-[#0d1117] border border-[#30363d] rounded-lg text-white focus:outline-none focus:border-[#F97316]"
                />
              </div>
              
              <div>
                <label className="block text-sm text-[#8b949e] mb-2">Reflection</label>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="How did your trading go today? What did you learn?"
                  className="w-full h-32 px-3 py-2 bg-[#0d1117] border border-[#30363d] rounded-lg text-white placeholder-[#8b949e] resize-none focus:outline-none focus:border-[#F97316]"
                />
              </div>
              
              <p className="text-sm text-[#8b949e]">
                More detailed prompts coming soon...
              </p>
            </div>
            
            <!-- Footer -->
            <div className="flex justify-end gap-3 p-4 border-t border-[#30363d]">
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
