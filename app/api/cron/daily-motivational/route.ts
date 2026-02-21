/**
 * Daily Motivational Message Cron Job
 * 
 * GET: Generate and store a daily motivational quote
 * - Uses date-based randomness for consistent daily selection
 * - Posts to /api/cron-results for display in the dashboard
 * - Runs every morning at 6:00 AM EST
 */

import { NextResponse } from 'next/server';
import { createClient } from 'redis';

// Extended quote collection for variety
const QUOTES = [
  { quote: "The future belongs to those who believe in the beauty of their dreams.", author: "Eleanor Roosevelt" },
  { quote: "Success is not final, failure is not fatal: it is the courage to continue that counts.", author: "Winston Churchill" },
  { quote: "The only way to do great work is to love what you do.", author: "Steve Jobs" },
  { quote: "Believe you can and you're halfway there.", author: "Theodore Roosevelt" },
  { quote: "Your time is limited, don't waste it living someone else's life.", author: "Steve Jobs" },
  { quote: "The best time to plant a tree was 20 years ago. The second best time is now.", author: "Chinese Proverb" },
  { quote: "Don't watch the clock; do what it does. Keep going.", author: "Sam Levenson" },
  { quote: "Everything you've ever wanted is on the other side of fear.", author: "George Addair" },
  { quote: "Success usually comes to those who are too busy to be looking for it.", author: "Henry David Thoreau" },
  { quote: "The only limit to our realization of tomorrow will be our doubts of today.", author: "Franklin D. Roosevelt" },
  { quote: "It is during our darkest moments that we must focus to see the light.", author: "Aristotle" },
  { quote: "The way to get started is to quit talking and begin doing.", author: "Walt Disney" },
  { quote: "Don't be afraid to give up the good to go for the great.", author: "John D. Rockefeller" },
  { quote: "I find that the harder I work, the more luck I seem to have.", author: "Thomas Jefferson" },
  { quote: "Success is walking from failure to failure with no loss of enthusiasm.", author: "Winston Churchill" },
  { quote: "The only place where success comes before work is in the dictionary.", author: "Vidal Sassoon" },
  { quote: "If you really look closely, most overnight successes took a long time.", author: "Steve Jobs" },
  { quote: "The secret of success is to do the common thing uncommonly well.", author: "John D. Rockefeller" },
  { quote: "I never dreamed about success, I worked for it.", author: "Estée Lauder" },
  { quote: "The only person you are destined to become is the person you decide to be.", author: "Ralph Waldo Emerson" },
  { quote: "What lies behind us and what lies before us are tiny matters compared to what lies within us.", author: "Ralph Waldo Emerson" },
  { quote: "It's not whether you get knocked down, it's whether you get up.", author: "Vince Lombardi" },
  { quote: "The greatest glory in living lies not in never falling, but in rising every time we fall.", author: "Nelson Mandela" },
  { quote: "Life is what happens when you're busy making other plans.", author: "John Lennon" },
  { quote: "The purpose of our lives is to be happy.", author: "Dalai Lama" },
  { quote: "Get busy living or get busy dying.", author: "Stephen King" },
  { quote: "You only live once, but if you do it right, once is enough.", author: "Mae West" },
  { quote: "Many of life's failures are people who did not realize how close they were to success when they gave up.", author: "Thomas Edison" },
  { quote: "If you want to live a happy life, tie it to a goal, not to people or things.", author: "Albert Einstein" },
  { quote: "Never let the fear of striking out keep you from playing the game.", author: "Babe Ruth" },
  { quote: "Money and success don't change people; they merely amplify what is already there.", author: "Will Smith" },
  { quote: "Your time is limited, so don't waste it living someone else's life.", author: "Steve Jobs" },
  { quote: "Not how long, but how well you have lived is the main thing.", author: "Seneca" },
  { quote: "If life were predictable it would cease to be life, and be without flavor.", author: "Eleanor Roosevelt" },
  { quote: "The whole secret of a successful life is to find out what is one's destiny to do, and then do it.", author: "Henry Ford" },
  { quote: "In order to write about life first you must live it.", author: "Ernest Hemingway" },
  { quote: "The big lesson in life, baby, is never be scared of anyone or anything.", author: "Frank Sinatra" },
  { quote: "Curiosity about life in all of its aspects, I think, is still the secret of great creative people.", author: "Leo Burnett" },
  { quote: "Life is not a problem to be solved, but a reality to be experienced.", author: "Søren Kierkegaard" },
  { quote: "The unexamined life is not worth living.", author: "Socrates" },
  { quote: "Turn your wounds into wisdom.", author: "Oprah Winfrey" },
  { quote: "The way to get started is to quit talking and begin doing.", author: "Walt Disney" },
  { quote: "Do not let making a living prevent you from making a life.", author: "John Wooden" },
  { quote: "Happiness is not something ready made. It comes from your own actions.", author: "Dalai Lama" },
  { quote: "Everything you can imagine is real.", author: "Pablo Picasso" },
  { quote: "Whatever you are, be a good one.", author: "Abraham Lincoln" },
  { quote: "Do what you can, with what you have, where you are.", author: "Theodore Roosevelt" },
  { quote: "It is never too late to be what you might have been.", author: "George Eliot" },
  { quote: "You miss 100% of the shots you don't take.", author: "Wayne Gretzky" },
  { quote: "Whether you think you can or you think you can't, you're right.", author: "Henry Ford" },
  { quote: "I have not failed. I've just found 10,000 ways that won't work.", author: "Thomas Edison" },
  { quote: "The best revenge is massive success.", author: "Frank Sinatra" },
  { quote: "Be yourself; everyone else is already taken.", author: "Oscar Wilde" },
  { quote: "Act as if what you do makes a difference. It does.", author: "William James" },
  { quote: "Success is not how high you have climbed, but how you make a positive difference to the world.", author: "Roy T. Bennett" },
  { quote: "Dream big and dare to fail.", author: "Norman Vaughan" },
  { quote: "What we achieve inwardly will change outer reality.", author: "Plutarch" },
  { quote: "Start where you are. Use what you have. Do what you can.", author: "Arthur Ashe" },
  { quote: "Fall seven times and stand up eight.", author: "Japanese Proverb" },
  { quote: "Everything has beauty, but not everyone can see.", author: "Confucius" },
  { quote: "How wonderful it is that nobody need wait a single moment before starting to improve the world.", author: "Anne Frank" },
  { quote: "When you reach the end of your rope, tie a knot in it and hang on.", author: "Franklin D. Roosevelt" },
  { quote: "Don't judge each day by the harvest you reap but by the seeds that you plant.", author: "Robert Louis Stevenson" },
  { quote: "The only impossible journey is the one you never begin.", author: "Tony Robbins" },
  { quote: "Life is either a daring adventure or nothing.", author: "Helen Keller" },
  { quote: "In the middle of every difficulty lies opportunity.", author: "Albert Einstein" },
  { quote: "Believe in yourself! Have faith in your abilities! Without a humble but reasonable confidence in your own powers you cannot be successful or happy.", author: "Norman Vincent Peale" },
  { quote: "The future starts today, not tomorrow.", author: "Pope John Paul II" },
  { quote: "A winner is a dreamer who never gives up.", author: "Nelson Mandela" },
  { quote: "The only way to achieve the impossible is to believe it is possible.", author: "Charles Kingsleigh" },
  { quote: "Hardships often prepare ordinary people for an extraordinary destiny.", author: "C.S. Lewis" },
  { quote: "Don't let yesterday take up too much of today.", author: "Will Rogers" },
  { quote: "We generate fears while we sit. We overcome them by action.", author: "Dr. Henry Link" },
  { quote: "The man who has confidence in himself gains the confidence of others.", author: "Hasidic Proverb" },
  { quote: "Fake it until you make it! Act as if you had all the confidence you require until it becomes your reality.", author: "Brian Tracy" },
  { quote: "We may encounter many defeats but we must not be defeated.", author: "Maya Angelou" },
  { quote: "Knowing is not enough; we must apply. Wishing is not enough; we must do.", author: "Johann Wolfgang Von Goethe" },
  { quote: "Imagine your life is perfect in every respect; what would it look like?", author: "Brian Tracy" },
  { quote: "Security is mostly a superstition. Life is either a daring adventure or nothing.", author: "Helen Keller" },
  { quote: "The best way to predict the future is to create it.", author: "Peter Drucker" },
  { quote: "Develop success from failures. Discouragement and failure are two of the surest stepping stones to success.", author: "Dale Carnegie" },
  { quote: "Action is the foundational key to all success.", author: "Pablo Picasso" },
  { quote: "Don't wish it were easier. Wish you were better.", author: "Jim Rohn" },
  { quote: "I attribute my success to this: I never gave or took any excuse.", author: "Florence Nightingale" },
  { quote: "If you want something you've never had, you must be willing to do something you've never done.", author: "Thomas Jefferson" },
  { quote: "The difference between ordinary and extraordinary is that little extra.", author: "Jimmy Johnson" },
  { quote: "Great things are done by a series of small things brought together.", author: "Vincent Van Gogh" },
  { quote: "The only person you should try to be better than is the person you were yesterday.", author: "Anonymous" },
  { quote: "Success is the sum of small efforts, repeated day in and day out.", author: "Robert Collier" },
  { quote: "Don't stop when you're tired. Stop when you're done.", author: "Anonymous" },
  { quote: "Persistence guarantees that results are inevitable.", author: "Paramahansa Yogananda" },
  { quote: "Energy and persistence conquer all things.", author: "Benjamin Franklin" },
  { quote: "Character cannot be developed in ease and quiet. Only through experience of trial and suffering can the soul be strengthened.", author: "Helen Keller" },
  { quote: "The greatest weapon against stress is the ability to choose one thought over another.", author: "William James" },
  { quote: "Tough times never last, but tough people do.", author: "Robert H. Schuller" },
  { quote: "Problems are not stop signs, they are guidelines.", author: "Robert H. Schuller" },
  { quote: "Be the change that you wish to see in the world.", author: "Mahatma Gandhi" },
  { quote: "Happiness depends upon ourselves.", author: "Aristotle" },
  { quote: "It always seems impossible until it's done.", author: "Nelson Mandela" },
  { quote: "The best preparation for tomorrow is doing your best today.", author: "H. Jackson Brown Jr." },
  { quote: "Keep your face always toward the sunshine—and shadows will fall behind you.", author: "Walt Whitman" },
  { quote: "What you get by achieving your goals is not as important as what you become by achieving your goals.", author: "Zig Ziglar" },
  { quote: "Small daily improvements are the key to staggering long-term results.", author: "Anonymous" },
  { quote: "Discipline is the bridge between goals and accomplishment.", author: "Jim Rohn" },
  { quote: "Focus on being productive instead of busy.", author: "Tim Ferriss" },
  { quote: "The secret of getting ahead is getting started.", author: "Mark Twain" },
  { quote: "Quality is not an act, it is a habit.", author: "Aristotle" },
  { quote: "The harder you work for something, the greater you'll feel when you achieve it.", author: "Anonymous" },
  { quote: "Dream it. Wish it. Do it.", author: "Anonymous" },
  { quote: "Success doesn't just find you. You have to go out and get it.", author: "Anonymous" },
  { quote: "The key to success is to focus on goals, not obstacles.", author: "Anonymous" },
  { quote: "Dream bigger. Do bigger.", author: "Anonymous" },
  { quote: "Don't watch the clock; do what it does. Keep going.", author: "Sam Levenson" },
  { quote: "A goal without a plan is just a wish.", author: "Antoine de Saint-Exupéry" },
  { quote: "Set your goals high, and don't stop till you get there.", author: "Bo Jackson" },
  { quote: "Your limitation—it's only your imagination.", author: "Anonymous" },
  { quote: "Push yourself, because no one else is going to do it for you.", author: "Anonymous" },
  { quote: "Great things never come from comfort zones.", author: "Anonymous" },
  { quote: "Dream it. Believe it. Build it.", author: "Anonymous" },
  { quote: "Success is what happens after you have survived all your mistakes.", author: "Anonymous" },
  { quote: "The struggle you're in today is developing the strength you need tomorrow.", author: "Robert Tew" },
  { quote: "Every champion was once a contender that refused to give up.", author: "Rocky Balboa" },
  { quote: "Pain is temporary. Quitting lasts forever.", author: "Lance Armstrong" },
  { quote: "The mind is everything. What you think you become.", author: "Buddha" },
  { quote: "With the new day comes new strength and new thoughts.", author: "Eleanor Roosevelt" },
  { quote: "First they ignore you, then they laugh at you, then they fight you, then you win.", author: "Mahatma Gandhi" },
  { quote: "Success is liking yourself, liking what you do, and liking how you do it.", author: "Maya Angelou" },
  { quote: "Don't count the days, make the days count.", author: "Muhammad Ali" },
  { quote: "The man who moves a mountain begins by carrying away small stones.", author: "Confucius" },
  { quote: "Everything you've ever wanted is on the other side of fear.", author: "George Addair" },
  { quote: "Opportunities don't happen. You create them.", author: "Chris Grosser" },
  { quote: "It does not matter how slowly you go as long as you do not stop.", author: "Confucius" },
  { quote: "Too many of us are not living our dreams because we are living our fears.", author: "Les Brown" },
  { quote: "I learned that courage was not the absence of fear, but the triumph over it.", author: "Nelson Mandela" },
  { quote: "The greatest discovery of all time is that a person can change his future by merely changing his attitude.", author: "Oprah Winfrey" },
  { quote: "Perseverance is not a long race; it is many short races one after the other.", author: "Walter Elliot" },
  { quote: "The difference between try and triumph is just a little umph!", author: "Marvin Phillips" },
  { quote: "You are never too old to set another goal or to dream a new dream.", author: "C.S. Lewis" },
  { quote: "Stay hungry, stay foolish.", author: "Steve Jobs" },
  { quote: "There are no shortcuts to any place worth going.", author: "Beverly Sills" },
  { quote: "Do what you love, and you'll never work a day in your life.", author: "Confucius" },
  { quote: "Don't be pushed around by the fears in your mind. Be led by the dreams in your heart.", author: "Roy T. Bennett" },
  { quote: "You don't have to be great to start, but you have to start to be great.", author: "Zig Ziglar" },
  { quote: "The only limit to our realization of tomorrow is our doubts of today.", author: "Franklin D. Roosevelt" },
  { quote: "Every morning we are born again. What we do today matters most.", author: "Buddha" },
];

