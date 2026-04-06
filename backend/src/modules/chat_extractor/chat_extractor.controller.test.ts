import { afterEach, describe, expect, it } from "bun:test";
import { Elysia } from "elysia";
import { chatExtractorController } from "./chat_extractor.controller.ts";
import { chatExtractorService } from "./chat_extractor.service.ts";

const restorers: Array<() => void> = [];

afterEach(() => {
  while (restorers.length > 0) {
    restorers.pop()!();
  }
});

describe("chat extractor controller", () => {
  it("parses onboarding sample preview request and returns the worker stdout shape", async () => {
    patchValue(chatExtractorService, "previewOnboardingSample", async (input) => ({
      pageId: input.pancakePageId,
      targetDate: "2026-04-05",
      businessTimezone: input.businessTimezone,
      windowStartAt: "2026-04-04T17:00:00.000Z",
      windowEndExclusiveAt: "2026-04-05T06:00:00.000Z",
      summary: {
        conversations_scanned: 4
      },
      pageTags: [
        {
          pancakeTagId: "22",
          text: "KH tái khám",
          isDeactive: false
        }
      ],
      conversations: [
        {
          conversationId: "thread-1",
          customerDisplayName: "Khách B",
          firstMeaningfulMessageText: "Mình muốn hỏi giá điều trị.",
          observedTagsJson: [{ sourceTagText: "KH tái khám" }],
          normalizedTagSignalsJson: { journey: [], need: [], outcome: [], branch: [], staff: [], noise: [] },
          openingBlockJson: { explicitSignals: [] }
        }
      ]
    }));

    const app = new Elysia().use(chatExtractorController);
    const response = await app.handle(new Request("http://localhost/chat-extractor/control-center/pages/onboarding-sample/preview", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        userAccessToken: "user-token",
        pancakePageId: "1406535699642677",
        businessTimezone: "Asia/Saigon",
        sampleConversationLimit: 5,
        sampleMessagePageLimit: 2
      })
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      samplePreview: {
        pageId: "1406535699642677",
        targetDate: "2026-04-05",
        businessTimezone: "Asia/Saigon",
        windowStartAt: "2026-04-04T17:00:00.000Z",
        windowEndExclusiveAt: "2026-04-05T06:00:00.000Z",
        summary: {
          conversations_scanned: 4
        },
        pageTags: [
          {
            pancakeTagId: "22",
            text: "KH tái khám",
            isDeactive: false
          }
        ],
        conversations: [
          {
            conversationId: "thread-1",
            customerDisplayName: "Khách B",
            firstMeaningfulMessageText: "Mình muốn hỏi giá điều trị.",
            observedTagsJson: [{ sourceTagText: "KH tái khám" }],
            normalizedTagSignalsJson: { journey: [], need: [], outcome: [], branch: [], staff: [], noise: [] },
            openingBlockJson: { explicitSignals: [] }
          }
        ]
      }
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
