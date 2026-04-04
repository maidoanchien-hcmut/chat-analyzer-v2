import { afterEach, describe, expect, it } from "bun:test";

const TEST_DATABASE_URL = "postgresql://test:test@localhost:5432/chat_analyzer_test?schema=public";
const CONNECTED_PAGE_ID = "11111111-1111-4111-8111-111111111111";
const CONFIG_VERSION_ID = "22222222-2222-4222-8222-222222222222";
const TAXONOMY_VERSION_ID = "33333333-3333-4333-8333-333333333333";
const PROMPT_IDENTITY_ID = "44444444-4444-4444-8444-444444444444";

type RepoModule = typeof import("./chat_extractor.repository.ts");

const repoRestorers: Array<() => void> = [];

afterEach(() => {
  while (repoRestorers.length > 0) {
    repoRestorers.pop()!();
  }
});

describe("chat_extractor service", () => {
  it("accepts official_daily preview and returns frozen snapshot fields per child run", async () => {
    const { previewJobBodySchema } = await loadChatExtractorTypes();
    const repositoryModule = await loadChatExtractorRepository();
    patchRepository(repositoryModule.chatExtractorRepository, "getConnectedPageById", async () => createConnectedPageDetail());
    patchRepository(repositoryModule.chatExtractorRepository, "getPromptIdentityByHash", async () => createPromptIdentity());

    const { ChatExtractorService } = await import("./chat_extractor.service.ts");
    const service = new ChatExtractorService();
    const parsed = previewJobBodySchema.parse({
      kind: "official_daily",
      connected_page_id: CONNECTED_PAGE_ID,
      job: {
        processing_mode: "etl_only",
        target_date: "2026-04-03"
      }
    });

    const result = await service.previewJobRequest(parsed as never);
    expect(result.run_group.run_mode).toBe("official_daily");
    expect(result.child_runs).toHaveLength(1);
    expect(result.child_runs[0]).toMatchObject({
      target_date: "2026-04-03",
      is_full_day: true,
      publish_eligibility: "official_full_day"
    });
    expect(result.child_runs[0].will_use_config_version).toBe(result.run_group.will_use_config_version);
    expect(result.child_runs[0].will_use_prompt_version).toBe(result.run_group.will_use_prompt_version);
    expect(result.child_runs[0].will_use_compiled_prompt_hash).toBe(result.run_group.will_use_compiled_prompt_hash);
  });

  it("executes official_daily with official request kind and manifest run mode", async () => {
    const { executeJobBodySchema } = await loadChatExtractorTypes();
    const repositoryModule = await loadChatExtractorRepository();
    const pageDetail = createConnectedPageDetail();
    const promptIdentity = createPromptIdentity();
    let capturedCreateRunGroupInput: any;
    let capturedManifest: any;

    patchRepository(repositoryModule.chatExtractorRepository, "getConnectedPageById", async () => pageDetail);
    patchRepository(repositoryModule.chatExtractorRepository, "getPromptIdentityByHash", async () => promptIdentity);
    patchRepository(repositoryModule.chatExtractorRepository, "createRunGroupWithRuns", async (input: unknown) => {
      capturedCreateRunGroupInput = input;
    });
    patchRepository(repositoryModule.chatExtractorRepository, "markRunExecutionStarted", async () => {});
    patchRepository(repositoryModule.chatExtractorRepository, "refreshRunGroupStatus", async () => {});
    patchRepository(repositoryModule.chatExtractorRepository, "listRunGroupRuns", async (runGroupId: string) => {
      return buildRunGroupRuns(runGroupId, capturedCreateRunGroupInput, pageDetail);
    });

    const { ChatExtractorService } = await import("./chat_extractor.service.ts");
    const service = new ChatExtractorService({
      runWorker: async (manifest) => {
        capturedManifest = manifest;
        return {
          pipelineRunId: manifest.pipeline_run_id,
          exitCode: 0,
          ok: true,
          stdout: "",
          stderr: ""
        };
      }
    });
    const parsed = executeJobBodySchema.parse({
      kind: "official_daily",
      connected_page_id: CONNECTED_PAGE_ID,
      job: {
        processing_mode: "etl_only",
        target_date: "2026-04-03"
      }
    });

    const result = await service.executeJobRequest(parsed as never);
    expect(capturedCreateRunGroupInput.runMode).toBe("official_daily");
    expect(capturedCreateRunGroupInput.childRuns[0].runMode).toBe("official_daily");
    expect(capturedCreateRunGroupInput.childRuns[0].requestJson.request_kind).toBe("official_daily");
    expect(capturedManifest.run_mode).toBe("official_daily");
    expect(result.run_group.run_mode).toBe("official_daily");
  });

  it("registering an existing page without explicit flags does not force schema defaults", async () => {
    const { registerPageBodySchema } = await loadChatExtractorTypes();
    const repositoryModule = await loadChatExtractorRepository();
    const existingPage = createConnectedPageDetail({
      etlEnabled: false,
      analysisEnabled: true
    });
    let capturedUpsertInput: any;

    patchRepository(repositoryModule.chatExtractorRepository, "getConnectedPageByPancakePageId", async () => existingPage);
    patchRepository(repositoryModule.chatExtractorRepository, "upsertConnectedPage", async (input: unknown) => {
      capturedUpsertInput = input;
      return existingPage.page;
    });
    patchRepository(repositoryModule.chatExtractorRepository, "ensureDefaultTaxonomy", async () => {
      return existingPage.activeConfigVersion.analysisTaxonomyVersion;
    });
    patchRepository(repositoryModule.chatExtractorRepository, "getActiveConfigVersion", async () => existingPage.activeConfigVersion);
    patchRepository(repositoryModule.chatExtractorRepository, "getConnectedPageById", async () => existingPage);

    const { ChatExtractorService } = await import("./chat_extractor.service.ts");
    const service = new ChatExtractorService({
      listPagesFromToken: async () => [
        {
          pageId: existingPage.page.pancakePageId,
          pageName: existingPage.page.pageName
        }
      ]
    });
    const parsed = registerPageBodySchema.parse({
      pancake_page_id: existingPage.page.pancakePageId,
      user_access_token: "user-token",
      business_timezone: "Asia/Ho_Chi_Minh"
    });

    await service.registerPageConfig(parsed as never);

    expect(capturedUpsertInput.etlEnabled).toBe(false);
    expect(capturedUpsertInput.analysisEnabled).toBe(true);
  });

  it("marks the run group execution as aborted when worker startup throws before worker-side status refresh", async () => {
    const { executeJobBodySchema } = await loadChatExtractorTypes();
    const repositoryModule = await loadChatExtractorRepository();
    const pageDetail = createConnectedPageDetail();
    const promptIdentity = createPromptIdentity();
    let capturedCreateRunGroupInput: any;
    const startedRunIds: string[] = [];
    const abortedExecutions: Array<{ runGroupId: string; failedRunId: string; errorText: string }> = [];
    const refreshedRunGroupIds: string[] = [];

    patchRepository(repositoryModule.chatExtractorRepository, "getConnectedPageById", async () => pageDetail);
    patchRepository(repositoryModule.chatExtractorRepository, "getPromptIdentityByHash", async () => promptIdentity);
    patchRepository(repositoryModule.chatExtractorRepository, "createRunGroupWithRuns", async (input: unknown) => {
      capturedCreateRunGroupInput = input;
    });
    patchRepository(repositoryModule.chatExtractorRepository, "markRunExecutionStarted", async (runId: string) => {
      startedRunIds.push(runId);
    });
    patchRepository(repositoryModule.chatExtractorRepository, "abortRunGroupExecution", async (
      runGroupId: string,
      failedRunId: string,
      errorText: string
    ) => {
      abortedExecutions.push({ runGroupId, failedRunId, errorText });
    });
    patchRepository(repositoryModule.chatExtractorRepository, "refreshRunGroupStatus", async (runGroupId: string) => {
      refreshedRunGroupIds.push(runGroupId);
    });

    const { ChatExtractorService } = await import("./chat_extractor.service.ts");
    const service = new ChatExtractorService({
      runWorker: async () => {
        throw new Error("spawn worker failed");
      }
    });
    const parsed = executeJobBodySchema.parse({
      kind: "official_daily",
      connected_page_id: CONNECTED_PAGE_ID,
      job: {
        processing_mode: "etl_only",
        target_date: "2026-04-03"
      }
    });

    await expect(service.executeJobRequest(parsed as never)).rejects.toThrow("spawn worker failed");

    expect(startedRunIds).toEqual([capturedCreateRunGroupInput.childRuns[0].id]);
    expect(abortedExecutions).toHaveLength(1);
    expect(abortedExecutions[0]?.runGroupId).toBe(capturedCreateRunGroupInput.runGroupId);
    expect(abortedExecutions[0]?.failedRunId).toBe(capturedCreateRunGroupInput.childRuns[0].id);
    expect(abortedExecutions[0]?.errorText).toContain("spawn worker failed");
    expect(refreshedRunGroupIds).toEqual([capturedCreateRunGroupInput.runGroupId]);
  });

  it("treats non-zero worker exit as a failed execution and aborts the run group", async () => {
    const { executeJobBodySchema } = await loadChatExtractorTypes();
    const repositoryModule = await loadChatExtractorRepository();
    const pageDetail = createConnectedPageDetail();
    const promptIdentity = createPromptIdentity();
    let capturedCreateRunGroupInput: any;
    const abortedExecutions: Array<{ runGroupId: string; failedRunId: string; errorText: string }> = [];
    const refreshedRunGroupIds: string[] = [];

    patchRepository(repositoryModule.chatExtractorRepository, "getConnectedPageById", async () => pageDetail);
    patchRepository(repositoryModule.chatExtractorRepository, "getPromptIdentityByHash", async () => promptIdentity);
    patchRepository(repositoryModule.chatExtractorRepository, "createRunGroupWithRuns", async (input: unknown) => {
      capturedCreateRunGroupInput = input;
    });
    patchRepository(repositoryModule.chatExtractorRepository, "markRunExecutionStarted", async () => {});
    patchRepository(repositoryModule.chatExtractorRepository, "abortRunGroupExecution", async (
      runGroupId: string,
      failedRunId: string,
      errorText: string
    ) => {
      abortedExecutions.push({ runGroupId, failedRunId, errorText });
    });
    patchRepository(repositoryModule.chatExtractorRepository, "refreshRunGroupStatus", async (runGroupId: string) => {
      refreshedRunGroupIds.push(runGroupId);
    });

    const { ChatExtractorService } = await import("./chat_extractor.service.ts");
    const service = new ChatExtractorService({
      runWorker: async (manifest) => ({
        pipelineRunId: manifest.pipeline_run_id,
        exitCode: 1,
        ok: false,
        stdout: "worker stdout",
        stderr: "worker stderr"
      })
    });
    const parsed = executeJobBodySchema.parse({
      kind: "official_daily",
      connected_page_id: CONNECTED_PAGE_ID,
      job: {
        processing_mode: "etl_only",
        target_date: "2026-04-03"
      }
    });

    await expect(service.executeJobRequest(parsed as never)).rejects.toThrow("worker exited with code 1");

    expect(abortedExecutions).toHaveLength(1);
    expect(abortedExecutions[0]?.runGroupId).toBe(capturedCreateRunGroupInput.runGroupId);
    expect(abortedExecutions[0]?.failedRunId).toBe(capturedCreateRunGroupInput.childRuns[0].id);
    expect(abortedExecutions[0]?.errorText).toContain("worker exited with code 1");
    expect(abortedExecutions[0]?.errorText).toContain("worker stderr");
    expect(refreshedRunGroupIds).toEqual([capturedCreateRunGroupInput.runGroupId]);
  });
});

