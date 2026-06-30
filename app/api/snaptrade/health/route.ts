import { NextResponse } from 'next/server';
import { requireOwner } from '@/lib/auth-session';

export async function GET() {
  const ownerCheck = await requireOwner();
  if ('error' in ownerCheck) return ownerCheck.error;

  const clientId = process.env.SNAPTRADE_CLIENT_ID ?? '';
  const consumerKey = process.env.SNAPTRADE_CONSUMER_KEY ?? '';

  return NextResponse.json({
    clientIdPresent: clientId.length > 0,
    clientIdLength: clientId.length,
    consumerKeyPresent: consumerKey.length > 0,
    consumerKeyLength: consumerKey.length,
    configured: clientId.length > 0 && consumerKey.length > 0,
    snaptradeEnvVarNames: ['SNAPTRADE_CLIENT_ID', 'SNAPTRADE_CONSUMER_KEY'],
  });
}
