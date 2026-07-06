/**
 * Robinhood connection health check (owner-only, READ-ONLY).
 *
 * GET /api/confluence/robinhood/health
 *   → verifies the server-side Robinhood MCP transport + OAuth token by calling
 *     the read-only `get_accounts` tool. Places NO orders. Use it to confirm the
 *     live rail is wired before ever arming live execution.
 */

import { NextResponse } from 'next/server';
import { requireOwner } from '@/lib/auth-session';
import { callRobinhoodTool, isRobinhoodConfigured } from '@/lib/confluence/robinhood/mcp-client';

interface RhAccount {
  account_number?: string;
  brokerage_account_type?: string;
  type?: string;
  nickname?: string;
  agentic_allowed?: boolean;
  is_default?: boolean;
}

function mask(n: string | undefined): string {
  if (!n) return '—';
  return n.length > 4 ? `••••${n.slice(-4)}` : n;
}

export async function GET(): Promise<NextResponse> {
  const { error } = await requireOwner();
  if (error) return error;

  if (!isRobinhoodConfigured()) {
    return NextResponse.json({
      success: true,
      connected: false,
      configured: false,
      message: 'Robinhood auth not configured (set ROBINHOOD_OAUTH_CLIENT_ID + ROBINHOOD_OAUTH_REFRESH_TOKEN).',
    });
  }

  try {
    const res = await callRobinhoodTool<{ data?: { accounts?: RhAccount[] } }>('get_accounts', {});
    const accounts = (res?.data?.accounts ?? []).map((a) => ({
      account: mask(a.account_number),
      type: a.brokerage_account_type || a.type,
      nickname: a.nickname,
      agentic_allowed: !!a.agentic_allowed,
      is_default: !!a.is_default,
    }));
    return NextResponse.json({ success: true, connected: true, configured: true, accountCount: accounts.length, accounts });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ success: true, connected: false, configured: true, error: message });
  }
}
