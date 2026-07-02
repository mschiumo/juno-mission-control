import { NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth-session';
import {
  getAccountSettings,
  patchAccountSetting,
  type AccountSetting,
} from '@/lib/db/account-settings';

export async function GET() {
  const authResult = await requireUserId();
  if (authResult.error) return authResult.error;
  const { userId } = authResult;

  const settings = await getAccountSettings(userId);
  return NextResponse.json({ success: true, settings });
}

export async function PATCH(request: Request) {
  const authResult = await requireUserId();
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

  const settings = await patchAccountSetting(userId, accountId, {
    label: body.label,
    type: body.type,
    startingBalance: body.startingBalance,
  });

  return NextResponse.json({ success: true, settings });
}
