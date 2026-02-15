// utils/subagent-tracker.ts
// Helper to auto-register subagents when spawning

interface SubagentRegistration {
  sessionKey: string;
  task: string;
  status: 'working' | 'in_progress' | 'completed' | 'failed';
}

/**
 * Register a new subagent with the tracking system
 * Call this immediately after spawning a subagent
 */
export async function registerSubagent(
  sessionKey: string,
  task: string,
  status: 'working' | 'in_progress' = 'working'
): Promise<boolean> {
  try {
    const response = await fetch('/api/subagents', {
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
 */
export async function updateSubagentStatus(
  sessionKey: string,
  status: 'working' | 'in_progress' | 'completed' | 'failed',
  task?: string
): Promise<boolean> {
  try {
    const response = await fetch('/api/subagents', {
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
    const response = await fetch(`/api/subagents?sessionKey=${sessionKey}`, {
      method: 'DELETE',
    });

    const data = await response.json();
    return data.success;
  } catch (error) {
    console.error('Failed to unregister subagent:', error);
    return false;
  }
}