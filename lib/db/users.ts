import { getRedisClient } from '@/lib/redis';
import bcrypt from 'bcryptjs';

export interface AppUser {
  id: string;
  email: string;
  name: string;
  passwordHash: string | null;
  provider: 'credentials' | 'google';
  createdAt: string;
}

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
    provider: 'credentials',
    createdAt: new Date().toISOString(),
  };

  await redis.set(userKey(id), JSON.stringify(user));
  await redis.set(emailIndexKey(email), id);

  return user;
}

export async function findOrCreateOAuthUser(
  email: string,
  name: string,
  provider: 'google',
): Promise<AppUser> {
  const redis = await getRedisClient();

  const existingId = await redis.get(emailIndexKey(email));
  if (existingId) {
    const data = await redis.get(userKey(existingId));
    if (data) return JSON.parse(data) as AppUser;
  }

  const id = crypto.randomUUID();
  const user: AppUser = {
    id,
    email: email.toLowerCase(),
    name,
    passwordHash: null,
    provider,
    createdAt: new Date().toISOString(),
  };

  await redis.set(userKey(id), JSON.stringify(user));
  await redis.set(emailIndexKey(email), id);

  return user;
}

export async function getUserById(id: string): Promise<AppUser | null> {
  const redis = await getRedisClient();
  const data = await redis.get(userKey(id));
  if (!data) return null;
  return JSON.parse(data) as AppUser;
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
  if (!user.passwordHash) return false;
  return bcrypt.compare(password, user.passwordHash);
}
