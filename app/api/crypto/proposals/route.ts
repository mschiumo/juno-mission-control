import { NextResponse } from 'next/server';
import { requireOwner } from '@/lib/auth-session';
import { expireStaleProposals } from '@/lib/db/crypto/collections';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { userId, error } = await requireOwner();
  if (error) return error;
  const proposals = await expireStaleProposals(userId);
  return NextResponse.json({ success: true, proposals: proposals.slice(0, 50) });
}
