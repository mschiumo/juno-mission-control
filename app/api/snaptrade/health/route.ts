import { NextResponse } from 'next/server';
import { requireOwner } from '@/lib/auth-session';
import { isSnapTradeConfigured, checkCredentials } from '@/lib/snaptrade';
import { getRedisClient } from '@/lib/redis';
import { isSealed, openSecret } from '@/lib/secret-box';

export async function GET() {
  const ownerCheck = await requireOwner();
  if ('error' in ownerCheck) return ownerCheck.error;
  const { userId } = ownerCheck;

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

  // Encryption-at-rest status for the SnapTrade userSecret (lib/secret-box.ts).
  // Reads the RAW Redis record (getBrokerConnection would decrypt it) to report
  // whether the stored secret is actually sealed and still readable with the
  // configured key. `userSecretSealed: false` with the key present just means
  // no save has run since the key was set — a Journal load or sync seals it.
  const encKeyRaw = process.env.BROKER_SECRET_ENC_KEY ?? '';
  const encryptionKeyPresent = encKeyRaw.length > 0;
  const encryptionKeyValid =
    encryptionKeyPresent && Buffer.from(encKeyRaw, 'base64').length === 32;
  let userSecretSealed: boolean | null = null;
  let userSecretReadable: boolean | null = null;
  if (redisOk) {
    try {
      const redis = await getRedisClient();
      const raw = await redis.get(`broker:snaptrade:${userId}`);
      if (raw) {
        const stored = (JSON.parse(raw) as { userSecret?: string }).userSecret ?? '';
        userSecretSealed = isSealed(stored);
        try {
          openSecret(stored);
          userSecretReadable = true;
        } catch {
          userSecretReadable = false;
        }
      }
    } catch {
      // Leave both null — the redisOk/redisError fields already tell the story.
    }
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
    encryptionKeyPresent,
    encryptionKeyValid,
    userSecretSealed,
    userSecretReadable,
    nextPublicAppUrl: process.env.NEXT_PUBLIC_APP_URL ?? null,
    snaptradeRedirectUrl: process.env.SNAPTRADE_REDIRECT_URL ?? null,
  });
}
