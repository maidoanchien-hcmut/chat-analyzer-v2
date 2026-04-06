import { afterEach, describe, expect, it } from "bun:test";
import type {
  ConnectedPageDetailRecord,
  PagePromptIdentityRecord,
  PipelineRunRecord,
  PromptPreviewArtifactRecord
} from "./chat_extractor.repository.ts";

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
  it("loads prompt workspace sample for a connected page using stored token and merged draft config", async () => {
    const { promptWorkspaceSampleBodySchema } = await loadChatExtractorTypes();
    const repositoryModule = await loadChatExtractorRepository();
    const pageDetail = createConnectedPageDetail();
    let capturedRuntimePreviewInput: any;

    patchRepository(repositoryModule.chatExtractorRepository, "getConnectedPageById", async () => pageDetail);

    const { ChatExtractorService } = await import("./chat_extractor.service.ts");
    const service = new ChatExtractorService({
      runRuntimePreview: async (input) => {
        capturedRuntimePreviewInput = input;
        return {
          pageId: input.pageId,
          targetDate: input.targetDate,
          businessTimezone: input.businessTimezone,
          windowStartAt: input.windowStartAt,
          windowEndExclusiveAt: input.windowEndExclusiveAt,
          summary: {
            conversations_scanned: 3
          },
          pageTags: [],
          conversations: []
        };
      }
    });
    const parsed = promptWorkspaceSampleBodySchema.parse({
      tag_mapping_json: {
        version: 1,
        default_role: "noise",
        entries: []
      },
      sample_conversation_limit: 3,
      sample_message_page_limit: 1
    });

    const result = await service.previewPromptWorkspaceSample(CONNECTED_PAGE_ID, parsed);

    expect(capturedRuntimePreviewInput.userAccessToken).toBe(pageDetail.page.pancakeUserAccessToken);
    expect(capturedRuntimePreviewInput.pageId).toBe(pageDetail.page.pancakePageId);
    expect(capturedRuntimePreviewInput.schedulerJson.maxConversationsPerRun).toBe(3);
    expect(result.connectedPageId).toBe(CONNECTED_PAGE_ID);
    expect(result.pageName).toBe(pageDetail.page.pageName);
    expect(result.sampleWorkspaceKey).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
    expect(typeof result.sampleWorkspaceExpiresAt).toBe("string");
  });

  it("reuses existing prompt preview artifacts for the same sample scope and prompt hash", async () => {
    const { promptPreviewArtifactBodySchema, promptWorkspaceSampleBodySchema } = await loadChatExtractorTypes();
    const repositoryModule = await loadChatExtractorRepository();
    const analysisClientModule = await import("../analysis/analysis.client.ts");
    const pageDetail = createConnectedPageDetail();
    const existingActiveArtifact = createPromptPreviewArtifactRecord({
      id: "artifact-active",
      compiledPromptHash: "sha256:active-effective",
      promptVersion: "A"
    });
    const existingDraftArtifact = createPromptPreviewArtifactRecord({
      id: "artifact-draft",
      compiledPromptHash: "sha256:draft-effective",
      promptVersion: "B"
    });
    const identityLookups: string[] = [];
    let createArtifactCalls = 0;

    patchRepository(repositoryModule.chatExtractorRepository, "getConnectedPageById", async () => pageDetail);
    patchRepository(repositoryModule.chatExtractorRepository, "getPromptIdentityByHash", async (_pageId: string, promptHash: string) => {
      if (promptHash === "sha256:active-compiled") {
        return createPromptIdentityRecord({ compiledPromptHash: "sha256:active-compiled", promptVersion: "A" });
      }
      return null;
    });
    patchRepository(repositoryModule.chatExtractorRepository, "createPromptIdentity", async ({ compiledPromptHash }: { compiledPromptHash: string }) => {
      if (compiledPromptHash === "sha256:draft-compiled") {
        return createPromptIdentityRecord({ compiledPromptHash: "sha256:draft-compiled", promptVersion: "B" });
      }
      return createPromptIdentityRecord({ compiledPromptHash, promptVersion: "A" });
    });
    patchRepository(repositoryModule.chatExtractorRepository, "getPromptPreviewArtifactByIdentity", async (input: {
      compiledPromptHash: string;
    }) => {
      identityLookups.push(input.compiledPromptHash);
      if (input.compiledPromptHash === "sha256:active-effective") {
        return existingActiveArtifact;
      }
      if (input.compiledPromptHash === "sha256:draft-effective") {
        return existingDraftArtifact;
      }
      return null;
    });
    patchRepository(repositoryModule.chatExtractorRepository, "createPromptPreviewArtifact", async () => {
      createArtifactCalls += 1;
      return existingDraftArtifact;
    });
    patchValue(analysisClientModule.conversationAnalysisClient, "analyzeConversations", async (input) => {
      if (input.bundles.length === 0) {
        return {
          results: [],
          runtimeMetadataJson: {
            effective_prompt_hash: input.runtime.pagePromptText === pageDetail.activeConfigVersion?.promptText
              ? "sha256:active-effective"
              : "sha256:draft-effective",
            model_name: "prompt-preview-model"
          }
        };
      }
      throw new Error("preview artifacts should have been reused instead of creating a new analysis call");
    });

    const { ChatExtractorService } = await import("./chat_extractor.service.ts");
    const service = new ChatExtractorService({
      runRuntimePreview: async () => createPromptWorkspaceSampleOutput()
    });
    const samplePreview = await service.previewPromptWorkspaceSample(
      CONNECTED_PAGE_ID,
      promptWorkspaceSampleBodySchema.parse({
        sample_conversation_limit: 3,
        sample_message_page_limit: 1
      })
    );
    const parsed = promptPreviewArtifactBodySchema.parse({
      draft_prompt_text: "Prompt draft cho sample",
      sample_workspace_key: samplePreview.sampleWorkspaceKey,
      selected_conversation_id: "thread-1"
    });

    const result = await service.previewPromptArtifacts(CONNECTED_PAGE_ID, parsed);

    expect(identityLookups).toEqual(["sha256:active-effective", "sha256:draft-effective"]);
    expect(createArtifactCalls).toBe(0);
    expect(result.active_artifact.id).toBe("artifact-active");
    expect(result.draft_artifact.id).toBe("artifact-draft");
    expect(result.sample_scope.sample_scope_key).toContain("sha256:");
  });

  it("rejects unknown or stale prompt workspace keys before preview execution", async () => {
    const { promptPreviewArtifactBodySchema, promptWorkspaceSampleBodySchema } = await loadChatExtractorTypes();
    const repositoryModule = await loadChatExtractorRepository();
    const pageDetail = createConnectedPageDetail();

    patchRepository(repositoryModule.chatExtractorRepository, "getConnectedPageById", async () => pageDetail);

    const { ChatExtractorService } = await import("./chat_extractor.service.ts");
    const service = new ChatExtractorService({
      runRuntimePreview: async () => createPromptWorkspaceSampleOutput()
    });

    const unknownWorkspace = promptPreviewArtifactBodySchema.parse({
      draft_prompt_text: "Prompt draft cho sample",
      sample_workspace_key: "11111111-1111-4111-8111-111111111111",
      selected_conversation_id: "thread-1"
    });
    await expect(service.previewPromptArtifacts(CONNECTED_PAGE_ID, unknownWorkspace)).rejects.toThrow("không còn hợp lệ");

    const samplePreview = await service.previewPromptWorkspaceSample(
      CONNECTED_PAGE_ID,
      promptWorkspaceSampleBodySchema.parse({
        sample_conversation_limit: 3,
        sample_message_page_limit: 1
      })
    );
    const realWorkspace = promptPreviewArtifactBodySchema.parse({
      draft_prompt_text: "Prompt draft cho sample",
      sample_workspace_key: samplePreview.sampleWorkspaceKey,
      selected_conversation_id: "thread-1"
    });
    const nowMs = Date.now();
    patchValue(Date, "now", () => nowMs + (31 * 60 * 1000));

    await expect(service.previewPromptArtifacts(CONNECTED_PAGE_ID, realWorkspace)).rejects.toThrow("đã hết hạn");
  });

  it("serializes fetched prompt preview artifacts with persisted taxonomy metadata", async () => {
    const repositoryModule = await loadChatExtractorRepository();
    const artifact = createPromptPreviewArtifactRecord({
      analysisTaxonomyVersion: {
        id: TAXONOMY_VERSION_ID,
        versionCode: "default.v1",
        taxonomyJson: {},
        isActive: false,
        createdAt: new Date("2026-04-01T00:00:00.000Z")
      }
    });

    patchRepository(repositoryModule.chatExtractorRepository, "getPromptPreviewArtifactById", async () => artifact);
    patchRepository(repositoryModule.chatExtractorRepository, "getConnectedPageById", async () => ({
      ...createConnectedPageDetail(),
      activeConfigVersion: {
        ...createConnectedPageDetail().activeConfigVersion!,
        analysisTaxonomyVersion: {
          ...createConnectedPageDetail().activeConfigVersion!.analysisTaxonomyVersion,
          versionCode: "rotated.v2"
        }
      }
    }));

    const { ChatExtractorService } = await import("./chat_extractor.service.ts");
    const service = new ChatExtractorService();

    const result = await service.getPromptPreviewArtifact(CONNECTED_PAGE_ID, artifact.id);

    expect(result.artifact.taxonomyVersionCode).toBe("default.v1");
  });

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
    const childRun = result.child_runs[0]!;
    expect(childRun).toMatchObject({
      target_date: "2026-04-03",
      is_full_day: true,
      publish_eligibility: "official_full_day"
    });
    expect(childRun.will_use_config_version).toBe(result.run_group.will_use_config_version);
    expect(childRun.will_use_prompt_version).toBe(result.run_group.will_use_prompt_version);
    expect(childRun.will_use_compiled_prompt_hash).toBe(result.run_group.will_use_compiled_prompt_hash);
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
      return existingPage.activeConfigVersion!.analysisTaxonomyVersion;
    });
    patchRepository(repositoryModule.chatExtractorRepository, "getActiveConfigVersion", async () => existingPage.activeConfigVersion!);
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

  it("registering a new page seeds activation-safe defaults with scheduler snapshot and built-in opening rules", async () => {
    const { registerPageBodySchema } = await loadChatExtractorTypes();
    const repositoryModule = await loadChatExtractorRepository();
    let capturedCreateConfigInput: any;
    let activatedConfigId: string | null = null;

    patchRepository(repositoryModule.chatExtractorRepository, "getConnectedPageByPancakePageId", async () => null);
    patchRepository(repositoryModule.chatExtractorRepository, "upsertConnectedPage", async () => ({
      ...createConnectedPageDetail().page,
      activeConfigVersionId: null
    }));
    patchRepository(repositoryModule.chatExtractorRepository, "ensureDefaultTaxonomy", async () => {
      return createConnectedPageDetail().activeConfigVersion!.analysisTaxonomyVersion;
    });
    patchRepository(repositoryModule.chatExtractorRepository, "getActiveConfigVersion", async () => null);
    patchRepository(repositoryModule.chatExtractorRepository, "nextConfigVersionNo", async () => 1);
    patchRepository(repositoryModule.chatExtractorRepository, "createPageConfigVersion", async (input: unknown) => {
      capturedCreateConfigInput = input;
      return {
        ...createConnectedPageDetail().activeConfigVersion!,
        id: "cfg-new",
        versionNo: 1,
        schedulerJson: expectedDefaultScheduler("Asia/Saigon"),
        openingRulesJson: expectedDefaultOpeningRules()
      };
    });
    patchRepository(repositoryModule.chatExtractorRepository, "activateConfigVersion", async (_pageId: string, configVersionId: string) => {
      activatedConfigId = configVersionId;
      return {
        ...createConnectedPageDetail().page,
        activeConfigVersionId: configVersionId
      };
    });
    patchRepository(repositoryModule.chatExtractorRepository, "getConnectedPageById", async () => ({
      ...createConnectedPageDetail(),
      page: {
        ...createConnectedPageDetail().page,
        businessTimezone: "Asia/Saigon",
        activeConfigVersionId: "cfg-new"
      },
      activeConfigVersion: {
        ...createConnectedPageDetail().activeConfigVersion!,
        id: "cfg-new",
        versionNo: 1,
        schedulerJson: expectedDefaultScheduler("Asia/Saigon"),
        openingRulesJson: expectedDefaultOpeningRules()
      }
    }));

    const { ChatExtractorService } = await import("./chat_extractor.service.ts");
    const service = new ChatExtractorService({
      listPagesFromToken: async () => [
        {
          pageId: "1406535699642677",
          pageName: "O2 SKIN"
        }
      ]
    });
    const parsed = registerPageBodySchema.parse({
      pancake_page_id: "1406535699642677",
      user_access_token: "user-token",
      business_timezone: "Asia/Saigon"
    });

    await service.registerPageConfig(parsed as never);

    expect(capturedCreateConfigInput.schedulerJson).toEqual(expectedDefaultScheduler("Asia/Saigon"));
    expect(capturedCreateConfigInput.openingRulesJson).toEqual(expectedDefaultOpeningRules());
    expect(activatedConfigId === "cfg-new").toBe(true);
  });

  it("normalizes onboarding sample preview request with default draft config and sample caps", async () => {
    const { onboardingSamplePreviewBodySchema } = await loadChatExtractorTypes();

    const parsed = onboardingSamplePreviewBodySchema.parse({
      user_access_token: "user-token",
      pancake_page_id: "1406535699642677",
      business_timezone: "Asia/Saigon"
    });

    expect(parsed.businessTimezone).toBe("Asia/Saigon");
    expect(parsed.tagMappingJson).toEqual({
      version: 1,
      defaultRole: "noise",
      entries: []
    });
    expect(parsed.openingRulesJson).toEqual(expectedDefaultOpeningRules());
    expect(parsed.schedulerJson).toBeNull();
    expect(parsed.sampleConversationLimit).toBe(12);
    expect(parsed.sampleMessagePageLimit).toBe(2);
  });

  it("returns runtime-only onboarding sample preview with the worker stdout shape", async () => {
    const { onboardingSamplePreviewBodySchema } = await loadChatExtractorTypes();

    const { ChatExtractorService } = await import("./chat_extractor.service.ts");
    const service = new ChatExtractorService({
      listPagesFromToken: async () => [
        {
          pageId: "1406535699642677",
          pageName: "O2 SKIN"
        }
      ],
      runRuntimePreview: async (input) => ({
        pageId: input.pageId,
        targetDate: input.targetDate,
        businessTimezone: input.businessTimezone,
        windowStartAt: input.windowStartAt,
        windowEndExclusiveAt: input.windowEndExclusiveAt,
        summary: {
          conversations_scanned: 6,
          thread_days_built: 4
        },
        pageTags: [
          {
            pancakeTagId: "11",
            text: "KH mới",
            isDeactive: false
          }
        ],
        conversations: [
          {
            conversationId: "c-1",
            customerDisplayName: "Khách A",
            firstMeaningfulMessageText: "Cho mình hỏi lịch tái khám.",
            observedTagsJson: [{ sourceTagText: "KH mới" }],
            normalizedTagSignalsJson: { journey: [], need: [], outcome: [], branch: [], staff: [], noise: [] },
            openingBlockJson: { explicitSignals: [] }
          }
        ]
      })
    });
    const parsed = onboardingSamplePreviewBodySchema.parse({
      user_access_token: "user-token",
      pancake_page_id: "1406535699642677",
      business_timezone: "Asia/Saigon",
      sample_conversation_limit: 8,
      sample_message_page_limit: 3
    });

    const result = await service.previewOnboardingSample(parsed);

    expect(result.pageId).toBe("1406535699642677");
    expect(result.businessTimezone).toBe("Asia/Saigon");
    expect(result.summary).toEqual({
      conversations_scanned: 6,
      thread_days_built: 4
    });
    expect(result.pageTags).toHaveLength(1);
    expect(result.conversations[0]?.conversationId).toBe("c-1");
    expect(result.conversations[0]?.customerDisplayName).toBe("Khách A");
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

  it("runs analysis after ETL when processing_mode is etl_and_ai and analysis is enabled", async () => {
    const { executeJobBodySchema } = await loadChatExtractorTypes();
    const repositoryModule = await loadChatExtractorRepository();
    const pageDetail = createConnectedPageDetail({
      analysisEnabled: true
    });
    const promptIdentity = createPromptIdentity();
    let capturedCreateRunGroupInput: any;
    const analysisCalls: string[] = [];

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
      runWorker: async (manifest) => ({
        pipelineRunId: manifest.pipeline_run_id,
        exitCode: 0,
        ok: true,
        stdout: "",
        stderr: ""
      }),
      runAnalysis: async (pipelineRunId) => {
        analysisCalls.push(pipelineRunId);
        return {
          pipelineRunId,
          analysisRunId: `analysis-${pipelineRunId}`,
          status: "completed",
          unitCountPlanned: 1,
          unitCountSucceeded: 1,
          unitCountUnknown: 0,
          unitCountFailed: 0,
          totalCostMicros: 99
        };
      }
    });
    const parsed = executeJobBodySchema.parse({
      kind: "official_daily",
      connected_page_id: CONNECTED_PAGE_ID,
      job: {
        processing_mode: "etl_and_ai",
        target_date: "2026-04-03"
      }
    });

    const result = await service.executeJobRequest(parsed as never);

    expect(analysisCalls).toEqual([capturedCreateRunGroupInput.childRuns[0].id]);
    expect(result.analysis_executions).toEqual([
      {
        pipelineRunId: capturedCreateRunGroupInput.childRuns[0].id,
        analysisRunId: `analysis-${capturedCreateRunGroupInput.childRuns[0].id}`,
        status: "completed",
        unitCountPlanned: 1,
        unitCountSucceeded: 1,
        unitCountUnknown: 0,
        unitCountFailed: 0,
        totalCostMicros: 99
      }
    ]);
  });

  it("returns enriched run detail diagnostics for analysis and mart state", async () => {
    const repositoryModule = await loadChatExtractorRepository();

    patchRepository(repositoryModule.chatExtractorRepository, "getRunById", async () => createPipelineRunRecord({
      publishEligibility: "provisional_current_day_partial",
      errorText: "analysis still retrying",
      metricsJson: {
        analysis: {
          analysis_run_id: "analysis-run-1",
          status: "completed",
          unit_count_planned: 12,
          unit_count_succeeded: 11,
          unit_count_unknown: 1,
          unit_count_failed: 0,
          total_cost_micros: 9000,
          prompt_hash: "sha256:prompt-a12",
          prompt_version: "Prompt A12",
          taxonomy_version_id: TAXONOMY_VERSION_ID,
          output_schema_version: "conversation-analysis.v1",
          resumed: true,
          skipped_thread_day_ids: ["thread-day-9"]
        },
        semantic_mart: {
          materialized: true,
          analysis_run_id: "analysis-run-1",
          fact_thread_day_count: 12,
          fact_staff_thread_day_count: 5,
          prompt_hash: "sha256:prompt-a12",
          prompt_version: "Prompt A12",
          config_version_id: CONFIG_VERSION_ID,
          config_version_no: 7,
          taxonomy_version_id: TAXONOMY_VERSION_ID,
          taxonomy_version_code: "default.v1"
        }
      }
    }));
    patchRepository(repositoryModule.chatExtractorRepository, "getRunArtifactCounts", async () => ({
      threadDayCount: 12,
      messageCount: 91
    }));

    const { ChatExtractorService } = await import("./chat_extractor.service.ts");
    const service = new ChatExtractorService();
    const result = await service.getRun("run-201");

    expect(result.artifact_counts.thread_day_count).toBe(12);
    expect(result.analysis_metrics?.analysis_run_id).toBe("analysis-run-1");
    expect(result.analysis_metrics?.unit_count_succeeded).toBe(11);
    expect(result.mart_metrics?.materialized).toBe(true);
    expect(result.publish_warning).toContain("provisional");
    expect(result.error_text).toContain("retrying");
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
}): ConnectedPageDetailRecord {
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
        } as const,
        openingRulesJson: expectedDefaultOpeningRules(),
        schedulerJson: {
          version: 1,
          timezone: "Asia/Ho_Chi_Minh",
          officialDailyTime: "00:00",
          lookbackHours: 2,
          maxConversationsPerRun: 0,
          maxMessagePagesPerThread: 0
        } as const,
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
          } as const,
        isActive: true,
        createdAt: new Date("2026-04-01T00:00:00.000Z")
      }
    },
    configVersions: []
  };
}

