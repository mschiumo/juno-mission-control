import { NextResponse } from 'next/server';
import { createClient } from 'redis';

export interface AgentStatus {
  id: string;
  name: string;
  displayName: string;
  role: 'lead' | 'specialist' | 'placeholder';
  reportsTo: string | null;
  model: 'kimi' | 'sonnet' | 'gpt4' | 'other';
  modelVersion: string;
  specialty: string[];
  avatar: string;
  currentTask: {
    id: string;
    title: string;
    description: string;
    status: 'idle' | 'working' | 'completed' | 'failed';
    prUrl?: string;
    startedAt?: string;
    progress: number;
  } | null;
  stats: {
    activePrs: number;
    completedToday: number;
    totalCompleted: number;
    lastActivity: string;
  };
  isOnline: boolean;
}

const AGENT_KEY_PREFIX = 'agent:';
const AGENT_TTL_SECONDS = 30 * 60; // 30 minutes

// Lazy Redis client initialization
let redisClient: ReturnType<typeof createClient> | null = null;

async function getRedisClient() {
  if (redisClient) {
    return redisClient;
  }

  try {
    const client = createClient({
      url: process.env.REDIS_URL || undefined
    });

    client.on('error', (err) => {
      console.error('[Agent Status] Redis Client Error:', err.message);
    });

    await client.connect();
    redisClient = client;
    return client;
  } catch (error) {
    console.error('[Agent Status] Failed to connect to Redis:', error);
    return null;
  }
}

// Mock data for initial display
const getMockAgents = (): AgentStatus[] => [
  {
    id: 'juno',
    name: 'juno',
    displayName: 'Juno',
    role: 'lead',
    reportsTo: null,
    model: 'kimi',
    modelVersion: 'Kimi K2',
    specialty: ['Operations', 'Coordination', 'Strategy'],
    avatar: 'J',
    currentTask: {
      id: 'task-1',
      title: 'Dashboard Redesign',
      description: 'Redesigning Projects tab as AI Agency Org Chart',
      status: 'working',
      prUrl: 'https://github.com/mschiumo/juno-mission-control/pull/42',
      startedAt: new Date(Date.now() - 3600000).toISOString(),
      progress: 65
    },
    stats: {
      activePrs: 3,
      completedToday: 5,
      totalCompleted: 142,
      lastActivity: new Date(Date.now() - 300000).toISOString()
    },
    isOnline: true
  },
  {
    id: 'keepliving-shopify',
    name: 'keepliving-shopify',
    displayName: 'KeepLiving-Shopify',
    role: 'specialist',
    reportsTo: 'juno',
    model: 'sonnet',
    modelVersion: 'Claude Sonnet 4.6',
    specialty: ['E-commerce', 'Shopify', 'Liquid', 'React'],
    avatar: 'K',
    currentTask: {
      id: 'task-2',
      title: 'Store Optimization',
      description: 'Optimizing checkout flow and product pages',
      status: 'working',
      prUrl: 'https://github.com/mschiumo/keepliving-shopify/pull/15',
      startedAt: new Date(Date.now() - 7200000).toISOString(),
      progress: 40
    },
    stats: {
      activePrs: 2,
      completedToday: 3,
      totalCompleted: 89,
      lastActivity: new Date(Date.now() - 600000).toISOString()
    },
    isOnline: true
  },
  {
    id: 'content-creator',
    name: 'content-creator',
    displayName: 'Content-Creator',
    role: 'specialist',
    reportsTo: 'juno',
    model: 'sonnet',
    modelVersion: 'Claude Sonnet 4.6',
    specialty: ['Content Writing', 'SEO', 'Social Media', 'Copywriting'],
    avatar: 'C',
    currentTask: {
      id: 'task-3',
      title: 'Blog Post Series',
      description: 'Writing mental health awareness content',
      status: 'working',
      startedAt: new Date(Date.now() - 1800000).toISOString(),
      progress: 75
    },
    stats: {
      activePrs: 1,
      completedToday: 4,
      totalCompleted: 67,
      lastActivity: new Date(Date.now() - 900000).toISOString()
    },
    isOnline: true
  },
  {
    id: 'research-analyst',
    name: 'research-analyst',
    displayName: 'Research-Analyst',
    role: 'placeholder',
    reportsTo: 'juno',
    model: 'kimi',
    modelVersion: 'Kimi K2',
    specialty: ['Research', 'Analysis', 'Data Processing', 'Reports'],
    avatar: 'R',
    currentTask: null,
    stats: {
      activePrs: 0,
      completedToday: 0,
      totalCompleted: 0,
      lastActivity: new Date(Date.now() - 86400000).toISOString()
    },
    isOnline: false
  },
  {
    id: 'code-reviewer',
    name: 'code-reviewer',
    displayName: 'Code-Reviewer',
    role: 'placeholder',
    reportsTo: 'juno',
    model: 'sonnet',
    modelVersion: 'Claude Sonnet 4.6',
    specialty: ['Code Review', 'Testing', 'Quality Assurance', 'Documentation'],
    avatar: 'CR',
    currentTask: null,
    stats: {
      activePrs: 0,
      completedToday: 0,
      totalCompleted: 0,
      lastActivity: new Date(Date.now() - 86400000).toISOString()
    },
    isOnline: false
  }
];

