'use client';

import { useState, useEffect } from 'react';
import { BookOpen, ChevronDown, ChevronUp, Plus, X, Calendar, Clock, Save, CheckCircle, Edit2, Trash2, AlertTriangle } from 'lucide-react';
import { getTodayInEST } from '@/lib/date-utils';

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

type ModalMode = 'create' | 'edit';

export default function JournalView() {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState<ModalMode>('create');
  const [editingEntry, setEditingEntry] = useState<JournalEntry | null>(null);
  const [selectedDate, setSelectedDate] = useState(getTodayInEST);
  const [prompts, setPrompts] = useState<JournalPrompt[]>(DEFAULT_PROMPTS.map(p => ({ ...p })));
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  // Check for URL params on mount (date and action from CalendarView)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const dateParam = params.get('date');
    const actionParam = params.get('action');
    
    if (dateParam && actionParam) {
      // Fetch the journal entry for this date to determine if it exists
      fetchJournalEntryForDate(dateParam).then(entry => {
        if (actionParam === 'edit' && entry) {
          // Open existing entry in edit mode
          setModalMode('edit');
          setEditingEntry(entry);
          setSelectedDate(entry.date);
          setPrompts(entry.prompts.length > 0 ? entry.prompts : DEFAULT_PROMPTS.map(p => ({ ...p })));
          setSaveStatus('idle');
          setValidationErrors({});
          setShowModal(true);
        } else if (actionParam === 'create' && !entry) {
          // Open create modal for new entry
          setModalMode('create');
          setEditingEntry(null);
          setSelectedDate(dateParam);
          setPrompts(DEFAULT_PROMPTS.map(p => ({ ...p })));
          setSaveStatus('idle');
          setValidationErrors({});
          setShowModal(true);
        } else if (actionParam === 'create' && entry) {
          // Entry already exists, open in edit mode instead
          setModalMode('edit');
          setEditingEntry(entry);
          setSelectedDate(entry.date);
          setPrompts(entry.prompts.length > 0 ? entry.prompts : DEFAULT_PROMPTS.map(p => ({ ...p })));
          setSaveStatus('idle');
          setValidationErrors({});
          setShowModal(true);
        }
        
        // Clean up URL params
        params.delete('date');
        params.delete('action');
        window.history.replaceState({}, '', `${window.location.pathname}?${params.toString()}`);
      });
    }
  }, []);
  
  // Fetch a specific journal entry by date
  const fetchJournalEntryForDate = async (date: string): Promise<JournalEntry | null> => {
    try {
      const response = await fetch(`/api/trades/journal?date=${date}`);
      const data = await response.json();
      
      if (data.success && data.notes) {
        // Convert API response to JournalEntry format
        return {
          id: `${date}-entry`,
          date: date,
          prompts: data.prompts || DEFAULT_PROMPTS.map(p => ({ ...p, answer: '' })),
          createdAt: data.createdAt || new Date().toISOString(),
          updatedAt: data.updatedAt || new Date().toISOString()
        };
      }
      return null;
    } catch (error) {
      console.error('Error fetching journal entry for date:', error);
      return null;
    }
  };

  // Legacy support: Check for openJournal param on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('openJournal') === 'true') {
      setShowModal(true);
      setModalMode('create');
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

  const openCreateModal = () => {
    setModalMode('create');
    setEditingEntry(null);
    setSelectedDate(getTodayInEST());
    setPrompts(DEFAULT_PROMPTS.map(p => ({ ...p })));
    setSaveStatus('idle');
    setValidationErrors({});
    setShowModal(true);
  };

  const openEditModal = (entry: JournalEntry) => {
    setModalMode('edit');
    setEditingEntry(entry);
    setSelectedDate(entry.date);
    setPrompts(entry.prompts.length > 0 ? entry.prompts : DEFAULT_PROMPTS.map(p => ({ ...p })));
    setSaveStatus('idle');
    setValidationErrors({});
    setShowModal(true);
  };

  const handleSave = async () => {
    setSaveStatus('idle');
    
    // Validate
    const errors: Record<string, string> = {};
    
    if (!selectedDate) {
      errors.date = 'Date is required';
    }
    
    prompts.forEach((prompt) => {
      if (!prompt.answer || prompt.answer.trim() === '') {
        errors[prompt.id] = 'This field is required';
      }
    });
    
    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      return;
    }
    
    setValidationErrors({});
    setIsSaving(true);
    
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
          setPrompts(DEFAULT_PROMPTS.map(p => ({ ...p })));
          setSaveStatus('idle');
          fetchEntries();
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

  const handleDelete = async (date: string) => {
    setIsDeleting(true);
    
    try {
      const response = await fetch(`/api/daily-journal?date=${date}`, {
        method: 'DELETE'
      });
      
      const result = await response.json();
      
      if (result.success) {
        setShowDeleteConfirm(null);
        fetchEntries();
      }
    } catch (error) {
      console.error('Error deleting journal:', error);
    } finally {
      setIsDeleting(false);
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
      day: 'numeric',
      timeZone: 'America/New_York'
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
        
        <button
          onClick={openCreateModal}
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
              onClick={openCreateModal}
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
                className="w-full p-4 sm:p-5 flex items-center justify-between hover:bg-[#1f242b] transition-colors min-h-[72px]"
              >
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                  {/* Date */}
                  <div className="flex items-center gap-2 text-[#8b949e]">
                    <Calendar className="w-4 h-4 flex-shrink-0" />
                    <span className="text-sm text-white">{formatDate(entry.date)}</span>
                  </div>
                  
                  {/* Time */}
                  <div className="flex items-center gap-2 text-[#8b949e] sm:ml-2">
                    <Clock className="w-4 h-4 flex-shrink-0" />
                    <span className="text-sm">
                      {new Date(entry.updatedAt).toLocaleTimeString('en-US', {
                        hour: '2-digit',
                        minute: '2-digit',
                        timeZone: 'America/New_York'
                      })}
                    </span>
                  </div>
                </div>
                
                <div className="flex items-center gap-1 sm:gap-2">
                  {/* Edit Button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      openEditModal(entry);
                    }}
                    className="p-2 hover:bg-[#30363d] rounded-lg transition-colors"
                    title="Edit entry"
                  >
                    <Edit2 className="w-4 h-4 text-[#8b949e] hover:text-[#F97316]" />
                  </button>
                  
                  {/* Delete Button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowDeleteConfirm(entry.date);
                    }}
                    className="p-2 hover:bg-[#30363d] rounded-lg transition-colors"
                    title="Delete entry"
                  >
                    <Trash2 className="w-4 h-4 text-[#8b949e] hover:text-[#f85149]" />
                  </button>
                  
                  <div className="w-6 flex items-center justify-center">
                    {expandedId === entry.id ? (
                      <ChevronUp className="w-5 h-5 text-[#8b949e]" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-[#8b949e]" />
                    )}
                  </div>
                </div>
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
                      Created: {new Date(entry.createdAt).toLocaleString('en-US', { timeZone: 'America/New_York' })}
                      <br />
                      Updated: {new Date(entry.updatedAt).toLocaleString('en-US', { timeZone: 'America/New_York' })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-[#161b22] border border-[#30363d] rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-[#30363d] sticky top-0 bg-[#161b22]">
              <h3 className="text-lg font-bold text-white">
                {modalMode === 'create' ? 'Daily Journal Entry' : 'Edit Journal Entry'}
              </h3>
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
                  disabled={modalMode === 'edit'}
                  className={`w-full px-3 py-2 bg-[#0d1117] border rounded-lg text-white focus:outline-none focus:border-[#F97316] disabled:opacity-50 ${
                    validationErrors.date ? 'border-[#f85149]' : 'border-[#30363d]'
                  }`}
                />
                {validationErrors.date && (
                  <p className="text-xs text-[#f85149] mt-1">{validationErrors.date}</p>
                )}
                {modalMode === 'edit' && !validationErrors.date && (
                  <p className="text-xs text-[#8b949e] mt-1">Date cannot be changed when editing</p>
                )}
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
                      className={`w-full h-20 px-3 py-2 bg-[#0d1117] border rounded-lg text-white placeholder-[#8b949e] resize-none focus:outline-none focus:border-[#F97316] ${
                        validationErrors[prompt.id] ? 'border-[#f85149]' : 'border-[#30363d]'
                      }`}
                    />
                    {validationErrors[prompt.id] && (
                      <p className="text-xs text-[#f85149] mt-1">{validationErrors[prompt.id]}</p>
                    )}
                  </div>
                ))}
              </div>

              {Object.keys(validationErrors).length > 0 && (
                <div className="text-[#f85149] text-sm">
                  Please fill in all required fields.
                </div>
              )}

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
                onClick={() => {
                  setShowModal(false);
                  setValidationErrors({});
                }}
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
                    {modalMode === 'create' ? 'Save Entry' : 'Update Entry'}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-[#161b22] border border-[#30363d] rounded-xl w-full max-w-md p-6">
            <div className="flex items-center gap-3 mb-4">
              <AlertTriangle className="w-8 h-8 text-[#f85149]" />
              <h3 className="text-lg font-bold text-white">Delete Journal Entry?</h3>
            </div>
            
            <p className="text-[#8b949e] mb-6">
              Are you sure you want to delete the journal entry for{' '}
              <span className="text-white font-medium">
                {formatDate(showDeleteConfirm)}
              </span>
              ? This action cannot be undone.
            </p>
            
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowDeleteConfirm(null)}
                disabled={isDeleting}
                className="px-4 py-2 text-[#8b949e] hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(showDeleteConfirm)}
                disabled={isDeleting}
                className="flex items-center gap-2 px-4 py-2 bg-[#f85149] hover:bg-[#da3633] text-white rounded-lg disabled:opacity-50"
              >
                {isDeleting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    Delete Entry
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
