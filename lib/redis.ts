import { createClient } from 'redis';

// Matches the env var priority used in lib/cron-helpers.ts (UPSTASH_REDIS_URL first).
// UPSTASH_REDIS_REST_URL is the HTTP-based Upstash client URL — not compatible with
// node-redis which speaks the Redis protocol. Using it here would cause a connection
// failure that queues commands indefinitely and hangs serverless functions.
const redisUrl = process.env.UPSTASH_REDIS_URL || process.env.REDIS_URL || 'redis://localhost:6379';

let client: ReturnType<typeof createClient> | null = null;

export async function getRedisClient() {
  // Return the existing client only if it is connected and ready.
  if (client?.isReady) return client;

  // Clean up any stale disconnected client before creating a new one.
  if (client) {
    try { await client.disconnect(); } catch { /* ignore */ }
    client = null;
  }

  try {
    const newClient = createClient({
      url: redisUrl,
      socket: {
        // Do not retry indefinitely in a serverless environment — fail fast so the
        // calling code can catch the error rather than hanging until a timeout kill.
        reconnectStrategy: false,
      },
    });

    newClient.on('error', (err) => {
      console.error('Redis Client Error:', err);
    });

    await newClient.connect();
    client = newClient;
    return client;
  } catch (error) {
    console.error('Failed to connect to Redis:', error);
    throw error;
  }
}

export async function disconnectRedis() {
  if (client) {
    await client.disconnect();
    client = null;
  }
}
