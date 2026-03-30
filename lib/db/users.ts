import { getRedisClient } from '@/lib/redis';
import bcrypt from 'bcryptjs';

export interface AppUser {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  createdAt: string;
}

function userKey(id: string) { return `user:${id}`; }
function emailIndexKey(email: string) { return `user:email:${email.toLowerCase()}`; }

const USER_INDEX_KEY = 'user:index';

export async function createUser(email: string, name: string, password: string): Promise<AppUser> {
  const redis = await getRedisClient();

  const existing = await redis.get(emailIndexKey(email));
  if (existing) throw new Error('Email already registered');

  const id = crypto.randomUUID();
  const passwordHash = await bcrypt.hash(password, 12);

  const user: AppUser = {
    id,
    email: email.toLowerCase(),
    name,
    passwordHash,
    createdAt: new Date().toISOString(),
  };

  await redis.set(userKey(id), JSON.stringify(user));
  await redis.set(emailIndexKey(email), id);
  await redis.sAdd(USER_INDEX_KEY, id);

  return user;
}

export async function getUserById(id: string): Promise<AppUser | null> {
  const redis = await getRedisClient();
  const data = await redis.get(userKey(id));
  if (!data) return null;
  return JSON.parse(data) as AppUser;
}

export async function getAllUserIds(): Promise<string[]> {
  const redis = await getRedisClient();
  return redis.sMembers(USER_INDEX_KEY);
}

/**
 * Backfill the user:index set for users created before the index existed.
 * Scans user:email:* keys to discover all user IDs.
 */
export async function backfillUserIndex(): Promise<number> {
  const redis = await getRedisClient();
  let cursor = 0;
  let added = 0;

  do {
    const result = await redis.scan(cursor, { MATCH: 'user:email:*', COUNT: 100 });
    cursor = result.cursor;
    for (const key of result.keys) {
      const userId = await redis.get(key);
      if (userId) {
        const wasNew = await redis.sAdd(USER_INDEX_KEY, userId);
        if (wasNew) added++;
      }
    }
  } while (cursor !== 0);

  return added;
}

export async function getUserByEmail(email: string): Promise<AppUser | null> {
  const redis = await getRedisClient();
  const id = await redis.get(emailIndexKey(email));
  if (!id) return null;
  const data = await redis.get(userKey(id));
  if (!data) return null;
  return JSON.parse(data) as AppUser;
}

export async function verifyPassword(user: AppUser, password: string): Promise<boolean> {
  return bcrypt.compare(password, user.passwordHash);
}