function createPromptIdentity(): PagePromptIdentityRecord {
  return createPromptIdentityRecord({});
}

function createPromptIdentityRecord(overrides: Partial<PagePromptIdentityRecord>): PagePromptIdentityRecord {
  return {
    id: PROMPT_IDENTITY_ID,
    connectedPageId: CONNECTED_PAGE_ID,
    compiledPromptHash: "sha256:existing-hash",
    promptVersion: "A",
    compiledPromptText: "compiled prompt",
    createdAt: new Date("2026-04-01T00:00:00.000Z"),
    ...overrides
  };
}

function createPromptPreviewArtifactRecord(overrides?: Partial<PromptPreviewArtifactRecord>): PromptPreviewArtifactRecord {
  return {
    id: "artifact-1",
    connectedPageId: CONNECTED_PAGE_ID,
    analysisTaxonomyVersionId: TAXONOMY_VERSION_ID,
    analysisTaxonomyVersion: {
      id: TAXONOMY_VERSION_ID,
      versionCode: "default.v1",
      taxonomyJson: {},
      isActive: true,
      createdAt: new Date("2026-04-01T00:00:00.000Z")
    },
    compiledPromptHash: "sha256:preview-prompt",
    promptVersion: "A",
    sampleScopeHash: "sha256:sample-scope",
    sampleTargetDate: new Date("2026-04-05T00:00:00.000Z"),
    sampleWindowStartAt: new Date("2026-04-04T17:00:00.000Z"),
    sampleWindowEndExclusiveAt: new Date("2026-04-05T06:00:00.000Z"),
    sampleConversationId: "thread-1",
    customerDisplayName: "Khách B",
    runtimeMetadataJson: {
      model_name: "prompt-preview-model",
      effective_prompt_hash: "sha256:preview-effective"
    },
    previewResultJson: {
      primary_need_code: "appointment_booking"
    },
    evidenceBundleJson: ["Opening block: Khách hàng tái khám"],
    fieldExplanationsJson: [{ field: "primary_need_code", explanation: "Khách muốn đặt lịch." }],
    supportingMessageIdsJson: ["msg-1"],
    createdAt: new Date("2026-04-05T06:00:00.000Z"),
    ...overrides
  };
}

