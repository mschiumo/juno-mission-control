/**
 * Performance Review — weekly reviews (owner-only).
 *
 * GET  /api/confluence/review/weekly — stored reviews, newest first.
 * POST /api/confluence/review/weekly — run the reviewer now, optionally for a
 *      specific week: { weekStart?: 'YYYY-MM-DD' } (normalized to its Monday).
 *      The narrative agent is read-only and tool-less; all numbers are
 *      computed in code before it runs.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireOwner } from '@/lib/auth-session';
import { mondayOf, ReviewNotConfigured, runWeeklyReview } from '@/lib/confluence/review/weekly-review';
import { getWeeklyReviews } from '@/lib/db/confluence/review';

export async function GET(): Promise<NextResponse> {
  const { userId, error } = await requireOwner();
  if (error) return error;
  const reviews = await getWeeklyReviews(userId);
  return NextResponse.json({ success: true, reviews });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const { userId, error } = await requireOwner();
  if (error) return error;

  let weekStart: string | undefined;
  try {
    const body = await request.json();
    if (typeof body?.weekStart === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.weekStart)) {
      weekStart = mondayOf(body.weekStart);
    }
  } catch {
    /* run for the last completed week */
  }

  try {
    const review = await runWeeklyReview(userId, weekStart);
    return NextResponse.json({ success: true, review });
  } catch (e) {
    if (e instanceof ReviewNotConfigured) {
      return NextResponse.json({ success: false, error: e.message }, { status: 422 });
    }
    console.error('Weekly review failed:', e);
    return NextResponse.json({ success: false, error: 'Weekly review failed' }, { status: 500 });
  }
}
