'use client';

import { useState, useEffect, useCallback } from 'react';
import { Note, NOTE_COLORS, formatNoteDate } from '@/types/note';
import { getNotes, deleteNote } from '@/lib/notes-storage';
import CreateNoteModal from './CreateNoteModal';
import { 
  StickyNote, 
  Plus, 
  Trash2, 
  X, 
  User, 
  Bot, 
  Calendar,
  GripVertical
} from 'lucide-react';

export default function NotesView() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [expandedNote, setExpandedNote] = useState<Note | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);

  // Load notes on mount
  useEffect(() => {
    loadNotes();
  }, []);

  const loadNotes = useCallback(() => {
    setLoading(true);
    try {
      const loadedNotes = getNotes();
      setNotes(loadedNotes);
    } catch (error) {
      console.error('Failed to load notes:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleCreateNote = (newNote: Note) => {
    setNotes(prev => [newNote, ...prev]);
  };

  const handleDeleteNote = async (id: string) => {
    setDeletingId(id);
    try {
      const success = deleteNote(id);
      if (success) {
        setNotes(prev => prev.filter(note => note.id !== id));
        if (expandedNote?.id === id) {
          setExpandedNote(null);
        }
      }
    } catch (error) {
      console.error('Failed to delete note:', error);
    } finally {
      setDeletingId(null);
      setShowDeleteConfirm(null);
    }
  };

  const getContentPreview = (content: string, maxLength: number = 120) => {
    if (content.length <= maxLength) return content;
    return content.substring(0, maxLength).trim() + '...';
  };

  const getCreatorIcon = (creator: string) => {
    return creator === 'MJ' ? (
      <User className="w-3 h-3" />
    ) : (
      <Bot className="w-3 h-3" />
    );
  };

  const getCreatorLabel = (creator: string) => {
    return creator === 'MJ' ? 'You' : 'Juno';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-gradient-to-br from-amber-400 to-orange-500 rounded-xl shadow-lg">
            <StickyNote className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Sticky Notes</h2>
            <p className="text-sm text-[#8b949e]">
              {notes.length === 0 
                ? 'No notes yet' 
                : `${notes.length} note${notes.length === 1 ? '' : 's'}`
              }
            </p>
          </div>
        </div>

        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#ff6b35] to-[#ff8c5a] hover:from-[#ff5722] hover:to-[#ff6b35] text-white rounded-lg transition-all font-medium shadow-lg hover:shadow-xl"
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">New Note</span>
        </button>
      </div>

      {/* Notes Grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-48 bg-[#161b22] border border-[#30363d] rounded-xl animate-pulse" />
          ))}
        </div>
      ) : notes.length === 0 ? (
        /* Empty State */
        <div className="text-center py-16 px-4">
          <div className="w-20 h-20 mx-auto mb-6 bg-gradient-to-br from-amber-400/20 to-orange-500/20 rounded-full flex items-center justify-center">
            <StickyNote className="w-10 h-10 text-amber-500" />
          </div>
          <h3 className="text-lg font-medium text-white mb-2">No sticky notes yet</h3>
          <p className="text-[#8b949e] max-w-md mx-auto mb-6">
            Create your first sticky note to jot down ideas, reminders, or anything you need to remember.
          </p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-[#ff6b35] to-[#ff8c5a] hover:from-[#ff5722] hover:to-[#ff6b35] text-white rounded-lg transition-all font-medium shadow-lg"
          >
            <Plus className="w-5 h-5" />
            Create Your First Note
          </button>
        </div>
      ) : (
        /* Notes Grid */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {notes.map((note) => {
            const colors = NOTE_COLORS[note.color || 'yellow'];
            const isDeleting = deletingId === note.id;

            return (
              <div
                key={note.id}
                onClick={() => setExpandedNote(note)}
                className={`group relative ${colors.bg} border ${colors.border} rounded-xl p-4 cursor-pointer transition-all hover:scale-[1.02] hover:shadow-xl ${colors.shadow} ${
                  isDeleting ? 'opacity-50' : ''
                }`}
              >
                {/* Drag Handle (decorative) */}
                <div className="absolute top-2 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-30 transition-opacity">
                  <GripVertical className={`w-4 h-4 ${colors.text}`} />
                </div>

                {/* Delete Button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowDeleteConfirm(note.id);
                  }}
                  disabled={isDeleting}
                  className={`absolute top-2 right-2 p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-all hover:bg-black/10 ${colors.text}`}
                >
                  <Trash2 className="w-4 h-4" />
                </button>

                {/* Content */}
                <div className="pt-2">
                  <h3 className={`font-bold ${colors.text} mb-2 line-clamp-1`}>
                    {note.title}
                  </h3>
                  <p className={`${colors.text} opacity-80 text-sm line-clamp-4 whitespace-pre-wrap`}>
                    {getContentPreview(note.content)}
                  </p>
                </div>

                {/* Footer */}
                <div className="mt-4 pt-3 border-t ${colors.border} border-opacity-50 flex items-center justify-between">
                  <div className={`flex items-center gap-1.5 text-xs ${colors.text} opacity-70`}>
                    {getCreatorIcon(note.creator)}
                    <span>{getCreatorLabel(note.creator)}</span>
                  </div>
                  <div className={`flex items-center gap-1 text-xs ${colors.text} opacity-70`}>
                    <Calendar className="w-3 h-3" />
                    <span>{formatNoteDate(note.createdAt)}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Note Modal */}
      <CreateNoteModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreate={handleCreateNote}
      />

      {/* Expanded Note Modal */}
      {expandedNote && (
        <div 
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
          onClick={() => setExpandedNote(null)}
        >
          <div 
            className={`${NOTE_COLORS[expandedNote.color || 'yellow'].bg} border ${NOTE_COLORS[expandedNote.color || 'yellow'].border} rounded-xl w-full max-w-lg shadow-2xl max-h-[80vh] overflow-hidden`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-4 border-b ${NOTE_COLORS[expandedNote.color || 'yellow'].border} flex items-center justify-between">
              <h3 className={`font-bold text-lg ${NOTE_COLORS[expandedNote.color || 'yellow'].text}`}>
                {expandedNote.title}
              </h3>
              <button
                onClick={() => setExpandedNote(null)}
                className={`p-2 hover:bg-black/10 rounded-lg transition-colors ${NOTE_COLORS[expandedNote.color || 'yellow'].text}`}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="p-4 overflow-y-auto max-h-[50vh]">
              <p className={`${NOTE_COLORS[expandedNote.color || 'yellow'].text} whitespace-pre-wrap leading-relaxed`}>
                {expandedNote.content}
              </p>
            </div>

            {/* Footer */}
            <div className={`p-4 border-t ${NOTE_COLORS[expandedNote.color || 'yellow'].border} bg-black/5 flex items-center justify-between`}>
              <div className={`flex items-center gap-2 text-sm ${NOTE_COLORS[expandedNote.color || 'yellow'].text} opacity-80`}>
                {getCreatorIcon(expandedNote.creator)}
                <span>Created by {getCreatorLabel(expandedNote.creator)}</span>
              </div>
              <div className={`flex items-center gap-2 text-sm ${NOTE_COLORS[expandedNote.color || 'yellow'].text} opacity-80`}>
                <Calendar className="w-4 h-4" />
                <span>{new Date(expandedNote.createdAt).toLocaleString()}</span>
              </div>
            </div>

            {/* Actions */}
            <div className={`p-4 border-t ${NOTE_COLORS[expandedNote.color || 'yellow'].border} flex gap-3`}>
              <button
                onClick={() => setShowDeleteConfirm(expandedNote.id)}
                className="flex items-center gap-2 px-4 py-2 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg transition-colors font-medium"
              >
                <Trash2 className="w-4 h-4" />
                Delete
              </button>
              <button
                onClick={() => setExpandedNote(null)}
                className="flex-1 px-4 py-2 bg-gray-800 hover:bg-gray-900 text-white rounded-lg transition-colors font-medium"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60] p-4">
          <div className="bg-[#161b22] border border-[#f85149]/50 rounded-xl w-full max-w-md p-6 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-[#f85149]/10 rounded-xl">
                <Trash2 className="w-6 h-6 text-[#f85149]" />
              </div>
              <h3 className="text-lg font-bold text-white">Delete Note?</h3>
            </div>
            
            <p className="text-[#8b949e] mb-6">
              This will permanently delete this sticky note. This action cannot be undone.
            </p>
            
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(null)}
                className="flex-1 px-4 py-2 bg-[#30363d] hover:bg-[#484f58] text-white rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteNote(showDeleteConfirm)}
                disabled={deletingId !== null}
                className="flex-1 px-4 py-2 bg-[#f85149] hover:bg-[#da3633] text-white rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {deletingId ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    Delete
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
