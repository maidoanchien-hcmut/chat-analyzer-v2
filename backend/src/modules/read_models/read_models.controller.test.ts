import { afterEach, describe, expect, it } from "bun:test";
import { Elysia } from "elysia";
import { readModelsController } from "./read_models.controller.ts";
import { readModelsService } from "./read_models.service.ts";

const restorers: Array<() => void> = [];

afterEach(() => {
  while (restorers.length > 0) {
    restorers.pop()!();
  }
});

describe("read models controller", () => {
  it("parses business filters and returns the overview payload", async () => {
    patchValue(readModelsService, "getOverview", async (filters) => ({
      pageLabel: filters.pageId,
      snapshot: {
        kind: "published_official",
        label: "Chinh thuc",
        coverage: `${filters.startDate} -> ${filters.endDate}`,
        promptVersion: "Prompt A10",
        configVersion: "v17",
        taxonomyVersion: "tax-2026-04"
      },
      warning: null,
      metrics: [],
      openingNew: [],
      openingRevisit: [],
      needs: [],
      outcomes: [],
      sources: [],
      priorities: []
    }));

    const app = new Elysia().use(readModelsController);
    const response = await app.handle(new Request("http://localhost/read-models/overview?pageId=page-1&startDate=2026-04-01&endDate=2026-04-05&publishSnapshot=provisional&inboxBucket=new&revisit=revisit&need=dat_lich&outcome=booked&risk=high&staff=Lan"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      overview: expect.objectContaining({
        pageLabel: "page-1",
        snapshot: expect.objectContaining({
          coverage: "2026-04-01 -> 2026-04-05"
        })
      })
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
