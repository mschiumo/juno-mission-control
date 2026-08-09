/**
 * Email-confirmation tokens.
 *
 * Same shape as the password-reset tokens: a 32-byte random hex string whose
 * SHA-256 is the Redis key, so a database read can never yield a usable link.
 * Single use, 24-hour TTL (longer than a password reset — confirming an email
 * is not urgent and people check inboxes late).
 */

import { createHash, randomBytes } from 'crypto';
import { getRedisClient } from '@/lib/redis';

const TTL_SECONDS = 24 * 60 * 60;

function tokenKey(token: string): string {
  return `auth:verify:${createHash('sha256').update(token).digest('hex')}`;
}

export async function createVerificationToken(userId: string): Promise<string> {
  const token = randomBytes(32).toString('hex');
  const redis = await getRedisClient();
  await redis.set(tokenKey(token), userId, { EX: TTL_SECONDS });
  return token;
}

/** Consumes the token (single use). Returns the userId, or null if invalid. */
export async function consumeVerificationToken(token: string): Promise<string | null> {
  if (!/^[0-9a-f]{64}$/.test(token)) return null;
  const redis = await getRedisClient();
  const userId = await redis.get(tokenKey(token));
  if (typeof userId !== 'string' || !userId) return null;
  await redis.del(tokenKey(token));
  return userId;
}
