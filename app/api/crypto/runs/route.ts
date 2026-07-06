import { NextResponse } from 'next/server';
import { requireOwner } from '@/lib/auth-session';
import { runCryptoAgent } from '@/lib/crypto/agent/runner';
import { listRuns } from '@/lib/db/crypto/collections';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function GET() {
  const { userId, error } = await requireOwner();
  if (error) return error;
  const runs = await listRuns(userId);
  return NextResponse.json({ success: true, runs: runs.slice(0, 20) });
}

/** Trigger an agent run now (screen → rug gate → analyst → proposals). */
export async function POST() {
  const { userId, error } = await requireOwner();
  if (error) return error;
  try {
    const run = await runCryptoAgent(userId, 'manual');
    return NextResponse.json({ success: !run.error, run });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Agent run failed';
    return NextResponse.json({ success: false, error: message }, { status: 409 });
  }
}
