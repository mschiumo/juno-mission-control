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
  const [modalMode, setModalMode] = useState<ModalMode>('create');
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<JournalEntry | null>(null);
  const [prompts, setPrompts] = useState<JournalPrompt[]>(DEFAULT_PROMPTS);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Fetch entries on mount
  useEffect(() => {
    fetchEntries();
  }, []);

  const fetchEntries = async () => {
    try {
      const response = await fetch('/api/daily-journal');
      const data = await response.json();
      if (data.success) {
        setEntries(data.entries || []);
      }
    } catch (error) {
      console.error('Error fetching journal entries:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Group entries by date for calendar
  const entriesByDate = useMemo(() => {
    const map: Record<string, JournalEntry> = {};
    entries.forEach(entry => {
      map[entry.date] = entry;
    });
    return map;
  }, [entries]);

  // Calculate month stats
  const monthStats = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const monthEntries = entries.filter(entry => {
      const entryDate = new Date(entry.date);
      return entryDate.getFullYear() === year && entryDate.getMonth() === month;
    });
    return {
      count: monthEntries.length
    };
  }, [entries, currentMonth]);

  // Generate calendar days
  const calendarDays = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const daysInMonth = getDaysInMonth(year, month);
    const firstDay = getFirstDayOfMonth(year, month);
    
    const days: { date: string | null; dayNumber: number | null; entry: JournalEntry | null }[] = [];
    
    // Empty slots for days before the 1st
    for (let i = 0; i < firstDay; i++) {
      days.push({ date: null, dayNumber: null, entry: null });
    }
    
    // Days of the month
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

  const isToday = (dateStr: string | null) => {
    if (!dateStr) return false;
    return dateStr === getTodayInEST();
  };

  const navigateMonth = (direction: 'prev' | 'next') => {
    setCurrentMonth(prev => {
      const newMonth = new Date(prev);
      if (direction === 'prev') {
        newMonth.setMonth(newMonth.getMonth() - 1);
      } else {
        newMonth.setMonth(newMonth.getMonth() + 1);
      }
      return newMonth;
    });
  };

  const openDayModal = (date: string, entry: JournalEntry | null) => {
    setSelectedDate(date);
    setSelectedEntry(entry);
    
    if (entry) {
      setModalMode('view');
      setPrompts(entry.prompts);
    } else {
      setModalMode('create');
      setPrompts(DEFAULT_PROMPTS.map(p => ({ ...p, answer: '' })));
    }
    
    setShowModal(true);
  };

  const openEditModal = () => {
    if (selectedEntry) {
      setModalMode('edit');
      setPrompts(selectedEntry.prompts.map(p => ({ ...p })));
    }
  };

  const closeModal = () => {
    setShowModal(false);
    setSelectedDate(null);
    setSelectedEntry(null);
    setPrompts(DEFAULT_PROMPTS);
    setShowDeleteConfirm(false);
  };

  const handlePromptChange = (id: string, answer: string) => {
    setPrompts(prev => prev.map(p => p.id === id ? { ...p, answer } : p));
  };

  const handleSubmit = async () => {
    if (!selectedDate) return;
    
    setIsSubmitting(true);
    
    try {
      const response = await fetch('/api/daily-journal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: selectedDate,
          prompts: prompts.filter(p => p.answer.trim())
        })
      });
      
      const data = await response.json();
      
      if (data.success) {
        await fetchEntries();
        closeModal();
      } else {
        alert('Failed to save journal entry');
      }
    } catch (error) {
      console.error('Error saving journal entry:', error);
      alert('Failed to save journal entry');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedEntry) return;
    
    try {
      const response = await fetch(`/api/daily-journal?id=${selectedEntry.id}`, {
        method: 'DELETE'
      });
      
      const data = await response.json();
      
      if (data.success) {
        await fetchEntries();
        closeModal();
      } else {
        alert('Failed to delete journal entry');
      }
    } catch (error) {
      console.error('Error deleting journal entry:', error);
      alert('Failed to delete journal entry');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#58a6ff]"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-[#1f6feb] rounded-lg">
            <BookOpen className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Trading Journal</h2>
            <p className="text-sm text-[#8b949e]">{entries.length} entries total</p>
          </div>
        </div>
        
        <button
          onClick={() => openDayModal(getTodayInEST(), entriesByDate[getTodayInEST()] || null)}
          className="flex items-center gap-2 px-4 py-2 bg-[#238636] hover:bg-[#2ea043] text-white rounded-lg transition-colors font-medium"
        >
          <Plus className="w-4 h-4" />
          New Entry
        </button>
      </div>

      {/* Calendar Container */}
      <div className="bg-[#161b22] rounded-xl border border-[#30363d] overflow-hidden">
        {/* Calendar Header */}
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-[#30363d] bg-[#0d1117]">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigateMonth('prev')}
              className="p-2 hover:bg-[#30363d] rounded-lg transition-colors text-[#8b949e]"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <h3 className="text-lg font-bold text-white min-w-[180px] text-center">
              {getMonthName(currentMonth)}
            </h3>
            <button
              onClick={() => navigateMonth('next')}
              className="p-2 hover:bg-[#30363d] rounded-lg transition-colors text-[#8b949e]"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
          
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-[#1f6feb]" />
              <span className="text-[#8b949e]">Has Entry</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full border border-[#8b949e]" />
              <span className="text-[#8b949e]">Today</span>
            </div>
          </div>
        </div>

        {/* Weekday Headers */}
        <div className="grid grid-cols-7 bg-[#0d1117] border-b border-[#30363d]">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
            <div key={day} className="py-3 text-center text-xs font-semibold text-[#8b949e] uppercase tracking-wider">
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
                  aspect-square border-b border-r border-[#30363d] p-2 sm:p-3
                  transition-all duration-200 cursor-pointer relative
                  ${!day.date ? 'bg-[#0d1117]/50 cursor-default' : 'hover:bg-[#30363d]/50'}
                  ${today ? 'bg-[#1f6feb]/10' : ''}
                `}
              >
                {day.dayNumber && (
                  <>
                    {/* Day Number */}
                    <span className={`
                      text-sm font-medium
                      ${today ? 'text-[#58a6ff]' : 'text-[#c9d1d9]'}
                      ${hasEntry ? 'font-bold' : ''}
                    `}>
                      {day.dayNumber}
                    </span>
                    
                    {/* Entry Indicator */}
                    {hasEntry && (
                      <div className="absolute bottom-2 left-2 right-2">
                        <div className="flex items-center gap-1.5">
                          <div className="w-2 h-2 rounded-full bg-[#1f6feb]" />
                          <span className="text-[10px] text-[#8b949e] truncate hidden sm:block">
                            Journal
                          </span>
                        </div>
                        {/* Preview text on larger screens */}
                        <p className="text-[10px] text-[#8b949e] truncate mt-1 hidden lg:block">
                          {day.entry!.prompts[0]?.answer?.slice(0, 25)}...
                        </p>
                      </div>
                    )}
                    
                    {/* Today indicator */}
                    {today && !hasEntry && (
                      <div className="absolute bottom-2 right-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-[#8b949e]" />
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
          <div className="w-3 h-3 rounded-full bg-[#1f6feb]" />
          <span className="text-[#8b949e]">Has Entry</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-[#8b949e]" />
          <span className="text-[#8b949e]">Today</span>
        </div>
      </div>

      {/* Entry Modal (View/Create/Edit) */}
      {showModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#161b22] rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto border border-[#30363d] shadow-2xl">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-5 border-b border-[#30363d] bg-[#0d1117] rounded-t-xl">
              <div className="flex items-center gap-3">
                <div className={`
                  p-2 rounded-lg
                  ${modalMode === 'view' ? 'bg-[#1f6feb]/20 text-[#58a6ff]' : 'bg-[#238636]/20 text-[#3fb950]'}
                `}>
                  {modalMode === 'view' ? <CalendarDays className="w-5 h-5" /> : <BookOpen className="w-5 h-5" />}
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">
                    {modalMode === 'view' ? 'Journal Entry' : modalMode === 'create' ? 'New Entry' : 'Edit Entry'}
                  </h3>
                  {selectedDate && (
                    <p className="text-sm text-[#8b949e]">{formatDateEST(selectedDate)}</p>
                  )}
                </div>
              </div>
              <button
                onClick={closeModal}
                className="p-2 hover:bg-[#30363d] rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-[#8b949e]" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-5 space-y-5">
              {/* View Mode */}
              {modalMode === 'view' && selectedEntry && (
                <>
                  <div className="space-y-4">
                    {selectedEntry.prompts.map((prompt) => (
                      <div key={prompt.id} className="bg-[#0d1117] rounded-lg p-4 border border-[#30363d]">
                        <h4 className="text-sm font-semibold text-[#58a6ff] mb-2">
                          {prompt.question}
                        </h4>
                        <p className="text-[#c9d1d9] text-sm leading-relaxed">
                          {prompt.answer || <span className="text-[#8b949e] italic">No answer provided</span>}
                        </p>
                      </div>
                    ))}
                  </div>
                  
                  {/* Metadata */}
                  <div className="flex items-center gap-4 text-xs text-[#8b949e] pt-3 border-t border-[#30363d]">
                    <div className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      <span>Created: {formatDateTimeEST(selectedEntry.createdAt)}</span>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-3 pt-2">
                    <button
                      onClick={openEditModal}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-[#1f6feb] hover:bg-[#388bfd] text-white rounded-lg transition-colors font-medium"
                    >
                      <Edit2 className="w-4 h-4" />
                      Edit
                    </button>
                    <button
                      onClick={() => setShowDeleteConfirm(true)}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-[#da3633]/20 hover:bg-[#da3633]/30 text-[#f85149] rounded-lg transition-colors font-medium"
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
                  <div className="space-y-4">
                    {prompts.map((prompt) => (
                      <div key={prompt.id}>
                        <label className="block text-sm font-medium text-[#c9d1d9] mb-2">
                          {prompt.question}
                        </label>
                        <textarea
                          value={prompt.answer}
                          onChange={(e) => handlePromptChange(prompt.id, e.target.value)}
                          placeholder="Write your reflection..."
                          rows={3}
                          className="w-full px-3 py-2 bg-[#0d1117] border border-[#30363d] rounded-lg text-[#c9d1d9] placeholder-[#8b949e] text-sm resize-none focus:outline-none focus:border-[#58a6ff] transition-colors"
                        />
                      </div>
                    ))}
                  </div>

                  {/* Submit Button */}
                  <button
                    onClick={handleSubmit}
                    disabled={isSubmitting || !prompts.some(p => p.answer.trim())}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-[#238636] hover:bg-[#2ea043] disabled:bg-[#30363d] text-white rounded-lg transition-colors font-medium disabled:opacity-50"
                  >
                    {isSubmitting ? (
                      <>Saving...</>
                    ) : (
                      <>
                        <Save className="w-4 h-4" />
                        {modalMode === 'create' ? 'Save Entry' : 'Update Entry'}
                      </>
                    )}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-[#161b22] rounded-xl w-full max-w-sm p-6 border border-[#30363d] shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-[#da3633]/20 rounded-lg">
                <AlertTriangle className="w-6 h-6 text-[#f85149]" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Delete Entry?</h3>
                <p className="text-sm text-[#8b949e]">This action cannot be undone.</p>
              </div>
            </div>
            
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 px-4 py-2.5 bg-[#30363d] hover:bg-[#3d444d] text-white rounded-lg transition-colors font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="flex-1 px-4 py-2.5 bg-[#da3633] hover:bg-[#f85149] text-white rounded-lg transition-colors font-medium"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
