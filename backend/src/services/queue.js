import Redis from 'ioredis';

let client = null;

export function getQueue() {
  if (!client) {
    client = new Redis(process.env.REDIS_URI, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        if (times > 5) return null;
        return Math.min(times * 200, 2000);
      },
      lazyConnect: true,
    });

    client.on('error', (err) => {
      console.error('Redis error:', err.message);
    });
  }
  return client;
}

export async function pushTask(taskId) {
  const redis = getQueue();
  try {
    await redis.connect();
    await redis.lpush('task:queue', taskId);
    await redis.quit();
    client = null;
    return true;
  } catch (err) {
    console.error('Failed to push task to queue:', err.message);
    return false;
  }
}

export async function isRedisHealthy() {
  const redis = getQueue();
  try {
    await redis.connect();
    const pong = await redis.ping();
    await redis.quit();
    client = null;
    return pong === 'PONG';
  } catch {
    return false;
  }
}