function createPromptWorkspaceSampleOutput() {
  return {
    pageId: "1406535699642677",
    targetDate: "2026-04-05",
    businessTimezone: "Asia/Saigon",
    windowStartAt: "2026-04-04T17:00:00.000Z",
    windowEndExclusiveAt: "2026-04-05T06:00:00.000Z",
    summary: {
      conversations_scanned: 1
    },
    pageTags: [],
    conversations: [
      {
        conversationId: "thread-1",
        customerDisplayName: "Khách B",
        firstMeaningfulMessageId: "msg-1",
        firstMeaningfulMessageText: "Mình muốn hỏi giá điều trị.",
        firstMeaningfulMessageSenderRole: "customer",
        observedTagsJson: [{ sourceTagText: "KH tái khám" }],
        normalizedTagSignalsJson: { journey: [] },
        openingBlockJson: { explicitSignals: [] },
        explicitRevisitSignal: "revisit",
        explicitNeedSignal: "appointment_booking",
        explicitOutcomeSignal: null,
        sourceThreadJsonRedacted: {},
        messageCount: 1,
        firstStaffResponseSeconds: 120,
        avgStaffResponseSeconds: 120,
        staffParticipantsJson: [],
        messages: [
          {
            messageId: "msg-1",
            insertedAt: "2026-04-05T00:01:00.000Z",
            senderRole: "customer",
            senderName: null,
            messageType: "text",
            redactedText: "Mình muốn hỏi giá điều trị.",
            isMeaningfulHumanMessage: true,
            isOpeningBlockMessage: false
          }
        ]
      }
    ]
  };
}

