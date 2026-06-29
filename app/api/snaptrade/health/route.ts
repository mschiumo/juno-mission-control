/**
 * GET /api/snaptrade/health  (TEMPORARY diagnostic — remove before merge)
 *
 * Reports whether the running deployment can see the SnapTrade credentials and
 * whether they actually authenticate. Returns ONLY booleans/lengths/validity —
 * never the secret values. Used to debug the "coming soon" (503) state.
 */

import { NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth-session';
import { isSnapTradeConfigured, checkCredentials } from '@/lib/snaptrade';

export async function GET(): Promise<NextResponse> {
  const { error: authError } = await requireUserId();
  if (authError) return authError;

  const clientId = process.env.SNAPTRADE_CLIENT_ID;
  const consumerKey = process.env.SNAPTRADE_CONSUMER_KEY;
  const clientIdPresent = Boolean(clientId);
  const consumerKeyPresent = Boolean(consumerKey);
  const configured = isSnapTradeConfigured();

  // Lengths (not values) help spot a swap or an empty/whitespace value.
  const data: Record<string, unknown> = {
    clientIdPresent,
    consumerKeyPresent,
    configured,
    clientIdLength: clientId?.length ?? 0,
    consumerKeyLength: consumerKey?.length ?? 0,
    // Names only (never values) — reveals a typo'd variable name instantly.
    snaptradeEnvVarNames: Object.keys(process.env).filter(k => k.startsWith('SNAPTRADE')).sort(),
  };

  if (configured) {
    data.credentials = await checkCredentials();
  }

  return NextResponse.json({ success: true, data });
}
