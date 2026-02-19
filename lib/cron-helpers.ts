/**
 * Cron Helper Utilities
 * 
 * Common utilities for API-based cron jobs
 * Removes AI dependency for simple data retrieval and formatting tasks
 */

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

/**
 * Post results to the cron-results endpoint
 * Stores results in Redis for later retrieval
 */
export async function postToCronResults(
  jobName: string, 
  content: string, 
  type: 'market' | 'motivational' | 'check-in' | 'review' | 'error' = 'check-in'
): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    const redis = await getRedisClient();
    
    if (!redis) {
      return { success: false, error: 'Redis unavailable' };
    }

    const STORAGE_KEY = 'cron_results';
    const MAX_RESULTS = 100;

    // Get existing results
    const data = await redis.get(STORAGE_KEY);
    const results: Array<{
      id: string;
      jobName: string;
      timestamp: string;
      content: string;
      type: string;
    }> = data ? JSON.parse(data) : [];

    // Create new result
    const newResult = {
      id: Date.now().toString(),
      jobName,
      timestamp: new Date().toISOString(),
      content,
      type
    };

    // Add to results (keep last 100)
    results.push(newResult);
    while (results.length > MAX_RESULTS) {
      results.shift();
    }

    // Save to Redis
    await redis.set(STORAGE_KEY, JSON.stringify(results));

    console.log(`[CronHelper] Posted results for job: ${jobName}`);
    return { success: true, id: newResult.id };
  } catch (error) {
    console.error('[CronHelper] Failed to post cron results:', error);
    return { success: false, error: String(error) };
  }
}

/**
 * Send Telegram notification if needed
 * Only sends if TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are configured
 */
export async function sendTelegramIfNeeded(
  message: string,
  condition: boolean = true
): Promise<{ success: boolean; error?: string }> {
  if (!condition) {
    return { success: true };
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!botToken || !chatId) {
    console.log('[CronHelper] Telegram not configured, skipping notification');
    return { success: false, error: 'Telegram not configured' };
  }

  try {
    const response = await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: 'HTML',
          disable_web_page_preview: true
        })
      }
    );

    if (!response.ok) {
      throw new Error(`Telegram API error: ${response.status}`);
    }

    console.log('[CronHelper] Telegram notification sent');
    return { success: true };
  } catch (error) {
    console.error('[CronHelper] Failed to send Telegram notification:', error);
    return { success: false, error: String(error) };
  }
}

/**
 * Log an action to the activity log
 */
export async function logToActivityLog(
  action: string,
  details: string,
  type: 'cron' | 'api' | 'user' | 'system' = 'cron',
  url?: string
): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    const redis = await getRedisClient();
    
    if (!redis) {
      return { success: false, error: 'Redis unavailable' };
    }

    const STORAGE_KEY = 'activity_log';

    // Get existing activities
    const data = await redis.get(STORAGE_KEY);
    const activities: Array<{
      id: string;
      timestamp: string;
      action: string;
      details: string;
      type: string;
      url?: string;
    }> = data ? JSON.parse(data) : [];

    // Create new activity
    const newActivity = {
      id: Date.now().toString(),
      timestamp: new Date().toISOString(),
      action,
      details,
      type,
      url
    };

    // Add to activities (keep last 25)
    activities.push(newActivity);
    if (activities.length > 25) {
      activities.shift();
    }

    // Save to Redis
    await redis.set(STORAGE_KEY, JSON.stringify(activities));

    console.log(`[CronHelper] Logged activity: ${action}`);
    return { success: true, id: newActivity.id };
  } catch (error) {
    console.error('[CronHelper] Failed to log activity:', error);
    return { success: false, error: String(error) };
  }
}

/**
 * Format a date for display
 */
export function formatDate(date: Date = new Date()): string {
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

/**
 * Format a time for display
 */
export function formatTime(date: Date = new Date()): string {
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short'
  });
}

/**
 * Check if today is a weekday (Mon-Fri)
 */
export function isWeekday(): boolean {
  const day = new Date().getDay();
  return day >= 1 && day <= 5;
}

/**
 * Check if US stock market is open today
 * (Not a weekend and not a holiday)
 */
export function isMarketOpenToday(): boolean {
  if (!isWeekday()) return false;
  
  // US Market Holidays 2026
  const today = new Date().toISOString().split('T')[0];
  const holidays = [
    '2026-01-01', // New Year's Day
    '2026-01-19', // Martin Luther King Jr. Day
    '2026-02-16', // Presidents' Day
    '2026-04-03', // Good Friday
    '2026-05-25', // Memorial Day
    '2026-06-19', // Juneteenth
    '2026-07-03', // Independence Day (observed)
    '2026-09-07', // Labor Day
    '2026-11-26', // Thanksgiving
    '2026-12-25', // Christmas Day
  ];
  
  return !holidays.includes(today);
}
