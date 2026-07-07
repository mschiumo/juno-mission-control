/**
 * Finance — balance history series for the progress charts. Owner-only.
 * GET returns { debt, investment, savings } as [{date, value}] arrays.
 * Points are recorded automatically on every balance mutation
 * (lib/finance/history.ts) — there is no POST here by design.
 */

import { NextResponse } from 'next/server';
import { requireOwner } from '@/lib/auth-session';
import { loadHistory } from '@/lib/finance/history';

export async function GET() {
  const { userId, error } = await requireOwner();
  if (error) return error;

  try {
    const history = await loadHistory(userId);
    return NextResponse.json({ success: true, history });
  } catch (e) {
    console.error('[finance/history] GET failed:', e);
    return NextResponse.json({ success: false, error: 'Failed to load history' }, { status: 500 });
  }
}
