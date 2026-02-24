import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth-config';
import { getUserId, getGoalsKey } from '@/lib/db/user-data';
import { getRedisClient } from '@/lib/redis';

type Category = 'yearly' | 'weekly' | 'daily' | 'collaborative';

interface ActionItem {
  id: string;
  text: string;
  status: 'pending' | 'in-progress' | 'completed';
  createdAt: string;
}

interface Goal {
  id: string;
  title: string;
  phase: 'not-started' | 'in-progress' | 'achieved';
  category: Category;
  notes?: string;
  junoAssisted?: boolean;
  actionItems?: ActionItem[];
  source?: 'mj' | 'juno' | 'subagent';  // Who created this goal
  dueDate?: string;  // ISO date string for goal deadline
  createdAt?: string; // ISO timestamp when goal was created
}

interface GoalsData {
  yearly: Goal[];
  weekly: Goal[];
  daily: Goal[];
  collaborative: Goal[];  // Tasks/Projects involving MJ, Juno, and subagents
}

// Default goals structure
const DEFAULT_GOALS: GoalsData = {
  yearly: [],
  weekly: [],
  daily: [],
  collaborative: []
};

// Helper function to validate category
function isValidCategory(cat: string): cat is Category {
  return cat === 'yearly' || cat === 'weekly' || cat === 'daily' || cat === 'collaborative';
}

