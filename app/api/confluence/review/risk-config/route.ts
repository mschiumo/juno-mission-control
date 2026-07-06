/**
 * Performance Review — risk framework config (owner-only).
 *
 * GET /api/confluence/review/risk-config — current config + append-only history.
 * PUT /api/confluence/review/risk-config — append changed keys (rows are never
 *     updated), then recompute R-multiples + observed violations for both
 *     sources so every reader sees the new framework immediately.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireOwner } from '@/lib/auth-session';
import { recomputeSource } from '@/lib/confluence/review/ingest';
import { appendRiskConfig, getRiskConfig, getRiskConfigEntries } from '@/lib/db/confluence/review';
import { DEFAULT_RISK_CONFIG, type RiskConfig } from '@/types/confluence-review';

export async function GET(): Promise<NextResponse> {
  const { userId, error } = await requireOwner();
  if (error) return error;
  const [config, history] = await Promise.all([getRiskConfig(userId), getRiskConfigEntries(userId)]);
  return NextResponse.json({ success: true, config, defaults: DEFAULT_RISK_CONFIG, history });
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  const { userId, email, error } = await requireOwner();
  if (error) return error;

  let body: Partial<RiskConfig>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  const updates: Partial<RiskConfig> = {};
  for (const key of Object.keys(DEFAULT_RISK_CONFIG) as (keyof RiskConfig)[]) {
    const value = body[key];
    if (value === undefined) continue;
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
      return NextResponse.json({ success: false, error: `${key} must be a positive number.` }, { status: 400 });
    }
    updates[key] = value;
  }

  const config = await appendRiskConfig(userId, updates, email);
  await recomputeSource(userId, 'manual_tos', config);
  await recomputeSource(userId, 'agentic_rh', config);

  return NextResponse.json({ success: true, config });
}