const STORAGE_KEY = 'cron_results';
const MAX_RESULTS = 100;
const JOB_NAME = 'Daily Motivational Message';

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
      console.error('[DailyMotivational] Redis Client Error:', err);
    });
    
    await client.connect();
    redisClient = client;
    return client;
  } catch (error) {
    console.error('[DailyMotivational] Failed to connect to Redis:', error);
    return null;
  }
}

/**
 * Get a deterministic daily quote based on the current date
 * Uses a seeded random approach for variety while ensuring
 * the same quote is returned throughout the day
 */
function getDailyQuote(): { quote: string; author: string; index: number } {
  const now = new Date();
  
  // Create a date string YYYYMMDD for consistent daily seeding
  const dateStr = now.toISOString().split('T')[0].replace(/-/g, '');
  const dateNum = parseInt(dateStr, 10);
  
  // Simple pseudo-random generator seeded by date
  // This ensures the same quote is selected all day, but different each day
  const seed = dateNum * 9301 + 49297;
  const randomIndex = seed % QUOTES.length;
  
  const selected = QUOTES[Math.abs(randomIndex)];
  
  return {
    quote: selected.quote,
    author: selected.author,
    index: Math.abs(randomIndex)
  };
}

/**
 * Post result directly to Redis
 * Bypasses HTTP call to avoid timeout issues
 */
