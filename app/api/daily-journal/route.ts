import { NextRequest, NextResponse } from 'next/server';
import { getRedisClient } from '@/lib/redis';

const DAILY_JOURNAL_PREFIX = 'daily-journal:';

export interface JournalPrompt {
  id: string;
  question: string;
  answer: string;
}

export interface DailyJournalEntry {
  id: string;
  date: string;
  prompts: JournalPrompt[];
  createdAt: string;
  updatedAt: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { date, prompts } = body;
    
    if (!date) {
      return NextResponse.json(
        { success: false, error: 'Date is required' },
        { status: 400 }
      );
    }
    
    const redis = await getRedisClient();
    const id = `${DAILY_JOURNAL_PREFIX}${date}`;
    const now = new Date().toISOString();
    
    // Check if entry exists
    const existing = await redis.hGetAll(id);
    
    const entry: DailyJournalEntry = {
      id,
      date,
      prompts: prompts || [],
      createdAt: existing.createdAt || now,
      updatedAt: now
    };
    
    await redis.hSet(id, {
      id: entry.id,
      date: entry.date,
      prompts: JSON.stringify(entry.prompts),
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt
    });
    
    return NextResponse.json({
      success: true,
      message: existing.createdAt ? 'Journal entry updated' : 'Journal entry created',
      entry
    });
    
  } catch (error) {
    console.error('Error saving daily journal:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to save journal entry' 
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');
    
    const redis = await getRedisClient();
    
    if (date) {
      // Get specific date
      const data = await redis.hGetAll(`${DAILY_JOURNAL_PREFIX}${date}`);
      
      if (!data || !data.id) {
        return NextResponse.json({
          success: true,
          entry: null,
          date
        });
      }
      
      return NextResponse.json({
        success: true,
        entry: {
          id: data.id,
          date: data.date,
          prompts: JSON.parse(data.prompts || '[]'),
          createdAt: data.createdAt,
          updatedAt: data.updatedAt
        } as DailyJournalEntry
      });
    }
    
    // Get all journal entries
    const keys = await redis.keys(`${DAILY_JOURNAL_PREFIX}*`);
    const entries: DailyJournalEntry[] = [];
    
    for (const key of keys) {
      const data = await redis.hGetAll(key);
      if (data && data.id) {
        entries.push({
          id: data.id,
          date: data.date,
          prompts: JSON.parse(data.prompts || '[]'),
          createdAt: data.createdAt,
          updatedAt: data.updatedAt
        });
      }
    }
    
    // Sort by date descending
    entries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    
    return NextResponse.json({
      success: true,
      entries,
      count: entries.length
    });
    
  } catch (error) {
    console.error('Error fetching daily journal:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to fetch journal entries' 
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');
    
    if (!date) {
      return NextResponse.json(
        { success: false, error: 'Date is required' },
        { status: 400 }
      );
    }
    
    const redis = await getRedisClient();
    await redis.del(`${DAILY_JOURNAL_PREFIX}${date}`);
    
    return NextResponse.json({
      success: true,
      message: 'Journal entry deleted'
    });
    
  } catch (error) {
    console.error('Error deleting daily journal:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to delete journal entry' 
      },
      { status: 500 }
    );
  }
}
