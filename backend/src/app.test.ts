import { afterEach, describe, expect, it } from "bun:test";
import { prisma } from "./infra/prisma.ts";
import { redisManager } from "./infra/redis.ts";

const restorers: Array<() => void> = [];

afterEach(() => {
  while (restorers.length > 0) {
    restorers.pop()!();
  }
});

describe("app health", () => {
  it("returns degraded instead of 500 when the database probe throws", async () => {
    patchValue(prisma, "$queryRaw", async () => {
      throw new Error("database unavailable");
    });
    patchValue(redisManager, "ping", async () => "PONG");

    const { app } = await import("./app.ts");
    const response = await app.handle(new Request("http://localhost/health"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: "degraded",
      database: "degraded",
      redis: "ok",
      timestamp: expect.any(String)
    });
  });
});

function patchValue<T extends object, K extends keyof T>(target: T, key: K, value: T[K]) {
  const original = target[key];
  target[key] = value;
  restorers.push(() => {
    target[key] = original;
  });
}
