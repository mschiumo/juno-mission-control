import { createClient } from 'redis';

const redisUrl = process.env.REDIS_URL || process.env.UPSTASH_REDIS_REST_URL || 'redis://localhost:6379';

let client: ReturnType<typeof createClient> | null = null;

export async function getRedisClient() {
  if (client) return client;
  
  client = createClient({
    url: redisUrl,
  });
  
  client.on('error', (err) => {
    console.error('Redis Client Error:', err);
  });
  
  await client.connect();
  return client;
}

export async function disconnectRedis() {
  if (client) {
    await client.disconnect();
    client = null;
  }
}
