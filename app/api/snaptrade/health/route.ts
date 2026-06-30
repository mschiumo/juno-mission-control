import { NextResponse } from 'next/server';
import { requireOwner } from '@/lib/auth-session';
import { isSnapTradeConfigured, checkCredentials } from '@/lib/snaptrade';

export async function GET() {
  const ownerCheck = await requireOwner();
  if ('error' in ownerCheck) return ownerCheck.error;

  const clientId = process.env.SNAPTRADE_CLIENT_ID ?? '';
  const consumerKey = process.env.SNAPTRADE_CONSUMER_KEY ?? '';
  const configured = isSnapTradeConfigured();

  // Live API ping to verify the keys are correct (not just present).
  let credentialsValid: boolean | null = null;
  let credentialsError: string | null = null;
  if (configured) {
    const check = await checkCredentials();
    credentialsValid = check.valid;
    credentialsError = check.error ?? null;
  }

  return NextResponse.json({
    clientIdPresent: clientId.length > 0,
    clientIdLength: clientId.length,
    consumerKeyPresent: consumerKey.length > 0,
    consumerKeyLength: consumerKey.length,
    configured,
    credentialsValid,
    credentialsError,
  });
}
