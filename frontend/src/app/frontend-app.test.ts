import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { FrontendApp, shouldRerenderConfigurationChange } from "./frontend-app.ts";
import { DEFAULT_PAGE_LOCAL_PROMPT } from "../features/configuration/state.ts";

let server: ReturnType<typeof Bun.serve> | null = null;
let baseUrl = "";
const requests: string[] = [];
let connectedPagesResponse: Array<Record<string, unknown>> = [];
const originalWindow = (globalThis as Record<string, unknown>).window;
const originalDocument = (globalThis as Record<string, unknown>).document;
const originalLocalStorage = (globalThis as Record<string, unknown>).localStorage;
const originalFormData = (globalThis as Record<string, unknown>).FormData;

beforeEach(() => {
  requests.length = 0;
  connectedPagesResponse = [
    {
      id: "11111111-1111-4111-8111-111111111111",
      pageName: "Page Da Lieu Quan 1",
      pancakePageId: "pk_101",
      businessTimezone: "Asia/Ho_Chi_Minh",
      tokenStatus: "not_checked",
      connectionStatus: "not_checked",
      tokenPreviewMasked: null,
      lastValidatedAt: null,
      etlEnabled: true,
      analysisEnabled: false,
      activeConfigVersionId: null,
      activeConfigVersion: null,
      configVersions: [],
      updatedAt: "2026-04-05T09:00:00.000Z"
    }
  ];
  server = Bun.serve({
    port: 0,
    async fetch(request) {
      const url = new URL(request.url);
      requests.push(`${request.method} ${url.pathname}`);

      if (url.pathname === "/read-models/catalog") {
        return json({
          catalog: {
            pages: [
              {
                id: "11111111-1111-4111-8111-111111111111",
                label: "Page Da Lieu Quan 1",
                pancakePageId: "pk_101",
                timezone: "Asia/Ho_Chi_Minh"
              }
            ],
            needs: [{ value: "all", label: "Tất cả nhu cầu" }],
            outcomes: [{ value: "all", label: "Tất cả outcome" }],
            risks: [{ value: "all", label: "Tất cả rủi ro" }],
            staff: [{ value: "all", label: "Tất cả nhân viên" }]
          }
        });
      }

      if (url.pathname === "/chat-extractor/control-center/pages") {
        return json({
          pages: connectedPagesResponse
        });
      }

      if (url.pathname === "/chat-extractor/control-center/pages/list-from-token" && request.method === "POST") {
        return json({
          pages: [
            {
              pageId: "pk_101",
              pageName: "Page Da Lieu Quan 1"
            }
          ]
        });
      }

      if (url.pathname === "/chat-extractor/control-center/pages/register" && request.method === "POST") {
        connectedPagesResponse = [
          {
            id: "11111111-1111-4111-8111-111111111111",
            pageName: "Page Da Lieu Quan 1",
            pancakePageId: "pk_101",
            businessTimezone: "Asia/Ho_Chi_Minh",
            tokenStatus: "valid",
            connectionStatus: "connected",
            tokenPreviewMasked: "abc***xyz",
            lastValidatedAt: "2026-04-05T09:10:00.000Z",
            etlEnabled: true,
            analysisEnabled: false,
            activeConfigVersionId: "cfg-101",
            activeConfigVersion: {
              id: "cfg-101",
              versionNo: 1,
              promptText: "Prompt default từ backend.",
              tagMappingJson: null,
              openingRulesJson: null,
              schedulerJson: null,
              notificationTargetsJson: null,
              notes: null,
              analysisTaxonomyVersionId: "tax-1",
              analysisTaxonomyVersion: {
                versionCode: "default.v1"
              },
              createdAt: "2026-04-05T09:10:00.000Z"
            },
            configVersions: [
              {
                id: "cfg-101",
                versionNo: 1,
                promptText: "Prompt default từ backend.",
                tagMappingJson: null,
                openingRulesJson: null,
                schedulerJson: null,
                notificationTargetsJson: null,
                notes: null,
                analysisTaxonomyVersionId: "tax-1",
                analysisTaxonomyVersion: {
                  versionCode: "default.v1"
                },
                createdAt: "2026-04-05T09:10:00.000Z"
              }
            ],
            updatedAt: "2026-04-05T09:10:00.000Z"
          }
        ];
        return json({
          page: connectedPagesResponse[0]
        });
      }

      if (url.pathname === "/chat-extractor/control-center/pages/onboarding-sample/preview" && request.method === "POST") {
        return json({
          samplePreview: {
            pageId: "pk_101",
            targetDate: "2026-04-05",
            businessTimezone: "Asia/Ho_Chi_Minh",
            windowStartAt: "2026-04-04T17:00:00.000Z",
            windowEndExclusiveAt: "2026-04-05T06:00:00.000Z",
            summary: {
              conversations_scanned: 3,
              thread_days_built: 2,
              messages_seen: 10,
              messages_selected: 6
            },
            pageTags: [
              { pancakeTagId: "11", text: "KH mới", isDeactive: false }
            ],
            conversations: [
              {
                conversationId: "c-1",
                customerDisplayName: "Khách A",
                firstMeaningfulMessageText: "Cho mình hỏi lịch tái khám.",
                observedTagsJson: [{ source_tag_id: "11", source_tag_text: "KH mới" }],
                normalizedTagSignalsJson: { journey: [{ source_tag_id: "11", source_tag_text: "KH mới", canonical_code: "new_to_clinic", mapping_source: "operator" }], need: [], outcome: [], branch: [], staff: [], noise: [] },
                openingBlockJson: {
                  explicit_signals: [{ signal_role: "journey", signal_code: "revisit", raw_text: "Khách hàng tái khám" }],
                  messages: [{ sender_role: "customer", message_type: "text", redacted_text: "Cho mình hỏi lịch tái khám." }],
                  cut_reason: "first_meaningful_message"
                }
              }
            ]
          }
        });
      }

      if (url.pathname === "/read-models/health") {
        return json({
          healthSummary: {
            generatedAt: "2026-04-05T09:00:00.000Z",
            cards: [
              { key: "backend", label: "backend", status: "ready", detail: "ok" }
            ]
          }
        });
      }

      return new Response("Not found", { status: 404 });
    }
  });
  baseUrl = `http://127.0.0.1:${server.port}`;
});

