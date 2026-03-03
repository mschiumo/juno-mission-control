import { NextResponse } from 'next/server';

interface Project {
  id: string;
  name: string;
  description: string;
  status: 'active' | 'paused' | 'completed' | 'planned';
  progress: number;
  startDate: string;
  targetDate?: string;
  category: string;
  milestones: Milestone[];
  recentActivity: ActivityItem[];
  metrics: {
    tasksCompleted: number;
    tasksTotal: number;
    hoursInvested: number;
    lastWorked: string;
  };
}

interface Milestone {
  id: string;
  title: string;
  completed: boolean;
  dueDate?: string;
}

interface ActivityItem {
  id: string;
  type: 'task' | 'note' | 'milestone' | 'commit';
  description: string;
  timestamp: string;
}

// Sample projects data - in production this would come from a database
const PROJECTS: Project[] = [
  {
    id: '1',
    name: 'Real World Solutions Book',
    description: 'A practical guide combining AI tools with human expertise for real-world problem solving.',
    status: 'active',
    progress: 35,
    startDate: '2026-01-15',
    targetDate: '2026-06-30',
    category: 'Writing',
    milestones: [
      { id: 'm1', title: 'Outline complete', completed: true },
      { id: 'm2', title: 'Chapter 1-3 drafts', completed: true },
      { id: 'm3', title: 'Chapter 4-6 drafts', completed: false, dueDate: '2026-03-15' },
      { id: 'm4', title: 'First edit pass', completed: false, dueDate: '2026-04-30' },
      { id: 'm5', title: 'Final manuscript', completed: false, dueDate: '2026-06-15' }
    ],
    recentActivity: [
      { id: 'a1', type: 'milestone', description: 'Completed Chapter 3 outline', timestamp: '2026-03-02T14:30:00Z' },
      { id: 'a2', type: 'task', description: 'Added case studies section', timestamp: '2026-03-01T10:15:00Z' },
      { id: 'a3', type: 'note', description: 'Research on AI implementation patterns', timestamp: '2026-02-28T16:45:00Z' }
    ],
    metrics: {
      tasksCompleted: 12,
      tasksTotal: 25,
      hoursInvested: 48,
      lastWorked: '2026-03-02T14:30:00Z'
    }
  },
  {
    id: '2',
    name: 'Content Automation',
    description: 'Automated content pipeline for blog posts, social media, and newsletters.',
    status: 'active',
    progress: 60,
    startDate: '2026-01-01',
    targetDate: '2026-04-15',
    category: 'Automation',
    milestones: [
      { id: 'm1', title: 'Research phase', completed: true },
      { id: 'm2', title: 'Workflow design', completed: true },
      { id: 'm3', title: 'Core automation built', completed: true },
      { id: 'm4', title: 'Integration testing', completed: false, dueDate: '2026-03-20' },
      { id: 'm5', title: 'Launch', completed: false, dueDate: '2026-04-15' }
    ],
    recentActivity: [
      { id: 'a1', type: 'commit', description: 'Added RSS feed parser', timestamp: '2026-03-03T09:00:00Z' },
      { id: 'a2', type: 'task', description: 'Configured webhook triggers', timestamp: '2026-03-02T11:20:00Z' },
      { id: 'a3', type: 'milestone', description: 'Core automation completed', timestamp: '2026-02-28T15:00:00Z' }
    ],
    metrics: {
      tasksCompleted: 18,
      tasksTotal: 22,
      hoursInvested: 72,
      lastWorked: '2026-03-03T09:00:00Z'
    }
  },
  {
    id: '3',
    name: 'Trading Dashboard',
    description: 'Comprehensive trading journal and analytics platform for tracking investments.',
    status: 'active',
    progress: 78,
    startDate: '2026-02-01',
    category: 'Development',
    milestones: [
      { id: 'm1', title: 'MVP design', completed: true },
      { id: 'm2', title: 'Trade import functionality', completed: true },
      { id: 'm3', title: 'Analytics dashboard', completed: true },
      { id: 'm4', title: 'Watchlist features', completed: true },
      { id: 'm5', title: 'Advanced reporting', completed: false, dueDate: '2026-03-30' }
    ],
    recentActivity: [
      { id: 'a1', type: 'commit', description: 'Fixed timezone consistency', timestamp: '2026-03-03T04:00:00Z' },
      { id: 'a2', type: 'task', description: 'Added favorites to watchlist', timestamp: '2026-03-02T20:30:00Z' },
      { id: 'a3', type: 'task', description: 'Implemented position calculator', timestamp: '2026-03-01T14:00:00Z' }
    ],
    metrics: {
      tasksCompleted: 31,
      tasksTotal: 35,
      hoursInvested: 96,
      lastWorked: '2026-03-03T04:00:00Z'
    }
  }
];

export async function GET() {
  try {
    // Calculate stats
    const totalProjects = PROJECTS.length;
    const activeProjects = PROJECTS.filter(p => p.status === 'active').length;
    const completedThisMonth = 0; // Would calculate based on completion dates
    const overallProgress = Math.round(
      PROJECTS.reduce((sum, p) => sum + p.progress, 0) / PROJECTS.length
    );
    
    return NextResponse.json({
      success: true,
      projects: PROJECTS,
      stats: {
        totalProjects,
        activeProjects,
        completedThisMonth,
        overallProgress
      }
    });
  } catch (error) {
    console.error('Projects API error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to load projects'
    }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    // In production, this would save to a database
    
    return NextResponse.json({
      success: true,
      message: 'Project created (mock)',
      project: body
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: 'Failed to create project'
    }, { status: 500 });
  }
}
