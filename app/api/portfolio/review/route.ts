/**
 * /api/portfolio/review — Platinum feature (owner always included).
 *
 * GET  — the stored weekly review history (newest first).
 * POST — generate (or regenerate) this week's review on demand.
 */

import { NextResponse } from 'next/server';
import { requireFeature } from '@/lib/auth-session';
import { friendlyAiErrorMessage } from '@/lib/ai-error-message';
import { getPortfolioReviews } from '@/lib/db/portfolio-connection';
import { generatePortfolioReview } from '@/lib/portfolio-review';
import {
  consumeReportGeneration,
  getReportGenerationStatus,
  rateLimitMessage,
  refundReportGeneration,
} from '@/lib/report-rate-limit';

export async function GET(): Promise<NextResponse> {
  const { userId, error: authError } = await requireFeature('portfolio');
  if (authError) return authError;

  const [reviews, rateLimit] = await Promise.all([
    getPortfolioReviews(userId),
    getReportGenerationStatus(userId, 'portfolio-review'),
  ]);
  return NextResponse.json({ success: true, data: { reviews, rateLimit } });
}

export async function POST(): Promise<NextResponse> {
  const { userId, error: authError } = await requireFeature('portfolio');
  if (authError) return authError;

  let consumed = false;
  try {
    const rate = await consumeReportGeneration(userId, 'portfolio-review');
    if (!rate.allowed) {
      return NextResponse.json(
        { success: false, error: rateLimitMessage(rate.limit), rateLimit: rate },
        { status: 429 }
      );
    }
    consumed = true;

    const generated = await generatePortfolioReview(userId);
    if (!generated) {
      // Claude was never called — return the slot to the user.
      consumed = false;
      await refundReportGeneration(userId, 'portfolio-review');
      return NextResponse.json(
        { success: false, error: 'Nothing to review yet — connect a brokerage and sync first.' },
        { status: 409 }
      );
    }
    return NextResponse.json({ success: true, data: { ...generated, rateLimit: rate } });
  } catch (error) {
    // The generation failed (Anthropic outage, bad data) — don't spend the
    // user's daily allowance on a review they never received.
    if (consumed) await refundReportGeneration(userId, 'portfolio-review');
    console.error('Portfolio review failed:', error);
    return NextResponse.json(
      { success: false, error: friendlyAiErrorMessage(error) },
      { status: 500 }
    );
  }
}
