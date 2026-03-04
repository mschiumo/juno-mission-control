'use client';

import { useState, useEffect, useMemo } from 'react';
import { 
  BookOpen, 
  Plus, 
  X, 
  ChevronLeft, 
  ChevronRight, 
  Edit2, 
  Trash2, 
  AlertTriangle,
  Save,
  CheckCircle,
  CalendarDays,
  Clock
} from 'lucide-react';
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

// ============================================================================
// Timezone Helper Functions (EST)
// ============================================================================

const parseDateAsEST = (dateStr: string): Date => {
  return new Date(`${dateStr}T00:00:00-05:00`);
};

const formatDateEST = (dateStr: string): string => {
  const date = parseDateAsEST(dateStr);
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'America/New_York'
  });
};

const formatTimeEST = (isoString: string): string => {
  return new Date(isoString).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/New_York'
  });
};

const formatDateTimeEST = (isoString: string): string => {
  return new Date(isoString).toLocaleString('en-US', {
    timeZone: 'America/New_York'
  });
};

const DEFAULT_PROMPTS = [
  { id: 'went-well', question: 'What went well today?', answer: '' },
  { id: 'improve', question: 'What could you improve?', answer: '' },
  { id: 'followed-plan', question: 'Did you follow your trading plan?', answer: '' }
];

type ModalMode = 'create' | 'edit' | 'view';

// ============================================================================
// Calendar Helper Functions
// ============================================================================

const getDaysInMonth = (year: number, month: number) => {
  return new Date(year, month + 1, 0).getDate();
};

const getFirstDayOfMonth = (year: number, month: number) => {
  return new Date(year, month, 1).getDay();
};

const getMonthName = (date: Date) => {
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
};

// ============================================================================
// Main Component
// ============================================================================

