/**
 * Evening Habit Check-in API Endpoint
 * 
 * GET: Send evening habit reminder
 * - Static message (no AI generation)
 * - Include link to dashboard
 * - POST to /api/cron-results
 */

import { NextResponse } from 'next/server';
import { 
  postToCronResults, 
  sendTelegramIfNeeded, 
  logToActivityLog,
  formatDate 
} from '@/lib/cron-helpers';
import { createClient } from 'redis';

// Redis client - lazy initialization
let redisClient: ReturnType<typeof createClient> | null = null;

async function getRedisClient() {
  if (redisClient?.isReady) {
    return redisClient;
  }
  
  try {
    const client = createClient({
      url: process.env.UPSTASH_REDIS_URL || process.env.REDIS_URL || undefined,
    });
    
    client.on('error', (err) => {
      console.error('Redis Client Error:', err);
    });
    
    await client.connect();
    redisClient = client;
    return client;
  } catch (error) {
    console.error('Failed to connect to Redis:', error);
    return null;
  }
}

interface HabitStatus {
  name: string;
  completed: boolean;
}

async function getTodayHabitStatus(): Promise<HabitStatus[]> {
  const redis = await getRedisClient();
  
  if (!redis) {
    return [];
  }

  try {
    const today = new Date().toISOString().split('T')[0];
    const data = await redis.get(`habits:${today}`);
    
    if (data) {
      return JSON.parse(data);
    }
    
    return [];
  } catch (error) {
    console.error('[HabitCheckin] Error fetching habit status:', error);
    return [];
  }
}

const HABITS = [
  { key: 'workout', label: 'Work out / lift', emoji: '💪' },
  { key: 'run', label: 'Run', emoji: '🏃' },
  { key: 'read', label: 'Read', emoji: '📚' },
  { key: 'journal', label: 'Journal', emoji: '📝' },
  { key: 'trade', label: 'Trade', emoji: '📈' },
  { key: 'bed', label: 'Make bed', emoji: '🛏️' },
  { key: 'meds', label: 'Take meds', emoji: '💊' }
];

export async function GET() {
  const startTime = Date.now();
  
  try {
    console.log('[HabitCheckin] Generating evening habit reminder...');
    
    // Get current habit status
    const habitStatus = await getTodayHabitStatus();
    const completedHabits = habitStatus.filter(h => h.completed).length;
    const totalHabits = HABITS.length;
    
    // Build the reminder message
    const reportLines = [
      `🌙 **Evening Habit Check-in** — ${formatDate()}`,
      ''
    ];
    
    // Add progress if available
    if (habitStatus.length > 0) {
      const progressPercent = Math.round((completedHabits / totalHabits) * 100);
      reportLines.push(`**Progress**: ${completedHabits}/${totalHabits} habits (${progressPercent}%)`);
      reportLines.push('');
    }
    
    reportLines.push('Time to check in on today\'s habits!');
    reportLines.push('');
    reportLines.push('**Your habits:**');
    
    // List habits with status if available
    for (const habit of HABITS) {
      const status = habitStatus.find(h => h.name === habit.key);
      const check = status?.completed ? '✅' : '⬜';
      reportLines.push(`${check} ${habit.emoji} ${habit.label}`);
    }
    
    reportLines.push('');
    reportLines.push('Open your dashboard to check in:');
    reportLines.push('https://juno-mission-control.vercel.app');
    reportLines.push('');
    reportLines.push('*(Tap the 🌙 moon icon in the Habits card)*');
    
    const reportContent = reportLines.join('\n');
    
    // Post to cron results
    await postToCronResults('Evening Habit Check-in', reportContent, 'check-in');
    
    // Log to activity log
    await logToActivityLog(
      'Evening Habit Check-in',
      `Sent reminder (${completedHabits}/${totalHabits} completed)`,
      'cron'
    );
    
    // Send Telegram notification
    await sendTelegramIfNeeded(reportContent);
    
    const duration = Date.now() - startTime;
    console.log(`[HabitCheckin] Reminder sent in ${duration}ms`);
    
    return NextResponse.json({
      success: true,
      data: {
        completedHabits,
        totalHabits,
        durationMs: duration
      }
    });
    
  } catch (error) {
    console.error('[HabitCheckin] Error:', error);
    
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    await logToActivityLog('Evening Habit Check-in Failed', errorMessage, 'cron');
    
    return NextResponse.json({
      success: false,
      error: 'Failed to send habit check-in',
      message: errorMessage
    }, { status: 500 });
  }
}
