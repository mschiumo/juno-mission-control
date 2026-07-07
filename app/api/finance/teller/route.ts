/**
 * Finance — Teller bank connection. Owner-only (billing/credential
 * protection, same rationale as the SnapTrade gate).
 *
 * GET    → status: { configured, environment, applicationId?, enrollment? }
 *          (applicationId is safe to expose — it's the public Connect id).
 * POST   → { accessToken, institutionNames? } stores a new enrollment
 *          (encrypted at rest) and syncs; {} re-syncs the existing one.
 * DELETE → disconnect; Teller-sourced accounts revert to manual with their
 *          last balances intact.
 *
 * Setup steps + auth model documented in lib/finance/teller.ts.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireOwner } from '@/lib/auth-session';
import {
  tellerConfigured,
  tellerConnectConfig,
  loadEnrollment,
  saveEnrollment,
  removeEnrollment,
  syncTellerAccounts,
} from '@/lib/finance/teller';

function enrollmentStatus(e: Awaited<ReturnType<typeof loadEnrollment>>) {
  if (!e) return null;
  // Never return tokenEnc to the client.
  return {
    institutionNames: e.institutionNames,
    enrolledAt: e.enrolledAt,
    lastSyncedAt: e.lastSyncedAt,
    lastResult: e.lastResult,
  };
}

// GET — connection status for the UI
export async function GET() {
  const { userId, error } = await requireOwner();
  if (error) return error;

  try {
    const config = tellerConnectConfig();
    const enrollment = await loadEnrollment(userId);
    return NextResponse.json({
      success: true,
      configured: tellerConfigured(),
      environment: config?.environment ?? null,
      applicationId: config?.applicationId ?? null,
      enrollment: enrollmentStatus(enrollment),
    });
  } catch (e) {
    console.error('[finance/teller] GET failed:', e);
    return NextResponse.json({ success: false, error: 'Failed to load Teller status' }, { status: 500 });
  }
}

// POST — enroll (accessToken present) or re-sync (empty body)
export async function POST(request: NextRequest) {
  const { userId, error } = await requireOwner();
  if (error) return error;

  try {
    if (!tellerConfigured()) {
      return NextResponse.json(
        { success: false, error: 'Teller is not configured — set TELLER_APP_ID / TELLER_ENVIRONMENT / TELLER_CERT_B64 / TELLER_KEY_B64 / FINANCE_TOKEN_SECRET (see lib/finance/teller.ts)' },
        { status: 503 },
      );
    }

    const body = await request.json().catch(() => ({}));
    if (typeof body.accessToken === 'string' && body.accessToken.trim()) {
      const institutionNames = Array.isArray(body.institutionNames)
        ? body.institutionNames.filter((n: unknown) => typeof n === 'string').slice(0, 10)
        : [];
      await saveEnrollment(userId, body.accessToken.trim(), institutionNames);
    } else {
      const existing = await loadEnrollment(userId);
      if (!existing) {
        return NextResponse.json({ success: false, error: 'No bank connected yet' }, { status: 400 });
      }
    }

    const result = await syncTellerAccounts(userId);
    if ('error' in result) {
      return NextResponse.json({ success: false, error: result.error }, { status: 422 });
    }
    const enrollment = await loadEnrollment(userId);
    return NextResponse.json({ success: true, ...result, enrollment: enrollmentStatus(enrollment) });
  } catch (e) {
    console.error('[finance/teller] POST failed:', e);
    return NextResponse.json({ success: false, error: 'Teller sync failed' }, { status: 500 });
  }
}

// DELETE — disconnect
export async function DELETE() {
  const { userId, error } = await requireOwner();
  if (error) return error;

  try {
    await removeEnrollment(userId);
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('[finance/teller] DELETE failed:', e);
    return NextResponse.json({ success: false, error: 'Failed to disconnect' }, { status: 500 });
  }
}
