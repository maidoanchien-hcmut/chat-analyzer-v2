import { afterEach, describe, expect, it } from "bun:test";
import { Elysia } from "elysia";
import { readModelsController } from "./read_models.controller.ts";
import { readModelsService } from "./read_models.service.ts";

const restorers: Array<() => void> = [];
const CONNECTED_PAGE_ID = "11111111-1111-4111-8111-111111111111";

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
    const response = await app.handle(new Request(`http://localhost/read-models/overview?pageId=${CONNECTED_PAGE_ID}&startDate=2026-04-01&endDate=2026-04-05&publishSnapshot=provisional&inboxBucket=new&revisit=revisit&need=dat_lich&outcome=booked&risk=high&staff=Lan`));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      overview: expect.objectContaining({
        pageLabel: CONNECTED_PAGE_ID,
        snapshot: expect.objectContaining({
          coverage: "2026-04-01 -> 2026-04-05"
        })
      })
    });
  });

  it("parses thread history params and returns owner-shaped thread workspace payload", async () => {
    patchValue(readModelsService, "getThreadHistory", async (_filters, threadId, threadDayId, tab) => ({
      warning: null,
      threads: [
        {
          id: threadId ?? "thread-1",
          customer: "Lan Anh",
          snippet: "Khach hoi gia",
          updatedAt: "2026-04-04",
          badges: ["Inbox moi"]
        }
      ],
      activeThreadId: threadId ?? "thread-1",
      activeThreadDayId: threadDayId ?? "thread-day-1",
      activeTab: tab,
      transcript: [],
      analysisHistory: [],
      audit: {
        model: "gpt-5.4-mini",
        promptVersion: "Prompt A12",
        promptHash: "sha256:prompt-a12",
        taxonomyVersion: "tax-2026-04",
        evidence: [],
        explanations: [],
        supportingMessageIds: []
      },
      crmLink: {
        customer: "CRM KH-7712",
        method: "deterministic",
        confidence: "0.97",
        history: []
      }
    }));

    const app = new Elysia().use(readModelsController);
    const response = await app.handle(new Request(`http://localhost/read-models/thread-history?pageId=${CONNECTED_PAGE_ID}&startDate=2026-04-01&endDate=2026-04-05&publishSnapshot=official&threadId=thread-1&threadDayId=thread-day-9&threadTab=ai-audit`));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      threadHistory: expect.objectContaining({
        activeThreadId: "thread-1",
        activeThreadDayId: "thread-day-9",
        activeTab: "ai-audit"
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
