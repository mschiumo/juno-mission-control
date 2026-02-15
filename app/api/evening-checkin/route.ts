import { NextResponse } from 'next/server';
import { createClient } from 'redis';

const STORAGE_KEY = 'evening_checkins';

// Evening habit check-in questions
const DEFAULT_QUESTIONS = [
  { id: 'worked-out', question: 'Did you work out / lift today?', category: 'fitness' },
  { id: 'ran', question: 'Did you run today?', category: 'fitness' },
  { id: 'read', question: 'Did you read today?', category: 'learning' },
  { id: 'journaled', question: 'Did you journal today?', category: 'mindfulness' },
  { id: 'traded', question: 'Did you trade today?', category: 'trading' },
  { id: 'made-bed', question: 'Did you make your bed today?', category: 'discipline' },
  { id: 'took-meds', question: 'Did you take your meds today?', category: 'health' },
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

function getToday() {
  const date = new Date().toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  // Format: MM/DD/YYYY → YYYY-MM-DD
  const [month, day, year] = date.split('/');
  return `${year}-${month}-${day}`;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date') || getToday();
    const range = searchParams.get('range') || '7'; // days for report

    const redis = await getRedisClient();
    
    if (!redis) {
      return NextResponse.json({ 
        success: false, 
        error: 'Redis not available' 
      }, { status: 503 });
    }

    const stored = await redis.get(STORAGE_KEY);
    const allCheckins = stored ? JSON.parse(stored) : [];

    // Filter by date range if specified
    const daysBack = parseInt(range, 10);
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysBack);
    
    const filteredCheckins = allCheckins.filter((c: { date: string }) => {
      const checkinDate = new Date(c.date);
      return checkinDate >= cutoffDate;
    });

    // Get today's checkin if exists
    const todayCheckin = allCheckins.find((c: { date: string }) => c.date === date);

    return NextResponse.json({
      success: true,
      data: {
        questions: DEFAULT_QUESTIONS,
        todayCheckin: todayCheckin || null,
        history: filteredCheckins,
        stats: calculateStats(filteredCheckins, DEFAULT_QUESTIONS)
      }
    });
  } catch (error) {
    console.error('Evening checkin GET error:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Failed to fetch checkin data' 
    }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { responses, notes } = body;

    if (!responses || typeof responses !== 'object') {
      return NextResponse.json({ 
        success: false, 
        error: 'responses object is required' 
      }, { status: 400 });
    }

    const redis = await getRedisClient();
    
    if (!redis) {
      return NextResponse.json({ 
        success: false, 
        error: 'Redis not available' 
      }, { status: 503 });
    }

    const today = getToday();
    const stored = await redis.get(STORAGE_KEY);
    const allCheckins = stored ? JSON.parse(stored) : [];

    // Check if already submitted today
    const existingIndex = allCheckins.findIndex((c: { date: string }) => c.date === today);

    const newCheckin = {
      date: today,
      timestamp: new Date().toISOString(),
      responses,
      notes: notes || '',
      completionRate: calculateCompletionRate(responses, DEFAULT_QUESTIONS)
    };

    if (existingIndex >= 0) {
      // Update existing
      allCheckins[existingIndex] = newCheckin;
    } else {
      // Add new
      allCheckins.push(newCheckin);
    }

    // Keep only last 90 days
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 90);
    const trimmedCheckins = allCheckins.filter((c: { date: string }) => {
      return new Date(c.date) >= cutoffDate;
    });

    await redis.set(STORAGE_KEY, JSON.stringify(trimmedCheckins));

    return NextResponse.json({
      success: true,
      data: newCheckin,
      message: existingIndex >= 0 ? 'Check-in updated' : 'Check-in recorded'
    });
  } catch (error) {
    console.error('Evening checkin POST error:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Failed to save checkin' 
    }, { status: 500 });
  }
}

interface Question {
  id: string;
  question: string;
  category: string;
}

function calculateCompletionRate(responses: Record<string, boolean>, questions: Question[]) {
  const total = questions.length;
  const completed = Object.values(responses).filter(Boolean).length;
  return Math.round((completed / total) * 100);
}

function calculateStats(checkins: { date: string; responses: Record<string, boolean>; completionRate: number }[], questions: Question[]) {
  if (checkins.length === 0) {
    return {
      totalCheckins: 0,
      averageCompletion: 0,
      streak: 0,
      byQuestion: {}
    };
  }

  // Calculate average completion rate
  const averageCompletion = Math.round(
    checkins.reduce((acc, c) => acc + (c.completionRate || 0), 0) / checkins.length
  );

  // Calculate streak (consecutive days with checkins)
  let streak = 0;
  const sortedDates = checkins.map(c => c.date).sort().reverse();
  const today = getToday();
  
  for (let i = 0; i < sortedDates.length; i++) {
    const expectedDate = new Date();
    expectedDate.setDate(expectedDate.getDate() - i);
    const expectedDateStr = expectedDate.toLocaleDateString('en-US', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).split('/').reverse().join('-');
    
    if (sortedDates[i] === expectedDateStr) {
      streak++;
    } else {
      break;
    }
  }

  // Calculate by question
  const byQuestion: Record<string, { yes: number; no: number; rate: number }> = {};
  
  questions.forEach(q => {
    const yes = checkins.filter(c => c.responses?.[q.id] === true).length;
    const no = checkins.filter(c => c.responses?.[q.id] === false).length;
    byQuestion[q.id] = {
      yes,
      no,
      rate: yes + no > 0 ? Math.round((yes / (yes + no)) * 100) : 0
    };
  });

  return {
    totalCheckins: checkins.length,
    averageCompletion,
    streak,
    byQuestion
  };
}