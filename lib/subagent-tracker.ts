// lib/subagent-tracker.ts
// Helper to auto-register subagents when spawning

// Base URL for API calls - works in both client and server contexts
const API_BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://juno-mission-control.vercel.app';

interface SubagentRegistration {
  sessionKey: string;
  task: string;
  status: 'working' | 'in_progress' | 'completed' | 'failed';
}

/**
 * Register a new subagent with the tracking system
 * Call this immediately after spawning a subagent
 * Uses the dedicated subagent-register endpoint for Redis storage
 */
export async function registerSubagent(
  sessionKey: string,
  task: string,
  status: 'working' | 'in_progress' = 'working'
): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/subagent-register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sessionKey,
        task,
        status,
      }),
    });

    const data = await response.json();
    return data.success;
  } catch (error) {
    console.error('Failed to register subagent:', error);
    return false;
  }
}

/**
 * Update subagent status (e.g., when work progresses or completes)
 * Uses the /api/subagents endpoint for status updates
 */
export async function updateSubagentStatus(
  sessionKey: string,
  status: 'working' | 'in_progress' | 'completed' | 'failed',
  task?: string
): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/subagents`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sessionKey,
        task: task || 'Updated task',
        status,
      }),
    });

    const data = await response.json();
    return data.success;
  } catch (error) {
    console.error('Failed to update subagent status:', error);
    return false;
  }
}

/**
 * Remove a subagent from tracking (optional cleanup)
 */
export async function unregisterSubagent(sessionKey: string): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/subagents?sessionKey=${encodeURIComponent(sessionKey)}`, {
      method: 'DELETE',
    });

    const data = await response.json();
    return data.success;
  } catch (error) {
    console.error('Failed to unregister subagent:', error);
    return false;
  }
}