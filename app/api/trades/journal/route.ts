import { NextRequest, NextResponse } from 'next/server';
import { getRedisClient } from '@/lib/redis';
import { getNowInEST } from '@/lib/date-utils';

const JOURNAL_KEY_PREFIX = 'journal:';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { date, notes } = body;
    
    if (!date) {
      return NextResponse.json(
        { success: false, error: 'Date is required' },
        { status: 400 }
      );
    }
    
    const redis = await getRedisClient();
    const key = `${JOURNAL_KEY_PREFIX}${date}`;
    
    await redis.hSet(key, {
      date,
      notes: notes || '',
      updatedAt: getNowInEST()
    });
    
    return NextResponse.json({
      success: true,
      message: 'Journal saved successfully'
    });
    
  } catch (error) {
    console.error('Error saving journal:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to save journal' 
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
      const data = await redis.hGetAll(`${JOURNAL_KEY_PREFIX}${date}`);
      return NextResponse.json({
        success: true,
        date,
        notes: data.notes || '',
        hasJournal: !!data.notes
      });
    }
    
    // Get all journals (scan for keys)
    const keys = await redis.keys(`${JOURNAL_KEY_PREFIX}*`);
    const journals: Record<string, string> = {};
    
    for (const key of keys) {
      const data = await redis.hGetAll(key);
      const dateKey = key.replace(JOURNAL_KEY_PREFIX, '');
      if (data.notes) {
        journals[dateKey] = data.notes;
      }
    }
    
    return NextResponse.json({
      success: true,
      journals
    });
    
  } catch (error) {
    console.error('Error fetching journal:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to fetch journal' 
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
    await redis.del(`${JOURNAL_KEY_PREFIX}${date}`);
    
    return NextResponse.json({
      success: true,
      message: 'Journal deleted'
    });
    
  } catch (error) {
    console.error('Error deleting journal:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to delete journal' 
      },
      { status: 500 }
    );
  }
}
