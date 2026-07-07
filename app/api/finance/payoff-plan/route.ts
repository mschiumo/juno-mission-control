/**
 * Finance — debt payoff planner. Owner-only.
 *
 * GET  → loads saved settings + accounts, returns the full three-strategy
 *        comparison (avalanche / snowball / minimum-only) with exact payment
 *        amounts and due dates per month.
 * POST → saves planner settings { monthlyBudget, strategy } and returns the
 *        recomputed comparison.
 *
 * The simulation itself is pure (lib/finance/debt-payoff.ts) and cheap, so
 * plans are computed on demand rather than stored.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getRedisClient } from '@/lib/redis';
import { requireOwner } from '@/lib/auth-session';
import { getNowInEST, getTodayInEST } from '@/lib/date-utils';
import { comparePayoffPlans } from '@/lib/finance/debt-payoff';
import { DebtAccount, FinanceSettings, PayoffStrategy } from '@/lib/finance/types';

const settingsKey = (userId: string) => `finance:${userId}:settings`;
const accountsKey = (userId: string) => `finance:${userId}:accounts`;

const DEFAULT_SETTINGS: Omit<FinanceSettings, 'updatedAt'> = {
  monthlyBudget: 0,
  strategy: 'avalanche',
};

async function loadSettings(userId: string): Promise<FinanceSettings> {
  const redis = await getRedisClient();
  const raw = await redis.get(settingsKey(userId));
  if (!raw) return { ...DEFAULT_SETTINGS, updatedAt: getNowInEST() };
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_SETTINGS, updatedAt: getNowInEST() };
  }
}

async function loadAccounts(userId: string): Promise<DebtAccount[]> {
  const redis = await getRedisClient();
  const raw = await redis.get(accountsKey(userId));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function buildResponse(accounts: DebtAccount[], settings: FinanceSettings) {
  const totalMinPayment = Math.round(accounts.reduce((s, a) => s + a.minPayment, 0) * 100) / 100;
  const comparison =
    accounts.some((a) => a.balance > 0) && settings.monthlyBudget > 0
      ? comparePayoffPlans(accounts, settings.monthlyBudget, getTodayInEST())
      : null;
  return NextResponse.json({ success: true, settings, totalMinPayment, comparison });
}

// GET — current settings + computed strategy comparison
export async function GET() {
  const { userId, error } = await requireOwner();
  if (error) return error;

  try {
    const [settings, accounts] = await Promise.all([loadSettings(userId), loadAccounts(userId)]);
    return buildResponse(accounts, settings);
  } catch (e) {
    console.error('[finance/payoff-plan] GET failed:', e);
    return NextResponse.json({ success: false, error: 'Failed to load payoff plan' }, { status: 500 });
  }
}

// POST — save settings { monthlyBudget, strategy } and recompute
export async function POST(request: NextRequest) {
  const { userId, error } = await requireOwner();
  if (error) return error;

  try {
    const body = await request.json();

    const monthlyBudget = Number(body.monthlyBudget);
    if (!Number.isFinite(monthlyBudget) || monthlyBudget < 0) {
      return NextResponse.json(
        { success: false, error: 'Monthly budget must be a non-negative number' },
        { status: 400 },
      );
    }
    const strategy: PayoffStrategy = ['avalanche', 'snowball', 'minimum-only'].includes(body.strategy)
      ? body.strategy
      : 'avalanche';

    const settings: FinanceSettings = {
      monthlyBudget: Math.round(monthlyBudget * 100) / 100,
      strategy,
      updatedAt: getNowInEST(),
    };

    const redis = await getRedisClient();
    await redis.set(settingsKey(userId), JSON.stringify(settings));

    const accounts = await loadAccounts(userId);
    return buildResponse(accounts, settings);
  } catch (e) {
    console.error('[finance/payoff-plan] POST failed:', e);
    return NextResponse.json({ success: false, error: 'Failed to save payoff plan' }, { status: 500 });
  }
}
