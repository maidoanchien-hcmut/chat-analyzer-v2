import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { FrontendApp } from "./frontend-app.ts";

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

      if (url.pathname === "/chat-extractor/control-center/pages/register" && request.method === "POST") {
        connectedPagesResponse = [
          {
            id: "11111111-1111-4111-8111-111111111111",
            pageName: "Page Da Lieu Quan 1",
            pancakePageId: "pk_101",
            businessTimezone: "Asia/Ho_Chi_Minh",
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

  it("hydrates the returned backend config immediately after register", async () => {
    installBrowserGlobals("?view=configuration", baseUrl);
    const root = createRoot();
    const app = new FrontendApp(root);
    await app.init();

    (app as any).onboarding = {
      token: "user-token",
      tokenPages: [{ pageId: "pk_101", pageName: "Page Da Lieu Quan 1" }],
      selectedPancakePageId: "pk_101",
      timezone: "Asia/Ho_Chi_Minh",
      etlEnabled: true,
      analysisEnabled: false
    };

    const form = {
      [Symbol.iterator]: undefined
    } as unknown as HTMLFormElement;
    (globalThis as Record<string, unknown>).FormData = class {
      get(name: string) {
        return name === "pancakePageId" ? "pk_101" : null;
      }
    };

    await (app as any).registerPage(form);

    expect((app as any).configuration.selectedPageId).toBe("11111111-1111-4111-8111-111111111111");
    expect((app as any).configuration.pageDetail?.activeConfigVersionId).toBe("cfg-101");
    expect((app as any).configuration.promptText).toBe("Prompt default từ backend.");
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

function createRoot() {
  return {
    innerHTML: "",
    addEventListener() {}
  } as unknown as HTMLDivElement;
}

function json(value: unknown) {
  return new Response(JSON.stringify(value), {
    headers: {
      "Content-Type": "application/json"
    }
  });
}
