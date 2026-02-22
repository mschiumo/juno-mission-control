import { NextResponse } from 'next/server';
import { createClient } from 'redis';

// Quote database - 30 quotes for daily variety
const QUOTES = [
  { text: "The future belongs to those who believe in the beauty of their dreams.", author: "Eleanor Roosevelt" },
  { text: "Success is not final, failure is not fatal: it is the courage to continue that counts.", author: "Winston Churchill" },
  { text: "The only way to do great work is to love what you do.", author: "Steve Jobs" },
  { text: "Believe you can and you're halfway there.", author: "Theodore Roosevelt" },
  { text: "Your time is limited, don't waste it living someone else's life.", author: "Steve Jobs" },
  { text: "The best time to plant a tree was 20 years ago. The second best time is now.", author: "Chinese Proverb" },
  { text: "Don't watch the clock; do what it does. Keep going.", author: "Sam Levenson" },
  { text: "Everything you've ever wanted is on the other side of fear.", author: "George Addair" },
  { text: "Success is walking from failure to failure with no loss of enthusiasm.", author: "Winston Churchill" },
  { text: "The only limit to our realization of tomorrow will be our doubts of today.", author: "Franklin D. Roosevelt" },
  { text: "Do what you can, with what you have, where you are.", author: "Theodore Roosevelt" },
  { text: "It always seems impossible until it's done.", author: "Nelson Mandela" },
  { text: "The secret of getting ahead is getting started.", author: "Mark Twain" },
  { text: "Don't let yesterday take up too much of today.", author: "Will Rogers" },
  { text: "You learn more from failure than from success.", author: "Unknown" },
  { text: "If you are working on something that you really care about, you don't have to be pushed.", author: "Steve Jobs" },
  { text: "The pessimist sees difficulty in every opportunity. The optimist sees opportunity in every difficulty.", author: "Winston Churchill" },
  { text: "Don't stop when you're tired. Stop when you're done.", author: "Unknown" },
  { text: "I have not failed. I've just found 10,000 ways that won't work.", author: "Thomas Edison" },
  { text: "Success usually comes to those who are too busy to be looking for it.", author: "Henry David Thoreau" },
  { text: "The way to get started is to quit talking and begin doing.", author: "Walt Disney" },
  { text: "Don't be afraid to give up the good to go for the great.", author: "John D. Rockefeller" },
  { text: "I find that the harder I work, the more luck I seem to have.", author: "Thomas Jefferson" },
  { text: "There are no secrets to success. It is the result of preparation, hard work, and learning from failure.", author: "Colin Powell" },
  { text: "If you really look closely, most overnight successes took a long time.", author: "Steve Jobs" },
  { text: "The real test is not whether you avoid this failure, because you won't. It's whether you let it harden or shame you into inaction.", author: "Barack Obama" },
  { text: "Character cannot be developed in ease and quiet. Only through experience of trial and suffering can the soul be strengthened.", author: "Helen Keller" },
  { text: "The only place where success comes before work is in the dictionary.", author: "Vidal Sassoon" },
  { text: "The best revenge is massive success.", author: "Frank Sinatra" },
  { text: "What seems to us as bitter trials are often blessings in disguise.", author: "Oscar Wilde" }
];

const JOB_NAME = 'Daily Motivational Message';
const JOB_ID = '73d12d70-c138-477e-bc3a-9a419a48d1a0';

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
 * Get deterministic quote based on date
 * Same date = same quote (ensures consistency if rerun)
 * Different dates = different quotes (ensures variety)
 */
function getQuoteForDate(date: Date = new Date()): { text: string; author: string; index: number } {
  // Create a date string in ET timezone
  const etDate = new Date(date.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const year = etDate.getFullYear();
  const month = etDate.getMonth();
  const day = etDate.getDate();
  
  // Use day of year for variety within the year
  const startOfYear = new Date(year, 0, 0);
  const dayOfYear = Math.floor((etDate.getTime() - startOfYear.getTime()) / (1000 * 60 * 60 * 24));
  
  // Deterministic selection based on day of year
  const index = dayOfYear % QUOTES.length;
  
  return {
    ...QUOTES[index],
    index
  };
}

/**
 * Send message via Telegram
 */
async function sendTelegramMessage(message: string): Promise<boolean> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  
  if (!botToken || !chatId) {
    console.error('Telegram credentials not configured');
    return false;
  }
  
  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML'
      })
    });
    
    if (!response.ok) {
      const error = await response.text();
      console.error('Telegram API error:', error);
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('Failed to send Telegram message:', error);
    return false;
  }
}

