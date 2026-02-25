/**
 * Note Types - TypeScript definitions for sticky notes feature
 */

export type NoteCreator = 'MJ' | 'Juno';

export interface Note {
  id: string;
  title: string;
  content: string;
  creator: NoteCreator;
  createdAt: string; // ISO timestamp
  color?: NoteColor;
}

export type NoteColor = 'yellow' | 'blue' | 'green' | 'pink' | 'purple' | 'orange';

export interface CreateNoteRequest {
  title: string;
  content: string;
  creator: NoteCreator;
  color?: NoteColor;
}

export interface CreateNoteResponse {
  success: boolean;
  note?: Note;
  error?: string;
}

export interface GetNotesResponse {
  success: boolean;
  notes: Note[];
  error?: string;
}

export interface DeleteNoteResponse {
  success: boolean;
  error?: string;
}

// Color configurations for sticky notes
export const NOTE_COLORS: Record<NoteColor, { bg: string; border: string; shadow: string; text: string }> = {
  yellow: {
    bg: 'bg-amber-100',
    border: 'border-amber-200',
    shadow: 'shadow-amber-200/50',
    text: 'text-amber-900'
  },
  blue: {
    bg: 'bg-sky-100',
    border: 'border-sky-200',
    shadow: 'shadow-sky-200/50',
    text: 'text-sky-900'
  },
  green: {
    bg: 'bg-emerald-100',
    border: 'border-emerald-200',
    shadow: 'shadow-emerald-200/50',
    text: 'text-emerald-900'
  },
  pink: {
    bg: 'bg-rose-100',
    border: 'border-rose-200',
    shadow: 'shadow-rose-200/50',
    text: 'text-rose-900'
  },
  purple: {
    bg: 'bg-violet-100',
    border: 'border-violet-200',
    shadow: 'shadow-violet-200/50',
    text: 'text-violet-900'
  },
  orange: {
    bg: 'bg-orange-100',
    border: 'border-orange-200',
    shadow: 'shadow-orange-200/50',
    text: 'text-orange-900'
  }
};

// Default color for new notes
export const DEFAULT_NOTE_COLOR: NoteColor = 'yellow';

// Available color options for the UI
export const AVAILABLE_COLORS: { value: NoteColor; label: string }[] = [
  { value: 'yellow', label: 'Yellow' },
  { value: 'blue', label: 'Blue' },
  { value: 'green', label: 'Green' },
  { value: 'pink', label: 'Pink' },
  { value: 'purple', label: 'Purple' },
  { value: 'orange', label: 'Orange' }
];
