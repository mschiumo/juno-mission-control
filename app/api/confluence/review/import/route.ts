/**
 * Performance Review — statement import (owner-only).
 *
 * POST /api/confluence/review/import — body { csv: string, fileName?: string }
 *      Parses a ThinkOrSwim/Schwab Account Statement export. Idempotent
 *      (file-hash dedupe); parse failures reject the batch atomically.
 * GET  /api/confluence/review/import — import batch history (parse reports).
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireOwner } from '@/lib/auth-session';
import { importStatement } from '@/lib/confluence/review/ingest';
import { getImportBatches } from '@/lib/db/confluence/review';

export async function GET(): Promise<NextResponse> {
  const { userId, error } = await requireOwner();
  if (error) return error;
  const batches = await getImportBatches(userId);
  return NextResponse.json({ success: true, batches });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const { userId, error } = await requireOwner();
  if (error) return error;

  let body: { csv?: string; fileName?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
  }
  if (typeof body.csv !== 'string' || body.csv.trim().length === 0) {
    return NextResponse.json({ success: false, error: 'Body must include the statement CSV text as `csv`.' }, { status: 400 });
  }

  const result = await importStatement(userId, body.csv, body.fileName);
  if (result.duplicate) {
    return NextResponse.json(
      { success: false, duplicate: true, error: 'This exact file was already imported.', batch: result.batch },
      { status: 409 },
    );
  }
  if (!result.ok) {
    return NextResponse.json(
      { success: false, error: result.batch.error ?? 'Parse failed', batch: result.batch },
      { status: 422 },
    );
  }
  return NextResponse.json({
    success: true,
    batch: result.batch,
    roundTrips: result.roundTrips,
    violations: result.violations,
  });
}