function patchValue<T extends object, K extends keyof T>(target: T, key: K, value: T[K]) {
  const original = target[key];
  target[key] = value;
  repoRestorers.push(() => {
    target[key] = original;
  });
}

function expectedDefaultScheduler(timezone: string) {
  return {
    version: 1,
    timezone,
    officialDailyTime: "00:00",
    lookbackHours: 2,
    maxConversationsPerRun: 0,
    maxMessagePagesPerThread: 0
  };
}

function expectedDefaultOpeningRules() {
  return {
    version: 1,
    selectors: [
      {
        selectorId: "builtin-journey-new-to-clinic",
        signalRole: "journey",
        signalCode: "new_to_clinic",
        allowedMessageTypes: ["template", "text"],
        options: [
          {
            rawText: "Khách hàng lần đầu",
            matchMode: "casefold_exact"
          }
        ]
      },
      {
        selectorId: "builtin-journey-revisit",
        signalRole: "journey",
        signalCode: "revisit",
        allowedMessageTypes: ["template", "text"],
        options: [
          {
            rawText: "Khách hàng tái khám",
            matchMode: "casefold_exact"
          }
        ]
      },
      {
        selectorId: "builtin-need-consultation-call",
        signalRole: "need",
        signalCode: "consultation",
        allowedMessageTypes: ["template", "text"],
        options: [
          {
            rawText: "Tôi muốn gọi tư vấn",
            matchMode: "casefold_exact"
          }
        ]
      },
      {
        selectorId: "builtin-need-consultation-chat",
        signalRole: "need",
        signalCode: "consultation",
        allowedMessageTypes: ["template", "text"],
        options: [
          {
            rawText: "Tôi muốn chat tư vấn",
            matchMode: "casefold_exact"
          }
        ]
      },
      {
        selectorId: "builtin-need-appointment-booking",
        signalRole: "need",
        signalCode: "appointment_booking",
        allowedMessageTypes: ["template", "text"],
        options: [
          {
            rawText: "Đặt lịch hẹn",
            matchMode: "casefold_exact"
          }
        ]
      }
    ]
  };
}

