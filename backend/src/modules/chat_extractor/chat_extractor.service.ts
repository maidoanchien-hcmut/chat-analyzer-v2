import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import type { Prisma } from "@prisma/client";
import { AppError } from "../../core/errors.ts";
import {
  buildPagePromptIdentityText,
  cloneJsonValue,
  DEFAULT_PAGE_PROMPT,
  defaultOpeningRulesConfig,
  defaultSchedulerConfig,
  defaultTagMappingConfig,
  hashPagePromptIdentity,
  hashPromptPreviewSampleScope,
  hashEtlConfig,
  nextPromptVersion
} from "./chat_extractor.artifacts.ts";
import { conversationAnalysisClient } from "../analysis/analysis.client.ts";
import type {
  AnalysisRuntimeSnapshot,
  AnalysisUnitBundle,
  ConversationAnalysisResult
} from "../analysis/analysis.types.ts";
import {
  ANALYSIS_OUTPUT_SCHEMA_VERSION,
  ANALYSIS_RUNTIME_MODEL_NAME,
  ANALYSIS_RUNTIME_PROFILE_ID,
  ANALYSIS_RUNTIME_PROFILE_VERSION
} from "../analysis/analysis.artifacts.ts";
import {
  buildFullDayRun,
  determinePublishEligibility,
  formatDateInTimezone,
  isHistoricalTargetDate,
  parseDayStart,
  splitRequestedWindowByTargetDate,
  type PlannedChildRun
} from "./chat_extractor.planner.ts";
import { buildRunDiagnostics } from "./chat_extractor.run_detail.ts";
import {
  chatExtractorRepository,
  type ConnectedPageDetailRecord,
  type ConnectedPageRecord,
  type PageConfigVersionRecord,
  type PagePromptIdentityRecord,
  type PipelineRunRecord,
  type PromptPreviewArtifactRecord
} from "./chat_extractor.repository.ts";
import type {
  ExecuteJobBody,
  ManualJobBody,
  OnboardingSamplePreviewBody,
  OfficialDailyJobBody,
  PromptPreviewArtifactBody,
  PromptWorkspaceSampleBody,
  PreviewJobBody,
  PublishAs,
  PublishEligibility,
  PublishRunBody,
  RegisterPageBody,
  WorkerManifest
} from "./chat_extractor.types.ts";

const backendRoot = resolve(import.meta.dir, "../../..");
const workerRoot = resolve(backendRoot, "go-worker");

type ListedPage = {
  pageId: string;
  pageName: string;
};

export type WorkerExecution = {
  pipelineRunId: string;
  exitCode: number;
  ok: boolean;
  stdout: string;
  stderr: string;
};

type ChatExtractorServiceDependencies = {
  listPagesFromToken: (userAccessToken: string) => Promise<ListedPage[]>;
  runWorker: (manifest: WorkerManifest) => Promise<WorkerExecution>;
  runRuntimePreview: (input: RuntimePreviewWorkerInput) => Promise<RuntimePreviewOutput>;
  runAnalysis: (pipelineRunId: string) => Promise<{
    pipelineRunId: string;
    analysisRunId: string;
    status: string;
    unitCountPlanned: number;
    unitCountSucceeded: number;
    unitCountUnknown: number;
    unitCountFailed: number;
    totalCostMicros: number;
  }>;
};

type RuntimeSnapshot = {
  configVersion: PageConfigVersionRecord;
  promptIdentityText: string;
  promptIdentityHash: string;
  promptIdentity: PagePromptIdentityRecord | {
    id: null;
    connectedPageId: string;
    compiledPromptHash: string;
    promptVersion: string;
    compiledPromptText: string;
    createdAt: Date | null;
  };
  etlConfigHash: string;
};

type RuntimePreviewWorkerInput = {
  pageId: string;
  userAccessToken: string;
  businessTimezone: string;
  targetDate: string;
  windowStartAt: string;
  windowEndExclusiveAt: string;
  tagMappingJson: ReturnType<typeof defaultTagMappingConfig>;
  openingRulesJson: ReturnType<typeof defaultOpeningRulesConfig>;
  schedulerJson: ReturnType<typeof defaultSchedulerConfig>;
};

type RuntimePreviewTag = {
  pancakeTagId: string;
  text: string;
  isDeactive: boolean;
};

type RuntimePreviewConversation = {
  conversationId: string;
  customerDisplayName: string;
  firstMeaningfulMessageId: string;
  firstMeaningfulMessageText: string;
  firstMeaningfulMessageSenderRole: string;
  observedTagsJson: unknown;
  normalizedTagSignalsJson: unknown;
  openingBlockJson: unknown;
  explicitRevisitSignal: string | null;
  explicitNeedSignal: string | null;
  explicitOutcomeSignal: string | null;
  sourceThreadJsonRedacted: unknown;
  messageCount: number;
  firstStaffResponseSeconds: number | null;
  avgStaffResponseSeconds: number | null;
  staffParticipantsJson: unknown;
  messages: RuntimePreviewMessage[];
};

type RuntimePreviewMessage = {
  messageId: string;
  insertedAt: string;
  senderRole: string;
  senderName: string | null;
  messageType: string;
  redactedText: string | null;
  isMeaningfulHumanMessage: boolean;
  isOpeningBlockMessage: boolean;
};

export type RuntimePreviewOutput = {
  pageId: string;
  targetDate: string;
  businessTimezone: string;
  windowStartAt: string;
  windowEndExclusiveAt: string;
  summary: Record<string, unknown>;
  pageTags: RuntimePreviewTag[];
  conversations: RuntimePreviewConversation[];
};

type StoredPromptWorkspaceSample = {
  connectedPageId: string;
  samplePreview: RuntimePreviewOutput;
  expiresAtMs: number;
};

type PromptPreviewArtifactView = {
  id: string;
  promptVersionLabel: string;
  promptHash: string;
  taxonomyVersionCode: string;
  sampleScopeKey: string;
  sampleConversationId: string;
  customerDisplayName: string;
  createdAt: string;
  runtimeMetadata: Record<string, unknown>;
  result: Record<string, unknown>;
  evidenceBundle: string[];
  fieldExplanations: Array<{ field: string; explanation: string }>;
  supportingMessageIds: string[];
};

type ConnectedPageStatusView =
  | {
      token_status: "not_checked" | "missing";
      connection_status: "not_checked";
      token_preview_masked: string | null;
      last_validated_at: null;
    }
  | {
      token_status: "valid";
      connection_status: "connected" | "page_unavailable";
      token_preview_masked: string | null;
      last_validated_at: string;
    }
  | {
      token_status: "invalid";
      connection_status: "token_invalid";
      token_preview_masked: string | null;
      last_validated_at: string;
    };

const PROMPT_WORKSPACE_SAMPLE_TTL_MS = 30 * 60 * 1000;
const promptWorkspaceSampleStore = new Map<string, StoredPromptWorkspaceSample>();

export class ChatExtractorService {
  private readonly listPagesFromTokenImpl: ChatExtractorServiceDependencies["listPagesFromToken"];
  private readonly runWorkerImpl: ChatExtractorServiceDependencies["runWorker"];
  private readonly runRuntimePreviewImpl: ChatExtractorServiceDependencies["runRuntimePreview"];
  private readonly runAnalysisImpl: ChatExtractorServiceDependencies["runAnalysis"];

  constructor(deps: Partial<ChatExtractorServiceDependencies> = {}) {
    this.listPagesFromTokenImpl = deps.listPagesFromToken ?? fetchPancakePages;
    this.runWorkerImpl = deps.runWorker ?? runWorkerManifest;
    this.runRuntimePreviewImpl = deps.runRuntimePreview ?? runWorkerRuntimePreview;
    this.runAnalysisImpl = deps.runAnalysis ?? runAnalysisLoadedRun;
  }

  async listPagesFromToken(userAccessToken: string) {
    return this.listPagesFromTokenImpl(userAccessToken);
  }

  async listConnectedPages() {
    const pages = await chatExtractorRepository.listConnectedPages();
    return {
      pages: pages.map((item) => serializeConnectedPageDetail(item, buildUncheckedConnectedPageStatus(item.page.pancakeUserAccessToken)))
    };
  }

  async getConnectedPage(id: string) {
    const page = await this.requireConnectedPage(id);
    const status = await this.resolveConnectedPageStatus(page.page);
    return {
      page: serializeConnectedPageDetail(page, status)
    };
  }

