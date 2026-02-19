import { NextResponse } from 'next/server';
import { createClient } from 'redis';

export interface PR {
  url: string;
  title: string;
  number: number;
  branch: string;
  status: 'open' | 'draft' | 'ready';
  author: string;
  createdAt: string;
}

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
  prs: PR[];
  isOnline: boolean;
}

const AGENT_KEY_PREFIX = 'agent:';
const AGENT_TTL_SECONDS = 30 * 60; // 30 minutes
const PR_CACHE_KEY = 'github:prs';
const PR_CACHE_TTL_SECONDS = 5 * 60; // 5 minutes

// GitHub API configuration
const GITHUB_API_URL = 'https://api.github.com/repos/mschiumo/juno-mission-control/pulls?state=open';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

// Cache for PRs
let prCache: { data: PR[]; timestamp: number } | null = null;

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

// Fetch open PRs from GitHub API
async function fetchGitHubPRs(): Promise<PR[]> {
  try {
    console.log('[GitHub] Fetching open PRs...');
    
    const response = await fetch(GITHUB_API_URL, {
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Juno-Mission-Control'
      }
    });

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    const prs: PR[] = data.map((pr: any) => ({
      url: pr.html_url,
      title: pr.title,
      number: pr.number,
      branch: pr.head.ref,
      status: pr.draft ? 'draft' : (pr.mergeable_state === 'clean' ? 'ready' : 'open'),
      author: pr.user.login,
      createdAt: pr.created_at
    }));

    console.log(`[GitHub] Fetched ${prs.length} open PRs`);
    return prs;
  } catch (error) {
    console.error('[GitHub] Failed to fetch PRs:', error);
    return [];
  }
}

// Get PRs with caching (Redis + in-memory fallback)
async function getCachedPRs(): Promise<PR[]> {
  const now = Date.now();
  
  // Check in-memory cache first (fastest)
  if (prCache && (now - prCache.timestamp) < PR_CACHE_TTL_SECONDS * 1000) {
    console.log('[Cache] Using in-memory PR cache');
    return prCache.data;
  }

  // Try Redis cache
  const redis = await getRedisClient();
  if (redis) {
    try {
      const cached = await redis.get(PR_CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        const cacheAge = now - parsed.timestamp;
        
        if (cacheAge < PR_CACHE_TTL_SECONDS * 1000) {
          console.log('[Cache] Using Redis PR cache');
          prCache = parsed; // Update in-memory cache
          return parsed.data;
        }
      }
    } catch (error) {
      console.error('[Cache] Redis cache read error:', error);
    }
  }

  // Fetch fresh data from GitHub
  const prs = await fetchGitHubPRs();
  
  // Update caches
  prCache = { data: prs, timestamp: now };
  
  if (redis) {
    try {
      await redis.setEx(
        PR_CACHE_KEY,
        PR_CACHE_TTL_SECONDS,
        JSON.stringify(prCache)
      );
      console.log('[Cache] PRs cached in Redis');
    } catch (error) {
      console.error('[Cache] Failed to cache PRs in Redis:', error);
    }
  }

  return prs;
}

// Map PRs to agents based on rules
function mapPRsToAgent(agentId: string, prs: PR[]): PR[] {
  const junoAuthors = ['juno', 'mj', 'mschiumo'];
  
  switch (agentId) {
    case 'juno':
      // Juno: PRs by @juno, mj, or unassigned (default)
      return prs.filter(pr => 
        junoAuthors.includes(pr.author.toLowerCase()) ||
        (!pr.title.toLowerCase().includes('shopify') && 
         !pr.title.toLowerCase().includes('content') &&
         !pr.branch.toLowerCase().includes('shopify') &&
         !pr.branch.toLowerCase().includes('content'))
      );
      
    case 'keepliving-shopify':
      // Shopify agent: PRs with "shopify" in title or branch
      return prs.filter(pr => 
        pr.title.toLowerCase().includes('shopify') || 
        pr.branch.toLowerCase().includes('shopify')
      );
      
    case 'content-creator':
      // Content agent: PRs with "content" in title or branch
      return prs.filter(pr => 
        pr.title.toLowerCase().includes('content') || 
        pr.branch.toLowerCase().includes('content')
      );
      
    default:
      return [];
  }
}

// Mock data for initial display
const getMockAgents = async (): Promise<AgentStatus[]> => {
  // Fetch real PRs even for mock data
  const allPRs = await getCachedPRs();
  
  return [
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
        activePrs: mapPRsToAgent('juno', allPRs).length,
        completedToday: 5,
        totalCompleted: 142,
        lastActivity: new Date(Date.now() - 300000).toISOString()
      },
      prs: mapPRsToAgent('juno', allPRs),
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
        activePrs: mapPRsToAgent('keepliving-shopify', allPRs).length,
        completedToday: 3,
        totalCompleted: 89,
        lastActivity: new Date(Date.now() - 600000).toISOString()
      },
      prs: mapPRsToAgent('keepliving-shopify', allPRs),
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
        activePrs: mapPRsToAgent('content-creator', allPRs).length,
        completedToday: 4,
        totalCompleted: 67,
        lastActivity: new Date(Date.now() - 900000).toISOString()
      },
      prs: mapPRsToAgent('content-creator', allPRs),
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
      prs: [],
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
      prs: [],
      isOnline: false
    }
  ];
};

export async function GET() {
  try {
    const redis = await getRedisClient();
    const allPRs = await getCachedPRs();
    
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
              // Map PRs to this agent
              agent.prs = mapPRsToAgent(agent.id, allPRs);
              agent.stats.activePrs = agent.prs.length;
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
            workingCount: agents.filter(a => a.currentTask?.status === 'working').length,
            prs: allPRs
          });
        }
      } catch (error) {
        console.error('[Agent Status] Redis fetch error:', error);
      }
    }

    // Return mock data if no Redis or no agents found
    const mockAgents = await getMockAgents();
    return NextResponse.json({
      success: true,
      data: mockAgents,
      count: mockAgents.length,
      activeCount: mockAgents.filter(a => a.isOnline).length,
      workingCount: mockAgents.filter(a => a.currentTask?.status === 'working').length,
      prs: allPRs,
      isMockData: true
    });
  } catch (error) {
    console.error('Agent status GET error:', error);
    // Return mock data on error
    const mockAgents = await getMockAgents();
    return NextResponse.json({
      success: true,
      data: mockAgents,
      count: mockAgents.length,
      activeCount: mockAgents.filter(a => a.isOnline).length,
      workingCount: mockAgents.filter(a => a.currentTask?.status === 'working').length,
      prs: [],
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
