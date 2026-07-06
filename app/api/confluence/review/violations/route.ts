/**
 * Performance Review — rule violations scorecard (owner-only).
 *
 * GET /api/confluence/review/violations?source=manual_tos|agentic_rh
 *   Observed violations, freshest first. Manual violations are informational
 *   (ToS trades happen outside the system); agentic ones mirror what the
 *   pre-trade checks enforce.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireOwner } from '@/lib/auth-session';
import { getViolations } from '@/lib/db/confluence/review';
import type { ReviewSource } from '@/types/confluence-review';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { userId, error } = await requireOwner();
  if (error) return error;

  const sourceRaw = request.nextUrl.searchParams.get('source');
  const source =
    sourceRaw === 'manual_tos' || sourceRaw === 'agentic_rh' ? (sourceRaw as ReviewSource) : undefined;

  const violations = await getViolations(userId, source);
  violations.sort((a, b) => (b.etDate ?? b.detectedAt).localeCompare(a.etDate ?? a.detectedAt));
  return NextResponse.json({ success: true, violations });
}
