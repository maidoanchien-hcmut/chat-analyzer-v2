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

  it("returns 400 when read-models receives a non-UUID pageId", async () => {
    const { app } = await import("./app.ts");
    const response = await app.handle(new Request("http://localhost/read-models/overview?pageId=&startDate=2026-04-01&endDate=2026-04-05"));

    expect(response.status).toBe(400);
    await expect(response.text()).resolves.toBe("pageId phải là connected_page_id UUID hợp lệ.");
  });

  it("returns 400 when page comparison receives invalid comparePageIds", async () => {
    const { app } = await import("./app.ts");
    const response = await app.handle(new Request("http://localhost/read-models/page-comparison?startDate=2026-04-01&endDate=2026-04-05&comparePageIds=not-a-uuid"));

    expect(response.status).toBe(400);
    await expect(response.text()).resolves.toBe("comparePageIds phải là connected_page_id UUID hợp lệ.");
  });
});

function patchValue<T extends object, K extends keyof T>(target: T, key: K, value: T[K]) {
  const original = target[key];
  target[key] = value;
  restorers.push(() => {
    target[key] = original;
  });
}