  async registerPageConfig(input: RegisterPageBody) {
    const selectedPage = await this.resolveListedPage(input.userAccessToken, input.pancakePageId);
    const existingPage = await chatExtractorRepository.getConnectedPageByPancakePageId(input.pancakePageId);
    const page = await chatExtractorRepository.upsertConnectedPage({
      pancakePageId: input.pancakePageId,
      pageName: selectedPage.pageName,
      pancakeUserAccessToken: input.userAccessToken,
      businessTimezone: input.businessTimezone,
      etlEnabled: input.etlEnabled ?? existingPage?.page.etlEnabled ?? true,
      analysisEnabled: input.analysisEnabled ?? existingPage?.page.analysisEnabled ?? false
    });

    const defaultTaxonomy = await chatExtractorRepository.ensureDefaultTaxonomy();
    const activeConfig = await chatExtractorRepository.getActiveConfigVersion(page.id);
    const hasPersistedActiveConfig = Boolean(page.activeConfigVersionId || activeConfig);
    const hasOnboardingDraft =
      input.tagMappingJson !== undefined
      || input.openingRulesJson !== undefined
      || input.schedulerJson !== undefined
      || input.notificationTargetsJson !== undefined
      || input.promptText !== undefined
      || input.analysisTaxonomyVersionId !== undefined
      || input.notes !== undefined;

    if (!hasPersistedActiveConfig || hasOnboardingDraft) {
      const taxonomyVersionId = input.analysisTaxonomyVersionId
        ?? activeConfig?.analysisTaxonomyVersionId
        ?? defaultTaxonomy.id;
      const configVersion = await chatExtractorRepository.createPageConfigVersion({
        connectedPageId: page.id,
        versionNo: await chatExtractorRepository.nextConfigVersionNo(page.id),
        tagMappingJson: input.tagMappingJson ?? activeConfig?.tagMappingJson ?? defaultTagMappingConfig(),
        openingRulesJson: input.openingRulesJson ?? activeConfig?.openingRulesJson ?? defaultOpeningRulesConfig(),
        schedulerJson: input.schedulerJson === undefined
          ? (activeConfig?.schedulerJson ?? defaultSchedulerConfig(input.businessTimezone))
          : input.schedulerJson,
        notificationTargetsJson: input.notificationTargetsJson === undefined
          ? (activeConfig?.notificationTargetsJson ?? null)
          : input.notificationTargetsJson,
        promptText: input.promptText ?? activeConfig?.promptText ?? DEFAULT_PAGE_PROMPT,
        analysisTaxonomyVersionId: taxonomyVersionId,
        notes: input.notes ?? null
      });
      if (input.activate) {
        await chatExtractorRepository.activateConfigVersion(page.id, configVersion.id);
      }
    }

    return this.getConnectedPage(page.id);
  }

  async previewOnboardingSample(input: OnboardingSamplePreviewBody) {
    await this.resolveListedPage(input.userAccessToken, input.pancakePageId);
    const now = new Date();
    const targetDate = formatDateInTimezone(now, input.businessTimezone);
    const dayStart = parseDayStart(targetDate, input.businessTimezone);
    if (now <= dayStart) {
      throw new AppError(409, "CHAT_EXTRACTOR_ONBOARDING_SAMPLE_WINDOW_EMPTY", "Chưa có khoảng sample hợp lệ trong ngày hiện tại theo business timezone đã chọn.");
    }

    const schedulerBase = input.schedulerJson ?? defaultSchedulerConfig(input.businessTimezone);
    return this.runRuntimePreviewImpl({
      pageId: input.pancakePageId,
      userAccessToken: input.userAccessToken,
      businessTimezone: input.businessTimezone,
      targetDate,
      windowStartAt: dayStart.toISOString(),
      windowEndExclusiveAt: now.toISOString(),
      tagMappingJson: input.tagMappingJson,
      openingRulesJson: input.openingRulesJson,
      schedulerJson: {
        ...schedulerBase,
        timezone: input.businessTimezone,
        maxConversationsPerRun: input.sampleConversationLimit,
        maxMessagePagesPerThread: 0
      }
    });
  }

  async previewPromptWorkspaceSample(connectedPageId: string, input: PromptWorkspaceSampleBody) {
    const page = await this.requireConnectedPage(connectedPageId);
    const samplePreview = await this.buildPromptWorkspaceSamplePreview(page, input);
    const workspace = storePromptWorkspaceSample(page.page.id, samplePreview);
    return {
      connectedPageId: page.page.id,
      pageName: page.page.pageName,
      sampleWorkspaceKey: workspace.sampleWorkspaceKey,
      sampleWorkspaceExpiresAt: workspace.sampleWorkspaceExpiresAt,
      ...samplePreview
    };
  }

  async previewPromptArtifacts(connectedPageId: string, input: PromptPreviewArtifactBody) {
    const page = await this.requireConnectedPage(connectedPageId);
    const configVersion = page.activeConfigVersion;
    if (!configVersion) {
      throw new AppError(400, "CHAT_EXTRACTOR_ACTIVE_CONFIG_REQUIRED", `Page ${page.page.id} chưa có active config version.`);
    }

    const sampleWorkspace = readPromptWorkspaceSample(connectedPageId, input.sampleWorkspaceKey);
    const sampleConversation = sampleWorkspace.samplePreview.conversations.find(
      (conversation) => conversation.conversationId === input.selectedConversationId
    );
    if (!sampleConversation) {
      throw new AppError(
        409,
        "CHAT_EXTRACTOR_PROMPT_WORKSPACE_CONVERSATION_NOT_FOUND",
        `Workspace sample ${input.sampleWorkspaceKey} không chứa hội thoại ${input.selectedConversationId}.`
      );
    }

    const sampleScopeHash = hashPromptPreviewSampleScope({
      connectedPageId: page.page.id,
      targetDate: sampleWorkspace.samplePreview.targetDate,
      businessTimezone: sampleWorkspace.samplePreview.businessTimezone,
      windowStartAt: sampleWorkspace.samplePreview.windowStartAt,
      windowEndExclusiveAt: sampleWorkspace.samplePreview.windowEndExclusiveAt,
      sampleConversation
    });

    const activeArtifact = await this.resolvePromptPreviewArtifact(page, {
      promptText: configVersion.promptText,
      sampleScopeHash,
      sampleScope: sampleWorkspace.samplePreview,
      sampleConversation
    });
    const draftArtifact = await this.resolvePromptPreviewArtifact(page, {
      promptText: input.draftPromptText,
      sampleScopeHash,
      sampleScope: sampleWorkspace.samplePreview,
      sampleConversation
    });

    return {
      sample_scope: {
        sample_scope_key: sampleScopeHash,
        target_date: sampleWorkspace.samplePreview.targetDate,
        business_timezone: sampleWorkspace.samplePreview.businessTimezone,
        window_start_at: sampleWorkspace.samplePreview.windowStartAt,
        window_end_exclusive_at: sampleWorkspace.samplePreview.windowEndExclusiveAt,
        selected_conversation_id: sampleConversation.conversationId
      },
      active_artifact: serializePromptPreviewArtifact(activeArtifact),
      draft_artifact: serializePromptPreviewArtifact(draftArtifact)
    };
  }

  async getPromptPreviewArtifact(connectedPageId: string, artifactId: string) {
    const artifact = await chatExtractorRepository.getPromptPreviewArtifactById(artifactId);
    if (!artifact || artifact.connectedPageId !== connectedPageId) {
      throw new AppError(404, "CHAT_EXTRACTOR_PROMPT_PREVIEW_ARTIFACT_NOT_FOUND", `Prompt preview artifact ${artifactId} không thuộc page ${connectedPageId}.`);
    }

    return {
      artifact: serializePromptPreviewArtifact(artifact)
    };
  }

  async createConfigVersion(connectedPageId: string, input: {
    tagMappingJson?: PageConfigVersionRecord["tagMappingJson"];
    openingRulesJson?: PageConfigVersionRecord["openingRulesJson"];
    schedulerJson?: PageConfigVersionRecord["schedulerJson"] | undefined;
    notificationTargetsJson?: PageConfigVersionRecord["notificationTargetsJson"] | undefined;
    promptText?: string | null;
    analysisTaxonomyVersionId?: string;
    notes?: string | null;
    activate: boolean;
    etlEnabled?: boolean;
    analysisEnabled?: boolean;
  }) {
    const page = await this.requireConnectedPage(connectedPageId);
    const activeConfig = page.activeConfigVersion;
    const defaultTaxonomy = await chatExtractorRepository.ensureDefaultTaxonomy();
    const taxonomyVersionId = input.analysisTaxonomyVersionId
      ?? activeConfig?.analysisTaxonomyVersionId
      ?? defaultTaxonomy.id;

    const configVersion = await chatExtractorRepository.createPageConfigVersion({
      connectedPageId,
      versionNo: await chatExtractorRepository.nextConfigVersionNo(connectedPageId),
      tagMappingJson: input.tagMappingJson ?? activeConfig?.tagMappingJson ?? defaultTagMappingConfig(),
      openingRulesJson: input.openingRulesJson ?? activeConfig?.openingRulesJson ?? defaultOpeningRulesConfig(),
      schedulerJson: input.schedulerJson === undefined ? (activeConfig?.schedulerJson ?? null) : input.schedulerJson,
      notificationTargetsJson: input.notificationTargetsJson === undefined ? (activeConfig?.notificationTargetsJson ?? null) : input.notificationTargetsJson,
      promptText: input.promptText ?? activeConfig?.promptText ?? DEFAULT_PAGE_PROMPT,
      analysisTaxonomyVersionId: taxonomyVersionId,
      notes: input.notes ?? null
    });

    if (input.activate) {
      await chatExtractorRepository.activateConfigVersion(connectedPageId, configVersion.id);
    }

    if (input.etlEnabled !== undefined || input.analysisEnabled !== undefined) {
      await chatExtractorRepository.updateConnectedPageFlags(connectedPageId, {
        etlEnabled: input.etlEnabled,
        analysisEnabled: input.analysisEnabled
      });
    }

    return {
      configVersion: serializeConfigVersion(configVersion),
      active: input.activate
    };
  }

