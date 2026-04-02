import Redis from "ioredis";
import { env } from "../config/env.ts";

class RedisManager {
  private client: Redis | null = null;
  private available = false;
  private connectAttempted = false;

  async getClient() {
    if (this.client) {
      return this.client;
    }

    this.connectAttempted = true;

    const client = new Redis(env.redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 1
    });

    client.on("error", () => {
      this.available = false;
    });

    try {
      await client.connect();
      this.client = client;
      this.available = true;
      return client;
    } catch {
      this.available = false;
      await client.quit().catch(() => undefined);
      return null;
    }
  }

  isAvailable() {
    return this.available;
  }

  hasAttemptedConnection() {
    return this.connectAttempted;
  }

  async ping() {
    const client = await this.getClient();
    if (!client) {
      return null;
    }

    try {
      return await client.ping();
    } catch {
      this.available = false;
      return null;
    }
  }

  async close() {
    if (!this.client) {
      return;
    }

    await this.client.quit().catch(() => undefined);
    this.client = null;
    this.available = false;
  }
}

export const redisManager = new RedisManager();