export async function GET() {
  try {
    const redis = await getRedisClient();
    
    // If Redis is available, try to get real data
    if (redis) {
      try {
        const keys = await redis.keys(`${AGENT_KEY_PREFIX}*`);
        const agents: AgentStatus[] = [];

        for (const key of keys) {
          try {
            const data = await redis.get(key);
            if (data) {
              const agent = JSON.parse(data);
              agents.push(agent);
            }
          } catch (error) {
            console.error(`[Agent Status] Failed to parse agent data for ${key}:`, error);
          }
        }

        // If we have real data, return it
        if (agents.length > 0) {
          // Sort: leads first, then specialists, then placeholders
          const roleOrder = { lead: 0, specialist: 1, placeholder: 2 };
          agents.sort((a, b) => {
            if (roleOrder[a.role] !== roleOrder[b.role]) {
              return roleOrder[a.role] - roleOrder[b.role];
            }
            return new Date(b.stats.lastActivity).getTime() - new Date(a.stats.lastActivity).getTime();
          });

          return NextResponse.json({
            success: true,
            data: agents,
            count: agents.length,
            activeCount: agents.filter(a => a.isOnline).length,
            workingCount: agents.filter(a => a.currentTask?.status === 'working').length
          });
        }
      } catch (error) {
        console.error('[Agent Status] Redis fetch error:', error);
      }
    }

    // Return mock data if no Redis or no agents found
    const mockAgents = getMockAgents();
    return NextResponse.json({
      success: true,
      data: mockAgents,
      count: mockAgents.length,
      activeCount: mockAgents.filter(a => a.isOnline).length,
      workingCount: mockAgents.filter(a => a.currentTask?.status === 'working').length,
      isMockData: true
    });
  } catch (error) {
    console.error('Agent status GET error:', error);
    // Return mock data on error
    const mockAgents = getMockAgents();
    return NextResponse.json({
      success: true,
      data: mockAgents,
      count: mockAgents.length,
      activeCount: mockAgents.filter(a => a.isOnline).length,
      workingCount: mockAgents.filter(a => a.currentTask?.status === 'working').length,
      isMockData: true
    });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { 
      id, 
      currentTask, 
      stats,
      isOnline 
    } = body;

    if (!id) {
      return NextResponse.json({
        success: false,
        error: 'id is required'
      }, { status: 400 });
    }

    const redis = await getRedisClient();
    if (!redis) {
      return NextResponse.json({
        success: false,
        error: 'Redis connection failed'
      }, { status: 500 });
    }

    // Get existing agent or create new
    const existingData = await redis.get(`${AGENT_KEY_PREFIX}${id}`);
    const existing: Partial<AgentStatus> = existingData ? JSON.parse(existingData) : {};

    const agent: AgentStatus = {
      ...existing,
      id,
      currentTask: currentTask || existing.currentTask || null,
      stats: {
        ...existing.stats,
        ...stats,
        lastActivity: new Date().toISOString()
      },
      isOnline: isOnline !== undefined ? isOnline : existing.isOnline || true
    } as AgentStatus;

    await redis.setEx(
      `${AGENT_KEY_PREFIX}${id}`,
      AGENT_TTL_SECONDS,
      JSON.stringify(agent)
    );

    return NextResponse.json({ success: true, data: agent });
  } catch (error) {
    console.error('Agent status POST error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to update agent status'
    }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { id, taskId, status, progress, prUrl } = body;

    if (!id || !taskId) {
      return NextResponse.json({
        success: false,
        error: 'id and taskId are required'
      }, { status: 400 });
    }

    const redis = await getRedisClient();
    if (!redis) {
      return NextResponse.json({
        success: false,
        error: 'Redis connection failed'
      }, { status: 500 });
    }

    const existingData = await redis.get(`${AGENT_KEY_PREFIX}${id}`);
    if (!existingData) {
      return NextResponse.json({
        success: false,
        error: 'Agent not found'
      }, { status: 404 });
    }

    const agent: AgentStatus = JSON.parse(existingData);

    // Update current task
    if (agent.currentTask && agent.currentTask.id === taskId) {
      agent.currentTask.status = status || agent.currentTask.status;
      agent.currentTask.progress = progress !== undefined ? progress : agent.currentTask.progress;
      if (prUrl) agent.currentTask.prUrl = prUrl;
    }

    agent.stats.lastActivity = new Date().toISOString();

    await redis.setEx(
      `${AGENT_KEY_PREFIX}${id}`,
      AGENT_TTL_SECONDS,
      JSON.stringify(agent)
    );

    return NextResponse.json({ success: true, data: agent });
  } catch (error) {
    console.error('Agent status PUT error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to update task status'
    }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({
        success: false,
        error: 'id is required'
      }, { status: 400 });
    }

    const redis = await getRedisClient();
    if (!redis) {
      return NextResponse.json({
        success: false,
        error: 'Redis connection failed'
      }, { status: 500 });
    }

    await redis.del(`${AGENT_KEY_PREFIX}${id}`);

    return NextResponse.json({
      success: true,
      message: `Agent ${id} removed from tracking`
    });
  } catch (error) {
    console.error('Agent status DELETE error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to remove agent'
    }, { status: 500 });
  }
}