  async activateConfigVersion(connectedPageId: string, configVersionId: string) {
    const page = await this.requireConnectedPage(connectedPageId);
    const configVersion = page.configVersions.find((item) => item.id === configVersionId);
    if (!configVersion) {
      throw new AppError(404, "CHAT_EXTRACTOR_CONFIG_VERSION_NOT_FOUND", `Config version ${configVersionId} không thuộc page ${connectedPageId}.`);
    }
    await chatExtractorRepository.activateConfigVersion(connectedPageId, configVersionId);
    return this.getConnectedPage(connectedPageId);
  }

  async previewJobRequest(body: PreviewJobBody) {
    const page = await this.requireConnectedPage(body.connectedPageId);
    const snapshot = await this.resolveRuntimeSnapshot(page);
    const runMode = inferRunMode(body.kind, body.job);
    const plannedRuns = this.planJob(body.kind, body.job, page.page.businessTimezone);

    return {
      run_group: {
        run_mode: runMode,
        connected_page_id: page.page.id,
        page_name: page.page.pageName,
        requested_window_start_at: body.kind === "manual" ? body.job.requestedWindowStartAt : null,
        requested_window_end_exclusive_at: body.kind === "manual" ? body.job.requestedWindowEndExclusiveAt : null,
        requested_target_date: body.job.targetDate,
        will_use_config_version: snapshot.configVersion.versionNo,
        will_use_prompt_version: snapshot.promptIdentity.promptVersion,
        will_use_compiled_prompt_hash: snapshot.promptIdentityHash
      },
      child_runs: plannedRuns.map((run) => serializePreviewChildRun(run, snapshot))
    };
  }

  async executeJobRequest(body: ExecuteJobBody) {
    const page = await this.requireConnectedPage(body.connectedPageId);
    const snapshot = await this.resolveRuntimeSnapshot(page, true);
    const plannedRuns = this.planJob(body.kind, body.job, page.page.businessTimezone);
    const runGroupId = randomUUID();
    const runMode = inferRunMode(body.kind, body.job);

    const runRows = plannedRuns.map((run) => ({
      id: randomUUID(),
      targetDate: run.targetDate,
      windowStartAt: new Date(run.windowStartAt),
      windowEndExclusiveAt: new Date(run.windowEndExclusiveAt),
      requestedWindowStartAt: run.requestedWindowStartAt ? new Date(run.requestedWindowStartAt) : null,
      requestedWindowEndExclusiveAt: run.requestedWindowEndExclusiveAt ? new Date(run.requestedWindowEndExclusiveAt) : null,
      isFullDay: run.isFullDay,
      runMode,
      status: "queued",
      publishState: "draft",
      publishEligibility: run.publishEligibility,
      requestJson: buildRequestJson(body.job, runMode),
      metricsJson: {},
      reuseSummaryJson: {
        raw_reused_thread_count: 0,
        raw_refetched_thread_count: 0,
        ods_reused_thread_count: 0,
        ods_rebuilt_thread_count: 0,
        reuse_reason: "fresh_run"
      }
    }));

    await chatExtractorRepository.createRunGroupWithRuns({
      runGroupId,
      runMode,
      requestedWindowStartAt: body.kind === "manual" && body.job.requestedWindowStartAt ? new Date(body.job.requestedWindowStartAt) : null,
      requestedWindowEndExclusiveAt: body.kind === "manual" && body.job.requestedWindowEndExclusiveAt ? new Date(body.job.requestedWindowEndExclusiveAt) : null,
      requestedTargetDate: body.job.targetDate ? new Date(`${body.job.targetDate}T00:00:00.000Z`) : null,
      frozenConfigVersionId: snapshot.configVersion.id,
      frozenTaxonomyVersionId: snapshot.configVersion.analysisTaxonomyVersionId,
      frozenCompiledPromptHash: snapshot.promptIdentityHash,
      frozenPromptVersion: snapshot.promptIdentity.promptVersion,
      publishIntent: derivePublishIntent(plannedRuns),
      status: "queued",
      createdBy: "operator",
      childRuns: runRows
    });

    const executions: WorkerExecution[] = [];
    const analysisExecutions: Array<{
      pipelineRunId: string;
      analysisRunId: string;
      status: string;
      unitCountPlanned: number;
      unitCountSucceeded: number;
      unitCountUnknown: number;
      unitCountFailed: number;
      totalCostMicros: number;
    }> = [];
    let executionError: unknown = null;
    try {
      for (const run of runRows) {
        const plannedRun = plannedRuns.find((item) => item.targetDate === run.targetDate && item.windowStartAt === run.windowStartAt.toISOString());
        if (!plannedRun) {
          continue;
        }
        await chatExtractorRepository.markRunExecutionStarted(run.id);
        const manifest = buildWorkerManifest({
          pipelineRunId: run.id,
          runGroupId,
          page: page.page,
          configVersion: snapshot.configVersion,
          plannedRun,
          runMode,
          processingMode: body.job.processingMode,
          etlConfigHash: snapshot.etlConfigHash
        });
        try {
          const execution = await this.runWorkerImpl(manifest);
          assertWorkerExecutionSucceeded(execution);
          executions.push(execution);
          if (body.job.processingMode === "etl_and_ai" && page.page.analysisEnabled) {
            analysisExecutions.push(await this.runAnalysisImpl(run.id));
          }
        } catch (error) {
          await chatExtractorRepository.abortRunGroupExecution(
            runGroupId,
            run.id,
            compactErrorText(error)
          );
          throw error;
        }
      }
    } catch (error) {
      executionError = error;
    } finally {
      await chatExtractorRepository.refreshRunGroupStatus(runGroupId);
    }

    if (executionError) {
      throw executionError;
    }

    const runs = await chatExtractorRepository.listRunGroupRuns(runGroupId);
    return {
      run_group: serializeRunGroup(runs),
      child_runs: runs.map((run) => serializeRunSummary(run)),
      executions,
      analysis_executions: analysisExecutions
    };
  }

  async getRunGroup(runGroupId: string) {
    const runs = await chatExtractorRepository.listRunGroupRuns(runGroupId);
    if (runs.length === 0) {
      throw new AppError(404, "CHAT_EXTRACTOR_RUN_GROUP_NOT_FOUND", `Run group ${runGroupId} không tồn tại.`);
    }
    return {
      run_group: serializeRunGroup(runs),
      child_runs: runs.map((run) => serializeRunSummary(run))
    };
  }

  async getRun(runId: string) {
    const run = await chatExtractorRepository.getRunById(runId);
    if (!run) {
      throw new AppError(404, "CHAT_EXTRACTOR_RUN_NOT_FOUND", `Run ${runId} không tồn tại.`);
    }
    const counts = await chatExtractorRepository.getRunArtifactCounts(runId);
    return {
      run: serializeRunSummary(run),
      ...buildRunDiagnostics(run, counts)
    };
  }