async function loadChatExtractorTypes() {
  Bun.env.DATABASE_URL = Bun.env.DATABASE_URL || TEST_DATABASE_URL;
  return import("./chat_extractor.types.ts");
}

async function loadChatExtractorRepository() {
  Bun.env.DATABASE_URL = Bun.env.DATABASE_URL || TEST_DATABASE_URL;
  return import("./chat_extractor.repository.ts");
}

function patchRepository<T extends object, K extends keyof T>(module: T, key: K, value: T[K]) {
  const original = module[key];
  module[key] = value;
  repoRestorers.push(() => {
    module[key] = original;
  });
}

function createConnectedPageDetail(overrides?: {
  etlEnabled?: boolean;
  analysisEnabled?: boolean;
}) {
  return {
    page: {
      id: CONNECTED_PAGE_ID,
      pancakePageId: "1406535699642677",
      pageName: "O2 SKIN",
      pancakeUserAccessToken: "user-token",
      businessTimezone: "Asia/Ho_Chi_Minh",
      etlEnabled: overrides?.etlEnabled ?? true,
      analysisEnabled: overrides?.analysisEnabled ?? false,
      activeConfigVersionId: CONFIG_VERSION_ID,
      createdAt: new Date("2026-04-03T00:00:00.000Z"),
      updatedAt: new Date("2026-04-03T00:00:00.000Z")
    },
    activeConfigVersion: {
      id: CONFIG_VERSION_ID,
      connectedPageId: CONNECTED_PAGE_ID,
      versionNo: 7,
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
        timezone: "Asia/Ho_Chi_Minh",
        officialDailyTime: "00:00",
        lookbackHours: 2,
        maxConversationsPerRun: 0,
        maxMessagePagesPerThread: 0
      },
      notificationTargetsJson: null,
      promptText: "Prompt page",
      analysisTaxonomyVersionId: TAXONOMY_VERSION_ID,
      notes: null,
      createdAt: new Date("2026-04-01T00:00:00.000Z"),
      analysisTaxonomyVersion: {
        id: TAXONOMY_VERSION_ID,
        versionCode: "default.v1",
        taxonomyJson: {
          version: 1,
          categories: {}
        },
        isActive: true,
        createdAt: new Date("2026-04-01T00:00:00.000Z")
      }
    },
    configVersions: []
  };
}

