import { NextRequest, NextResponse } from 'next/server';
import { requireOwner } from '@/lib/auth-session';
import { exchangePublicToken, plaidConfigured, PlaidError } from '@/lib/finances/plaid';
import { readItems, toPublicItem, upsertItem } from '@/lib/finances/plaid-items';
import { syncAllItems } from '@/lib/finances/sync';

/**
 * Institution names arrive from the browser's Link metadata, so they are
 * untrusted input. Keep spaces and punctuation ("Capital One", "U.S. Bank") but
 * drop anything non-printable and cap the length before it reaches storage.
 */
function sanitizeInstitutionName(value: unknown): string {
  if (typeof value !== 'string') return 'Bank';
  const cleaned = Array.from(value)
    .filter((char) => {
      const code = char.codePointAt(0) ?? 0;
      return code >= 0x20 && code !== 0x7f;
    })
    .join('')
    .trim();
  return cleaned ? cleaned.slice(0, 80) : 'Bank';
}

/**
 * Complete the Link flow: swap the browser's short-lived public_token for a
 * long-lived access token, store it encrypted, and immediately pull balances so
 * the tab shows live numbers the moment the modal closes.
 *
 * Body: { publicToken, institutionName?, institutionId? }
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
    const body = await request.json();
    const publicToken = typeof body?.publicToken === 'string' ? body.publicToken : '';
    if (!publicToken) {
      return NextResponse.json({ success: false, error: 'Missing public token' }, { status: 400 });
    }

    const { accessToken, itemId } = await exchangePublicToken(publicToken);
    await upsertItem(userId, {
      itemId,
      accessToken,
      institutionName: sanitizeInstitutionName(body?.institutionName),
      institutionId: typeof body?.institutionId === 'string' ? body.institutionId.slice(0, 60) : undefined,
    });

    // Sync just the new connection — leaves other banks' timestamps untouched.
    const { summary, accounts, history } = await syncAllItems(userId, { onlyItemId: itemId });
    const items = (await readItems(userId)).map(toPublicItem);

    return NextResponse.json({ success: true, accounts, history, summary, items });
  } catch (error) {
    const message = error instanceof PlaidError ? error.userMessage : 'Failed to link this bank';
    console.error('Plaid exchange failed:', error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: message }, { status: 502 });
  }
}