export default function JournalView() {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  
  // Modal states
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState<ModalMode>('view');
  const [selectedEntry, setSelectedEntry] = useState<JournalEntry | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  
  // Form states
  const [prompts, setPrompts] = useState<JournalPrompt[]>(DEFAULT_PROMPTS.map(p => ({ ...p })));
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  // Fetch entries on mount
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

  // Create a map of date -> entry for quick lookup
  const entriesByDate = useMemo(() => {
    const map: Record<string, JournalEntry> = {};
    entries.forEach(entry => {
      map[entry.date] = entry;
    });
    return map;
  }, [entries]);

  // Calendar data
  const calendarDays = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const daysInMonth = getDaysInMonth(year, month);
    const firstDay = getFirstDayOfMonth(year, month);
    
    const days: Array<{ date: string | null; dayNumber: number | null; entry: JournalEntry | null }> = [];
    
    // Empty padding days
    for (let i = 0; i < firstDay; i++) {
      days.push({ date: null, dayNumber: null, entry: null });
    }
    
    // Actual days
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      days.push({
        date: dateStr,
        dayNumber: day,
        entry: entriesByDate[dateStr] || null
      });
    }
    
    return days;
  }, [currentMonth, entriesByDate]);

  // Stats for the month
  const monthStats = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const monthEntries = entries.filter(e => {
      const entryDate = new Date(e.date);
      return entryDate.getFullYear() === year && entryDate.getMonth() === month;
    });
    
    return {
      count: monthEntries.length,
      totalEntries: entries.length
    };
  }, [currentMonth, entries]);

  // Navigation
  const navigateMonth = (direction: 'prev' | 'next') => {
    setCurrentMonth(prev => {
      const newDate = new Date(prev);
      if (direction === 'prev') {
        newDate.setMonth(newDate.getMonth() - 1);
      } else {
        newDate.setMonth(newDate.getMonth() + 1);
      }
      return newDate;
    });
  };

  // Modal handlers
  const openDayModal = (date: string, entry: JournalEntry | null) => {
    setSelectedDate(date);
    
    if (entry) {
      // View existing entry
      setSelectedEntry(entry);
      setPrompts(entry.prompts.length > 0 ? entry.prompts : DEFAULT_PROMPTS.map(p => ({ ...p })));
      setModalMode('view');
    } else {
      // Create new entry
      setSelectedEntry(null);
      setPrompts(DEFAULT_PROMPTS.map(p => ({ ...p })));
      setModalMode('create');
    }
    
    setSaveStatus('idle');
    setValidationErrors({});
    setShowModal(true);
  };

  const openEditModal = () => {
    if (selectedEntry) {
      setModalMode('edit');
      setValidationErrors({});
    }
  };

  const closeModal = () => {
    setShowModal(false);
    setSelectedEntry(null);
    setSelectedDate(null);
    setSaveStatus('idle');
    setValidationErrors({});
  };

  // CRUD operations
  const handleSave = async () => {
    setSaveStatus('idle');
    
    // Validate
    const errors: Record<string, string> = {};
    
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
          closeModal();
          fetchEntries();
        }, 800);
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

  const handleDelete = async () => {
    if (!selectedDate) return;
    
    setIsDeleting(true);
    
    try {
      const response = await fetch(`/api/daily-journal?date=${selectedDate}`, {
        method: 'DELETE'
      });
      
      const result = await response.json();
      
      if (result.success) {
        setShowDeleteConfirm(false);
        closeModal();
        fetchEntries();
      }
    } catch (error) {
      console.error('Error deleting journal:', error);
    } finally {
      setIsDeleting(false);
    }
  };

  const updatePromptAnswer = (id: string, answer: string) => {
    setPrompts(prev => prev.map(p => p.id === id ? { ...p, answer } : p));
  };

  // Check if date is today
  const isToday = (dateStr: string | null) => {
    if (!dateStr) return false;
    return dateStr === getTodayInEST();
  };

  if (isLoading) {
    return (
      <div className="min-h-[400px] flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-3 border-orange-200 border-t-orange-500 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-500">Loading journal...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-br from-orange-400 to-rose-500 rounded-xl shadow-lg shadow-orange-200">
            <BookOpen className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800">Trading Journal</h2>
            <p className="text-sm text-slate-500">{entries.length} entries total</p>
          </div>
        </div>
        
        <button
          onClick={() => openDayModal(getTodayInEST(), entriesByDate[getTodayInEST()] || null)}
          className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-orange-500 to-rose-500 hover:from-orange-600 hover:to-rose-600 text-white rounded-xl transition-all shadow-lg shadow-orange-200 hover:shadow-xl hover:shadow-orange-300 font-medium"
        >
          <Plus className="w-4 h-4" />
          New Entry
        </button>
      </div>

      {/* Calendar Container */}
      <div className="bg-white rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden">
        {/* Calendar Header */}
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigateMonth('prev')}
              className="p-2 hover:bg-slate-100 rounded-lg transition-colors text-slate-600"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <h3 className="text-lg font-bold text-slate-800 min-w-[180px] text-center">
              {getMonthName(currentMonth)}
            </h3>
            <button
              onClick={() => navigateMonth('next')}
              className="p-2 hover:bg-slate-100 rounded-lg transition-colors text-slate-600"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
          
          <div className="hidden sm:flex items-center gap-4 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-gradient-to-r from-orange-400 to-rose-500" />
              <span className="text-slate-600">{monthStats.count} entries this month</span>
            </div>
          </div>
        </div>

        {/* Weekday Headers */}
        <div className="grid grid-cols-7 bg-slate-50/50">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
            <div key={day} className="py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider">
              {day}
            </div>
          ))}
        </div>

        {/* Calendar Grid */}
        <div className="grid grid-cols-7">
          {calendarDays.map((day, index) => {
            const today = isToday(day.date);
            const hasEntry = !!day.entry;
            
            return (
              <div
                key={index}
                onClick={() => day.date && openDayModal(day.date, day.entry)}
                className={`
                  aspect-square border-b border-r border-slate-100 p-2 sm:p-3
                  transition-all duration-200 cursor-pointer relative
                  ${!day.date ? 'bg-slate-50/30 cursor-default' : 'hover:bg-orange-50/50'}
                  ${today ? 'bg-orange-50/30' : ''}
                `}
              >
                {day.dayNumber && (
                  <>
                    {/* Day Number */}
                    <span className={`
                      text-sm font-medium
                      ${today ? 'text-orange-600' : 'text-slate-700'}
                      ${hasEntry ? 'font-bold' : ''}
                    `}>
                      {day.dayNumber}
                    </span>
                    
                    {/* Entry Indicator */}
                    {hasEntry && (
                      <div className="absolute bottom-2 left-2 right-2">
                        <div className="flex items-center gap-1.5">
                          <div className="w-2 h-2 rounded-full bg-gradient-to-r from-orange-400 to-rose-500" />
                          <span className="text-[10px] text-slate-500 truncate hidden sm:block">
                            Journal
                          </span>
                        </div>
                        {/* Preview text on larger screens */}
                        <p className="text-[10px] text-slate-400 truncate mt-1 hidden lg:block">
                          {day.entry!.prompts[0]?.answer?.slice(0, 25)}...
                        </p>
                      </div>
                    )}
                    
                    {/* Today indicator */}
                    {today && !hasEntry && (
                      <div className="absolute bottom-2 right-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-orange-400" />
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-6 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-gradient-to-r from-orange-400 to-rose-500" />
          <span className="text-slate-600">Has Entry</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-orange-400" />
          <span className="text-slate-600">Today</span>
        </div>
      </div>

      {/* Entry Modal (View/Create/Edit) */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white rounded-t-2xl">
              <div className="flex items-center gap-3">
                <div className={`
                  p-2 rounded-xl
                  ${modalMode === 'view' ? 'bg-blue-100 text-blue-600' : 'bg-orange-100 text-orange-600'}
                `}>
                  {modalMode === 'view' ? <CalendarDays className="w-5 h-5" /> : <BookOpen className="w-5 h-5" />}
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-800">
                    {modalMode === 'view' ? 'Journal Entry' : modalMode === 'create' ? 'New Entry' : 'Edit Entry'}
                  </h3>
                  {selectedDate && (
                    <p className="text-sm text-slate-500">{formatDateEST(selectedDate)}</p>
                  )}
                </div>
              </div>
              <button
                onClick={closeModal}
                className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-5 space-y-5">
              {/* View Mode */}
              {modalMode === 'view' && selectedEntry && (
                <>
                  <div className="space-y-4">
                    {selectedEntry.prompts.map((prompt) => (
                      <div key={prompt.id} className="bg-slate-50 rounded-xl p-4">
                        <h4 className="text-sm font-semibold text-orange-600 mb-2">
                          {prompt.question}
                        </h4>
                        <p className="text-slate-700 text-sm leading-relaxed">
                          {prompt.answer || <span className="text-slate-400 italic">No answer provided</span>}
                        </p>
                      </div>
                    ))}
                  </div>
                  
                  {/* Metadata */}
                  <div className="flex items-center gap-4 text-xs text-slate-400 pt-3 border-t border-slate-100">
                    <div className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      <span>Created: {formatDateTimeEST(selectedEntry.createdAt)}</span>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-3 pt-2">
                    <button
                      onClick={openEditModal}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-500 hover:bg-blue-600 text-white rounded-xl transition-colors font-medium"
                    >
                      <Edit2 className="w-4 h-4" />
                      Edit
                    </button>
                    <button
                      onClick={() => setShowDeleteConfirm(true)}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-xl transition-colors font-medium"
                    >
                      <Trash2 className="w-4 h-4" />
                      Delete
                    </button>
                  </div>
                </>
              )}

              {/* Create/Edit Mode */}
              {(modalMode === 'create' || modalMode === 'edit') && (
                <>
                  {/* Prompts */}
                  <div className="space-y-4">
                    {prompts.map((prompt) => (
                      <div key={prompt.id}>
                        <label className="block text-sm font-semibold text-orange-600 mb-2">
                          {prompt.question}
                        </label>
                        <textarea
                          value={prompt.answer}
                          onChange={(e) => updatePromptAnswer(prompt.id, e.target.value)}
                          placeholder="Write your thoughts..."
                          className={`
                            w-full h-24 px-4 py-3 bg-slate-50 border-2 rounded-xl text-slate-700 
                            placeholder-slate-400 resize-none transition-all
                            focus:outline-none focus:bg-white
                            ${validationErrors[prompt.id] 
                              ? 'border-rose-300 focus:border-rose-500' 
                              : 'border-slate-200 focus:border-orange-400'
                            }
                          `}
                        />
                        {validationErrors[prompt.id] && (
                          <p className="text-xs text-rose-500 mt-1">{validationErrors[prompt.id]}</p>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Status Messages */}
                  {saveStatus === 'success' && (
                    <div className="flex items-center gap-2 text-emerald-600 bg-emerald-50 p-3 rounded-xl">
                      <CheckCircle className="w-5 h-5" />
                      <span className="text-sm font-medium">Journal saved successfully!</span>
                    </div>
                  )}

                  {saveStatus === 'error' && (
                    <div className="text-rose-600 text-sm bg-rose-50 p-3 rounded-xl">
                      Failed to save journal. Please try again.
                    </div>
                  )}

                  {/* Footer Actions */}
                  <div className="flex gap-3 pt-2">
                    <button
                      onClick={modalMode === 'edit' ? () => setModalMode('view') : closeModal}
                      className="flex-1 px-4 py-2.5 text-slate-600 hover:bg-slate-100 rounded-xl transition-colors font-medium"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSave}
                      disabled={isSaving}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-orange-500 to-rose-500 hover:from-orange-600 hover:to-rose-600 text-white rounded-xl transition-all font-medium disabled:opacity-50"
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
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 bg-rose-100 rounded-xl">
                <AlertTriangle className="w-6 h-6 text-rose-600" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-800">Delete Entry?</h3>
                <p className="text-sm text-slate-500">
                  {selectedDate && formatDateEST(selectedDate)}
                </p>
              </div>
            </div>
            
            <p className="text-slate-600 text-sm mb-6">
              This action cannot be undone. Your journal entry will be permanently removed.
            </p>
            
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={isDeleting}
                className="flex-1 px-4 py-2.5 text-slate-600 hover:bg-slate-100 rounded-xl transition-colors font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-rose-500 hover:bg-rose-600 text-white rounded-xl transition-colors font-medium disabled:opacity-50"
              >
                {isDeleting ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