function createPromptIdentity() {
  return {
    id: PROMPT_IDENTITY_ID,
    connectedPageId: CONNECTED_PAGE_ID,
    compiledPromptHash: "sha256:existing-hash",
    promptVersion: "A",
    compiledPromptText: "compiled prompt",
    createdAt: new Date("2026-04-01T00:00:00.000Z")
  };
}

function buildRunGroupRuns(runGroupId: string, createInput: any, pageDetail: ReturnType<typeof createConnectedPageDetail>) {
  return createInput.childRuns.map((run: any) => ({
    id: run.id,
    runGroupId,
    targetDate: new Date(`${run.targetDate}T00:00:00.000Z`),
    windowStartAt: run.windowStartAt,
    windowEndExclusiveAt: run.windowEndExclusiveAt,
    requestedWindowStartAt: run.requestedWindowStartAt,
    requestedWindowEndExclusiveAt: run.requestedWindowEndExclusiveAt,
    isFullDay: run.isFullDay,
    runMode: run.runMode,
    status: "loaded",
    publishState: "draft",
    publishEligibility: run.publishEligibility,
    supersedesRunId: null,
    supersededByRunId: null,
    requestJson: run.requestJson,
    metricsJson: run.metricsJson,
    reuseSummaryJson: run.reuseSummaryJson,
    errorText: null,
    createdAt: new Date("2026-04-03T00:00:00.000Z"),
    startedAt: new Date("2026-04-03T00:00:00.000Z"),
    finishedAt: new Date("2026-04-03T00:05:00.000Z"),
    publishedAt: null,
    runGroup: {
      id: runGroupId,
      runMode: createInput.runMode,
      requestedWindowStartAt: createInput.requestedWindowStartAt,
      requestedWindowEndExclusiveAt: createInput.requestedWindowEndExclusiveAt,
      requestedTargetDate: createInput.requestedTargetDate,
      frozenConfigVersionId: createInput.frozenConfigVersionId,
      frozenTaxonomyVersionId: createInput.frozenTaxonomyVersionId,
      frozenCompiledPromptHash: createInput.frozenCompiledPromptHash,
      frozenPromptVersion: createInput.frozenPromptVersion,
      publishIntent: createInput.publishIntent,
      status: "loaded",
      createdBy: createInput.createdBy,
      createdAt: new Date("2026-04-03T00:00:00.000Z"),
      startedAt: new Date("2026-04-03T00:00:00.000Z"),
      finishedAt: new Date("2026-04-03T00:05:00.000Z"),
      connectedPage: pageDetail.page,
      frozenConfigVersion: pageDetail.activeConfigVersion
    }
  }));
}
