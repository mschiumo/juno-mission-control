import { NextResponse } from 'next/server';
import { createClient } from 'redis';

const CRON_RESULTS_KEY = 'cron_results';
const ACTIVITY_LOG_KEY = 'activity_log';

// Quotes array (30 quotes for variety)
const QUOTES = [
  { quote: "The future belongs to those who believe in the beauty of their dreams.", author: "Eleanor Roosevelt", category: "Success" },
  { quote: "Success is not final, failure is not fatal: it is the courage to continue that counts.", author: "Winston Churchill", category: "Resilience" },
  { quote: "The only way to do great work is to love what you do.", author: "Steve Jobs", category: "Passion" },
  { quote: "Believe you can and you're halfway there.", author: "Theodore Roosevelt", category: "Mindset" },
  { quote: "Your time is limited, don't waste it living someone else's life.", author: "Steve Jobs", category: "Life" },
  { quote: "The best time to plant a tree was 20 years ago. The second best time is now.", author: "Chinese Proverb", category: "Action" },
  { quote: "Don't watch the clock; do what it does. Keep going.", author: "Sam Levenson", category: "Persistence" },
  { quote: "Everything you've ever wanted is on the other side of fear.", author: "George Addair", category: "Courage" },
  { quote: "Success usually comes to those who are too busy to be looking for it.", author: "Henry David Thoreau", category: "Success" },
  { quote: "The only limit to our realization of tomorrow will be our doubts of today.", author: "Franklin D. Roosevelt", category: "Future" },
  { quote: "The greatest glory in living lies not in never falling, but in rising every time we fall.", author: "Nelson Mandela", category: "Resilience" },
  { quote: "The way to get started is to quit talking and begin doing.", author: "Walt Disney", category: "Action" },
  { quote: "Don't be afraid to give up the good to go for the great.", author: "John D. Rockefeller", category: "Ambition" },
  { quote: "I find that the harder I work, the more luck I seem to have.", author: "Thomas Jefferson", category: "Work" },
  { quote: "Success is walking from failure to failure with no loss of enthusiasm.", author: "Winston Churchill", category: "Success" },
  { quote: "The only place where success comes before work is in the dictionary.", author: "Vidal Sassoon", category: "Work" },
  { quote: "If you really look closely, most overnight successes took a long time.", author: "Steve Jobs", category: "Patience" },
  { quote: "The secret of success is to do the common thing uncommonly well.", author: "John D. Rockefeller", category: "Excellence" },
  { quote: "I never dreamed about success, I worked for it.", author: "Estée Lauder", category: "Work" },
  { quote: "The only person you are destined to become is the person you decide to be.", author: "Ralph Waldo Emerson", category: "Destiny" },
  { quote: "What lies behind us and what lies before us are tiny matters compared to what lies within us.", author: "Ralph Waldo Emerson", category: "Strength" },
  { quote: "It's not whether you get knocked down, it's whether you get up.", author: "Vince Lombardi", category: "Resilience" },
  { quote: "The market is a device for transferring money from the impatient to the patient.", author: "Warren Buffett", category: "Trading" },
  { quote: "Cut your losses short and let your winners run.", author: "Jesse Livermore", category: "Trading" },
  { quote: "Risk comes from not knowing what you're doing.", author: "Warren Buffett", category: "Risk" },
  { quote: "The goal of a successful trader is to make the best trades. Money is secondary.", author: "Alexander Elder", category: "Trading" },
  { quote: "In trading, the majority is always wrong.", author: "Unknown", category: "Trading" },
  { quote: "Plan your trade and trade your plan.", author: "Unknown", category: "Discipline" },
  { quote: "Small daily improvements are the key to staggering long-term results.", author: "Unknown", category: "Growth" },
  { quote: "We are what we repeatedly do. Excellence, then, is not an act, but a habit.", author: "Aristotle", category: "Excellence" }
];

let redisClient: ReturnType<typeof createClient> | null = null;

async function getRedisClient() {
  if (redisClient) return redisClient;
  try {
    const client = createClient({ url: process.env.REDIS_URL || undefined });
    client.on('error', (err) => console.error('Redis Client Error:', err));
    await client.connect();
    redisClient = client;
    return client;
  } catch (error) {
    console.error('Failed to connect to Redis:', error);
    return null;
  }
}

export async function GET() {
  try {
    // Get current date for deterministic quote selection
    const now = new Date();
    const dayOfMonth = now.getDate(); // 1-31
    
    // Select quote based on day of month (deterministic)
    const quoteIndex = (dayOfMonth - 1) % QUOTES.length;
    const selectedQuote = QUOTES[quoteIndex];
    
    const message = `Good morning MJ! ☀️\n\n"${selectedQuote.quote}" — ${selectedQuote.author}\n\nMake today count! 💪`;
    
    const redis = await getRedisClient();
    
    if (redis) {
      // Store in cron results
      const cronResult = {
        id: Date.now().toString(),
        jobName: 'Daily Motivational Message',
        content: message,
        type: 'motivational',
        timestamp: now.toISOString()
      };
      
      const existingResults = await redis.get(CRON_RESULTS_KEY);
      const results = existingResults ? JSON.parse(existingResults) : [];
      results.push(cronResult);
      if (results.length > 50) results.shift();
      await redis.set(CRON_RESULTS_KEY, JSON.stringify(results));
      
      // Log to activity log
      const activityEntry = {
        id: Date.now().toString(),
        timestamp: now.toISOString(),
        action: 'Daily Motivational Message Generated',
        details: `Quote #${quoteIndex + 1} by ${selectedQuote.author}`,
        type: 'cron'
      };
      
      const existingActivities = await redis.get(ACTIVITY_LOG_KEY);
      const activities = existingActivities ? JSON.parse(existingActivities) : [];
      activities.push(activityEntry);
      if (activities.length > 25) activities.shift();
      await redis.set(ACTIVITY_LOG_KEY, JSON.stringify(activities));
    }
    
    return NextResponse.json({
      success: true,
      message,
      quote: selectedQuote,
      dayOfMonth,
      quoteIndex
    });
  } catch (error) {
    console.error('Daily motivational error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to generate motivational message'
    }, { status: 500 });
  }
}
