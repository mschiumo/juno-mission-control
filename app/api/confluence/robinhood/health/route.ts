/**
 * Robinhood connection health check (owner-only, READ-ONLY).
 *
 * GET /api/confluence/robinhood/health
 *   → verifies the server-side Robinhood MCP transport + OAuth token by calling
 *     the read-only `get_accounts` tool. Places NO orders. Use it to confirm the
 *     live rail is wired before ever arming live execution.
 *
 * Every response carries `auth` — which credential path is live (presence and
 * enums only, never a secret) — and a failure carries a `hint` naming the next
 * concrete action. Without those, `configured: true` was the only signal, and
 * it is satisfied by a static token alone; a deployment that had silently
 * fallen back to one looked identical to a healthy OAuth setup.
 *
 * The check itself lives in lib/confluence/robinhood/health-check.ts, shared
 * with the weekday alert cron so this endpoint and the watchdog can never
 * disagree about what "connected" means.
 */

import { NextResponse } from 'next/server';
import { requireOwner } from '@/lib/auth-session';
import { checkRobinhoodHealth } from '@/lib/confluence/robinhood/health-check';

export async function GET(): Promise<NextResponse> {
  const { error } = await requireOwner();
  if (error) return error;

  const health = await checkRobinhoodHealth();
  return NextResponse.json({
    success: true,
    connected: health.connected,
    configured: health.configured,
    auth: health.auth,
    ...(health.accounts ? { accountCount: health.accounts.length, accounts: health.accounts } : {}),
    ...(health.error ? { error: health.error } : {}),
    ...(health.hint ? { hint: health.hint } : {}),
    ...(health.message ? { message: health.message } : {}),
  });
}
