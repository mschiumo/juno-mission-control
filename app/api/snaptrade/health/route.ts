import { NextResponse } from 'next/server';
import { requireOwner } from '@/lib/auth-session';
import { isSnapTradeConfigured, checkCredentials } from '@/lib/snaptrade';
import { getRedisClient } from '@/lib/redis';

export async function GET() {
  const ownerCheck = await requireOwner();
  if ('error' in ownerCheck) return ownerCheck.error;

  const clientId = process.env.SNAPTRADE_CLIENT_ID ?? '';
  const consumerKey = process.env.SNAPTRADE_CONSUMER_KEY ?? '';
  const configured = isSnapTradeConfigured();

  // Which Redis URL is actually in use.
  const redisUrlEnv = process.env.UPSTASH_REDIS_URL
    ? 'UPSTASH_REDIS_URL'
    : process.env.REDIS_URL
    ? 'REDIS_URL'
    : 'fallback:localhost';

  // Live API ping to verify the keys are correct (not just present).
  let credentialsValid: boolean | null = null;
  let credentialsError: string | null = null;
  if (configured) {
    const check = await checkCredentials();
    credentialsValid = check.valid;
    credentialsError = check.error ?? null;
  }

  // Redis connectivity check.
  let redisOk = false;
  let redisError: string | null = null;
  try {
    const redis = await getRedisClient();
    await redis.ping();
    redisOk = true;
  } catch (err) {
    redisError = err instanceof Error ? err.message.slice(0, 200) : String(err);
  }

  return NextResponse.json({
    clientIdPresent: clientId.length > 0,
    clientIdLength: clientId.length,
    consumerKeyPresent: consumerKey.length > 0,
    consumerKeyLength: consumerKey.length,
    configured,
    credentialsValid,
    credentialsError,
    redisUrlEnv,
    redisOk,
    redisError,
    nextPublicAppUrl: process.env.NEXT_PUBLIC_APP_URL ?? null,
    snaptradeRedirectUrl: process.env.SNAPTRADE_REDIRECT_URL ?? null,
  });
}
