import { describe, expect, it } from "bun:test";
import { ChatExtractorService } from "./chat_extractor.service.ts";

function createConnectedPage(overrides: Record<string, unknown> = {}) {
  return {
    id: "connected-page-1",
    pancakePageId: "1406535699642677",
    pageName: "O2 SKIN - Tri Mun Chuan Y Khoa",
    pancakeUserAccessToken: "demo-user-token",
    businessTimezone: "Asia/Ho_Chi_Minh",
    autoScraperEnabled: false,
    autoAiAnalysisEnabled: false,
    activePromptVersionId: null,
    activeTagMappingJson: [],
    activeOpeningRulesJson: [],
    activeBotSignaturesJson: [],
    onboardingStateJson: {},
    isActive: true,
    createdAt: new Date("2026-04-02T08:00:00.000Z"),
    updatedAt: new Date("2026-04-02T08:00:00.000Z"),
    ...overrides
  };
}

function createPromptVersion(overrides: Record<string, unknown> = {}) {
  return {
    id: "prompt-version-1",
    connectedPageId: "connected-page-1",
    versionNo: 1,
    promptText: "Prompt hien tai",
    notes: null,
    createdAt: new Date("2026-04-02T09:00:00.000Z"),
    ...overrides
  };
}

function createRepository(overrides: Record<string, unknown> = {}) {
  return {
    listRecentRuns: async () => [],
    getRunById: async () => null,
    getRunCounts: async () => ({
      conversationDayCount: 0,
      messageCount: 0
    }),
    listConversationArtifacts: async () => [],
    nextSnapshotVersion: async () => 1,
    listConnectedPages: async () => [],
    getConnectedPageById: async () => null,
    upsertConnectedPage: async () => createConnectedPage(),
    updateConnectedPage: async () => createConnectedPage(),
    updateConnectedPageOnboardingState: async () => createConnectedPage(),
    listSchedulerPages: async () => [],
    listPagePromptVersions: async () => [],
    nextPromptVersionNo: async () => 1,
    createPagePromptVersion: async () => createPromptVersion(),
    getPagePromptVersionById: async () => null,
    getActivePromptVersion: async () => null,
    activatePagePromptVersion: async () => createConnectedPage(),
    ...overrides
  };
}

