import { NextResponse } from 'next/server';
import { readFile, stat, readdir } from 'fs/promises';
import { join } from 'path';

export interface SubagentStatus {
  sessionKey: string;
  task: string;
  status: 'working' | 'in_progress' | 'completed' | 'failed';
  startedAt: string;
  lastUpdated: string;
}

const SESSIONS_DIR = '/home/clawd/.openclaw/agents/main/sessions';
const SESSIONS_JSON = join(SESSIONS_DIR, 'sessions.json');

interface SessionMapping {
  sessionId: string;
  updatedAt: number;
  [key: string]: any;
}

interface SessionsJson {
  [sessionKey: string]: SessionMapping;
}

async function readSessionsJson(): Promise<SessionsJson> {
  try {
    const data = await readFile(SESSIONS_JSON, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Failed to read sessions.json:', error);
    return {};
  }
}

async function isSessionActive(sessionId: string): Promise<boolean> {
  try {
    await stat(join(SESSIONS_DIR, `${sessionId}.jsonl.lock`));
    return true;
  } catch {
    return false;
  }
}

async function getSessionFileModifiedTime(sessionId: string): Promise<Date | null> {
  try {
    const stats = await stat(join(SESSIONS_DIR, `${sessionId}.jsonl`));
    return stats.mtime;
  } catch {
    return null;
  }
}

function extractTaskFromMessage(content: string): string {
  // Try to extract task name from common patterns
  const taskMatch = content.match(/## Task:\s*(.+?)(?:\n|$)/);
  if (taskMatch) {
    return taskMatch[1].trim();
  }
  
  // Fallback: extract first line that looks like a task
  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('[') && !trimmed.startsWith('##')) {
      return trimmed.substring(0, 100); // Limit length
    }
  }
  
  return 'Unknown Task';
}

async function getSessionTask(sessionId: string): Promise<{ task: string; startedAt: string } | null> {
  try {
    const filePath = join(SESSIONS_DIR, `${sessionId}.jsonl`);
    const data = await readFile(filePath, 'utf-8');
    const lines = data.split('\n').filter(line => line.trim());
    
    if (lines.length === 0) return null;
    
    // Parse first line to get session start time
    const firstLine = JSON.parse(lines[0]);
    const startedAt = firstLine.timestamp || new Date().toISOString();
    
    // Look for the first user message to extract task
    for (const line of lines) {
      try {
        const event = JSON.parse(line);
        if (event.type === 'message' && event.message?.role === 'user') {
          const content = event.message.content;
          if (Array.isArray(content)) {
            for (const item of content) {
              if (item.type === 'text' && item.text) {
                const task = extractTaskFromMessage(item.text);
                if (task !== 'Unknown Task') {
                  return { task, startedAt };
                }
              }
            }
          } else if (typeof content === 'string') {
            const task = extractTaskFromMessage(content);
            if (task !== 'Unknown Task') {
              return { task, startedAt };
            }
          }
        }
      } catch {
        // Skip malformed lines
        continue;
      }
    }
    
    return { task: 'Unknown Task', startedAt };
  } catch (error) {
    console.error(`Failed to read session ${sessionId}:`, error);
    return null;
  }
}

export async function GET() {
  try {
    const sessions = await readSessionsJson();
    const subagents: SubagentStatus[] = [];
    
    // Find all subagent sessions (keys containing 'subagent')
    for (const [sessionKey, sessionData] of Object.entries(sessions)) {
      if (!sessionKey.includes('subagent')) continue;
      
      const sessionId = sessionData.sessionId;
      if (!sessionId) continue;
      
      // Check if session is active (has lock file)
      const isActive = await isSessionActive(sessionId);
      
      // Get task from session file
      const sessionInfo = await getSessionTask(sessionId);
      
      if (sessionInfo) {
        // Get last modified time for lastUpdated
        const lastModified = await getSessionFileModifiedTime(sessionId);
        
        subagents.push({
          sessionKey,
          task: sessionInfo.task,
          status: isActive ? 'working' : 'completed',
          startedAt: sessionInfo.startedAt,
          lastUpdated: lastModified?.toISOString() || new Date().toISOString()
        });
      }
    }

    // Sort by lastUpdated (newest first)
    subagents.sort((a, b) => 
      new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime()
    );

    return NextResponse.json({
      success: true,
      data: subagents,
      count: subagents.length,
      activeCount: subagents.filter(s => s.status === 'working' || s.status === 'in_progress').length
    });
  } catch (error) {
    console.error('Subagent status GET error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch subagent status'
    }, { status: 500 });
  }
}

export async function POST(request: Request) {
  // For backwards compatibility, accept POST but store in memory only
  // since we now read from session files directly
  try {
    const body = await request.json();
    const { sessionKey, task, status } = body;

    if (!sessionKey) {
      return NextResponse.json({
        success: false,
        error: 'sessionKey is required'
      }, { status: 400 });
    }

    // Return success but note that we now read from session files
    return NextResponse.json({
      success: true,
      message: 'Subagent status is now read from session files directly. POST is deprecated.',
      data: {
        sessionKey,
        task: task || 'Unknown',
        status: status || 'working',
        startedAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Subagent status POST error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to process subagent status'
    }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionKey = searchParams.get('sessionKey');

    if (!sessionKey) {
      return NextResponse.json({
        success: false,
        error: 'sessionKey is required'
      }, { status: 400 });
    }

    // Note: We can't delete session files from the API
    // The session will naturally expire when the process ends
    return NextResponse.json({
      success: true,
      message: `Subagent ${sessionKey} removed from tracking (session files remain until process ends)`
    });
  } catch (error) {
    console.error('Subagent status DELETE error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to remove subagent'
    }, { status: 500 });
  }
}
