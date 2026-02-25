'use client';

import { useState } from 'react';
import { Note, NoteColor, NOTE_COLORS, AVAILABLE_COLORS, CreateNoteRequest } from '@/types/note';
import { StickyNote, X, Plus, Palette } from 'lucide-react';

interface CreateNoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (note: Note) => void;
}

export default function CreateNoteModal({ isOpen, onClose, onCreate }: CreateNoteModalProps) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [selectedColor, setSelectedColor] = useState<NoteColor>('yellow');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!title.trim() || !content.trim()) {
      return;
    }

    setIsSubmitting(true);

    try {
      // Import dynamically to avoid SSR issues
      const { createNote } = await import('@/lib/notes-storage');
      
      const request: CreateNoteRequest = {
        title: title.trim(),
        content: content.trim(),
        creator: 'MJ',
        color: selectedColor
      };

      const note = createNote(request);
      onCreate(note);
      
      // Reset form
      setTitle('');
      setContent('');
      setSelectedColor('yellow');
      onClose();
    } catch (error) {
      console.error('Failed to create note:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setTitle('');
    setContent('');
    setSelectedColor('yellow');
    setShowColorPicker(false);
    onClose();
  };

  const colors = NOTE_COLORS[selectedColor];

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className={`${colors.bg} border ${colors.border} rounded-xl w-full max-w-md shadow-2xl ${colors.shadow} overflow-hidden`}>
        {/* Header */}
        <div className="p-4 border-b ${colors.border} flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${colors.bg} border ${colors.border}`}>
              <StickyNote className={`w-5 h-5 ${colors.text}`} />
            </div>
            <h2 className={`text-lg font-bold ${colors.text}`}>New Sticky Note</h2>
          </div>
          
          <div className="flex items-center gap-2">
            {/* Color Picker Toggle */}
            <button
              type="button"
              onClick={() => setShowColorPicker(!showColorPicker)}
              className={`p-2 rounded-lg transition-colors ${colors.text} hover:bg-black/10`}
              title="Choose color"
            >
              <Palette className="w-5 h-5" />
            </button>
            
            <button
              type="button"
              onClick={handleClose}
              className={`p-2 hover:bg-black/10 rounded-lg transition-colors ${colors.text}`}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Color Picker */}
        {showColorPicker && (
          <div className="px-4 py-3 border-b ${colors.border} bg-black/5">
            <div className="flex items-center gap-2">
              {AVAILABLE_COLORS.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    setSelectedColor(value);
                    setShowColorPicker(false);
                  }}
                  className={`w-8 h-8 rounded-lg border-2 transition-all ${
                    selectedColor === value
                      ? 'border-gray-800 scale-110 shadow-md'
                      : 'border-transparent hover:scale-105'
                  } ${NOTE_COLORS[value].bg}`}
                  title={label}
                />
              ))}
            </div>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label htmlFor="note-title" className={`block text-sm font-medium ${colors.text} mb-1`}>
              Title
            </label>
            <input
              id="note-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter note title..."
              className={`w-full px-3 py-2 rounded-lg border ${colors.border} bg-white/80 focus:bg-white focus:outline-none focus:ring-2 focus:ring-offset-0 focus:ring-gray-400 ${colors.text} placeholder-gray-500`}
              autoFocus
            />
          </div>

          <div>
            <label htmlFor="note-content" className={`block text-sm font-medium ${colors.text} mb-1`}>
              Content
            </label>
            <textarea
              id="note-content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Write your note here..."
              rows={6}
              className={`w-full px-3 py-2 rounded-lg border ${colors.border} bg-white/80 focus:bg-white focus:outline-none focus:ring-2 focus:ring-offset-0 focus:ring-gray-400 ${colors.text} placeholder-gray-500 resize-none`}
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={handleClose}
              className="flex-1 px-4 py-2 bg-white/80 hover:bg-white border border-gray-300 text-gray-700 rounded-lg transition-colors font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!title.trim() || !content.trim() || isSubmitting}
              className="flex-1 px-4 py-2 bg-gray-800 hover:bg-gray-900 text-white rounded-lg transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  Create Note
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
