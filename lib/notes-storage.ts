/**
 * Notes Storage - LocalStorage helpers for sticky notes
 * Key: `juno:notes`
 */

import { Note, CreateNoteRequest, NoteColor, DEFAULT_NOTE_COLOR } from '@/types/note';

const STORAGE_KEY = 'juno:notes';

/**
 * Generate a unique ID for a note
 */
function generateId(): string {
  return `note_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Get all notes from localStorage
 */
export function getNotes(): Note[] {
  if (typeof window === 'undefined') {
    return [];
  }
  
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return [];
    }
    
    const notes: Note[] = JSON.parse(stored);
    // Sort by creation date (newest first)
    return notes.sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  } catch (error) {
    console.error('Failed to load notes from localStorage:', error);
    return [];
  }
}

/**
 * Save all notes to localStorage
 */
export function saveNotes(notes: Note[]): void {
  if (typeof window === 'undefined') {
    return;
  }
  
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
  } catch (error) {
    console.error('Failed to save notes to localStorage:', error);
  }
}

/**
 * Create a new note
 */
export function createNote(request: CreateNoteRequest): Note {
  const note: Note = {
    id: generateId(),
    title: request.title.trim(),
    content: request.content.trim(),
    creator: request.creator,
    createdAt: new Date().toISOString(),
    color: request.color || DEFAULT_NOTE_COLOR
  };
  
  const notes = getNotes();
  notes.unshift(note); // Add to beginning (newest first)
  saveNotes(notes);
  
  return note;
}

/**
 * Delete a note by ID
 */
export function deleteNote(id: string): boolean {
  const notes = getNotes();
  const filtered = notes.filter(note => note.id !== id);
  
  if (filtered.length === notes.length) {
    return false; // Note not found
  }
  
  saveNotes(filtered);
  return true;
}

/**
 * Get a single note by ID
 */
export function getNoteById(id: string): Note | null {
  const notes = getNotes();
  return notes.find(note => note.id === id) || null;
}

/**
 * Update an existing note
 */
export function updateNote(id: string, updates: Partial<Omit<Note, 'id' | 'createdAt'>>): Note | null {
  const notes = getNotes();
  const index = notes.findIndex(note => note.id === id);
  
  if (index === -1) {
    return null;
  }
  
  notes[index] = { ...notes[index], ...updates };
  saveNotes(notes);
  
  return notes[index];
}

/**
 * Clear all notes (use with caution)
 */
export function clearAllNotes(): void {
  if (typeof window === 'undefined') {
    return;
  }
  
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error('Failed to clear notes from localStorage:', error);
  }
}

/**
 * Get the total count of notes
 */
export function getNoteCount(): number {
  return getNotes().length;
}

/**
 * Format date for display
 */
export function formatNoteDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  
  if (diffSecs < 60) {
    return 'Just now';
  } else if (diffMins < 60) {
    return `${diffMins}m ago`;
  } else if (diffHours < 24) {
    return `${diffHours}h ago`;
  } else if (diffDays < 7) {
    return `${diffDays}d ago`;
  } else {
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
    });
  }
}

/**
 * Parse Telegram note message formats:
 * - "Note: [title] - [content]"
 * - "Create note: [title]" followed by content
 */
export function parseTelegramNote(message: string): { title: string; content: string } | null {
  const trimmed = message.trim();
  
  // Pattern 1: "Note: [title] - [content]"
  const noteDashPattern = /^Note:\s*(.+?)\s*-\s*(.+)$/is;
  const dashMatch = trimmed.match(noteDashPattern);
  if (dashMatch) {
    return {
      title: dashMatch[1].trim(),
      content: dashMatch[2].trim()
    };
  }
  
  // Pattern 2: "Create note: [title]" followed by content (on same line or next)
  const createNotePattern = /^Create note:\s*(.+)$/im;
  const createMatch = trimmed.match(createNotePattern);
  if (createMatch) {
    const rest = trimmed.replace(createNotePattern, '').trim();
    const title = createMatch[1].trim();
    // If there's content after the title on the same line or next lines
    const content = rest || title; // If no separate content, use title as content too
    return {
      title,
      content: rest || ''
    };
  }
  
  return null;
}
