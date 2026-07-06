import { NextRequest, NextResponse } from 'next/server';
import { requireOwner } from '@/lib/auth-session';
import { getSystemState, isLiveAllowed, updateSystemState } from '@/lib/db/crypto/system-state';
import { appendAudit } from '@/lib/db/crypto/collections';
import type { CryptoSystemState } from '@/types/crypto-trader';

export const dynamic = 'force-dynamic';

/** Owner-only system state: kill switch, paper/live, auto-trade, caps. */
export async function GET() {
  const { userId, error } = await requireOwner();
  if (error) return error;
  const state = await getSystemState(userId);
  return NextResponse.json({ success: true, state, liveAllowed: isLiveAllowed() });
}

const EDITABLE_BOOLEANS = ['tradingEnabled', 'paperMode', 'autoTrade'] as const;
const EDITABLE_NUMBERS = [
  'paperBankrollUsd',
  'perPositionCapUsd',
  'totalExposureCapUsd',
  'maxOpenPositions',
  'dailyLossLimitUsd',
  'cooldownMinutesAfterLoss',
  'minSafetyScore',
  'minLiquidityUsd',
  'minTokenAgeHours',
  'maxSlippageBps',
] as const;

export async function PUT(request: NextRequest) {
  const { userId, email, error } = await requireOwner();
  if (error) return error;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 });
  }

  const updates: Partial<CryptoSystemState> = {};
  for (const key of EDITABLE_BOOLEANS) {
    if (typeof body[key] === 'boolean') updates[key] = body[key] as boolean;
  }
  for (const key of EDITABLE_NUMBERS) {
    const value = body[key];
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
      updates[key] = value;
    }
  }

  // Flipping to live requires the server env gate — same 422 pattern as confluence.
  if (updates.paperMode === false && !isLiveAllowed()) {
    return NextResponse.json(
      { success: false, error: 'Live mode is not armed on this server (CRYPTO_ALLOW_LIVE).' },
      { status: 422 },
    );
  }

  const before = await getSystemState(userId);
  const state = await updateSystemState(userId, updates, email);

  if (updates.tradingEnabled !== undefined && updates.tradingEnabled !== before.tradingEnabled) {
    await appendAudit(userId, {
      actor: 'user',
      actorId: email,
      eventType: updates.tradingEnabled ? 'killswitch.deactivated' : 'killswitch.activated',
      entityType: 'system',
      note: updates.tradingEnabled ? 'Trading enabled' : 'Kill switch: trading disabled',
    });
  }
  if (updates.paperMode !== undefined && updates.paperMode !== before.paperMode) {
    await appendAudit(userId, {
      actor: 'user',
      actorId: email,
      eventType: 'paper_mode.changed',
      entityType: 'system',
      note: updates.paperMode ? 'Switched to paper mode' : 'Switched to LIVE mode',
    });
  }
  if (updates.autoTrade !== undefined && updates.autoTrade !== before.autoTrade) {
    await appendAudit(userId, {
      actor: 'user',
      actorId: email,
      eventType: 'auto_trade.changed',
      entityType: 'system',
      note: updates.autoTrade ? 'Auto-trade enabled' : 'Auto-trade disabled (proposals need approval)',
    });
  }

  return NextResponse.json({ success: true, state, liveAllowed: isLiveAllowed() });
}