afterEach(() => {
  server?.stop(true);
  server = null;
  const globals = globalThis as Record<string, unknown>;
  globals.window = originalWindow;
  globals.document = originalDocument;
  globals.localStorage = originalLocalStorage;
  globals.FormData = originalFormData;
});

describe("frontend app", () => {
  it("does not re-enter operations view loading on init", async () => {
    installBrowserGlobals("?view=operations", baseUrl);
    const root = createRoot();

    const app = new FrontendApp(root);
    await app.init();

    expect(requests).toEqual([
      "GET /read-models/catalog",
      "GET /chat-extractor/control-center/pages",
      "GET /read-models/health"
    ]);
  });

  it("register keeps a sample-seeded draft while binding the new connected page context", async () => {
    installBrowserGlobals("?view=configuration", baseUrl);
    const root = createRoot();
    const app = new FrontendApp(root);
    await app.init();

    (app as any).configuration.workspace = {
      ...(app as any).configuration.workspace,
      token: "user-token",
      tokenPages: [{ pageId: "pk_101", pageName: "Page Da Lieu Quan 1" }],
      selectedPancakePageId: "pk_101",
      selectedPageId: "",
      businessTimezone: "Asia/Ho_Chi_Minh",
      etlEnabled: true,
      analysisEnabled: false,
      sampleConversationLimit: 12,
      promptText: "Prompt đang chỉnh từ sample",
      tagMappings: [
        { sourceTagId: "", rawTag: "KH mới", role: "customer_journey", canonicalValue: "new_to_clinic", source: "operator_override" }
      ]
    };
    (app as any).configuration.onboardingSamplePreview = {
      pageId: "pk_101",
      pageName: "Page Da Lieu Quan 1",
      targetDate: "2026-04-05",
      businessTimezone: "Asia/Ho_Chi_Minh",
      windowStartAt: "2026-04-04T17:00:00.000Z",
      windowEndExclusiveAt: "2026-04-05T06:00:00.000Z",
      summary: {
        conversationsScanned: 1,
        threadDaysBuilt: 1,
        messagesSeen: 3,
        messagesSelected: 2
      },
      pageTags: [],
      conversations: []
    };

    const form = {
      dataset: {
        form: "onboarding-register"
      },
      [Symbol.iterator]: undefined
    } as unknown as HTMLFormElement;
    (globalThis as Record<string, unknown>).FormData = class {
      get(name: string) {
        return name === "pancakePageId" ? "pk_101" : null;
      }
    };

    await (app as any).registerPage(form);

    expect((app as any).configuration.workspace.selectedPageId).toBe("11111111-1111-4111-8111-111111111111");
    expect((app as any).configuration.pageDetail?.activeConfigVersionId).toBe("cfg-101");
    expect((app as any).configuration.workspace.promptText).toBe("Prompt đang chỉnh từ sample");
    expect((app as any).configuration.workspace.tagMappings[0]).toEqual({
      sourceTagId: "",
      rawTag: "KH mới",
      role: "customer_journey",
      canonicalValue: "new_to_clinic",
      source: "operator_override"
    });
    expect((app as any).configuration.onboardingSamplePreview?.pageId).toBe("pk_101");
  });

  it("loads real onboarding sample preview into configuration state", async () => {
    installBrowserGlobals("?view=configuration", baseUrl);
    const root = createRoot();
    const app = new FrontendApp(root);
    await app.init();

    (app as any).configuration.workspace = {
      ...(app as any).configuration.workspace,
      token: "user-token",
      tokenPages: [{ pageId: "pk_101", pageName: "Page Da Lieu Quan 1" }],
      selectedPancakePageId: "pk_101",
      businessTimezone: "Asia/Ho_Chi_Minh",
      etlEnabled: true,
      analysisEnabled: false,
      sampleConversationLimit: 12
    };

    await (app as any).loadOnboardingSamplePreview(null);

    expect((app as any).configuration.onboardingSamplePreview?.pageName).toBe("Page Da Lieu Quan 1");
    expect((app as any).configuration.onboardingSamplePreview?.conversations[0]?.normalizedTagSignals[0]?.canonicalCode).toBe("new_to_clinic");
    expect((app as any).configuration.workspace.tagMappings[0]).toEqual({
      sourceTagId: "11",
      rawTag: "KH mới",
      role: "customer_journey",
      canonicalValue: "new_to_clinic",
      source: "operator_override"
    });
    expect((app as any).configuration.workspace.promptText).toBe(DEFAULT_PAGE_LOCAL_PROMPT);
    expect((app as any).configuration.workspace.openingRules[0]).toEqual({
      buttonTitle: "Khách hàng tái khám",
      signalType: "customer_journey",
      canonicalValue: "revisit"
    });
  });

  it("keeps the newly saved config version selected when operator does not activate immediately", async () => {
    installBrowserGlobals("?view=configuration", baseUrl);
    const root = createRoot();
    const app = new FrontendApp(root);
    await app.init();

    const activeConfig = {
      id: "cfg-101",
      versionNo: 1,
      promptText: "Prompt default từ backend.",
      tagMappingJson: null,
      openingRulesJson: null,
      schedulerJson: null,
      notificationTargetsJson: null,
      notes: null,
      analysisTaxonomyVersionId: "tax-1",
      analysisTaxonomyVersionCode: "default.v1",
      createdAt: "2026-04-05T09:10:00.000Z",
      promptVersionLabel: "Prompt A1",
      promptHash: "sha256:a1",
      evidenceBundle: [],
      fieldExplanations: []
    };
    const createdConfig = {
      ...activeConfig,
      id: "cfg-102",
      versionNo: 2,
      promptText: "Prompt draft vừa lưu.",
      promptVersionLabel: "Prompt A2",
      promptHash: "sha256:a2"
    };

    (app as any).configuration.pageDetail = {
      ...connectedPagesResponse[0],
      activeConfigVersionId: "cfg-101",
      activeConfigVersion: activeConfig,
      configVersions: [activeConfig]
    };
    (app as any).configuration.workspace = {
      ...(app as any).configuration.workspace,
      selectedPageId: "11111111-1111-4111-8111-111111111111",
      selectedConfigVersionId: "cfg-101",
      promptText: "Prompt draft vừa lưu.",
      tagMappings: [
        { sourceTagId: "11", rawTag: "KH mới", role: "customer_journey", canonicalValue: "new_to_clinic", source: "operator_override" }
      ],
      openingRules: [
        { buttonTitle: "Khách hàng tái khám", signalType: "customer_journey", canonicalValue: "revisit" }
      ],
      scheduler: { useSystemDefaults: true, timezone: "Asia/Ho_Chi_Minh", officialDailyTime: "00:00", lookbackHours: 2 },
      notificationTargets: [{ channel: "telegram", value: "" }],
      notes: "",
      activateAfterCreate: false
    };
    Object.assign((app as any).controlPlaneAdapter, {
      async createConfigVersion() {
        return createdConfig;
      },
      async getConnectedPage() {
        return {
          ...(app as any).configuration.pageDetail,
          configVersions: [createdConfig, activeConfig],
          activeConfigVersion: activeConfig,
          activeConfigVersionId: "cfg-101"
        };
      }
    });

    const form = {
      dataset: { form: "configuration-create" }
    } as unknown as HTMLFormElement;
    (globalThis as Record<string, unknown>).FormData = class {
      get(name: string) {
        const values: Record<string, string> = {
          selectedConfigVersionId: "cfg-101",
          promptText: "Prompt draft vừa lưu.",
          promptCloneSourceVersionId: "",
          promptCloneSourcePageId: "",
          promptCompareLeftVersionId: "",
          promptCompareRightVersionId: "",
          selectedPromptSampleConversationId: "",
          notes: "",
          schedulerTimezone: "Asia/Ho_Chi_Minh",
          schedulerOfficialDailyTime: "00:00",
          schedulerLookbackHours: "2"
        };
        return values[name] ?? null;
      }

      getAll(name: string) {
        const values: Record<string, string[]> = {
          tagSourceTagId: ["11"],
          tagRawTag: ["KH mới"],
          tagRole: ["customer_journey"],
          tagCanonicalValue: ["new_to_clinic"],
          tagSource: ["operator_override"],
          openingButtonTitle: ["Khách hàng tái khám"],
          openingSignalType: ["customer_journey"],
          openingCanonicalValue: ["revisit"],
          notificationChannel: ["telegram"],
          notificationValue: [""]
        };
        return values[name] ?? [];
      }
    };

    await (app as any).createConfigVersion(form);

    expect((app as any).configuration.workspace.selectedConfigVersionId).toBe("cfg-102");
    expect((app as any).configuration.workspace.promptText).toBe("Prompt draft vừa lưu.");
    expect((app as any).configuration.draftSource).toBe("connected_page_saved_version");
    expect((app as any).configuration.pageDetail.configVersions[0].id).toBe("cfg-102");
  });

  it("finalizes onboarding with the current draft before the page is added to operations", async () => {
    installBrowserGlobals("?view=configuration", baseUrl);
    const root = createRoot();
    const app = new FrontendApp(root);
    await app.init();

    let capturedRegisterInput: Record<string, unknown> | null = null;
    Object.assign((app as any).controlPlaneAdapter, {
      async registerPage(input: Record<string, unknown>) {
        capturedRegisterInput = input;
        return {
          ...connectedPagesResponse[0],
          pageName: "Page Da Lieu Quan 1",
          pancakePageId: "pk_101",
          businessTimezone: "Asia/Ho_Chi_Minh",
          activeConfigVersionId: "cfg-101",
          activeConfigVersion: {
            id: "cfg-101",
            versionNo: 1,
            promptText: "Prompt draft onboarding",
            tagMappingJson: {
              version: 1,
              defaultRole: "noise",
              entries: [
                {
                  sourceTagId: "11",
                  sourceTagText: "KH mới",
                  role: "journey",
                  canonicalCode: "new_to_clinic",
                  mappingSource: "operator",
                  status: "active"
                }
              ]
            },
            openingRulesJson: null,
            schedulerJson: null,
            notificationTargetsJson: null,
            notes: null,
            analysisTaxonomyVersionId: "tax-1",
            analysisTaxonomyVersionCode: "default.v1",
            createdAt: "2026-04-05T09:10:00.000Z",
            promptVersionLabel: "Prompt A1",
            promptHash: "sha256:a1",
            evidenceBundle: [],
            fieldExplanations: []
          },
          configVersions: []
        };
      }
    });
    (app as any).configuration.workspace = {
      ...(app as any).configuration.workspace,
      token: "user-token",
      tokenPages: [{ pageId: "pk_101", pageName: "Page Da Lieu Quan 1" }],
      selectedPancakePageId: "pk_101",
      selectedPageId: "",
      promptText: "Prompt draft onboarding",
      tagMappings: [
        { sourceTagId: "11", rawTag: "KH mới", role: "customer_journey", canonicalValue: "new_to_clinic", source: "operator_override" }
      ],
      openingRules: [{ buttonTitle: "", signalType: "customer_journey", canonicalValue: "" }],
      scheduler: { useSystemDefaults: true, timezone: "Asia/Ho_Chi_Minh", officialDailyTime: "00:00", lookbackHours: 2 },
      notificationTargets: [{ channel: "telegram", value: "" }],
      notes: "",
      activateAfterCreate: true
    };

    const form = {
      dataset: { form: "configuration-create" }
    } as unknown as HTMLFormElement;
    (globalThis as Record<string, unknown>).FormData = class {
      get(name: string) {
        const values: Record<string, string> = {
          selectedConfigVersionId: "",
          promptText: "Prompt draft onboarding",
          promptCloneSourceVersionId: "",
          promptCloneSourcePageId: "",
          promptCompareLeftVersionId: "",
          promptCompareRightVersionId: "",
          selectedPromptSampleConversationId: "",
          notes: "",
          schedulerTimezone: "Asia/Ho_Chi_Minh",
          schedulerOfficialDailyTime: "00:00",
          schedulerLookbackHours: "2"
        };
        return values[name] ?? null;
      }

      getAll(name: string) {
        const values: Record<string, string[]> = {
          tagSourceTagId: ["11"],
          tagRawTag: ["KH mới"],
          tagRole: ["customer_journey"],
          tagCanonicalValue: ["new_to_clinic"],
          tagSource: ["operator_override"],
          openingButtonTitle: [""],
          openingSignalType: ["customer_journey"],
          openingCanonicalValue: [""],
          notificationChannel: ["telegram"],
          notificationValue: [""]
        };
        return values[name] ?? [];
      }
    };

    await (app as any).createConfigVersion(form);

    expect(capturedRegisterInput).toMatchObject({
      pancakePageId: "pk_101",
      userAccessToken: "user-token",
      promptText: "Prompt draft onboarding"
    });
    expect((capturedRegisterInput as any).tagMappingJson.entries[0]).toMatchObject({
      sourceTagId: "11",
      canonicalCode: "new_to_clinic",
      mappingSource: "operator"
    });
    expect((app as any).configuration.workspace.selectedPageId).toBe("11111111-1111-4111-8111-111111111111");
    expect((app as any).configuration.draftSource).toBe("connected_page_active_config");
  });

  it("clears a stale connected page binding when onboarding switches to a different pancake page", async () => {
    installBrowserGlobals("?view=configuration", baseUrl);
    const root = createRoot();
    const app = new FrontendApp(root);
    await app.init();

    (app as any).configuration.workspace.selectedPancakePageId = "pk_new";
    (app as any).configuration.workspace.selectedPageId = "11111111-1111-4111-8111-111111111111";

    await (app as any).refreshControlPages({ reloadView: false });

    expect((app as any).configuration.workspace.selectedPageId).toBe("");
  });

  it("uses custom onboarding sample limits from the register form", async () => {
    installBrowserGlobals("?view=configuration", baseUrl);
    const root = createRoot();
    const app = new FrontendApp(root);
    await app.init();

    (app as any).configuration.workspace = {
      ...(app as any).configuration.workspace,
      token: "user-token",
      tokenPages: [{ pageId: "pk_101", pageName: "Page Da Lieu Quan 1" }],
      selectedPancakePageId: "pk_101",
      businessTimezone: "Asia/Ho_Chi_Minh",
      sampleConversationLimit: 5
    };
    let capturedPreviewInput: {
      sampleConversationLimit?: number;
    } | null = null;
    Object.assign((app as any).controlPlaneAdapter, {
      async previewOnboardingSample(input: Record<string, unknown>) {
        capturedPreviewInput = input;
        return {
          pageId: "pk_101",
          pageName: "Page Da Lieu Quan 1",
          targetDate: "2026-04-05",
          businessTimezone: "Asia/Ho_Chi_Minh",
          windowStartAt: "2026-04-04T17:00:00.000Z",
          windowEndExclusiveAt: "2026-04-05T06:00:00.000Z",
          summary: {
            conversationsScanned: 0,
            threadDaysBuilt: 0,
            messagesSeen: 0,
            messagesSelected: 0
          },
          pageTags: [],
          conversations: []
        };
      }
    });

    await (app as any).loadOnboardingSamplePreview(null);

    expect(capturedPreviewInput).toEqual(expect.objectContaining({
      sampleConversationLimit: 5
    }));
  });

  it("keeps the token in the shared workspace draft after listing pages", async () => {
    installBrowserGlobals("?view=configuration", baseUrl);
    const root = createRoot();
    const app = new FrontendApp(root);
    await app.init();

    const form = {
      dataset: {
        form: "onboarding-token"
      },
      [Symbol.iterator]: undefined
    } as unknown as HTMLFormElement;
    (globalThis as Record<string, unknown>).FormData = class {
      get(name: string) {
        const values: Record<string, string> = {
          token: "user-token",
          businessTimezone: "Asia/Ho_Chi_Minh"
        };
        return values[name] ?? null;
      }
    };

    await (app as any).listFromToken(form);

    expect((app as any).configuration.workspace.token).toBe("user-token");
    expect((app as any).configuration.workspace.selectedPancakePageId).toBe("pk_101");
  });

  it("rerenders configuration when selected config version changes", () => {
    const form = {
      dataset: { form: "configuration-create" }
    } as unknown as HTMLFormElement;
    const event = {
      target: {
        name: "selectedConfigVersionId",
        closest: () => form
      }
    } as unknown as Event;

    expect(shouldRerenderConfigurationChange(event, form)).toBe(true);
    expect(shouldRerenderConfigurationChange({
      target: {
        name: "tagRawTag",
        closest: () => form
      }
    } as unknown as Event, form)).toBe(false);
  });
});

function installBrowserGlobals(search: string, apiBaseUrl: string) {
  const globals = globalThis as Record<string, unknown>;
  globals.window = {
    location: { search },
    addEventListener() {},
    history: {
      replaceState() {},
      pushState() {}
    }
  };
  globals.document = {};
  globals.localStorage = {
    getItem(key: string) {
      return key === "chat-analyzer-v2:api-base-url" ? apiBaseUrl : null;
    },
    setItem() {}
  };
}

function createRoot(overrides?: Partial<HTMLDivElement>) {
  return {
    innerHTML: "",
    addEventListener() {},
    querySelector() {
      return null;
    },
    ...overrides
  } as unknown as HTMLDivElement;
}

function json(value: unknown) {
  return new Response(JSON.stringify(value), {
    headers: {
      "Content-Type": "application/json"
    }
  });
}
