/**
 * API Endpoint: Create Note from Telegram
 * 
 * Accepts note creation requests from Telegram integration.
 * POST /api/notes/create-from-telegram
 * 
 * Body: { title: string, content: string, creator?: 'MJ' | 'Juno' }
 * Response: { success: boolean, note?: Note, error?: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { Note, CreateNoteResponse, CreateNoteRequest, DEFAULT_NOTE_COLOR } from '@/types/note';

// Since we're using localStorage on the client, we need to store notes
// in a way that the client can access them. For server-side storage,
// we'll use a simple in-memory store that gets synced to the client.
// In production, this should use Redis or a database.

// Note: This is a server-side endpoint, but localStorage is client-side only.
// For this implementation, we'll return the note data that the client can store.
// The actual storage happens on the client via the notes-storage.ts functions.

// For Telegram bot integration, we would typically use Redis or a database.
// Since the requirement mentions localStorage, we'll provide the note data
// in a format that can be used by the Telegram bot to display confirmation.

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { title, content, creator = 'Juno' } = body;

    // Validate required fields
    if (!title || typeof title !== 'string' || title.trim() === '') {
      return NextResponse.json<CreateNoteResponse>({
        success: false,
        error: 'Title is required and must be a non-empty string'
      }, { status: 400 });
    }

    if (!content || typeof content !== 'string' || content.trim() === '') {
      return NextResponse.json<CreateNoteResponse>({
        success: false,
        error: 'Content is required and must be a non-empty string'
      }, { status: 400 });
    }

    // Validate creator
    if (creator !== 'MJ' && creator !== 'Juno') {
      return NextResponse.json<CreateNoteResponse>({
        success: false,
        error: "Creator must be either 'MJ' or 'Juno'"
      }, { status: 400 });
    }

    // Create the note object
    const note: Note = {
      id: `note_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      title: title.trim(),
      content: content.trim(),
      creator,
      createdAt: new Date().toISOString(),
      color: DEFAULT_NOTE_COLOR
    };

    // For Telegram integration, we would typically:
    // 1. Store in Redis/database for server-side persistence
    // 2. Or emit an event that the client can listen to
    // 
    // Since this uses localStorage (client-side), we return the note
    // and the Telegram bot can inform the user that the note will appear
    // when they open the dashboard.

    // If REDIS_URL is available, we could also store there for sync
    try {
      const { getRedisClient } = await import('@/lib/redis');
      const redis = await getRedisClient();
      
      // Store in Redis for potential server-side sync
      await redis.set(`juno:note:${note.id}`, JSON.stringify(note));
      
      // Add to a list of pending notes for the user
      await redis.lpush('juno:notes:pending', JSON.stringify(note));
      
      // Set expiration to clean up old pending notes (7 days)
      await redis.expire(`juno:note:${note.id}`, 60 * 60 * 24 * 7);
      
    } catch (redisError) {
      // Redis is optional - if it fails, we still return success
      // since the client-side localStorage is the primary storage
      console.log('Redis not available, relying on client-side storage');
    }

    return NextResponse.json<CreateNoteResponse>({
      success: true,
      note
    });

  } catch (error) {
    console.error('Error creating note from Telegram:', error);
    
    return NextResponse.json<CreateNoteResponse>({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    }, { status: 500 });
  }
}

/**
 * GET endpoint to retrieve pending notes (for sync purposes)
 * This allows the client to sync notes created via Telegram
 */
export async function GET(): Promise<NextResponse> {
  try {
    const { getRedisClient } = await import('@/lib/redis');
    const redis = await getRedisClient();
    
    // Get all pending notes (limited to last 100)
    const pendingNotes = await redis.lrange('juno:notes:pending', 0, 99);
    
    // Parse and return notes
    const notes: Note[] = pendingNotes.map(noteJson => {
      try {
        return JSON.parse(noteJson);
      } catch {
        return null;
      }
    }).filter((note): note is Note => note !== null);

    return NextResponse.json({
      success: true,
      notes
    });

  } catch (error) {
    // Redis not available, return empty array
    return NextResponse.json({
      success: true,
      notes: []
    });
  }
}

/**
 * DELETE endpoint to clear pending notes after sync
 */
export async function DELETE(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const noteId = searchParams.get('id');
    
    const { getRedisClient } = await import('@/lib/redis');
    const redis = await getRedisClient();
    
    if (noteId) {
      // Remove specific note from Redis
      await redis.del(`juno:note:${noteId}`);
    } else {
      // Clear all pending notes (use with caution)
      await redis.del('juno:notes:pending');
    }

    return NextResponse.json({
      success: true
    });

  } catch (error) {
    return NextResponse.json({
      success: false,
      error: 'Failed to clear pending notes'
    }, { status: 500 });
  }
}