  async publishRun(runId: string, body: PublishRunBody) {
    const run = await chatExtractorRepository.getRunById(runId);
    if (!run) {
      throw new AppError(404, "CHAT_EXTRACTOR_RUN_NOT_FOUND", `Run ${runId} không tồn tại.`);
    }
    if (run.status !== "loaded" && run.status !== "published") {
      throw new AppError(409, "CHAT_EXTRACTOR_RUN_NOT_READY", "Chỉ được publish run đã load xong.");
    }

    const connectedPageId = run.runGroup.connectedPage.id;
    const targetDate = run.targetDate.toISOString().slice(0, 10);
    const isHistorical = isHistoricalTargetDate(targetDate, run.runGroup.connectedPage.businessTimezone);
    validatePublishRequest(run, body.publishAs, isHistorical, body.confirmHistoricalOverwrite);

    const publishedRuns = (await chatExtractorRepository.findPublishedRunsForDate(connectedPageId, targetDate))
      .filter((item) => item.id !== runId);
    const existingOfficial = publishedRuns.find((item) => item.publishState === "published_official") ?? null;
    const existingProvisional = publishedRuns.find((item) => item.publishState === "published_provisional") ?? null;

    if (body.publishAs === "official" && existingOfficial && body.expectedReplacedRunId !== existingOfficial.id) {
      throw new AppError(409, "CHAT_EXTRACTOR_EXPECTED_REPLACED_RUN_MISMATCH", "expected_replaced_run_id không khớp snapshot official hiện tại.");
    }
    if (body.publishAs === "provisional" && existingProvisional && body.expectedReplacedRunId !== existingProvisional.id) {
      throw new AppError(409, "CHAT_EXTRACTOR_EXPECTED_REPLACED_RUN_MISMATCH", "expected_replaced_run_id không khớp snapshot provisional hiện tại.");
    }

    const supersedeRunIds = body.publishAs === "official"
      ? publishedRuns.map((item) => item.id)
      : existingProvisional ? [existingProvisional.id] : [];

    await chatExtractorRepository.publishRun({
      runId,
      publishAs: body.publishAs,
      publishedAt: new Date(),
      supersedeRunIds,
      expectedReplacedRunId: body.publishAs === "official" ? existingOfficial?.id ?? null : existingProvisional?.id ?? null
    });
    await chatExtractorRepository.refreshRunGroupStatus(run.runGroupId);
    return this.getRun(runId);
  }

  private async buildPromptWorkspaceSamplePreview(
    page: ConnectedPageDetailRecord,
    input: PromptWorkspaceSampleBody
  ) {
    const now = new Date();
    const targetDate = formatDateInTimezone(now, page.page.businessTimezone);
    const dayStart = parseDayStart(targetDate, page.page.businessTimezone);
    if (now <= dayStart) {
      throw new AppError(409, "CHAT_EXTRACTOR_PROMPT_WORKSPACE_WINDOW_EMPTY", "Chưa có khoảng sample hợp lệ trong ngày hiện tại theo business timezone của page.");
    }

    const configVersion = page.activeConfigVersion;
    const schedulerBase = input.schedulerJson
      ?? configVersion?.schedulerJson
      ?? defaultSchedulerConfig(page.page.businessTimezone);

    return this.runRuntimePreviewImpl({
      pageId: page.page.pancakePageId,
      userAccessToken: page.page.pancakeUserAccessToken,
      businessTimezone: page.page.businessTimezone,
      targetDate,
      windowStartAt: dayStart.toISOString(),
      windowEndExclusiveAt: now.toISOString(),
      tagMappingJson: input.tagMappingJson ?? configVersion?.tagMappingJson ?? defaultTagMappingConfig(),
      openingRulesJson: input.openingRulesJson ?? configVersion?.openingRulesJson ?? defaultOpeningRulesConfig(),
      schedulerJson: {
        ...schedulerBase,
        timezone: page.page.businessTimezone,
        maxConversationsPerRun: input.sampleConversationLimit,
        maxMessagePagesPerThread: 0
      }
    });
  }

  private async resolvePromptPreviewArtifact(
    page: ConnectedPageDetailRecord,
    input: {
      promptText: string;
      sampleScopeHash: string;
      sampleScope: RuntimePreviewOutput;
      sampleConversation: RuntimePreviewConversation;
    }
  ): Promise<PromptPreviewArtifactRecord> {
    const configVersion = page.activeConfigVersion;
    if (!configVersion) {
      throw new AppError(400, "CHAT_EXTRACTOR_ACTIVE_CONFIG_REQUIRED", `Page ${page.page.id} chưa có active config version.`);
    }

    const promptIdentity = await this.resolvePromptIdentity(page.page.id, input.promptText, configVersion.analysisTaxonomyVersion.taxonomyJson, true);
    const runtime = buildPromptPreviewRuntimeSnapshot(page, configVersion, promptIdentity, input.promptText);
    const runtimeMetadata = await this.resolvePromptPreviewRuntimeMetadata(runtime);
    const effectivePromptHash = readRuntimePromptHash(runtimeMetadata, promptIdentity.compiledPromptHash);

    const existingArtifact = await chatExtractorRepository.getPromptPreviewArtifactByIdentity({
      connectedPageId: page.page.id,
      analysisTaxonomyVersionId: configVersion.analysisTaxonomyVersionId,
      compiledPromptHash: effectivePromptHash,
      sampleScopeHash: input.sampleScopeHash,
      sampleConversationId: input.sampleConversation.conversationId
    });
    if (existingArtifact) {
      return existingArtifact;
    }

    const bundle = buildPromptPreviewBundle(page, input.sampleScopeHash, input.sampleScope, input.sampleConversation);
    const response = await conversationAnalysisClient.analyzeConversations({
      runtime,
      bundles: [bundle]
    });
    const result = response.results[0];
    if (!result) {
      throw new AppError(502, "CHAT_EXTRACTOR_PROMPT_PREVIEW_EMPTY_RESULT", "AI preview không trả về result nào cho sample conversation đã chọn.");
    }

    return chatExtractorRepository.createPromptPreviewArtifact({
      connectedPageId: page.page.id,
      analysisTaxonomyVersionId: configVersion.analysisTaxonomyVersionId,
      compiledPromptHash: readRuntimePromptHash(response.runtimeMetadataJson, effectivePromptHash),
      promptVersion: promptIdentity.promptVersion,
      sampleScopeHash: input.sampleScopeHash,
      sampleTargetDate: new Date(`${input.sampleScope.targetDate}T00:00:00.000Z`),
      sampleWindowStartAt: new Date(input.sampleScope.windowStartAt),
      sampleWindowEndExclusiveAt: new Date(input.sampleScope.windowEndExclusiveAt),
      sampleConversationId: input.sampleConversation.conversationId,
      customerDisplayName: normalizePromptPreviewCustomer(input.sampleConversation.customerDisplayName),
      runtimeMetadataJson: cloneJsonValue(response.runtimeMetadataJson) as Prisma.InputJsonValue,
      previewResultJson: serializePromptPreviewResult(result),
      evidenceBundleJson: buildPromptPreviewEvidenceBundle(result.evidenceUsedJson),
      fieldExplanationsJson: buildPromptPreviewFieldExplanations(result.fieldExplanationsJson),
      supportingMessageIdsJson: cloneJsonValue(result.supportingMessageIdsJson)
    });
  }

  private async resolvePromptIdentity(
    connectedPageId: string,
    promptText: string,
    taxonomyJson: unknown,
    persistPromptIdentity = false
  ) {
    const promptIdentityText = buildPagePromptIdentityText({
      promptText,
      taxonomyJson
    });
    const promptIdentityHash = hashPagePromptIdentity(promptIdentityText);
    const existingIdentity = await chatExtractorRepository.getPromptIdentityByHash(connectedPageId, promptIdentityHash);
    if (existingIdentity) {
      return existingIdentity;
    }

    if (persistPromptIdentity) {
      return chatExtractorRepository.createPromptIdentity({
        connectedPageId,
        compiledPromptHash: promptIdentityHash,
        compiledPromptText: promptIdentityText
      });
    }

    return {
      id: null,
      connectedPageId,
      compiledPromptHash: promptIdentityHash,
      promptVersion: nextPromptVersion((await chatExtractorRepository.listPromptIdentities(connectedPageId)).map((item) => item.promptVersion)),
      compiledPromptText: promptIdentityText,
      createdAt: null
    };
  }

  private async resolvePromptPreviewRuntimeMetadata(runtime: AnalysisRuntimeSnapshot) {
    const response = await conversationAnalysisClient.analyzeConversations({
      runtime,
      bundles: []
    });
    return response.runtimeMetadataJson;
  }

  private async resolveRuntimeSnapshot(page: ConnectedPageDetailRecord, persistPromptIdentity = false): Promise<RuntimeSnapshot> {
    const configVersion = page.activeConfigVersion;
    if (!configVersion) {
      throw new AppError(400, "CHAT_EXTRACTOR_ACTIVE_CONFIG_REQUIRED", `Page ${page.page.id} chưa có active config version.`);
    }

    const promptIdentity = await this.resolvePromptIdentity(
      page.page.id,
      configVersion.promptText,
      configVersion.analysisTaxonomyVersion.taxonomyJson,
      persistPromptIdentity
    );

    return {
      configVersion,
      promptIdentityText: promptIdentity.compiledPromptText,
      promptIdentityHash: promptIdentity.compiledPromptHash,
      promptIdentity,
      etlConfigHash: hashEtlConfig({
        tagMapping: configVersion.tagMappingJson,
        openingRules: configVersion.openingRulesJson,
        scheduler: configVersion.schedulerJson
      })
    };
  }

