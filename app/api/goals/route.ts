import { NextResponse } from 'next/server';
import { createClient } from 'redis';

const STORAGE_KEY = 'goals_data';

// Type definitions
type Category = 'yearly' | 'weekly' | 'daily';

// Default goals structure
const DEFAULT_GOALS = {
  yearly: [
    { id: 'y1', title: 'Generate steady self-generated income', phase: 'in-progress', category: 'yearly' },
    { id: 'y2', title: 'Master physical health & fitness', phase: 'in-progress', category: 'yearly' },
    { id: 'y3', title: 'Launch KeepLiving brand', phase: 'not-started', category: 'yearly' },
    { id: 'y4', title: 'Move overseas successfully', phase: 'not-started', category: 'yearly' }
  ],
  weekly: [
    { id: 'w1', title: 'Lift 4x this week', phase: 'in-progress', category: 'weekly' },
    { id: 'w2', title: 'Run 5x this week', phase: 'in-progress', category: 'weekly' },
    { id: 'w3', title: 'Trade daily with discipline', phase: 'in-progress', category: 'weekly' },
    { id: 'w4', title: 'Publish 1 blog post', phase: 'not-started', category: 'weekly' }
  ],
  daily: [
    { id: 'd1', title: 'Make bed', phase: 'achieved', category: 'daily' },
    { id: 'd2', title: 'Take morning meds', phase: 'in-progress', category: 'daily' },
    { id: 'd3', title: 'Read market brief', phase: 'not-started', category: 'daily' },
    { id: 'd4', title: 'Exercise/Lift', phase: 'not-started', category: 'daily' }
  ]
};

// Lazy Redis client initialization
let redisClient: ReturnType<typeof createClient> | null = null;

// Helper function to validate category
function isValidCategory(cat: string): cat is Category {
  return ['yearly', 'weekly', 'daily'].includes(cat);
}

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
    const redis = await getRedisClient();
    
    let goals = DEFAULT_GOALS;
    
    if (redis) {
      const stored = await redis.get(STORAGE_KEY);
      if (stored) {
        goals = JSON.parse(stored);
      }
    }

    return NextResponse.json({
      success: true,
      data: goals,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Goals fetch error:', error);
    return NextResponse.json({
      success: true,
      data: DEFAULT_GOALS,
      timestamp: new Date().toISOString()
    });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { goalId, newPhase, category } = body;
    
    if (!goalId || !newPhase || !category || !isValidCategory(category)) {
      return NextResponse.json({
        success: false,
        error: 'Missing required fields or invalid category'
      }, { status: 400 });
    }

    const redis = await getRedisClient();
    
    // Get current goals
    let goals = DEFAULT_GOALS;
    if (redis) {
      const stored = await redis.get(STORAGE_KEY);
      if (stored) {
        goals = JSON.parse(stored);
      }
    }
    
    // Update the goal
    const goalIndex = goals[category].findIndex((g: { id: string }) => g.id === goalId);
    if (goalIndex === -1) {
      return NextResponse.json({
        success: false,
        error: 'Goal not found'
      }, { status: 404 });
    }
    
    goals[category][goalIndex].phase = newPhase;
    
    // Save to Redis
    if (redis) {
      await redis.set(STORAGE_KEY, JSON.stringify(goals));
    }

    return NextResponse.json({
      success: true,
      data: goals,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Goal update error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to update goal'
    }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { title, category } = body;
    
    if (!title || !category || !isValidCategory(category)) {
      return NextResponse.json({
        success: false,
        error: 'Missing required fields or invalid category'
      }, { status: 400 });
    }

    const redis = await getRedisClient();
    
    // Get current goals
    let goals = DEFAULT_GOALS;
    if (redis) {
      const stored = await redis.get(STORAGE_KEY);
      if (stored) {
        goals = JSON.parse(stored);
      }
    }
    
    // Add new goal
    const newGoal = {
      id: `${category[0]}${Date.now()}`,
      title,
      phase: 'not-started',
      category
    };
    
    goals[category].push(newGoal);
    
    // Save to Redis
    if (redis) {
      await redis.set(STORAGE_KEY, JSON.stringify(goals));
    }

    return NextResponse.json({
      success: true,
      data: goals,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Goal create error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to create goal'
    }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const goalId = searchParams.get('goalId');
    const category = searchParams.get('category');
    
    if (!goalId || !category || !isValidCategory(category)) {
      return NextResponse.json({
        success: false,
        error: 'Missing required fields or invalid category'
      }, { status: 400 });
    }

    const redis = await getRedisClient();
    
    // Get current goals
    let goals = DEFAULT_GOALS;
    if (redis) {
      const stored = await redis.get(STORAGE_KEY);
      if (stored) {
        goals = JSON.parse(stored);
      }
    }
    
    // Remove goal
    goals[category] = goals[category].filter((g: { id: string }) => g.id !== goalId);
    
    // Save to Redis
    if (redis) {
      await redis.set(STORAGE_KEY, JSON.stringify(goals));
    }

    return NextResponse.json({
      success: true,
      data: goals,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Goal delete error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to delete goal'
    }, { status: 500 });
  }
}
