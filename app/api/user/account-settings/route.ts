import { NextResponse } from 'next/server';
import { requireOwner } from '@/lib/auth-session';
import {
  getAccountSettings,
  patchAccountSetting,
  type AccountSetting,
} from '@/lib/db/account-settings';
import { getBrokerConnection } from '@/lib/db/broker-connections';
import { MANUAL_ACCOUNT_ID, MAX_ACTIVE_ACCOUNTS } from '@/lib/account-classification';

export async function GET() {
  const authResult = await requireOwner();
  if (authResult.error) return authResult.error;
  const { userId } = authResult;

  const settings = await getAccountSettings(userId);
  return NextResponse.json({ success: true, settings });
}

export async function PATCH(request: Request) {
  const authResult = await requireOwner();
  if (authResult.error) return authResult.error;
  const { userId } = authResult;

  let body: { accountId?: string } & Partial<AccountSetting>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 });
  }

  const accountId = typeof body.accountId === 'string' ? body.accountId.trim() : '';
  if (!accountId) {
    return NextResponse.json({ success: false, error: 'accountId is required' }, { status: 400 });
  }

  // Enforce the active-account cap server-side. One brokerage login can expose
  // several accounts, so the limit that matters is how many accounts feed the
  // app — not how many brokerages are linked. Only broker accounts count; the
  // synthetic "manual" bucket is always available.
  if (body.enabled === true && accountId !== MANUAL_ACCOUNT_ID) {
    const connection = await getBrokerConnection(userId);
    const brokerIds = (connection?.accounts ?? []).map(a => a.id);
    if (brokerIds.includes(accountId)) {
      const current = await getAccountSettings(userId);
      const activeAfter = brokerIds.filter(
        id => (id === accountId ? true : current[id]?.enabled !== false),
      );
      if (activeAfter.length > MAX_ACTIVE_ACCOUNTS) {
        return NextResponse.json(
          {
            success: false,
            code: 'ACCOUNT_LIMIT',
            limit: MAX_ACTIVE_ACCOUNTS,
            error: `You can use up to ${MAX_ACTIVE_ACCOUNTS} brokerage accounts. Turn one off before enabling another.`,
          },
          { status: 409 },
        );
      }
    }
  }

  const settings = await patchAccountSetting(userId, accountId, {
    label: body.label,
    type: body.type,
    startingBalance: body.startingBalance,
    enabled: body.enabled,
  });

  return NextResponse.json({ success: true, settings });
}
