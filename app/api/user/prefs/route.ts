import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { requireUserId } from '@/lib/auth-session';
import { getRedisClient } from '@/lib/redis';
import { getEntitlements } from '@/lib/db/entitlements';

interface EmailAlertPrefs {
  marketBriefing: boolean;
  gapScanner: boolean;
}

interface UserPrefs {
  tradingTourCompleted?: boolean;
  /** Tier the user held when they finished the tour — upgrading re-offers it. */
  tourCompletedTier?: string;
  startingBalance?: number;
  emailAlerts?: EmailAlertPrefs;
  tradingRules?: string[];
}

const MAX_RULES = 30;
const MAX_RULE_LENGTH = 240;

async function getPrefs(userId: string): Promise<UserPrefs> {
  const redis = await getRedisClient();
  const raw = await redis.get(`user:prefs:${userId}`);
  if (!raw) return {};
  try {
    return JSON.parse(raw as string) as UserPrefs;
  } catch {
    return {};
  }
}

async function savePrefs(userId: string, prefs: UserPrefs): Promise<void> {
  const redis = await getRedisClient();
  await redis.set(`user:prefs:${userId}`, JSON.stringify(prefs));
}

export async function GET() {
  const authResult = await requireUserId();
  if (authResult.error) return authResult.error;
  const { userId } = authResult;

  const prefs = await getPrefs(userId);
  return NextResponse.json({ success: true, prefs });
}

export async function PATCH(request: Request) {
  const authResult = await requireUserId();
  if (authResult.error) return authResult.error;
  const { userId } = authResult;

  let body: Partial<UserPrefs>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 });
  }

  const existing = await getPrefs(userId);
  const updated: UserPrefs = { ...existing };

  if (typeof body.tradingTourCompleted === 'boolean') {
    updated.tradingTourCompleted = body.tradingTourCompleted;
  }

  if (typeof body.tourCompletedTier === 'string') {
    updated.tourCompletedTier = body.tourCompletedTier;
  }

  if (typeof body.startingBalance === 'number' && body.startingBalance >= 0) {
    updated.startingBalance = body.startingBalance;
  }

  if (body.emailAlerts && typeof body.emailAlerts === 'object') {
    // Email briefings are Gold+. The send-time cron re-checks entitlement, but
    // rejecting the opt-in here keeps the stored prefs honest about what the
    // user will actually receive.
    const session = await auth();
    const entitlements = await getEntitlements(userId, session?.user?.email);
    if (!entitlements.features.emailBriefings) {
      return NextResponse.json(
        {
          success: false,
          code: 'UPGRADE_REQUIRED',
          error: 'Email briefings are available on the Gold plan and up.',
        },
        { status: 403 },
      );
    }
    updated.emailAlerts = {
      marketBriefing: !!body.emailAlerts.marketBriefing,
      gapScanner: !!body.emailAlerts.gapScanner,
    };
  }

  if (Array.isArray(body.tradingRules)) {
    const cleaned = body.tradingRules
      .filter((r): r is string => typeof r === 'string')
      .map((r) => r.trim())
      .filter((r) => r.length > 0)
      .map((r) => r.slice(0, MAX_RULE_LENGTH))
      .slice(0, MAX_RULES);
    updated.tradingRules = cleaned;
  }

  await savePrefs(userId, updated);
  return NextResponse.json({ success: true, prefs: updated });
}
