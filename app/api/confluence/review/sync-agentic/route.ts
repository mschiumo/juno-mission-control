/**
 * Performance Review — agentic fill sync (owner-only).
 *
 * POST /api/confluence/review/sync-agentic
 *   Maps fills already recorded by the execution service into the normalized
 *   review schema (source: agentic_rh). No new Robinhood calls; read-only
 *   over the order log.
 */

import { NextResponse } from 'next/server';
import { requireOwner } from '@/lib/auth-session';
import { syncAgenticFills } from '@/lib/confluence/review/ingest';

export async function POST(): Promise<NextResponse> {
  const { userId, error } = await requireOwner();
  if (error) return error;
  const result = await syncAgenticFills(userId);
  return NextResponse.json({ success: true, ...result });
}
