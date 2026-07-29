import { NextRequest, NextResponse } from 'next/server';
import { requireOwner } from '@/lib/auth-session';
import { createLinkToken, plaidConfigured, PlaidError } from '@/lib/finances/plaid';
import { accessTokenOf, readItems } from '@/lib/finances/plaid-items';

/**
 * Mint a short-lived Plaid Link token for the browser.
 *
 * Body: { itemId?: string } — pass an itemId to re-authenticate that existing
 * connection (Plaid "update mode") rather than creating a second Item for the
 * same bank, which would consume another billed Item slot.
 */
export async function POST(request: NextRequest) {
  const { userId, error: authError } = await requireOwner();
  if (authError) return authError;

  if (!plaidConfigured()) {
    return NextResponse.json(
      { success: false, error: 'Bank sync is not configured on this deployment.' },
      { status: 503 },
    );
  }

  try {
    const body = await request.json().catch(() => ({}));
    const itemId = typeof body?.itemId === 'string' ? body.itemId : undefined;

    let accessToken: string | undefined;
    if (itemId) {
      const item = (await readItems(userId)).find((i) => i.itemId === itemId);
      if (!item) {
        return NextResponse.json({ success: false, error: 'Connection not found' }, { status: 404 });
      }
      try {
        accessToken = accessTokenOf(item);
      } catch {
        // Token can't be decrypted (rotated secret) — fall back to a fresh link.
        accessToken = undefined;
      }
    }

    const { linkToken } = await createLinkToken(userId, { accessToken });
    return NextResponse.json({ success: true, linkToken });
  } catch (error) {
    const message = error instanceof PlaidError ? error.userMessage : 'Failed to start bank connection';
    console.error('Plaid link-token creation failed:', error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: message }, { status: 502 });
  }
}