describe("ChatExtractorService control-plane", () => {
  it("registers Pancake page config into connected_page and removes frontend-owned fields from the contract", async () => {
    const captured: Array<Record<string, unknown>> = [];
    const repository = createRepository({
      upsertConnectedPage: async (input: Record<string, unknown>) => {
        captured.push(input);
        return createConnectedPage({
          pancakePageId: input.pancakePageId,
          pageName: "O2 SKIN - Tri Mun Chuan Y Khoa",
          pancakeUserAccessToken: input.pancakeUserAccessToken,
          businessTimezone: input.businessTimezone,
          autoScraperEnabled: input.autoScraperEnabled,
          autoAiAnalysisEnabled: input.autoAiAnalysisEnabled
        });
      }
    });
    const service = new ChatExtractorService({
      repository: repository as never,
      listPagesFromToken: async () => [
        {
          pageId: "1406535699642677",
          pageName: "O2 SKIN - Tri Mun Chuan Y Khoa"
        }
      ]
    });

    const result = await service.registerPageConfig({
      pancakePageId: "1406535699642677",
      userAccessToken: "demo-user-token",
      businessTimezone: "Asia/Ho_Chi_Minh",
      autoScraperEnabled: false,
      autoAiAnalysisEnabled: false
    });

    expect(captured).toEqual([
      {
        pancakePageId: "1406535699642677",
        pageName: "O2 SKIN - Tri Mun Chuan Y Khoa",
        pancakeUserAccessToken: "demo-user-token",
        businessTimezone: "Asia/Ho_Chi_Minh",
        autoScraperEnabled: false,
        autoAiAnalysisEnabled: false
      }
    ]);
    expect(result.page).toMatchObject({
      id: "connected-page-1",
      pancakePageId: "1406535699642677",
      pageName: "O2 SKIN - Tri Mun Chuan Y Khoa",
      businessTimezone: "Asia/Ho_Chi_Minh",
      autoScraperEnabled: false,
      autoAiAnalysisEnabled: false
    });
  });

  it("builds manual worker jobs from the stored connected_page config instead of a frontend page bundle", async () => {
    const repository = createRepository({
      getConnectedPageById: async () =>
        createConnectedPage({
          activeTagMappingJson: [
            {
              name: "vip",
              match_any_text: ["VIP"],
              signals: {
                lead_tier: "vip"
              }
            }
          ],
          activeBotSignaturesJson: [
            {
              name: "Bot tu dong",
              admin_name_contains: "Bot"
            }
          ]
        }),
      nextSnapshotVersion: async () => 3
    });
    const service = new ChatExtractorService({
      repository: repository as never
    });

    const result = await service.previewJobRequest({
      kind: "manual",
      connectedPageId: "connected-page-1",
      job: {
        jobName: "manual-day-run",
        processingMode: "etl_only",
        targetDate: "2026-04-01",
        runMode: null,
        requestedWindowStartAt: null,
        requestedWindowEndExclusiveAt: null,
        publish: false,
        runGroupId: null,
        snapshotVersion: null,
        windowStartAt: null,
        windowEndExclusiveAt: null,
        maxConversations: 0,
        maxMessagePagesPerConversation: 0
      }
    });

    expect(result).toMatchObject({
      kind: "manual",
      jobName: "manual-day-run",
      connectedPageId: "connected-page-1",
      pageName: "O2 SKIN - Tri Mun Chuan Y Khoa"
    });
    expect(result.workerJobs).toHaveLength(1);
    expect(result.workerJobs[0]).toMatchObject({
      connected_page_id: "connected-page-1",
      processing_mode: "etl_only",
      page_id: "1406535699642677",
      target_date: "2026-04-01",
      snapshot_version: 3,
      tag_rules: [
        {
          name: "vip"
        }
      ],
      bot_signatures: [
        {
          name: "Bot tu dong"
        }
      ],
      run_params_json: {}
    });
  });

  it("stores onboarding artifacts back onto connected_page after a successful onboarding execute", async () => {
    const capturedStates: unknown[] = [];
    const repository = createRepository({
      getConnectedPageById: async () => createConnectedPage(),
      nextSnapshotVersion: async () => 5,
      getRunById: async () => ({
        id: "3c04eb16-e849-47f5-a9b8-55d65742aa7c",
        connectedPageId: "connected-page-1",
        pageId: "1406535699642677",
        pageName: "O2 SKIN - Tri Mun Chuan Y Khoa",
        targetDate: new Date("2026-04-01T00:00:00.000Z"),
        businessTimezone: "Asia/Ho_Chi_Minh",
        requestedWindowStartAt: null,
        requestedWindowEndExclusiveAt: null,
        windowStartAt: new Date("2026-03-31T17:00:00.000Z"),
        windowEndExclusiveAt: new Date("2026-04-01T17:00:00.000Z"),
        status: "loaded",
        runMode: "onboarding_sample",
        processingMode: "etl_and_ai",
        snapshotVersion: 5,
        isPublished: false,
        runParamsJson: {
          initial_conversation_limit: 25
        },
        metricsJson: {},
        errorText: null,
        startedAt: new Date("2026-04-02T09:00:00.000Z"),
        finishedAt: new Date("2026-04-02T09:10:00.000Z")
      }),
      listConversationArtifacts: async () => [
        {
          conversationId: "conv-1",
          currentTagsJson: [{ text: "KH moi" }],
          openingBlocksJson: {
            opening_candidate_window: [{ redacted_text: "Bat dau" }],
            unmatched_candidate_texts: ["Khach hang lan dau"]
          }
        }
      ],
      updateConnectedPageOnboardingState: async (_id: string, onboardingStateJson: unknown) => {
        capturedStates.push(onboardingStateJson);
        return createConnectedPage({
          onboardingStateJson
        });
      }
    });
    const service = new ChatExtractorService({
      repository: repository as never,
      runWorker: async () => ({
        connectedPageId: "connected-page-1",
        pageId: "1406535699642677",
        targetDate: "2026-04-01",
        exitCode: 0,
        ok: true,
        stdout: "etl_run_id=3c04eb16-e849-47f5-a9b8-55d65742aa7c",
        stderr: ""
      })
    });

    const result = await service.executeJobRequest({
      kind: "onboarding",
      connectedPageId: "connected-page-1",
      job: {
        jobName: "onboarding-sample",
        targetDate: "2026-04-01",
        processingMode: "etl_and_ai",
        initialConversationLimit: 25,
        snapshotVersion: null,
        requestedWindowStartAt: null,
        requestedWindowEndExclusiveAt: null,
        windowStartAt: null,
        windowEndExclusiveAt: null,
        maxMessagePagesPerConversation: 0
      },
      writeArtifacts: true
    });

    expect(result.executions).toHaveLength(1);
    expect(result.artifactWrites).toHaveLength(1);
    expect(capturedStates).toHaveLength(1);
    expect(capturedStates[0]).toMatchObject({
      latestOnboardingRunId: "3c04eb16-e849-47f5-a9b8-55d65742aa7c",
      latestOnboardingTargetDate: "2026-04-01",
      status: "ready",
      tagCandidates: [
        {
          text: "KH moi",
          count: 1
        }
      ]
    });
  });

  it("clones the active prompt from another page into a new version for the target page", async () => {
    const captured: Array<Record<string, unknown>> = [];
    const repository = createRepository({
      getConnectedPageById: async (id: string) => createConnectedPage({ id }),
      getActivePromptVersion: async (connectedPageId: string) =>
        connectedPageId === "source-page"
          ? createPromptVersion({
              id: "source-prompt-v4",
              connectedPageId: "source-page",
              versionNo: 4,
              promptText: "Prompt clone tu page khac",
              notes: "Active"
            })
          : null,
      nextPromptVersionNo: async () => 2,
      createPagePromptVersion: async (input: Record<string, unknown>) => {
        captured.push(input);
        return createPromptVersion({
          id: "prompt-version-2",
          connectedPageId: input.connectedPageId,
          versionNo: input.versionNo,
          promptText: input.promptText,
          notes: input.notes
        });
      }
    });
    const service = new ChatExtractorService({
      repository: repository as never
    });

    const result = await service.clonePromptVersion("connected-page-1", {
      sourcePageId: "source-page",
      notes: "Clone de fine-tune"
    });

    expect(captured).toEqual([
      {
        connectedPageId: "connected-page-1",
        versionNo: 2,
        promptText: "Prompt clone tu page khac",
        notes: "Clone de fine-tune"
      }
    ]);
    expect(result.prompt).toMatchObject({
      id: "prompt-version-2",
      connectedPageId: "connected-page-1",
      versionNo: 2,
      promptText: "Prompt clone tu page khac",
      notes: "Clone de fine-tune"
    });
  });
});
