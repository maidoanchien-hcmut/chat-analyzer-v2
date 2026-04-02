import { redisManager } from "./redis.ts";

type RateLimitResult = {
  allowed: boolean;
  attempts: number;
  retryAfterSeconds: number;
};

const localAttempts = new Map<string, { count: number; expiresAt: number }>();

export async function consumeRateLimit(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
  const client = await redisManager.getClient();

  if (client) {
    const namespacedKey = `rate-limit:${key}`;
    const attempts = await client.incr(namespacedKey);

    if (attempts === 1) {
      await client.expire(namespacedKey, windowSeconds);
    }

    const ttl = Math.max(await client.ttl(namespacedKey), 0);
    return {
      allowed: attempts <= limit,
      attempts,
      retryAfterSeconds: ttl
    };
  }

  const now = Date.now();
  const current = localAttempts.get(key);

  if (!current || current.expiresAt <= now) {
    localAttempts.set(key, { count: 1, expiresAt: now + windowSeconds * 1000 });
    return { allowed: true, attempts: 1, retryAfterSeconds: windowSeconds };
  }

  current.count += 1;
  const retryAfterSeconds = Math.max(Math.ceil((current.expiresAt - now) / 1000), 0);

  return {
    allowed: current.count <= limit,
    attempts: current.count,
    retryAfterSeconds
  };
}

export async function resetRateLimit(key: string) {
  const client = await redisManager.getClient();

  if (client) {
    await client.del(`rate-limit:${key}`);
    return;
  }

  localAttempts.delete(key);
}
