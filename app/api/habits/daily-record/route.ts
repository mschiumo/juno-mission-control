import { NextResponse } from 'next/server';
import { getRedisClient } from '@/lib/redis';
import { getTodayInEST } from '@/lib/date-utils';

const HABITS_KEY_PREFIX = 'habits_data';
const DAILY_RECORD_PREFIX = 'habits:daily-record';
const EVENING_CHECKINS_KEY = 'evening_checkins';

// Evening habit check-in questions for reference
const DEFAULT_QUESTIONS = [
  { id: 'worked-out', question: 'Did you work out / lift today?', label: 'Work Out', category: 'fitness' },
  { id: 'ran', question: 'Did you run today?', label: 'Run', category: 'fitness' },
  { id: 'read', question: 'Did you read today?', label: 'Read', category: 'learning' },
  { id: 'journaled', question: 'Did you journal today?', label: 'Journal', category: 'mindfulness' },
  { id: 'traded', question: 'Did you trade today?', label: 'Trade', category: 'trading' },
  { id: 'made-bed', question: 'Did you make your bed today?', label: 'Make Bed', category: 'discipline' },
  { id: 'took-meds', question: 'Did you take your meds today?', label: 'Take Meds', category: 'health' },
];

// Map habit IDs to evening check-in question IDs
const HABIT_TO_QUESTION_MAP: Record<string, string> = {
  'exercise': 'worked-out',
  'market-brief': 'traded',
  'read': 'read',
  'journal': 'journaled',
  'trade-journal': 'traded',
  'make-bed': 'made-bed',
  'take-meds': 'took-meds',
};

interface HabitData {
  id: string;
  name: string;
  icon: string;
  target: string;
  category: string;
  completedToday: boolean;
  streak: number;
  history: boolean[];
  order: number;
}

interface DailyRecord {
  date: string;
  habits: HabitData[];
  recordedAt: string;
  completedCount: number;
  totalCount: number;
  completionRate: number;
  transferredToEveningCheckin: boolean;
}

/**
 * Calculate completion stats from habits array
 */
function calculateStats(habits: HabitData[]) {
  const completedCount = habits.filter(h => h.completedToday).length;
  const totalCount = habits.length;
  const completionRate = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  
  return {
    completedCount,
    totalCount,
    completionRate
  };
}

/**
 * Convert habit completions to evening check-in format
 */
function convertHabitsToEveningCheckin(habits: HabitData[]): Record<string, boolean> {
  const responses: Record<string, boolean> = {};
  
  for (const habit of habits) {
    const questionId = HABIT_TO_QUESTION_MAP[habit.id];
    if (questionId && habit.completedToday) {
      responses[questionId] = true;
    }
  }
  
  return responses;
}

/**
 * Calculate completion rate for evening check-in responses
 */
function calculateEveningCompletionRate(responses: Record<string, boolean>): number {
  const total = DEFAULT_QUESTIONS.length;
  const completed = Object.values(responses).filter(Boolean).length;
  return Math.round((completed / total) * 100);
}

/**
 * POST /api/habits/daily-record
 * 
 * Records the current state of all habits for today.
 * Also transfers completions to evening check-in format.
 */
export async function POST() {
  try {
    const today = getTodayInEST();
    const habitsKey = `${HABITS_KEY_PREFIX}:${today}`;
    const dailyRecordKey = `${DAILY_RECORD_PREFIX}:${today}`;
    
    const redis = await getRedisClient();
    
    if (!redis) {
      return NextResponse.json(
        { success: false, error: 'Redis not available' },
        { status: 503 }
      );
    }
    
    // Get current habits data for today
    const habitsData = await redis.get(habitsKey);
    
    if (!habitsData) {
      return NextResponse.json(
        { success: false, error: 'No habit data found for today' },
        { status: 404 }
      );
    }
    
    const habits: HabitData[] = JSON.parse(habitsData);
    const { completedCount, totalCount, completionRate } = calculateStats(habits);
    
    // Create daily record
    const dailyRecord: DailyRecord = {
      date: today,
      habits,
      recordedAt: new Date().toISOString(),
      completedCount,
      totalCount,
      completionRate,
      transferredToEveningCheckin: false
    };
    
    // Save daily record to Redis
    await redis.set(dailyRecordKey, JSON.stringify(dailyRecord));
    
    // Transfer to evening check-in format
    const eveningResponses = convertHabitsToEveningCheckin(habits);
    
    // Check if evening check-in already exists for today
    const storedCheckins = await redis.get(EVENING_CHECKINS_KEY);
    const allCheckins = storedCheckins ? JSON.parse(storedCheckins) : [];
    
    const existingIndex = allCheckins.findIndex((c: { date: string }) => c.date === today);
    
    const eveningCheckin = {
      date: today,
      timestamp: new Date().toISOString(),
      responses: eveningResponses,
      notes: '(Auto-recorded from habit tracker)',
      completionRate: calculateEveningCompletionRate(eveningResponses),
      source: 'habit-daily-record-cron'
    };
    
    if (existingIndex >= 0) {
      // Merge with existing check-in (preserve manual responses)
      const existing = allCheckins[existingIndex];
      const mergedResponses = {
        ...eveningResponses,
        ...existing.responses // Manual responses take precedence
      };
      
      allCheckins[existingIndex] = {
        ...existing,
        responses: mergedResponses,
        completionRate: calculateEveningCompletionRate(mergedResponses),
        habitAutoRecord: true,
        updatedAt: new Date().toISOString()
      };
    } else {
      // Add new check-in
      allCheckins.push(eveningCheckin);
    }
    
    // Keep only last 90 days of check-ins
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 90);
    const trimmedCheckins = allCheckins.filter((c: { date: string }) => {
      return new Date(c.date) >= cutoffDate;
    });
    
    await redis.set(EVENING_CHECKINS_KEY, JSON.stringify(trimmedCheckins));
    
    // Update daily record to reflect transfer
    dailyRecord.transferredToEveningCheckin = true;
    await redis.set(dailyRecordKey, JSON.stringify(dailyRecord));
    
    // Return success response
    return NextResponse.json({
      success: true,
      message: `Recorded ${completedCount}/${totalCount} habits for ${today}`,
      data: {
        date: today,
        completedCount,
        totalCount,
        completionRate,
        transferredToEveningCheckin: true,
        eveningCheckinResponses: Object.keys(eveningResponses).length
      }
    });
    
  } catch (error) {
    console.error('Daily habit record error:', error);
    
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to record daily habits',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/habits/daily-record
 * 
 * Retrieves the daily record for a specific date (defaults to today)
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date') || getTodayInEST();
    
    const dailyRecordKey = `${DAILY_RECORD_PREFIX}:${date}`;
    
    const redis = await getRedisClient();
    
    if (!redis) {
      return NextResponse.json(
        { success: false, error: 'Redis not available' },
        { status: 503 }
      );
    }
    
    const record = await redis.get(dailyRecordKey);
    
    if (!record) {
      return NextResponse.json(
        { success: false, error: `No daily record found for ${date}` },
        { status: 404 }
      );
    }
    
    const dailyRecord: DailyRecord = JSON.parse(record);
    
    return NextResponse.json({
      success: true,
      data: dailyRecord
    });
    
  } catch (error) {
    console.error('Daily habit record GET error:', error);
    
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to retrieve daily record',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
