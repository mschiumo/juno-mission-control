/**
 * /api/portfolio/review — owner-only.
 *
 * GET  — the stored weekly review history (newest first).
 * POST — generate (or regenerate) this week's review on demand.
 */

import { NextResponse } from 'next/server';
import { requireOwner } from '@/lib/auth-session';
import { getPortfolioReviews } from '@/lib/db/portfolio-connection';
import { generatePortfolioReview } from '@/lib/portfolio-review';

export async function GET(): Promise<NextResponse> {
  const { userId, error: authError } = await requireOwner();
  if (authError) return authError;

  const reviews = await getPortfolioReviews(userId);
  return NextResponse.json({ success: true, data: { reviews } });
}

export async function POST(): Promise<NextResponse> {
  const { userId, error: authError } = await requireOwner();
  if (authError) return authError;

  try {
    const generated = await generatePortfolioReview(userId);
    if (!generated) {
      return NextResponse.json(
        { success: false, error: 'Nothing to review yet — connect a brokerage and sync first.' },
        { status: 409 }
      );
    }
    return NextResponse.json({ success: true, data: generated });
  } catch (error) {
    console.error('Portfolio review failed:', error);
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { success: false, error: 'Review generation failed.', detail },
      { status: 500 }
    );
  }
}
