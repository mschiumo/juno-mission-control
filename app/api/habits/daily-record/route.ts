/**
 * Daily Habit Record API Endpoint
 * 
 * POST: Record daily habit completion status
 * Called by cron job at 11:59 PM EST to log day's habits
 */

import { NextResponse } from 'next/server';
import { getRedisClient } from '@/lib/redis';

interface HabitRecord {
  date: string;
  habits: {
    name: string;
    completed: boolean;
    notes?: string;
  }[];
  summary?: string;
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { date, habits, summary } = body;
    
    const recordDate = date || new Date().toISOString().split('T')[0];
    
    // Get Redis client
    const redis = getRedisClient();
    
    // Create record
    const record: HabitRecord = {
      date: recordDate,
      habits: habits || [],
      summary: summary || `Daily habit record for ${recordDate}`,
      recordedAt: new Date().toISOString(),
    };
    
    // Store in Redis
    const key = `habits:daily:${recordDate}`;
    await redis.set(key, JSON.stringify(record));
    
    // Also add to a list of all daily records
    await redis.lpush('habits:daily:history', JSON.stringify({
      date: recordDate,
      habitCount: habits?.length || 0,
      recordedAt: new Date().toISOString(),
    }));
    
    // Trim history to last 365 entries
    await redis.ltrim('habits:daily:history', 0, 364);
    
    console.log(`[DailyHabitRecord] Recorded ${habits?.length || 0} habits for ${recordDate}`);
    
    return NextResponse.json({
      success: true,
      message: `Daily habit record created for ${recordDate}`,
      data: {
        date: recordDate,
        habitCount: habits?.length || 0,
      },
    });
    
  } catch (error) {
    console.error('[DailyHabitRecord] Error:', error);
    
    return NextResponse.json({
      success: false,
      error: 'Failed to record daily habits',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');
    
    const redis = getRedisClient();
    
    if (date) {
      // Get specific date
      const key = `habits:daily:${date}`;
      const data = await redis.get(key);
      
      if (!data) {
        return NextResponse.json({
          success: false,
          error: 'No record found for date',
        }, { status: 404 });
      }
      
      return NextResponse.json({
        success: true,
        data: JSON.parse(data),
      });
    }
    
    // Get recent history
    const history = await redis.lrange('habits:daily:history', 0, 30);
    
    return NextResponse.json({
      success: true,
      data: {
        recentRecords: history.map(h => JSON.parse(h)),
      },
    });
    
  } catch (error) {
    console.error('[DailyHabitRecord] GET Error:', error);
    
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch daily habit records',
    }, { status: 500 });
  }
}