  private planJob(
    kind: PreviewJobBody["kind"] | ExecuteJobBody["kind"],
    job: PreviewJobBody["job"] | ExecuteJobBody["job"],
    businessTimezone: string
  ): PlannedChildRun[] {
    if (kind === "official_daily") {
      const officialJob = job as OfficialDailyJobBody;
      return [buildFullDayRun(officialJob.targetDate, businessTimezone)];
    }

    const manualJob = job as ManualJobBody;
    return typeof manualJob.targetDate === "string"
      ? [buildFullDayRun(manualJob.targetDate, businessTimezone)]
      : splitRequestedWindowByTargetDate(
          manualJob.requestedWindowStartAt!,
          manualJob.requestedWindowEndExclusiveAt!,
          businessTimezone
        );
  }

  private async requireConnectedPage(id: string) {
    const page = await chatExtractorRepository.getConnectedPageById(id);
    if (!page) {
      throw new AppError(404, "CHAT_EXTRACTOR_CONNECTED_PAGE_NOT_FOUND", `Connected page ${id} không tồn tại.`);
    }
    return page;
  }

  private async resolveListedPage(userAccessToken: string, pancakePageId: string) {
    const pages = await this.listPagesFromTokenImpl(userAccessToken);
    const selectedPage = pages.find((page) => page.pageId === pancakePageId);
    if (!selectedPage) {
      throw new AppError(400, "CHAT_EXTRACTOR_PAGE_SELECTION_INVALID", `Pancake page ${pancakePageId} không tồn tại với token đã cung cấp.`);
    }
    return selectedPage;
  }

  private async resolveConnectedPageStatus(page: ConnectedPageRecord): Promise<ConnectedPageStatusView> {
    const tokenPreviewMasked = maskToken(page.pancakeUserAccessToken);
    if (!page.pancakeUserAccessToken.trim()) {
      return {
        token_status: "missing",
        connection_status: "not_checked",
        token_preview_masked: tokenPreviewMasked,
        last_validated_at: null
      } as const;
    }

    const lastValidatedAt = new Date().toISOString();
    try {
      const pages = await this.listPagesFromTokenImpl(page.pancakeUserAccessToken);
      const hasPageAccess = pages.some((item) => item.pageId === page.pancakePageId);
      return {
        token_status: "valid",
        connection_status: hasPageAccess ? "connected" : "page_unavailable",
        token_preview_masked: tokenPreviewMasked,
        last_validated_at: lastValidatedAt
      } as const;
    } catch {
      return {
        token_status: "invalid",
        connection_status: "token_invalid",
        token_preview_masked: tokenPreviewMasked,
        last_validated_at: lastValidatedAt
      } as const;
    }
  }
}

export const chatExtractorService = new ChatExtractorService();

async function fetchPancakePages(userAccessToken: string): Promise<ListedPage[]> {
  const endpoint = new URL("https://pages.fm/api/v1/pages");
  endpoint.searchParams.set("access_token", userAccessToken);

  const response = await fetch(endpoint, {
    headers: {
      Accept: "application/json",
      "User-Agent": "chat-analyzer-v2-control-plane/0.3"
    }
  });
  const raw = await response.text();
  if (!response.ok) {
    throw new AppError(400, "CHAT_EXTRACTOR_LIST_PAGES_FAILED", "Không thể lấy danh sách page từ Pancake.", {
      status: response.status,
      body: compactPayload(raw)
    });
  }
  return parseListPagesResponse(raw);
}

async function runAnalysisLoadedRun(pipelineRunId: string) {
  const [analysisModule, readModelsModule] = await Promise.all([
    import("../analysis/analysis.service.ts"),
    import("../read_models/read_models.service.ts")
  ]);
  const summary = await analysisModule.analysisService.executeLoadedRun(pipelineRunId);
  if (summary.status === "completed") {
    await readModelsModule.readModelsService.materializeRun(pipelineRunId);
  }
  return summary;
}

async function runWorkerRuntimePreview(input: RuntimePreviewWorkerInput): Promise<RuntimePreviewOutput> {
  const proc = Bun.spawn([
    "go",
    "run",
    ".",
    "-runtime-only",
    "-job-json",
    JSON.stringify({
      manifest_version: 1,
      run_group_id: randomUUID(),
      page_id: input.pageId,
      user_access_token: input.userAccessToken,
      business_timezone: input.businessTimezone,
      target_date: input.targetDate,
      run_mode: "onboarding_sample",
      processing_mode: "etl_only",
      publish_eligibility: "provisional_current_day_partial",
      requested_window_start_at: input.windowStartAt,
      requested_window_end_exclusive_at: input.windowEndExclusiveAt,
      window_start_at: input.windowStartAt,
      window_end_exclusive_at: input.windowEndExclusiveAt,
      is_full_day: false,
      etl_config: {
        config_version_id: "onboarding-sample-preview",
        etl_config_hash: "sha256:onboarding-sample-preview",
        tag_mapping: toWorkerTagMappingConfig(input.tagMappingJson),
        opening_rules: toWorkerOpeningRulesConfig(input.openingRulesJson),
        scheduler: toWorkerSchedulerConfig(input.schedulerJson)
      }
    })
  ], {
    cwd: workerRoot,
    stdout: "pipe",
    stderr: "pipe"
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited
  ]);

  if (exitCode !== 0) {
    throw new AppError(
      502,
      "CHAT_EXTRACTOR_ONBOARDING_SAMPLE_FAILED",
      `Không thể lấy sample onboarding từ runtime preview. ${compactErrorText(stderr || stdout || `worker exited with code ${exitCode}`)}`
    );
  }

  try {
    return parseRuntimePreviewOutput(stdout);
  } catch (error) {
    throw new AppError(
      502,
      "CHAT_EXTRACTOR_ONBOARDING_SAMPLE_INVALID_OUTPUT",
      `Runtime preview trả về JSON không hợp lệ. ${compactErrorText(error)}`
    );
  }
}

async function runWorkerManifest(manifest: WorkerManifest): Promise<WorkerExecution> {
  await mkdir(resolve(workerRoot, "tmp"), { recursive: true });
  const tempDir = await mkdtemp(resolve(tmpdir(), "chat-analyzer-chat-extractor-"));
  const tempFile = resolve(tempDir, `${manifest.pipeline_run_id}.json`);
  await writeFile(tempFile, JSON.stringify(manifest, null, 2), "utf8");

  try {
    const proc = Bun.spawn(["go", "run", ".", "-job-file", tempFile], {
      cwd: workerRoot,
      stdout: "pipe",
      stderr: "pipe"
    });
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited
    ]);

    return {
      pipelineRunId: manifest.pipeline_run_id,
      exitCode,
      ok: exitCode === 0,
      stdout: stdout.trim(),
      stderr: stderr.trim()
    };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

