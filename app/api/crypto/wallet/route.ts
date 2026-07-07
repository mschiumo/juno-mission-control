import { NextRequest, NextResponse } from 'next/server';
import { requireOwner } from '@/lib/auth-session';
import { getWalletStatus } from '@/lib/crypto/wallet';

export const dynamic = 'force-dynamic';

/** Trading hot-wallet status: address + SOL/USDC balances (owner only). */
export async function GET(request: NextRequest) {
  const { error } = await requireOwner();
  if (error) return error;
  const status = await getWalletStatus(request.nextUrl.searchParams.get('refresh') === '1');
  return NextResponse.json({ success: true, wallet: status });
}
