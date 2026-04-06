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
  it("parses register page request and forwards the onboarding draft fields", async () => {
    let capturedInput: unknown;
    patchValue(chatExtractorService, "registerPageConfig", async (input) => {
      capturedInput = input;
      return {
        page: {
          id: "cp-101",
          pancakePageId: input.pancakePageId,
          pageName: "O2 SKIN",
          businessTimezone: input.businessTimezone,
          etlEnabled: input.etlEnabled,
          analysisEnabled: input.analysisEnabled,
          activeConfigVersionId: "cfg-101",
          activeConfigVersion: {
            id: "cfg-101",
            versionNo: 1,
            promptText: "Prompt default",
            tagMappingJson: {
              version: 1,
              defaultRole: "noise",
              entries: []
            },
            openingRulesJson: {
              version: 1,
              selectors: []
            },
            schedulerJson: {
              version: 1,
              timezone: input.businessTimezone,
              officialDailyTime: "00:00",
              lookbackHours: 2,
              maxConversationsPerRun: 0,
              maxMessagePagesPerThread: 0
            },
            notificationTargetsJson: null,
            analysisTaxonomyVersionId: "taxonomy-1",
            analysisTaxonomyVersion: {
              id: "taxonomy-1",
              versionCode: "default.v1",
              taxonomyJson: {},
              isActive: true
            },
            notes: null,
            createdAt: "2026-04-05T06:00:00.000Z"
          },
          configVersions: [],
          createdAt: "2026-04-05T06:00:00.000Z",
          updatedAt: "2026-04-05T06:00:00.000Z"
        }
      };
    });

    const app = new Elysia().use(chatExtractorController);
    const response = await app.handle(new Request("http://localhost/chat-extractor/control-center/pages/register", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        pancakePageId: "1406535699642677",
        userAccessToken: "user-token",
        businessTimezone: "Asia/Saigon",
        etlEnabled: true,
        analysisEnabled: false
      })
    }));

    expect(response.status).toBe(200);
    expect(capturedInput).toEqual({
      pancakePageId: "1406535699642677",
      userAccessToken: "user-token",
      businessTimezone: "Asia/Saigon",
      etlEnabled: true,
      analysisEnabled: false
    });
    await expect(response.json()).resolves.toMatchObject({
      page: {
        id: "cp-101",
        pancakePageId: "1406535699642677",
        businessTimezone: "Asia/Saigon",
        activeConfigVersionId: "cfg-101"
      }
    });
  });

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

  it("parses connected-page prompt workspace sample request", async () => {
    patchValue(chatExtractorService, "previewPromptWorkspaceSample", async (pageId, input) => ({
      connectedPageId: pageId,
      pageId: "1406535699642677",
      pageName: "O2 SKIN",
      sampleWorkspaceKey: "11111111-1111-4111-8111-111111111111",
      sampleWorkspaceExpiresAt: "2026-04-05T06:30:00.000Z",
      targetDate: "2026-04-05",
      businessTimezone: "Asia/Saigon",
      windowStartAt: "2026-04-04T17:00:00.000Z",
      windowEndExclusiveAt: "2026-04-05T06:00:00.000Z",
      summary: {
        conversations_scanned: input.sampleConversationLimit
      },
      pageTags: [],
      conversations: []
    }));

    const app = new Elysia().use(chatExtractorController);
    const response = await app.handle(new Request("http://localhost/chat-extractor/control-center/pages/page-1/prompt-workspace/sample", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        sampleConversationLimit: 5,
        sampleMessagePageLimit: 2
      })
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      samplePreview: {
        connectedPageId: "page-1",
        pageId: "1406535699642677",
        pageName: "O2 SKIN",
        sampleWorkspaceKey: "11111111-1111-4111-8111-111111111111",
        sampleWorkspaceExpiresAt: "2026-04-05T06:30:00.000Z",
        targetDate: "2026-04-05",
        businessTimezone: "Asia/Saigon",
        windowStartAt: "2026-04-04T17:00:00.000Z",
        windowEndExclusiveAt: "2026-04-05T06:00:00.000Z",
        summary: {
          conversations_scanned: 5
        },
        pageTags: [],
        conversations: []
      }
    });
  });

  it("parses prompt preview artifact request with server-owned sample workspace identity", async () => {
    patchValue(chatExtractorService, "previewPromptArtifacts", async (pageId, input) => ({
      sample_scope: {
        sample_scope_key: "sha256:sample-scope",
        target_date: "2026-04-05",
        business_timezone: "Asia/Saigon",
        window_start_at: "2026-04-04T17:00:00.000Z",
        window_end_exclusive_at: "2026-04-05T06:00:00.000Z",
        selected_conversation_id: input.selectedConversationId
      },
      active_artifact: {
        id: "artifact-active",
        promptVersionLabel: "A12",
        promptHash: "sha256:active",
        taxonomyVersionCode: "default.v1",
        sampleScopeKey: "sha256:sample-scope",
        sampleConversationId: input.selectedConversationId,
        customerDisplayName: "Khách B",
        createdAt: "2026-04-05T06:00:00.000Z",
        runtimeMetadata: { pageId },
        result: { primary_need_code: "appointment_booking" },
        evidenceBundle: ["Opening block: Khách hàng tái khám"],
        fieldExplanations: [{ field: "primary_need_code", explanation: "Khách muốn đặt lịch." }],
        supportingMessageIds: ["msg-1"]
      },
      draft_artifact: {
        id: "artifact-draft",
        promptVersionLabel: "B01",
        promptHash: "sha256:draft",
        taxonomyVersionCode: "default.v1",
        sampleScopeKey: "sha256:sample-scope",
        sampleConversationId: input.selectedConversationId,
        customerDisplayName: "Khách B",
        createdAt: "2026-04-05T06:01:00.000Z",
        runtimeMetadata: { pageId },
        result: { primary_need_code: "consultation" },
        evidenceBundle: ["Prompt draft ưu tiên tư vấn."],
        fieldExplanations: [{ field: "primary_need_code", explanation: "Draft ưu tiên consultation." }],
        supportingMessageIds: ["msg-1"]
      }
    }));

    const app = new Elysia().use(chatExtractorController);
    const response = await app.handle(new Request("http://localhost/chat-extractor/control-center/pages/page-1/prompt-preview-artifacts", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        draftPromptText: "Prompt draft",
        sampleWorkspaceKey: "11111111-1111-4111-8111-111111111111",
        selectedConversationId: "thread-1"
      })
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      sample_scope: {
        sample_scope_key: "sha256:sample-scope",
        selected_conversation_id: "thread-1"
      },
      active_artifact: {
        promptVersionLabel: "A12"
      },
      draft_artifact: {
        promptVersionLabel: "B01"
      }
    });
  });
});

function patchValue<T extends object, K extends keyof T>(target: T, key: K, value: any) {
  const original = target[key];
  target[key] = value;
  restorers.push(() => {
    target[key] = original;
  });
}