function parseRuntimePreviewOutput(raw: string): RuntimePreviewOutput {
  const parsed = JSON.parse(raw) as Partial<RuntimePreviewOutput> | null;
  if (!parsed || typeof parsed !== "object") {
    throw new Error("preview output phải là object JSON.");
  }
  if (typeof parsed.pageId !== "string" || typeof parsed.targetDate !== "string" || typeof parsed.businessTimezone !== "string") {
    throw new Error("preview output thiếu pageId/targetDate/businessTimezone.");
  }
  if (typeof parsed.windowStartAt !== "string" || typeof parsed.windowEndExclusiveAt !== "string") {
    throw new Error("preview output thiếu windowStartAt/windowEndExclusiveAt.");
  }
  if (!parsed.summary || typeof parsed.summary !== "object" || Array.isArray(parsed.summary)) {
    throw new Error("preview output thiếu summary.");
  }

  return {
    pageId: parsed.pageId,
    targetDate: parsed.targetDate,
    businessTimezone: parsed.businessTimezone,
    windowStartAt: parsed.windowStartAt,
    windowEndExclusiveAt: parsed.windowEndExclusiveAt,
    summary: parsed.summary as Record<string, unknown>,
    pageTags: Array.isArray(parsed.pageTags)
      ? parsed.pageTags
        .filter((item) => item && typeof item === "object")
        .map((item) => ({
          pancakeTagId: typeof (item as { pancakeTagId?: unknown }).pancakeTagId === "string" ? (item as { pancakeTagId: string }).pancakeTagId : "",
          text: typeof (item as { text?: unknown }).text === "string" ? (item as { text: string }).text : "",
          isDeactive: typeof (item as { isDeactive?: unknown }).isDeactive === "boolean" ? (item as { isDeactive: boolean }).isDeactive : false
        }))
      : [],
    conversations: Array.isArray(parsed.conversations)
      ? parsed.conversations
        .filter((item) => item && typeof item === "object" && typeof (item as { conversationId?: unknown }).conversationId === "string")
        .map((item) => ({
          conversationId: (item as { conversationId: string }).conversationId,
          customerDisplayName: typeof (item as { customerDisplayName?: unknown }).customerDisplayName === "string"
            ? (item as { customerDisplayName: string }).customerDisplayName
            : "",
          firstMeaningfulMessageId: typeof (item as { firstMeaningfulMessageId?: unknown }).firstMeaningfulMessageId === "string"
            ? (item as { firstMeaningfulMessageId: string }).firstMeaningfulMessageId
            : "",
          firstMeaningfulMessageText: typeof (item as { firstMeaningfulMessageText?: unknown }).firstMeaningfulMessageText === "string"
            ? (item as { firstMeaningfulMessageText: string }).firstMeaningfulMessageText
            : "",
          firstMeaningfulMessageSenderRole: typeof (item as { firstMeaningfulMessageSenderRole?: unknown }).firstMeaningfulMessageSenderRole === "string"
            ? (item as { firstMeaningfulMessageSenderRole: string }).firstMeaningfulMessageSenderRole
            : "",
          observedTagsJson: (item as { observedTagsJson?: unknown }).observedTagsJson ?? null,
          normalizedTagSignalsJson: (item as { normalizedTagSignalsJson?: unknown }).normalizedTagSignalsJson ?? null,
          openingBlockJson: (item as { openingBlockJson?: unknown }).openingBlockJson ?? null,
          explicitRevisitSignal: normalizeNullableString((item as { explicitRevisitSignal?: unknown }).explicitRevisitSignal),
          explicitNeedSignal: normalizeNullableString((item as { explicitNeedSignal?: unknown }).explicitNeedSignal),
          explicitOutcomeSignal: normalizeNullableString((item as { explicitOutcomeSignal?: unknown }).explicitOutcomeSignal),
          sourceThreadJsonRedacted: (item as { sourceThreadJsonRedacted?: unknown }).sourceThreadJsonRedacted ?? {},
          messageCount: readNumberField(item, "messageCount"),
          firstStaffResponseSeconds: readNullableNumberField(item, "firstStaffResponseSeconds"),
          avgStaffResponseSeconds: readNullableNumberField(item, "avgStaffResponseSeconds"),
          staffParticipantsJson: (item as { staffParticipantsJson?: unknown }).staffParticipantsJson ?? [],
          messages: Array.isArray((item as { messages?: unknown }).messages)
            ? ((item as { messages: Array<Record<string, unknown>> }).messages).map((message) => ({
              messageId: typeof message.messageId === "string" ? message.messageId : "",
              insertedAt: typeof message.insertedAt === "string" ? message.insertedAt : "",
              senderRole: typeof message.senderRole === "string" ? message.senderRole : "",
              senderName: normalizeNullableString(message.senderName),
              messageType: typeof message.messageType === "string" ? message.messageType : "",
              redactedText: normalizeNullableString(message.redactedText),
              isMeaningfulHumanMessage: message.isMeaningfulHumanMessage === true,
              isOpeningBlockMessage: message.isOpeningBlockMessage === true
            })).filter((message) => message.messageId || message.insertedAt || message.senderRole || message.messageType || message.redactedText)
            : []
        }))
      : []
  };
}

function buildPromptPreviewRuntimeSnapshot(
  page: ConnectedPageDetailRecord,
  configVersion: PageConfigVersionRecord,
  promptIdentity: PagePromptIdentityRecord | {
    id: null;
    connectedPageId: string;
    compiledPromptHash: string;
    promptVersion: string;
    compiledPromptText: string;
    createdAt: Date | null;
  },
  promptText: string
): AnalysisRuntimeSnapshot {
  return {
    profileId: ANALYSIS_RUNTIME_PROFILE_ID,
    versionNo: ANALYSIS_RUNTIME_PROFILE_VERSION,
    modelName: ANALYSIS_RUNTIME_MODEL_NAME,
    outputSchemaVersion: ANALYSIS_OUTPUT_SCHEMA_VERSION,
    pagePromptHash: promptIdentity.compiledPromptHash,
    promptVersion: promptIdentity.promptVersion,
    configVersionId: configVersion.id,
    taxonomyVersionId: configVersion.analysisTaxonomyVersion.id,
    taxonomyVersionCode: configVersion.analysisTaxonomyVersion.versionCode,
    connectedPageId: page.page.id,
    pagePromptText: promptText,
    taxonomyJson: cloneJsonValue(configVersion.analysisTaxonomyVersion.taxonomyJson),
    generationConfig: {},
    profileJson: {
      connected_page_id: page.page.id,
      page_name: page.page.pageName,
      business_timezone: page.page.businessTimezone,
      config_version_id: configVersion.id,
      taxonomy_version_id: configVersion.analysisTaxonomyVersion.id,
      taxonomy_version_code: configVersion.analysisTaxonomyVersion.versionCode,
      page_prompt_hash: promptIdentity.compiledPromptHash,
      page_prompt_version: promptIdentity.promptVersion,
      preview_mode: "prompt_profile_workspace"
    }
  };
}

function buildPromptPreviewBundle(
  page: ConnectedPageDetailRecord,
  sampleScopeHash: string,
  sampleScope: RuntimePreviewOutput,
  sampleConversation: RuntimePreviewConversation
): AnalysisUnitBundle {
  return {
    threadDayId: `prompt-preview:${sampleScopeHash}:${sampleConversation.conversationId}`,
    threadId: sampleConversation.conversationId,
    connectedPageId: page.page.id,
    pipelineRunId: `prompt-preview:${page.page.id}`,
    runGroupId: `prompt-preview:${sampleScopeHash}`,
    targetDate: sampleScope.targetDate,
    businessTimezone: sampleScope.businessTimezone,
    customerDisplayName: normalizePromptPreviewCustomer(sampleConversation.customerDisplayName),
    normalizedTagSignalsJson: cloneJsonValue(sampleConversation.normalizedTagSignalsJson),
    observedTagsJson: cloneJsonValue(sampleConversation.observedTagsJson),
    openingBlockJson: cloneJsonValue(sampleConversation.openingBlockJson),
    firstMeaningfulMessageId: sampleConversation.firstMeaningfulMessageId,
    firstMeaningfulMessageTextRedacted: normalizePromptPreviewCustomer(sampleConversation.firstMeaningfulMessageText),
    firstMeaningfulMessageSenderRole: sampleConversation.firstMeaningfulMessageSenderRole,
    explicitRevisitSignal: sampleConversation.explicitRevisitSignal,
    explicitNeedSignal: sampleConversation.explicitNeedSignal,
    explicitOutcomeSignal: sampleConversation.explicitOutcomeSignal,
    sourceThreadJsonRedacted: cloneJsonValue(sampleConversation.sourceThreadJsonRedacted),
    messageCount: sampleConversation.messageCount,
    firstStaffResponseSeconds: sampleConversation.firstStaffResponseSeconds,
    avgStaffResponseSeconds: sampleConversation.avgStaffResponseSeconds,
    staffParticipantsJson: cloneJsonValue(sampleConversation.staffParticipantsJson),
    staffMessageStatsJson: [],
    messages: sampleConversation.messages.map((message) => ({
      id: message.messageId,
      insertedAt: message.insertedAt,
      senderRole: message.senderRole,
      senderName: message.senderName,
      messageType: message.messageType,
      redactedText: message.redactedText,
      isMeaningfulHumanMessage: message.isMeaningfulHumanMessage,
      isOpeningBlockMessage: message.isOpeningBlockMessage
    }))
  };
}

function storePromptWorkspaceSample(connectedPageId: string, samplePreview: RuntimePreviewOutput) {
  cleanupPromptWorkspaceSamples(Date.now());
  const sampleWorkspaceKey = randomUUID();
  const expiresAtMs = Date.now() + PROMPT_WORKSPACE_SAMPLE_TTL_MS;
  promptWorkspaceSampleStore.set(sampleWorkspaceKey, {
    connectedPageId,
    samplePreview,
    expiresAtMs
  });
  return {
    sampleWorkspaceKey,
    sampleWorkspaceExpiresAt: new Date(expiresAtMs).toISOString()
  };
}

function readPromptWorkspaceSample(connectedPageId: string, sampleWorkspaceKey: string): StoredPromptWorkspaceSample {
  const sampleWorkspace = promptWorkspaceSampleStore.get(sampleWorkspaceKey);
  if (!sampleWorkspace || sampleWorkspace.connectedPageId !== connectedPageId) {
    cleanupPromptWorkspaceSamples(Date.now());
    throw new AppError(
      409,
      "CHAT_EXTRACTOR_PROMPT_WORKSPACE_SAMPLE_NOT_FOUND",
      `Workspace sample ${sampleWorkspaceKey} không còn hợp lệ cho page ${connectedPageId}.`
    );
  }
  if (sampleWorkspace.expiresAtMs <= Date.now()) {
    promptWorkspaceSampleStore.delete(sampleWorkspaceKey);
    cleanupPromptWorkspaceSamples(Date.now());
    throw new AppError(
      409,
      "CHAT_EXTRACTOR_PROMPT_WORKSPACE_SAMPLE_STALE",
      `Workspace sample ${sampleWorkspaceKey} đã hết hạn.`
    );
  }
  return sampleWorkspace;
}