export async function GET() {
  try {
    const session = await auth();
    
    if (!session?.user?.email) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    const userId = getUserId(session.user.email);
    const redis = await getRedisClient();
    
    const storageKey = getGoalsKey(userId);
    let goals = DEFAULT_GOALS;
    
    if (redis) {
      const stored = await redis.get(storageKey);
      if (stored) {
        goals = JSON.parse(stored);
        // Ensure all categories exist (migration for old data)
        if (!goals.collaborative) goals.collaborative = [];
        if (!goals.yearly) goals.yearly = [];
        if (!goals.weekly) goals.weekly = [];
        if (!goals.daily) goals.daily = [];
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
    const session = await auth();
    
    if (!session?.user?.email) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    const userId = getUserId(session.user.email);
    const body = await request.json();
    const { goalId, newPhase, category, notes, junoAssisted, actionItems, title, dueDate } = body;
    
    if (!goalId || !category) {
      return NextResponse.json({
        success: false,
        error: 'Missing required fields'
      }, { status: 400 });
    }

    // Validate category
    if (!isValidCategory(category)) {
      return NextResponse.json({
        success: false,
        error: 'Invalid category'
      }, { status: 400 });
    }

    const redis = await getRedisClient();
    const storageKey = getGoalsKey(userId);
    
    // Get current goals
    let goals = DEFAULT_GOALS;
    if (redis) {
      const stored = await redis.get(storageKey);
      if (stored) {
        goals = JSON.parse(stored);
      }
    }
    
    // Update the goal
    const goalIndex = goals[category].findIndex((g: Goal) => g.id === goalId);
    if (goalIndex === -1) {
      return NextResponse.json({
        success: false,
        error: 'Goal not found'
      }, { status: 404 });
    }
    
    // Update phase if provided
    if (newPhase) {
      goals[category][goalIndex].phase = newPhase;
    }
    
    // Update notes if provided
    if (notes !== undefined) {
      goals[category][goalIndex].notes = notes;
    }

    // Update junoAssisted if provided
    if (junoAssisted !== undefined) {
      goals[category][goalIndex].junoAssisted = junoAssisted;
    }

    // Update actionItems if provided
    if (actionItems !== undefined) {
      goals[category][goalIndex].actionItems = actionItems;
    }
    
    // Update title if provided
    if (title !== undefined) {
      goals[category][goalIndex].title = title;
    }

    // Update dueDate if provided
    if (dueDate !== undefined) {
      goals[category][goalIndex].dueDate = dueDate;
    }
    
    // Save to Redis
    if (redis) {
      await redis.set(storageKey, JSON.stringify(goals));
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
    const session = await auth();
    
    if (!session?.user?.email) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    const userId = getUserId(session.user.email);
    const body = await request.json();
    const { title, category, notes, phase, junoAssisted, actionItems, id, source, dueDate } = body;
    
    if (!title || !category) {
      return NextResponse.json({
        success: false,
        error: 'Missing required fields'
      }, { status: 400 });
    }

    // Validate category
    if (!isValidCategory(category)) {
      return NextResponse.json({
        success: false,
        error: 'Invalid category'
      }, { status: 400 });
    }

    const redis = await getRedisClient();
    const storageKey = getGoalsKey(userId);
    
    // Get current goals
    let goals = DEFAULT_GOALS;
    if (redis) {
      const stored = await redis.get(storageKey);
      if (stored) {
        goals = JSON.parse(stored);
        // Ensure all categories exist (fix for corrupted data)
        if (!goals.collaborative) goals.collaborative = [];
        if (!goals.yearly) goals.yearly = [];
        if (!goals.weekly) goals.weekly = [];
        if (!goals.daily) goals.daily = [];
      }
    }
    
    // Determine source - MJ-created goals default to 'mj', unless explicitly set
    const goalSource: 'mj' | 'juno' | 'subagent' = source || 'mj';
    
    // Auto-categorize collaborative goals
    const finalCategory = goalSource !== 'mj' ? 'collaborative' : category;
    
    // Add new goal (or restore with existing ID)
    const newGoal: Goal = {
      id: id || `${finalCategory[0]}${Date.now()}`,
      title,
      phase: phase || 'not-started',
      category: finalCategory,
      notes: notes || undefined,
      junoAssisted: junoAssisted || goalSource !== 'mj',
      actionItems: actionItems || undefined,
      source: goalSource,
      dueDate: dueDate || undefined,
      createdAt: new Date().toISOString()
    };
    
    goals[finalCategory].push(newGoal);
    
    // Save to Redis
    if (redis) {
      await redis.set(storageKey, JSON.stringify(goals));
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
    const session = await auth();
    
    if (!session?.user?.email) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    const userId = getUserId(session.user.email);
    const { searchParams } = new URL(request.url);
    const goalId = searchParams.get('goalId');
    const category = searchParams.get('category');
    
    if (!goalId || !category) {
      return NextResponse.json({
        success: false,
        error: 'Missing required fields'
      }, { status: 400 });
    }

    // Validate category
    if (!isValidCategory(category)) {
      return NextResponse.json({
        success: false,
        error: 'Invalid category'
      }, { status: 400 });
    }

    const redis = await getRedisClient();
    const storageKey = getGoalsKey(userId);
    
    // Get current goals
    let goals = DEFAULT_GOALS;
    if (redis) {
      const stored = await redis.get(storageKey);
      if (stored) {
        goals = JSON.parse(stored);
        // Ensure all categories exist (migration for old data)
        if (!goals.collaborative) goals.collaborative = [];
        if (!goals.yearly) goals.yearly = [];
        if (!goals.weekly) goals.weekly = [];
        if (!goals.daily) goals.daily = [];
      }
    }
    
    // Remove goal
    goals[category] = goals[category].filter((g: Goal) => g.id !== goalId);
    
    // Save to Redis
    if (redis) {
      await redis.set(storageKey, JSON.stringify(goals));
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

export async function PATCH(request: Request) {
  try {
    const session = await auth();
    
    if (!session?.user?.email) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    const userId = getUserId(session.user.email);
    const body = await request.json();
    const { goalId, fromCategory, toCategory } = body;
    
    if (!goalId || !fromCategory || !toCategory) {
      return NextResponse.json({
        success: false,
        error: 'Missing required fields'
      }, { status: 400 });
    }

    // Validate categories
    if (!isValidCategory(fromCategory) || !isValidCategory(toCategory)) {
      return NextResponse.json({
        success: false,
        error: 'Invalid category'
      }, { status: 400 });
    }

    const redis = await getRedisClient();
    const storageKey = getGoalsKey(userId);
    
    // Get current goals
    let goals = DEFAULT_GOALS;
    if (redis) {
      const stored = await redis.get(storageKey);
      if (stored) {
        goals = JSON.parse(stored);
      }
    }
    
    // Find and remove goal from source category
    const goalIndex = goals[fromCategory].findIndex((g: Goal) => g.id === goalId);
    if (goalIndex === -1) {
      return NextResponse.json({
        success: false,
        error: 'Goal not found in source category'
      }, { status: 404 });
    }
    
    // Get the goal and update its category
    const goal = goals[fromCategory][goalIndex];
    goal.category = toCategory;
    
    // Remove from source and add to target
    goals[fromCategory].splice(goalIndex, 1);
    goals[toCategory].push(goal);
    
    // Save to Redis
    if (redis) {
      await redis.set(storageKey, JSON.stringify(goals));
    }

    return NextResponse.json({
      success: true,
      data: goals,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Goal move error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to move goal'
    }, { status: 500 });
  }
}