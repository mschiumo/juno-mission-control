import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth-session';
import {
  getAllSnapshots,
  saveSnapshot,
  deleteSnapshot,
} from '@/lib/db/account-value';
import type { AccountValueSnapshot } from '@/types/account-value';

/**
 * GET /api/account-value
 *
 * Query params (optional):
 *   startDate - YYYY-MM-DD
 *   endDate   - YYYY-MM-DD
 */
export async function GET(request: NextRequest) {
  const { userId, error } = await requireUserId();
  if (error) return error;

  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    let snapshots = await getAllSnapshots(userId);

    if (startDate) {
      snapshots = snapshots.filter((s) => s.date >= startDate);
    }
    if (endDate) {
      snapshots = snapshots.filter((s) => s.date <= endDate);
    }

    return NextResponse.json({ success: true, snapshots });
  } catch (err) {
    console.error('Error fetching account value snapshots:', err);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch account value snapshots' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/account-value
 *
 * Body (JSON):
 *   date                - YYYY-MM-DD (required)
 *   totalPositionValue  - number (required)
 *   totalPLOpen         - number (default 0)
 *   totalPLDay          - number (default 0)
 *   cashBalance         - number (optional)
 *   netLiquidatingValue - number (optional, computed if omitted)
 *   source              - 'position_statement' | 'manual' (default 'manual')
 */
export async function POST(request: NextRequest) {
  const { userId, error } = await requireUserId();
  if (error) return error;

  try {
    const body = await request.json();

    const {
      date,
      totalPositionValue,
      totalPLOpen = 0,
      totalPLDay = 0,
      cashBalance,
      netLiquidatingValue,
      source = 'manual',
    } = body;

    if (!date || totalPositionValue === undefined) {
      return NextResponse.json(
        { success: false, error: 'date and totalPositionValue are required' },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();
    const snapshot: AccountValueSnapshot = {
      id: crypto.randomUUID(),
      userId,
      date,
      totalPositionValue,
      totalPLOpen,
      totalPLDay,
      cashBalance: cashBalance ?? undefined,
      netLiquidatingValue:
        netLiquidatingValue ?? totalPositionValue + (cashBalance ?? 0),
      source,
      createdAt: now,
      updatedAt: now,
    };

    await saveSnapshot(snapshot);

    return NextResponse.json({ success: true, snapshot });
  } catch (err) {
    console.error('Error saving account value snapshot:', err);
    return NextResponse.json(
      { success: false, error: 'Failed to save account value snapshot' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/account-value
 *
 * Body (JSON):
 *   id - snapshot ID to delete
 */
export async function DELETE(request: NextRequest) {
  const { userId, error } = await requireUserId();
  if (error) return error;

  try {
    const body = await request.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Snapshot id is required' },
        { status: 400 }
      );
    }

    await deleteSnapshot(userId, id);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Error deleting account value snapshot:', err);
    return NextResponse.json(
      { success: false, error: 'Failed to delete account value snapshot' },
      { status: 500 }
    );
  }
}