async function postToCronResults(
  jobName: string,
  content: string,
  type: 'market' | 'motivational' | 'check-in' | 'review' | 'error' = 'motivational'
): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    const redis = await getRedisClient();
    
    if (!redis) {
      return { success: false, error: 'Redis unavailable' };
    }

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

    console.log(`[DailyMotivational] Posted results for job: ${jobName}`);
    return { success: true, id: newResult.id };
  } catch (error) {
    console.error('[DailyMotivational] Failed to post cron results:', error);
    return { success: false, error: String(error) };
  }
}

/**
 * Log activity to activity log
 */
async function logActivity(
  action: string,
  details: string
): Promise<void> {
  try {
    const redis = await getRedisClient();
    if (!redis) return;

    const ACTIVITY_KEY = 'activity_log';
    const data = await redis.get(ACTIVITY_KEY);
    const activities: Array<{
      id: string;
      timestamp: string;
      action: string;
      details: string;
      type: string;
    }> = data ? JSON.parse(data) : [];

    const newActivity = {
      id: Date.now().toString(),
      timestamp: new Date().toISOString(),
      action,
      details,
      type: 'cron'
    };

    activities.push(newActivity);
    if (activities.length > 25) {
      activities.shift();
    }

    await redis.set(ACTIVITY_KEY, JSON.stringify(activities));
  } catch (error) {
    console.error('[DailyMotivational] Failed to log activity:', error);
  }
}