/**
 * Post result to cron-results endpoint
 */
async function postCronResult(content: string, type: string = 'motivational'): Promise<boolean> {
  try {
    // Use internal API call or direct Redis write
    const redis = await getRedisClient();
    if (!redis) {
      console.error('Redis unavailable for cron result storage');
      return false;
    }
    
    const STORAGE_KEY = 'cron_results';
    const MAX_RESULTS = 100;
    
    const data = await redis.get(STORAGE_KEY);
    const results = data ? JSON.parse(data) : [];
    
    const newResult = {
      id: Date.now().toString(),
      jobName: JOB_NAME,
      timestamp: new Date().toISOString(),
      content,
      type
    };
    
    results.push(newResult);
    while (results.length > MAX_RESULTS) {
      results.shift();
    }
    
    await redis.set(STORAGE_KEY, JSON.stringify(results));
    return true;
  } catch (error) {
    console.error('Failed to post cron result:', error);
    return false;
  }
}

/**
 * Log activity
 */
async function logActivity(action: string, details: string, type: 'cron' | 'api' | 'user' | 'system' = 'cron'): Promise<boolean> {
  try {
    const redis = await getRedisClient();
    if (!redis) {
      console.error('Redis unavailable for activity logging');
      return false;
    }
    
    const STORAGE_KEY = 'activity_log';
    
    const data = await redis.get(STORAGE_KEY);
    const activities = data ? JSON.parse(data) : [];
    
    const newActivity = {
      id: Date.now().toString(),
      timestamp: new Date().toISOString(),
      action,
      details,
      type
    };
    
    activities.push(newActivity);
    if (activities.length > 25) {
      activities.shift();
    }
    
    await redis.set(STORAGE_KEY, JSON.stringify(activities));
    return true;
  } catch (error) {
    console.error('Failed to log activity:', error);
    return false;
  }
}

/**
 * GET handler - Returns today's quote without sending
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get('date');
    
    const date = dateParam ? new Date(dateParam) : new Date();
    const quote = getQuoteForDate(date);
    
    const message = `Good morning! ☀️

"${quote.text}" — ${quote.author}

Make today count! 💪`;
    
    return NextResponse.json({
      success: true,
      data: {
        quote,
        message,
        date: date.toISOString(),
        quoteIndex: quote.index,
        totalQuotes: QUOTES.length
      }
    });
  } catch (error) {
    console.error('Daily motivational GET error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to get daily quote'
    }, { status: 500 });
  }
}

/**
 * POST handler - Sends the daily motivational message
 */
export async function POST(request: Request) {
  const startTime = Date.now();
  
  try {
    // Get today's quote
    const quote = getQuoteForDate();
    
    const message = `Good morning! ☀️

"${quote.text}" — ${quote.author}

Make today count! 💪`;
    
    // Send via Telegram
    const telegramSuccess = await sendTelegramMessage(message);
    
    // Store result
    const resultContent = telegramSuccess 
      ? `✅ Daily Motivational Message sent successfully\n\nQuote #${quote.index + 1}: "${quote.text.substring(0, 50)}..." — ${quote.author}`
      : `❌ Failed to send Daily Motivational Message\n\nQuote #${quote.index + 1}: "${quote.text.substring(0, 50)}..." — ${quote.author}`;
    
    await postCronResult(resultContent, telegramSuccess ? 'motivational' : 'error');
    
    // Log activity
    await logActivity(
      telegramSuccess ? 'Daily Motivational Sent' : 'Daily Motivational Failed',
      `Quote #${quote.index + 1} by ${quote.author}. Telegram: ${telegramSuccess ? 'success' : 'failed'}`,
      'cron'
    );
    
    const duration = Date.now() - startTime;
    
    return NextResponse.json({
      success: telegramSuccess,
      data: {
        quote,
        message,
        telegramSent: telegramSuccess,
        durationMs: duration,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    console.error('Daily motivational POST error:', error);
    
    // Log failure
    await postCronResult(`❌ Daily Motivational Message failed: ${errorMessage}`, 'error');
    await logActivity('Daily Motivational Error', errorMessage, 'cron');
    
    return NextResponse.json({
      success: false,
      error: errorMessage,
      durationMs: duration
    }, { status: 500 });
  }
}
