import { getRedisClient } from '@/lib/redis';
import bcrypt from 'bcryptjs';

export interface AppUser {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  createdAt: string;
}

const USER_INDEX_KEY = 'user:index';

function userKey(id: string) { return `user:${id}`; }
function emailIndexKey(email: string) { return `user:email:${email.toLowerCase()}`; }

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

export async function updateUser(id: string, updates: { name?: string; email?: string }): Promise<AppUser | null> {
  const redis = await getRedisClient();
  const data = await redis.get(userKey(id));
  if (!data) return null;

  const user = JSON.parse(data) as AppUser;

  if (updates.email && updates.email.toLowerCase() !== user.email) {
    const newEmail = updates.email.toLowerCase();
    const existing = await redis.get(emailIndexKey(newEmail));
    if (existing && existing !== id) throw new Error('Email already registered');
    await redis.del(emailIndexKey(user.email));
    await redis.set(emailIndexKey(newEmail), id);
    user.email = newEmail;
  }

  if (updates.name !== undefined) {
    user.name = updates.name;
  }

  await redis.set(userKey(id), JSON.stringify(user));
  return user;
}

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