function cleanupPromptWorkspaceSamples(nowMs: number) {
  for (const [workspaceKey, sampleWorkspace] of promptWorkspaceSampleStore.entries()) {
    if (sampleWorkspace.expiresAtMs <= nowMs) {
      promptWorkspaceSampleStore.delete(workspaceKey);
    }
  }
}

function serializePromptPreviewResult(result: ConversationAnalysisResult) {
  return {
    opening_theme_code: result.openingThemeCode,
    opening_theme_reason: result.openingThemeReason,
    customer_mood_code: result.customerMoodCode,
    primary_need_code: result.primaryNeedCode,
    primary_topic_code: result.primaryTopicCode,
    journey_code: result.journeyCode,
    closing_outcome_inference_code: result.closingOutcomeInferenceCode,
    process_risk_level_code: result.processRiskLevelCode,
    process_risk_reason_text: result.processRiskReasonText,
    staff_assessments_json: cloneJsonValue(result.staffAssessmentsJson)
  };
}

function buildPromptPreviewEvidenceBundle(evidenceUsedJson: Record<string, unknown>) {
  const flattened = flattenEvidence("", evidenceUsedJson);
  return flattened.length > 0 ? flattened : ["Không có evidence bundle từ runtime preview."];
}

function buildPromptPreviewFieldExplanations(fieldExplanationsJson: Record<string, unknown>) {
  return Object.entries(fieldExplanationsJson)
    .flatMap(([field, value]) => {
      if (typeof value === "string") {
        return [{ field, explanation: value }];
      }
      if (value && typeof value === "object" && !Array.isArray(value)) {
        const explanation = typeof (value as Record<string, unknown>).explanation === "string"
          ? String((value as Record<string, unknown>).explanation)
          : JSON.stringify(value);
        return [{ field, explanation }];
      }
      return [];
    });
}

function serializePromptPreviewArtifact(artifact: PromptPreviewArtifactRecord): PromptPreviewArtifactView {
  return {
    id: artifact.id,
    promptVersionLabel: artifact.promptVersion,
    promptHash: artifact.compiledPromptHash,
    taxonomyVersionCode: artifact.analysisTaxonomyVersion.versionCode,
    sampleScopeKey: artifact.sampleScopeHash,
    sampleConversationId: artifact.sampleConversationId,
    customerDisplayName: artifact.customerDisplayName ?? "",
    createdAt: artifact.createdAt.toISOString(),
    runtimeMetadata: asObjectJson(artifact.runtimeMetadataJson),
    result: asObjectJson(artifact.previewResultJson),
    evidenceBundle: asStringArrayJson(artifact.evidenceBundleJson),
    fieldExplanations: asFieldExplanationArrayJson(artifact.fieldExplanationsJson),
    supportingMessageIds: asStringArrayJson(artifact.supportingMessageIdsJson)
  };
}

function readRuntimePromptHash(runtimeMetadataJson: Record<string, unknown>, fallback: string) {
  const value = runtimeMetadataJson.effective_prompt_hash;
  return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}

function flattenEvidence(prefix: string, value: unknown): string[] {
  if (typeof value === "string") {
    return value.trim() ? [`${prefix}${value}`] : [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => flattenEvidence(prefix, item));
  }
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).flatMap(([key, item]) =>
      flattenEvidence(prefix ? `${prefix}${key}: ` : `${key}: `, item)
    );
  }
  if (value === null || value === undefined) {
    return [];
  }
  return [`${prefix}${String(value)}`];
}

function asObjectJson(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? cloneJsonValue(value as Record<string, unknown>)
    : {};
}

function asStringArrayJson(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function asFieldExplanationArrayJson(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") {
      return [];
    }
    const field = typeof (item as Record<string, unknown>).field === "string"
      ? String((item as Record<string, unknown>).field)
      : "";
    const explanation = typeof (item as Record<string, unknown>).explanation === "string"
      ? String((item as Record<string, unknown>).explanation)
      : "";
    return field && explanation ? [{ field, explanation }] : [];
  });
}

function readNumberField(value: unknown, key: string) {
  if (!value || typeof value !== "object") {
    return 0;
  }
  const result = (value as Record<string, unknown>)[key];
  return typeof result === "number" ? result : 0;
}

function readNullableNumberField(value: unknown, key: string) {
  if (!value || typeof value !== "object") {
    return null;
  }
  const result = (value as Record<string, unknown>)[key];
  return typeof result === "number" ? result : null;
}

function normalizeNullableString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function normalizePromptPreviewCustomer(value: string | null | undefined) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function toWorkerTagMappingConfig(value: ReturnType<typeof defaultTagMappingConfig>) {
  return {
    version: value.version,
    default_role: value.defaultRole,
    entries: value.entries.map((entry) => ({
      source_tag_id: entry.sourceTagId,
      source_tag_text: entry.sourceTagText,
      role: entry.role,
      canonical_code: entry.canonicalCode,
      mapping_source: entry.mappingSource,
      status: entry.status
    }))
  };
}

function toWorkerOpeningRulesConfig(value: ReturnType<typeof defaultOpeningRulesConfig>) {
  return {
    version: value.version,
    selectors: value.selectors.map((selector) => ({
      selector_id: selector.selectorId,
      signal_role: selector.signalRole,
      signal_code: selector.signalCode,
      allowed_message_types: selector.allowedMessageTypes,
      options: selector.options.map((option) => ({
        raw_text: option.rawText,
        match_mode: option.matchMode
      }))
    }))
  };
}

function toWorkerSchedulerConfig(value: ReturnType<typeof defaultSchedulerConfig>) {
  return {
    version: value.version,
    timezone: value.timezone,
    official_daily_time: value.officialDailyTime,
    lookback_hours: value.lookbackHours,
    max_conversations_per_run: value.maxConversationsPerRun,
    max_message_pages_per_thread: value.maxMessagePagesPerThread
  };
}

function buildWorkerManifest(input: {
  pipelineRunId: string;
  runGroupId: string;
  page: ConnectedPageRecord;
  configVersion: PageConfigVersionRecord;
  plannedRun: PlannedChildRun;
  runMode: WorkerManifest["run_mode"];
  processingMode: WorkerManifest["processing_mode"];
  etlConfigHash: string;
}): WorkerManifest {
  return {
    manifest_version: 1,
    pipeline_run_id: input.pipelineRunId,
    run_group_id: input.runGroupId,
    connected_page_id: input.page.id,
    page_id: input.page.pancakePageId,
    user_access_token: input.page.pancakeUserAccessToken,
    business_timezone: input.page.businessTimezone,
    target_date: input.plannedRun.targetDate,
    run_mode: input.runMode,
    processing_mode: input.processingMode,
    publish_eligibility: input.plannedRun.publishEligibility,
    requested_window_start_at: input.plannedRun.requestedWindowStartAt,
    requested_window_end_exclusive_at: input.plannedRun.requestedWindowEndExclusiveAt,
    window_start_at: input.plannedRun.windowStartAt,
    window_end_exclusive_at: input.plannedRun.windowEndExclusiveAt,
    is_full_day: input.plannedRun.isFullDay,
    etl_config: {
      config_version_id: input.configVersion.id,
      etl_config_hash: input.etlConfigHash,
      tag_mapping: input.configVersion.tagMappingJson,
      opening_rules: input.configVersion.openingRulesJson,
      scheduler: input.configVersion.schedulerJson ?? defaultSchedulerConfig(input.page.businessTimezone)
    }
  };
}

function serializeConnectedPageDetail(
  record: ConnectedPageDetailRecord,
  status: ConnectedPageStatusView = buildUncheckedConnectedPageStatus(record.page.pancakeUserAccessToken)
) {
  return {
    id: record.page.id,
    pancakePageId: record.page.pancakePageId,
    pageName: record.page.pageName,
    businessTimezone: record.page.businessTimezone,
    tokenStatus: status.token_status,
    connectionStatus: status.connection_status,
    tokenPreviewMasked: status.token_preview_masked,
    lastValidatedAt: status.last_validated_at,
    etlEnabled: record.page.etlEnabled,
    analysisEnabled: record.page.analysisEnabled,
    activeConfigVersionId: record.page.activeConfigVersionId,
    activeConfigVersion: record.activeConfigVersion ? serializeConfigVersion(record.activeConfigVersion) : null,
    configVersions: record.configVersions.map((item) => serializeConfigVersion(item)),
    createdAt: record.page.createdAt,
    updatedAt: record.page.updatedAt
  };
}