function buildRunGroupRuns(runGroupId: string, createInput: any, pageDetail: ConnectedPageDetailRecord): PipelineRunRecord[] {
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
    status: "loaded" as const,
    publishState: "draft" as const,
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
      status: "loaded" as const,
      createdBy: createInput.createdBy,
      createdAt: new Date("2026-04-03T00:00:00.000Z"),
      startedAt: new Date("2026-04-03T00:00:00.000Z"),
      finishedAt: new Date("2026-04-03T00:05:00.000Z"),
      connectedPage: pageDetail.page,
      frozenConfigVersion: pageDetail.activeConfigVersion!
    }
  }));
}

function createPipelineRunRecord(overrides?: Partial<PipelineRunRecord>): PipelineRunRecord {
  return {
    id: "run-201",
    runGroupId: "rg-201",
    targetDate: new Date("2026-04-03T00:00:00.000Z"),
    windowStartAt: new Date("2026-04-03T00:00:00.000Z"),
    windowEndExclusiveAt: new Date("2026-04-04T00:00:00.000Z"),
    requestedWindowStartAt: null,
    requestedWindowEndExclusiveAt: null,
    isFullDay: false,
    runMode: "manual_range",
    status: "loaded" as const,
    publishState: "draft" as const,
    publishEligibility: "official_full_day" as const,
    supersedesRunId: null,
    supersededByRunId: null,
    requestJson: {},
    metricsJson: {},
    reuseSummaryJson: {},
    errorText: null,
    createdAt: new Date("2026-04-03T00:00:00.000Z"),
    startedAt: new Date("2026-04-03T00:00:00.000Z"),
    finishedAt: new Date("2026-04-03T00:05:00.000Z"),
    publishedAt: null,
    runGroup: {
      id: "rg-201",
      runMode: "manual",
      requestedWindowStartAt: null,
      requestedWindowEndExclusiveAt: null,
      requestedTargetDate: new Date("2026-04-03T00:00:00.000Z"),
      frozenConfigVersionId: CONFIG_VERSION_ID,
      frozenTaxonomyVersionId: TAXONOMY_VERSION_ID,
      frozenCompiledPromptHash: "sha256:prompt-a12",
      frozenPromptVersion: "Prompt A12",
      publishIntent: "official",
      status: "loaded" as const,
      createdBy: "operator",
      createdAt: new Date("2026-04-03T00:00:00.000Z"),
      startedAt: new Date("2026-04-03T00:00:00.000Z"),
      finishedAt: new Date("2026-04-03T00:05:00.000Z"),
      connectedPage: createConnectedPageDetail().page,
      frozenConfigVersion: createConnectedPageDetail().activeConfigVersion!
    },
    ...overrides
  };
}