export async function GET() {
  const startTime = Date.now();
  
  try {
    console.log('[DailyMotivational] Generating daily motivational message...');
    
    // Get today's quote using date-based selection
    const { quote, author, index } = getDailyQuote();
    
    // Format the message
    const content = `💡 **Daily Motivational Message** — ${new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric'
    })}

"${quote}"

— ${author}

*Quote #${index + 1} of ${QUOTES.length}*`;

    // Post to cron results (direct Redis write, no HTTP timeout risk)
    const postResult = await postToCronResults(JOB_NAME, content, 'motivational');
    
    if (!postResult.success) {
      throw new Error(`Failed to post results: ${postResult.error}`);
    }
    
    // Log success
    await logActivity(
      'Daily Motivational Message Generated',
      `Quote #${index + 1} by ${author}`
    );
    
    const duration = Date.now() - startTime;
    console.log(`[DailyMotivational] Message generated in ${duration}ms`);
    
    return NextResponse.json({
      success: true,
      data: {
        quote,
        author,
        quoteIndex: index + 1,
        totalQuotes: QUOTES.length,
        durationMs: duration
      }
    });
    
  } catch (error) {
    console.error('[DailyMotivational] Error:', error);
    
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    // Log failure
    await logActivity(
      'Daily Motivational Message Failed',
      errorMessage
    );
    
    return NextResponse.json({
      success: false,
      error: 'Failed to generate motivational message',
      message: errorMessage
    }, { status: 500 });
  }
}

export async function POST() {
  // POST and GET do the same thing - support both for flexibility
  return GET();
}
