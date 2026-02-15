import { NextResponse } from 'next/server';
import { readFile, stat } from 'fs/promises';
import { join } from 'path';

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

export async function GET() {
  try {
    const sessions = await readSessionsJson();
    let activeCount = 0;
    
    // Count active subagent sessions
    for (const [sessionKey, sessionData] of Object.entries(sessions)) {
      if (!sessionKey.includes('subagent')) continue;
      
      const sessionId = sessionData.sessionId;
      if (!sessionId) continue;
      
      if (await isSessionActive(sessionId)) {
        activeCount++;
      }
    }

    return NextResponse.json({
      success: true,
      count: activeCount,
      hasSubAgents: activeCount > 0,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Subagent status GET error:', error);
    return NextResponse.json({
      success: false,
      count: 0,
      hasSubAgents: false,
      error: 'Failed to fetch sub-agent status'
    }, { status: 500 });
  }
}
