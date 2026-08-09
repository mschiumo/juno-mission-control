/**
 * Password-reset tokens.
 *
 * A token is a 32-byte random hex string stored at auth:reset:{sha256(token)}
 * → userId with a 1-hour TTL. Only the HASH is stored, so a Redis read can
 * never yield a usable token; the plain token exists only inside the email
 * link. Tokens are single-use — consumed (deleted) on successful reset.
 */

import { createHash, randomBytes } from 'crypto';
import { getRedisClient } from '@/lib/redis';

const TTL_SECONDS = 60 * 60;

function tokenKey(token: string): string {
  const digest = createHash('sha256').update(token).digest('hex');
  return `auth:reset:${digest}`;
}

export async function createResetToken(userId: string): Promise<string> {
  const token = randomBytes(32).toString('hex');
  const redis = await getRedisClient();
  await redis.set(tokenKey(token), userId, { EX: TTL_SECONDS });
  return token;
}

/** Returns the userId for a valid token without consuming it. */
export async function peekResetToken(token: string): Promise<string | null> {
  if (!/^[0-9a-f]{64}$/.test(token)) return null;
  const redis = await getRedisClient();
  const userId = await redis.get(tokenKey(token));
  return typeof userId === 'string' && userId ? userId : null;
}

/** Consumes the token (single use). Returns the userId, or null if invalid. */
export async function consumeResetToken(token: string): Promise<string | null> {
  const userId = await peekResetToken(token);
  if (!userId) return null;
  const redis = await getRedisClient();
  await redis.del(tokenKey(token));
  return userId;
}