function buildUncheckedConnectedPageStatus(token: string) {
  return {
    token_status: token.trim() ? "not_checked" : "missing",
    connection_status: "not_checked",
    token_preview_masked: maskToken(token),
    last_validated_at: null
  } as const;
}

function maskToken(token: string) {
  const trimmed = token.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.length <= 8) {
    return `${trimmed.slice(0, 2)}***${trimmed.slice(-2)}`;
  }
  return `${trimmed.slice(0, 4)}...${trimmed.slice(-4)}`;
}

function serializeConfigVersion(record: PageConfigVersionRecord) {
  return {
    id: record.id,
    versionNo: record.versionNo,
    tagMappingJson: record.tagMappingJson,
    openingRulesJson: record.openingRulesJson,
    schedulerJson: record.schedulerJson,
    notificationTargetsJson: record.notificationTargetsJson,
    promptText: record.promptText,
    analysisTaxonomyVersionId: record.analysisTaxonomyVersionId,
    analysisTaxonomyVersion: {
      id: record.analysisTaxonomyVersion.id,
      versionCode: record.analysisTaxonomyVersion.versionCode,
      taxonomyJson: record.analysisTaxonomyVersion.taxonomyJson,
      isActive: record.analysisTaxonomyVersion.isActive
    },
    notes: record.notes,
    createdAt: record.createdAt
  };
}

function serializePreviewChildRun(run: PlannedChildRun, snapshot: RuntimeSnapshot) {
  return {
    target_date: run.targetDate,
    window_start_at: run.windowStartAt,
    window_end_exclusive_at: run.windowEndExclusiveAt,
    is_full_day: run.isFullDay,
    publish_eligibility: run.publishEligibility,
    historical_overwrite_required: run.historicalOverwriteRequired,
    will_use_config_version: snapshot.configVersion.versionNo,
    will_use_prompt_version: snapshot.promptIdentity.promptVersion,
    will_use_compiled_prompt_hash: snapshot.promptIdentityHash
  };
}

function serializeRunSummary(run: PipelineRunRecord) {
  return {
    id: run.id,
    run_group_id: run.runGroupId,
    target_date: run.targetDate.toISOString().slice(0, 10),
    window_start_at: run.windowStartAt,
    window_end_exclusive_at: run.windowEndExclusiveAt,
    requested_window_start_at: run.requestedWindowStartAt,
    requested_window_end_exclusive_at: run.requestedWindowEndExclusiveAt,
    is_full_day: run.isFullDay,
    run_mode: run.runMode,
    status: run.status,
    publish_state: run.publishState,
    publish_eligibility: run.publishEligibility,
    supersedes_run_id: run.supersedesRunId,
    superseded_by_run_id: run.supersededByRunId,
    request_json: run.requestJson,
    metrics_json: run.metricsJson,
    reuse_summary_json: run.reuseSummaryJson,
    error_text: run.errorText,
    created_at: run.createdAt,
    started_at: run.startedAt,
    finished_at: run.finishedAt,
    published_at: run.publishedAt
  };
}

function serializeRunGroup(runs: PipelineRunRecord[]) {
  const firstRun = runs[0]!;
  const targetDates = runs.map((run) => run.targetDate.toISOString().slice(0, 10));
  return {
    id: firstRun.runGroup.id,
    connected_page_id: firstRun.runGroup.connectedPage.id,
    page_name: firstRun.runGroup.connectedPage.pageName,
    run_mode: firstRun.runGroup.runMode,
    status: firstRun.runGroup.status,
    requested_window_start_at: firstRun.runGroup.requestedWindowStartAt,
    requested_window_end_exclusive_at: firstRun.runGroup.requestedWindowEndExclusiveAt,
    requested_target_date: firstRun.runGroup.requestedTargetDate,
    frozen_config_version_id: firstRun.runGroup.frozenConfigVersionId,
    frozen_taxonomy_version_id: firstRun.runGroup.frozenTaxonomyVersionId,
    frozen_compiled_prompt_hash: firstRun.runGroup.frozenCompiledPromptHash,
    frozen_prompt_version: firstRun.runGroup.frozenPromptVersion,
    publish_intent: firstRun.runGroup.publishIntent,
    created_by: firstRun.runGroup.createdBy,
    created_at: firstRun.runGroup.createdAt,
    started_at: firstRun.runGroup.startedAt,
    finished_at: firstRun.runGroup.finishedAt,
    target_date_start: targetDates[0] ?? null,
    target_date_end: targetDates[targetDates.length - 1] ?? null,
    child_run_count: runs.length
  };
}

function inferRunMode(
  kind: PreviewJobBody["kind"] | ExecuteJobBody["kind"],
  job: PreviewJobBody["job"] | ExecuteJobBody["job"]
): WorkerManifest["run_mode"] {
  if (kind === "official_daily") {
    return "official_daily";
  }
  return job.targetDate ? "backfill_day" : "manual_range";
}

function derivePublishIntent(runs: PlannedChildRun[]) {
  if (runs.some((run) => run.publishEligibility === "official_full_day")) {
    return "official";
  }
  if (runs.some((run) => run.publishEligibility === "provisional_current_day_partial")) {
    return "provisional";
  }
  return "none";
}

function buildRequestJson(
  job: PreviewJobBody["job"] | ExecuteJobBody["job"],
  runMode: WorkerManifest["run_mode"]
) {
  return {
    request_kind: runMode,
    requested_by: "operator",
    processing_mode: job.processingMode,
    requested_target_date: job.targetDate,
    requested_window_start_at: "requestedWindowStartAt" in job ? job.requestedWindowStartAt : null,
    requested_window_end_exclusive_at: "requestedWindowEndExclusiveAt" in job ? job.requestedWindowEndExclusiveAt : null,
    write_artifacts: false,
    publish_requested: false
  };
}

function validatePublishRequest(
  run: PipelineRunRecord,
  publishAs: PublishAs,
  isHistorical: boolean,
  confirmHistoricalOverwrite: boolean
) {
  const publishEligibility = run.publishEligibility as PublishEligibility;
  if (publishEligibility === "not_publishable_old_partial") {
    throw new AppError(409, "CHAT_EXTRACTOR_PUBLISH_NOT_ALLOWED", "Partial old day không được publish.");
  }
  if (publishAs === "provisional" && publishEligibility !== "provisional_current_day_partial") {
    throw new AppError(409, "CHAT_EXTRACTOR_PUBLISH_NOT_ALLOWED", "Chỉ partial current day mới được publish provisional.");
  }
  if (publishAs === "official" && publishEligibility !== "official_full_day") {
    throw new AppError(409, "CHAT_EXTRACTOR_PUBLISH_NOT_ALLOWED", "Chỉ full-day run mới được publish official.");
  }
  if (publishAs === "official" && isHistorical && !confirmHistoricalOverwrite) {
    throw new AppError(409, "CHAT_EXTRACTOR_HISTORICAL_OVERWRITE_CONFIRMATION_REQUIRED", "Historical full-day publish cần confirm_historical_overwrite=true.");
  }
}

export function parseListPagesResponse(raw: string) {
  const parsed = JSON.parse(raw) as {
    pages?: Array<{ id?: string; name?: string }>;
    categorized?: {
      activated?: Array<{ id?: string; name?: string }>;
    };
  };

  const pages = parsed.pages ?? parsed.categorized?.activated ?? [];
  return pages
    .filter((page) => typeof page.id === "string" && typeof page.name === "string")
    .map((page) => ({
      pageId: page.id!,
      pageName: page.name!
    }));
}

function compactPayload(value: string) {
  const trimmed = value.trim();
  if (trimmed.length <= 2000) {
    return trimmed;
  }
  return `${trimmed.slice(0, 2000)}...`;
}

function compactErrorText(error: unknown) {
  const text = error instanceof Error ? error.message : String(error);
  const trimmed = text.trim();
  if (trimmed.length <= 4000) {
    return trimmed;
  }
  return trimmed.slice(0, 4000);
}

function assertWorkerExecutionSucceeded(execution: WorkerExecution) {
  if (execution.ok) {
    return;
  }

  throw new AppError(
    502,
    "CHAT_EXTRACTOR_WORKER_EXECUTION_FAILED",
    formatWorkerExecutionFailure(execution),
    {
      pipelineRunId: execution.pipelineRunId,
      exitCode: execution.exitCode,
      stdout: execution.stdout,
      stderr: execution.stderr
    }
  );
}

function formatWorkerExecutionFailure(execution: WorkerExecution) {
  const parts = [`worker exited with code ${execution.exitCode}`];
  if (execution.stderr) {
    parts.push(`stderr: ${compactPayload(execution.stderr)}`);
  }
  if (execution.stdout) {
    parts.push(`stdout: ${compactPayload(execution.stdout)}`);
  }
  return parts.join("; ");
}
