/**
 * Crypto trading agent cron tick (every 10 minutes, see vercel.json).
 *
 * Every tick:
 *   1. Manage open positions — hard stops, take-profit ladder rungs, trailing
 *      stops. This ALWAYS runs (exits are risk-reducing and must not depend on
 *      the agent being enabled).
 *   2. If auto-trade is enabled AND the kill switch is off, run the full agent
 *      (screen → rug gate → analyst → execute) to hunt new entries.
 *
 * Auth: /api/cron-jobs/* is gated by CRON_SECRET in middleware.ts.
 * Idempotent: the runner takes a Redis lock, exits check live prices against
 * stored levels, and order placement is idempotent on refId.
 */

import { NextResponse } from 'next/server';
import { getUserByEmail } from '@/lib/db/users';
import { OWNER_EMAIL } from '@/lib/owner';
import { getSystemState } from '@/lib/db/crypto/system-state';
import { manageOpenPositions } from '@/lib/crypto/position-manager';
import { runCryptoAgent } from '@/lib/crypto/agent/runner';
import { expireStaleProposals } from '@/lib/db/crypto/collections';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET() {
  const startTime = Date.now();
  try {
    const owner = await getUserByEmail(OWNER_EMAIL);
    if (!owner) {
      return NextResponse.json({ success: false, error: 'Owner account not found' }, { status: 404 });
    }
    const userId = owner.id;
    const state = await getSystemState(userId);

    await expireStaleProposals(userId);

    // 1. Exit management — always.
    const actions = await manageOpenPositions(userId, state);

    // 2. Entry hunting — only when explicitly armed.
    let run = null;
    if (state.autoTrade && state.tradingEnabled) {
      try {
        run = await runCryptoAgent(userId, 'cron');
      } catch (error) {
        // A concurrent manual run holds the lock — fine, skip this tick.
        console.error('crypto agent cron run skipped:', error);
      }
    }

    return NextResponse.json({
      success: true,
      durationMs: Date.now() - startTime,
      positionActions: actions,
      run,
    });
  } catch (error) {
    console.error('crypto-agent cron failed:', error);
    return NextResponse.json({ success: false, error: 'Cron failed' }, { status: 500 });
  }
}
