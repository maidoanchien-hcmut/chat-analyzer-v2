import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { AppError } from "../../core/errors.ts";
import { buildOnboardingArtifacts } from "./chat_extractor.artifacts.ts";
import { splitRequestedWindowByTargetDate } from "./chat_extractor.planner.ts";
import {
  buildPromptProfile,
  parseNotificationTargets,
  parseOpeningRulesConfig,
  parseTagMappingConfig,
  toWorkerOpeningRules,
  toWorkerTagMapping,
  type CapabilityKey,
  type CloneAiProfileVersionBody,
  type CommitSetupBody,
  type CreateAiProfileVersionBody,
  type CreatePromptVersionBody,
  type ExecuteJobBody,
  type JobPreview,
  type ManualJobBody,
  type OnboardingJobBody,
  type PreviewJobBody,
  type RunSlice,
  type SchedulerJobBody,
  type SetupSampleBody,
  type UpdateConnectedPageBody,
  type WorkerJob
} from "./chat_extractor.types.ts";
import {
  chatExtractorRepository,
  type ConnectedPageRecord,
  type ConversationArtifactRow,
  type CreatePageAiProfileVersionInput,
  type EtlRunRow,
  type PageAiProfileVersionRecord,
  type RunCounts,
  type UpdateConnectedPageInput,
  type UpsertConnectedPageInput
} from "./chat_extractor.repository.ts";

const backendRoot = resolve(import.meta.dir, "../../..");
const workerRoot = resolve(backendRoot, "go-worker");
const conversationAnalysisCapability: CapabilityKey = "conversation_analysis";
const threadCustomerMappingCapability: CapabilityKey = "thread_customer_mapping";

type ListedPage = {
  pageId: string;
  pageName: string;
};

export type WorkerExecution = {
  connectedPageId: string;
  pageId: string;
  targetDate: string;
  runGroupId: string;
  exitCode: number;
  ok: boolean;
  stdout: string;
  stderr: string;
};

type RuntimeSampleConversationArtifact = {
  conversationId: string;
  observedTagsJson: unknown;
  openingBlocksJson: unknown;
};

type RuntimeSamplePageTag = {
  pancakeTagId: string;
  text: string;
  isDeactive?: boolean;
};

type RuntimeSamplePreview = {
  pageId: string;
  targetDate: string;
  businessTimezone: string;
  windowStartAt: string;
  windowEndExclusiveAt: string;
  summary: Record<string, unknown>;
  pageTags?: RuntimeSamplePageTag[];
  conversations: RuntimeSampleConversationArtifact[];
};

export type ChatExtractorRepositoryPort = {
  nextSnapshotVersion(connectedPageId: string, targetDate: string): Promise<number>;
  listRecentRuns(limit?: number): Promise<EtlRunRow[]>;
  listRunsForConnectedPage(connectedPageId: string, limit?: number): Promise<EtlRunRow[]>;
  listRunsByRunGroupId(runGroupId: string): Promise<EtlRunRow[]>;
  getRunById(runId: string): Promise<EtlRunRow | null>;
  getRunCounts(runId: string): Promise<RunCounts>;
  listConversationArtifacts(runId: string): Promise<ConversationArtifactRow[]>;
  listConnectedPages(): Promise<ConnectedPageRecord[]>;
  getConnectedPageById(id: string): Promise<ConnectedPageRecord | null>;
  upsertConnectedPage(input: UpsertConnectedPageInput): Promise<ConnectedPageRecord>;
  updateConnectedPage(id: string, patch: UpdateConnectedPageInput): Promise<ConnectedPageRecord>;
  updateConnectedPageOnboardingState(id: string, onboardingStateJson: unknown): Promise<ConnectedPageRecord>;
  listSchedulerPages(): Promise<ConnectedPageRecord[]>;
  listPageAiProfileVersions(connectedPageId: string, capabilityKey?: string): Promise<PageAiProfileVersionRecord[]>;
  nextAiProfileVersionNo(connectedPageId: string, capabilityKey: string): Promise<number>;
  createPageAiProfileVersion(input: CreatePageAiProfileVersionInput): Promise<PageAiProfileVersionRecord>;
  getPageAiProfileVersionById(id: string): Promise<PageAiProfileVersionRecord | null>;
  getActiveAiProfile(connectedPageId: string, capabilityKey: string): Promise<PageAiProfileVersionRecord | null>;
  activatePageAiProfileVersion(connectedPageId: string, capabilityKey: string, profileVersionId: string): Promise<ConnectedPageRecord>;
};

type ChatExtractorServiceDependencies = {
  repository: ChatExtractorRepositoryPort;
  listPagesFromToken: (userAccessToken: string) => Promise<ListedPage[]>;
  runWorker: (workerJob: WorkerJob) => Promise<WorkerExecution>;
  runRuntimeSample: (workerJob: WorkerJob) => Promise<RuntimeSamplePreview>;
};

export class ChatExtractorService {
  private readonly repository: ChatExtractorRepositoryPort;
  private readonly listPagesFromTokenImpl: ChatExtractorServiceDependencies["listPagesFromToken"];
  private readonly runWorkerImpl: ChatExtractorServiceDependencies["runWorker"];
  private readonly runRuntimeSampleImpl: ChatExtractorServiceDependencies["runRuntimeSample"];

  constructor(deps: Partial<ChatExtractorServiceDependencies> = {}) {
    this.repository = deps.repository ?? chatExtractorRepository;
    this.listPagesFromTokenImpl = deps.listPagesFromToken ?? fetchPancakePages;
    this.runWorkerImpl = deps.runWorker ?? runWorkerJob;
    this.runRuntimeSampleImpl = deps.runRuntimeSample ?? runRuntimePreviewJob;
  }

  async listPagesFromToken(userAccessToken: string) {
    return this.listPagesFromTokenImpl(userAccessToken);
  }

  async listConnectedPages() {
    const pages = await this.repository.listConnectedPages();
    return {
      pages: pages.map(serializeConnectedPage)
    };
  }

  async getConnectedPage(id: string) {
    const page = await this.requireConnectedPage(id);
    return {
      page: serializeConnectedPage(page)
    };
  }

  async listPageRunGroups(connectedPageId: string) {
    await this.requireConnectedPage(connectedPageId);
    const runs = await this.repository.listRunsForConnectedPage(connectedPageId, 200);
    return {
      runGroups: groupRunsByRunGroup(runs)
    };
  }

  async getRunGroup(runGroupId: string) {
    const runs = await this.repository.listRunsByRunGroupId(runGroupId);
    if (runs.length === 0) {
      throw new AppError(404, "CHAT_EXTRACTOR_RUN_GROUP_NOT_FOUND", `Run group ${runGroupId} was not found.`);
    }
    return {
      runGroup: buildRunGroupSummary(runs),
      childRuns: runs.map(serializeRunSummary)
    };
  }

  async registerPageConfig(input: {
    pancakePageId: string;
    userAccessToken: string;
    businessTimezone: string;
    etlEnabled: boolean;
    analysisEnabled: boolean;
  }) {
    const selectedPage = await this.resolveListedPage(input.userAccessToken, input.pancakePageId);
    const page = await this.repository.upsertConnectedPage({
      pancakePageId: input.pancakePageId,
      pageName: selectedPage.pageName,
      pancakeUserAccessToken: input.userAccessToken,
      businessTimezone: input.businessTimezone,
      etlEnabled: input.etlEnabled,
      analysisEnabled: input.analysisEnabled
    });

    return {
      page: serializeConnectedPage(page)
    };
  }

  async previewSetupSample(input: SetupSampleBody) {
    const selectedPage = await this.resolveListedPage(input.userAccessToken, input.pancakePageId);
    const runtimePage = buildRuntimeOnlyPageRecord({
      pancakePageId: selectedPage.pageId,
      pageName: selectedPage.pageName,
      userAccessToken: input.userAccessToken,
      businessTimezone: input.businessTimezone,
      activeTagMappingJson: input.activeTagMappingJson,
      activeOpeningRulesJson: input.activeOpeningRulesJson
    });
    const workerJob = this.buildWorkerJob({
      page: runtimePage,
      processingMode: input.processingMode,
      runParamsJson: compactObject({
        initial_conversation_limit: input.initialConversationLimit
      }),
      targetDate: formatDateInTimeZone(new Date(), input.businessTimezone),
      runMode: "onboarding_sample",
      runGroupId: randomUUID(),
      snapshotVersion: 1,
      isPublished: false,
      requestedWindowStartAt: null,
      requestedWindowEndExclusiveAt: null,
      windowStartAt: null,
      windowEndExclusiveAt: new Date().toISOString(),
      maxConversations: input.initialConversationLimit,
      maxMessagePagesPerConversation: 0
    });
    const preview = await this.runRuntimeSampleImpl(workerJob);
    const artifacts = buildOnboardingArtifacts(preview.conversations);
    const openingSampleConversation = pickOpeningSampleConversation(preview.conversations);
    const openingCandidates = buildOpeningCandidatesFromSingleConversation(openingSampleConversation);
    const observedTagCountMap = new Map<string, number>(
      artifacts.observedTagCounts.map((item) => [normalizeKey(item.text), item.count])
    );
    const pageTagCandidates = buildPageTagCandidates(preview.pageTags, observedTagCountMap);

    return {
      sample: {
        pageId: preview.pageId,
        pageName: selectedPage.pageName,
        targetDate: preview.targetDate,
        businessTimezone: preview.businessTimezone,
        processingMode: input.processingMode,
        initialConversationLimit: input.initialConversationLimit,
        windowStartAt: preview.windowStartAt,
        windowEndExclusiveAt: preview.windowEndExclusiveAt,
        metrics: preview.summary,
        tagCandidates: pageTagCandidates,
        openingCandidates: {
          topOpeningCandidateWindows: openingCandidates.topOpeningCandidateWindows,
          unmatchedOpeningTexts: openingCandidates.unmatchedOpeningTexts,
          matchedOpeningSelections: openingCandidates.matchedOpeningSelections
        },
        openingSampleConversationId: openingSampleConversation?.conversationId ?? null
      }
    };
  }

  async commitSetupPage(input: CommitSetupBody) {
    const selectedPage = await this.resolveListedPage(input.userAccessToken, input.pancakePageId);
    let page = await this.repository.upsertConnectedPage({
      pancakePageId: input.pancakePageId,
      pageName: selectedPage.pageName,
      pancakeUserAccessToken: input.userAccessToken,
      businessTimezone: input.businessTimezone,
      etlEnabled: input.etlEnabled,
      analysisEnabled: input.analysisEnabled
    });
    page = await this.repository.updateConnectedPage(page.id, {
      activeTagMappingJson: input.activeTagMappingJson,
      activeOpeningRulesJson: input.activeOpeningRulesJson,
      notificationTargetsJson: input.notificationTargetsJson
    });

    const createdProfiles: PageAiProfileVersionRecord[] = [];
    const conversationProfile = await this.createAiProfileVersionInternal(page.id, conversationAnalysisCapability, input.conversationAnalysisProfileJson, input.promptNotes, true);
    createdProfiles.push(conversationProfile);

    if (input.threadCustomerMappingProfileJson) {
      const mappingProfile = await this.createAiProfileVersionInternal(page.id, threadCustomerMappingCapability, input.threadCustomerMappingProfileJson, input.promptNotes, true);
      createdProfiles.push(mappingProfile);
    }

    if (input.onboardingStateJson) {
      page = await this.repository.updateConnectedPageOnboardingState(page.id, input.onboardingStateJson);
    }

    return {
      page: serializeConnectedPage(page),
      profiles: createdProfiles.map(serializeAiProfileVersion)
    };
  }

  async updateConnectedPage(id: string, patch: UpdateConnectedPageBody) {
    await this.requireConnectedPage(id);
    const page = await this.repository.updateConnectedPage(id, patch);
    return {
      page: serializeConnectedPage(page)
    };
  }

  async listPageAiProfiles(connectedPageId: string) {
    const [page, profiles] = await Promise.all([
      this.requireConnectedPage(connectedPageId),
      this.repository.listPageAiProfileVersions(connectedPageId)
    ]);

    return {
      connectedPageId: page.id,
      activeAiProfiles: page.activeAiProfilesJson,
      profiles: profiles.map(serializeAiProfileVersion)
    };
  }

  async createAiProfileVersion(connectedPageId: string, input: CreateAiProfileVersionBody) {
    await this.requireConnectedPage(connectedPageId);
    const profile = await this.createAiProfileVersionInternal(connectedPageId, input.capabilityKey, input.profileJson, input.notes, input.activate);
    return {
      profile: serializeAiProfileVersion(profile)
    };
  }

  async cloneAiProfileVersion(connectedPageId: string, input: CloneAiProfileVersionBody) {
    await this.requireConnectedPage(connectedPageId);
    await this.requireConnectedPage(input.sourcePageId);
    const activeProfile = await this.repository.getActiveAiProfile(input.sourcePageId, input.capabilityKey);
    if (!activeProfile) {
      throw new AppError(400, "CHAT_EXTRACTOR_SOURCE_PROFILE_NOT_FOUND", `Source page ${input.sourcePageId} does not have an active ${input.capabilityKey} profile.`);
    }

    const profile = await this.createAiProfileVersionInternal(connectedPageId, input.capabilityKey, activeProfile.profileJson, input.notes, input.activate);
    return {
      profile: serializeAiProfileVersion(profile)
    };
  }

  async activateAiProfileVersion(connectedPageId: string, profileVersionId: string) {
    await this.requireConnectedPage(connectedPageId);
    const profile = await this.repository.getPageAiProfileVersionById(profileVersionId);
    if (!profile || profile.connectedPageId !== connectedPageId) {
      throw new AppError(404, "CHAT_EXTRACTOR_PROFILE_NOT_FOUND", `AI profile version ${profileVersionId} does not belong to page ${connectedPageId}.`);
    }
    const page = await this.repository.activatePageAiProfileVersion(connectedPageId, profile.capabilityKey, profileVersionId);
    return {
      page: serializeConnectedPage(page)
    };
  }

  async listPagePrompts(connectedPageId: string) {
    const page = await this.requireConnectedPage(connectedPageId);
    const profiles = await this.repository.listPageAiProfileVersions(connectedPageId, conversationAnalysisCapability);
    const activeProfile = await this.repository.getActiveAiProfile(connectedPageId, conversationAnalysisCapability);
    return {
      connectedPageId: page.id,
      activePromptVersionId: activeProfile?.id ?? null,
      prompts: profiles.map(serializePromptVersion)
    };
  }

  async createPromptVersion(connectedPageId: string, input: CreatePromptVersionBody) {
    await this.requireConnectedPage(connectedPageId);
    const profile = await this.createAiProfileVersionInternal(
      connectedPageId,
      conversationAnalysisCapability,
      buildPromptProfile(input.promptText, input.notes, {
        modelName: input.modelName,
        outputSchemaVersion: input.outputSchemaVersion
      }),
      input.notes,
      false
    );
    return {
      prompt: serializePromptVersion(profile)
    };
  }

  async clonePromptVersion(connectedPageId: string, input: { sourcePageId: string; notes: string | null }) {
    await this.requireConnectedPage(connectedPageId);
    await this.requireConnectedPage(input.sourcePageId);
    const activeProfile = await this.repository.getActiveAiProfile(input.sourcePageId, conversationAnalysisCapability);
    if (!activeProfile) {
      throw new AppError(400, "CHAT_EXTRACTOR_SOURCE_PROMPT_NOT_FOUND", `Source page ${input.sourcePageId} does not have an active prompt to clone.`);
    }
    const profile = await this.createAiProfileVersionInternal(
      connectedPageId,
      conversationAnalysisCapability,
      activeProfile.profileJson,
      input.notes,
      false
    );
    return {
      prompt: serializePromptVersion(profile)
    };
  }

  async activatePromptVersion(connectedPageId: string, promptVersionId: string) {
    return this.activateAiProfileVersion(connectedPageId, promptVersionId);
  }

  async getHealthSummary() {
    const runs = await this.repository.listRecentRuns(100);
    const runGroups = groupRunsByRunGroup(runs);
    const totals = {
      running: runGroups.filter((group) => group.status === "running").length,
      loaded: runGroups.filter((group) => group.status === "loaded").length,
      published: runGroups.filter((group) => group.status === "published").length,
      failed: runGroups.filter((group) => group.status === "failed").length
    };

    return {
      totals,
      recentRunGroups: runGroups,
      recentFailures: runGroups.filter((group) => group.status === "failed").slice(0, 20)
    };
  }

  async getRun(runId: string) {
    const run = await this.repository.getRunById(runId);
    if (!run) {
      throw new AppError(404, "CHAT_EXTRACTOR_RUN_NOT_FOUND", `Chat extractor run ${runId} was not found.`);
    }
    const counts = await this.repository.getRunCounts(runId);
    return {
      run: serializeRunSummary(run),
      counts
    };
  }

  async previewJobRequest(body: PreviewJobBody): Promise<JobPreview> {
    if (body.kind === "manual") {
      const page = await this.requireConnectedPage(body.connectedPageId);
      const job = resolveManualJobName(body.job, page);
      const workerJobs = await this.buildWorkerJobsForManual(job, page);
      return {
        kind: "manual",
        jobName: job.jobName,
        connectedPageId: page.id,
        pageName: page.pageName,
        workerJobs
      };
    }

    if (body.kind === "onboarding") {
      const page = await this.requireConnectedPage(body.connectedPageId);
      const workerJobs = await this.buildWorkerJobsForOnboarding(body.job, page);
      return {
        kind: "onboarding",
        jobName: body.job.jobName,
        connectedPageId: page.id,
        pageName: page.pageName,
        workerJobs
      };
    }

    const pages = await this.repository.listSchedulerPages();
    const workerJobs = await this.buildWorkerJobsForScheduler(body.job, pages);
    return {
      kind: "scheduler",
      jobName: body.job.jobName,
      pageNames: pages.map((page) => page.pageName),
      workerJobs
    };
  }

  async executeJobRequest(body: ExecuteJobBody) {
    const preview = await this.previewJobRequest(body);
    const executions: WorkerExecution[] = [];

    for (const workerJob of preview.workerJobs) {
      executions.push(await this.runWorkerImpl(workerJob));
    }

    const artifactWrites = [];
    if (body.kind === "onboarding" && body.writeArtifacts) {
      for (const execution of executions) {
        if (!execution.ok) {
          continue;
        }
        const runId = extractRunIDFromWorkerOutput(execution.stdout);
        if (!runId) {
          continue;
        }
        artifactWrites.push(await this.generateOnboardingArtifacts(execution.connectedPageId, runId));
      }
    }

    return {
      preview,
      executions,
      artifactWrites
    };
  }

  async generateOnboardingArtifacts(connectedPageId: string, runId: string) {
    const [run, conversations] = await Promise.all([
      this.getRun(runId),
      this.repository.listConversationArtifacts(runId)
    ]);
    const artifacts = buildOnboardingArtifacts(conversations);
    const onboardingState = {
      latestOnboardingRunId: runId,
      latestOnboardingTargetDate: run.run.targetDate as string,
      generatedAt: new Date().toISOString(),
      status: "ready",
      tagCandidates: artifacts.topObservedTags,
      openingCandidates: {
        topOpeningCandidateWindows: artifacts.topOpeningCandidateWindows,
        unmatchedOpeningTexts: artifacts.unmatchedOpeningTexts,
        matchedOpeningSelections: artifacts.matchedOpeningSelections
      }
    };

    const page = await this.repository.updateConnectedPageOnboardingState(connectedPageId, onboardingState);
    return {
      page: serializeConnectedPage(page),
      runId,
      onboardingState
    };
  }

  private async createAiProfileVersionInternal(
    connectedPageId: string,
    capabilityKey: CapabilityKey,
    profileJson: unknown,
    notes: string | null,
    activate: boolean
  ) {
    const versionNo = await this.repository.nextAiProfileVersionNo(connectedPageId, capabilityKey);
    const profile = await this.repository.createPageAiProfileVersion({
      connectedPageId,
      capabilityKey,
      versionNo,
      profileJson,
      notes
    });
    if (activate) {
      await this.repository.activatePageAiProfileVersion(connectedPageId, capabilityKey, profile.id);
    }
    return profile;
  }

  private async buildWorkerJobsForManual(job: ManualJobBody, page: ConnectedPageRecord): Promise<WorkerJob[]> {
    const slices = job.windowStartAt || job.windowEndExclusiveAt
      ? [{
          targetDate: job.targetDate!,
          requestedWindowStartAt: job.requestedWindowStartAt,
          requestedWindowEndExclusiveAt: job.requestedWindowEndExclusiveAt,
          windowStartAt: job.windowStartAt,
          windowEndExclusiveAt: job.windowEndExclusiveAt,
          isFullDay: !(job.windowStartAt || job.windowEndExclusiveAt)
        } satisfies RunSlice]
      : job.targetDate
      ? [{
          targetDate: job.targetDate,
          requestedWindowStartAt: null,
          requestedWindowEndExclusiveAt: null,
          windowStartAt: null,
          windowEndExclusiveAt: null,
          isFullDay: true
        } satisfies RunSlice]
      : splitRequestedWindowByTargetDate(job.requestedWindowStartAt!, job.requestedWindowEndExclusiveAt!, page.businessTimezone);

    const runGroupId = job.runGroupId ?? randomUUID();
    const workerJobs: WorkerJob[] = [];

    for (const slice of slices) {
      const snapshotVersion = job.snapshotVersion ?? await this.repository.nextSnapshotVersion(page.id, slice.targetDate);
      workerJobs.push(this.buildWorkerJob({
        page,
        processingMode: job.processingMode,
        runParamsJson: buildManualRunParams(job),
        targetDate: slice.targetDate,
        runMode: job.runMode ?? (slice.isFullDay ? "backfill_day" : "manual_range"),
        runGroupId,
        snapshotVersion,
        isPublished: job.publish && slice.isFullDay,
        requestedWindowStartAt: slice.requestedWindowStartAt,
        requestedWindowEndExclusiveAt: slice.requestedWindowEndExclusiveAt,
        windowStartAt: slice.windowStartAt,
        windowEndExclusiveAt: slice.windowEndExclusiveAt,
        maxConversations: job.maxConversations,
        maxMessagePagesPerConversation: job.maxMessagePagesPerConversation
      }));
    }

    return workerJobs;
  }

  private async buildWorkerJobsForOnboarding(job: OnboardingJobBody, page: ConnectedPageRecord): Promise<WorkerJob[]> {
    const snapshotVersion = job.snapshotVersion ?? await this.repository.nextSnapshotVersion(page.id, job.targetDate);
    return [this.buildWorkerJob({
      page,
      processingMode: job.processingMode,
      runParamsJson: buildOnboardingRunParams(job),
      targetDate: job.targetDate,
      runMode: "onboarding_sample",
      runGroupId: randomUUID(),
      snapshotVersion,
      isPublished: false,
      requestedWindowStartAt: job.requestedWindowStartAt,
      requestedWindowEndExclusiveAt: job.requestedWindowEndExclusiveAt,
      windowStartAt: job.windowStartAt,
      windowEndExclusiveAt: job.windowEndExclusiveAt,
      maxConversations: job.initialConversationLimit,
      maxMessagePagesPerConversation: job.maxMessagePagesPerConversation
    })];
  }

  private async buildWorkerJobsForScheduler(job: SchedulerJobBody, pages: ConnectedPageRecord[]): Promise<WorkerJob[]> {
    const workerJobs: WorkerJob[] = [];

    for (const page of pages) {
      const snapshotVersion = job.snapshotVersion ?? await this.repository.nextSnapshotVersion(page.id, job.targetDate);
      workerJobs.push(this.buildWorkerJob({
        page,
        processingMode: job.processingMode,
        runParamsJson: buildSchedulerRunParams(job),
        targetDate: job.targetDate,
        runMode: "scheduled_daily",
        runGroupId: randomUUID(),
        snapshotVersion,
        isPublished: job.isPublished,
        requestedWindowStartAt: null,
        requestedWindowEndExclusiveAt: null,
        windowStartAt: null,
        windowEndExclusiveAt: null,
        maxConversations: job.maxConversations,
        maxMessagePagesPerConversation: job.maxMessagePagesPerConversation
      }));
    }

    return workerJobs;
  }

  private buildWorkerJob(input: {
    page: ConnectedPageRecord;
    processingMode: WorkerJob["processing_mode"];
    runParamsJson: WorkerJob["run_params_json"];
    targetDate: string;
    runMode: WorkerJob["run_mode"];
    runGroupId: string;
    snapshotVersion: number;
    isPublished: boolean;
    requestedWindowStartAt: string | null;
    requestedWindowEndExclusiveAt: string | null;
    windowStartAt: string | null;
    windowEndExclusiveAt: string | null;
    maxConversations: number;
    maxMessagePagesPerConversation: number;
  }): WorkerJob {
    return {
      connected_page_id: input.page.id,
      processing_mode: input.processingMode,
      run_params_json: input.runParamsJson,
      user_access_token: input.page.pancakeUserAccessToken,
      page_id: input.page.pancakePageId,
      target_date: input.targetDate,
      business_timezone: input.page.businessTimezone,
      run_mode: input.runMode,
      run_group_id: input.runGroupId,
      snapshot_version: input.snapshotVersion,
      is_published: input.isPublished,
      requested_window_start_at: input.requestedWindowStartAt,
      requested_window_end_exclusive_at: input.requestedWindowEndExclusiveAt,
      window_start_at: input.windowStartAt,
      window_end_exclusive_at: input.windowEndExclusiveAt,
      max_conversations: input.maxConversations,
      max_message_pages_per_conversation: input.maxMessagePagesPerConversation,
      tag_mapping: toWorkerTagMapping(parseTagMappingConfig(input.page.activeTagMappingJson)),
      opening_rules: toWorkerOpeningRules(parseOpeningRulesConfig(input.page.activeOpeningRulesJson)),
      customer_directory: []
    };
  }

  private async requireConnectedPage(id: string) {
    const page = await this.repository.getConnectedPageById(id);
    if (!page) {
      throw new AppError(404, "CHAT_EXTRACTOR_CONNECTED_PAGE_NOT_FOUND", `Connected page ${id} was not found.`);
    }
    return page;
  }

  private async resolveListedPage(userAccessToken: string, pancakePageId: string) {
    const pages = await this.listPagesFromTokenImpl(userAccessToken);
    const selectedPage = pages.find((page) => page.pageId === pancakePageId);
    if (!selectedPage) {
      throw new AppError(400, "CHAT_EXTRACTOR_PAGE_SELECTION_INVALID", `Pancake page ${pancakePageId} was not found for the provided user_access_token.`);
    }
    return selectedPage;
  }
}

export const chatExtractorService = new ChatExtractorService();

async function fetchPancakePages(userAccessToken: string): Promise<ListedPage[]> {
  const endpoint = new URL("https://pages.fm/api/v1/pages");
  endpoint.searchParams.set("access_token", userAccessToken);

  const response = await fetch(endpoint, {
    headers: {
      Accept: "application/json",
      "User-Agent": "chat-analyzer-v2-control-plane/0.2"
    }
  });
  const raw = await response.text();
  if (!response.ok) {
    throw new AppError(400, "CHAT_EXTRACTOR_LIST_PAGES_FAILED", "Failed to list Pancake pages.", {
      status: response.status,
      body: compactPayload(raw)
    });
  }
  return parseListPagesResponse(raw);
}

async function runWorkerJob(workerJob: WorkerJob): Promise<WorkerExecution> {
  await mkdir(resolve(workerRoot, "tmp"), { recursive: true });
  const tempDir = await mkdtemp(resolve(tmpdir(), "chat-analyzer-chat-extractor-"));
  const tempFile = resolve(tempDir, `${workerJob.page_id}-${workerJob.target_date}.json`);
  await writeFile(tempFile, JSON.stringify(workerJob, null, 2), "utf8");

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
      connectedPageId: workerJob.connected_page_id,
      pageId: workerJob.page_id,
      targetDate: workerJob.target_date,
      runGroupId: workerJob.run_group_id,
      exitCode,
      ok: exitCode === 0,
      stdout: stdout.trim(),
      stderr: stderr.trim()
    };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function runRuntimePreviewJob(workerJob: WorkerJob): Promise<RuntimeSamplePreview> {
  await mkdir(resolve(workerRoot, "tmp"), { recursive: true });
  const tempDir = await mkdtemp(resolve(tmpdir(), "chat-analyzer-chat-extractor-preview-"));
  const tempFile = resolve(tempDir, `${workerJob.page_id}-${workerJob.target_date}.json`);
  await writeFile(tempFile, JSON.stringify(workerJob, null, 2), "utf8");

  try {
    const proc = Bun.spawn(["go", "run", ".", "-job-file", tempFile, "-runtime-only"], {
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
      throw new AppError(500, "CHAT_EXTRACTOR_RUNTIME_SAMPLE_FAILED", "Runtime sample execution failed.", {
        stdout: compactPayload(stdout),
        stderr: compactPayload(stderr)
      });
    }

    try {
      return JSON.parse(stdout) as RuntimeSamplePreview;
    } catch (error) {
      throw new AppError(500, "CHAT_EXTRACTOR_RUNTIME_SAMPLE_PARSE_FAILED", "Runtime sample output was not valid JSON.", {
        stdout: compactPayload(stdout),
        stderr: compactPayload(stderr),
        error: error instanceof Error ? error.message : String(error)
      });
    }
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

function buildRuntimeOnlyPageRecord(input: {
  pancakePageId: string;
  pageName: string;
  userAccessToken: string;
  businessTimezone: string;
  activeTagMappingJson: unknown;
  activeOpeningRulesJson: unknown;
}): ConnectedPageRecord {
  return {
    id: "",
    pancakePageId: input.pancakePageId,
    pageName: input.pageName,
    pancakeUserAccessToken: input.userAccessToken,
    businessTimezone: input.businessTimezone,
    etlEnabled: false,
    analysisEnabled: false,
    activeAiProfilesJson: {},
    activeTagMappingJson: input.activeTagMappingJson,
    activeOpeningRulesJson: input.activeOpeningRulesJson,
    notificationTargetsJson: {},
    onboardingStateJson: {},
    createdAt: new Date(0),
    updatedAt: new Date(0)
  };
}

function serializeConnectedPage(page: ConnectedPageRecord) {
  return {
    id: page.id,
    pancakePageId: page.pancakePageId,
    pageName: page.pageName,
    businessTimezone: page.businessTimezone,
    etlEnabled: page.etlEnabled,
    analysisEnabled: page.analysisEnabled,
    activeAiProfilesJson: page.activeAiProfilesJson,
    activeTagMappingJson: parseTagMappingConfig(page.activeTagMappingJson),
    activeOpeningRulesJson: parseOpeningRulesConfig(page.activeOpeningRulesJson),
    notificationTargetsJson: parseNotificationTargets(page.notificationTargetsJson),
    onboardingStateJson: page.onboardingStateJson,
    createdAt: page.createdAt,
    updatedAt: page.updatedAt
  };
}

function serializeAiProfileVersion(profile: PageAiProfileVersionRecord) {
  return {
    id: profile.id,
    connectedPageId: profile.connectedPageId,
    capabilityKey: profile.capabilityKey,
    versionNo: profile.versionNo,
    profileJson: profile.profileJson,
    notes: profile.notes,
    createdAt: profile.createdAt
  };
}

function serializePromptVersion(profile: PageAiProfileVersionRecord) {
  return {
    id: profile.id,
    connectedPageId: profile.connectedPageId,
    versionNo: profile.versionNo,
    promptText: readStringProfileField(profile.profileJson, "prompt_template") ?? "",
    notes: profile.notes,
    createdAt: profile.createdAt,
    modelName: readStringProfileField(profile.profileJson, "model_name"),
    outputSchemaVersion: readStringProfileField(profile.profileJson, "output_schema_version")
  };
}

function serializeRunSummary(run: EtlRunRow) {
  return {
    id: run.id,
    connectedPageId: run.connectedPageId,
    runGroupId: run.runGroupId,
    runMode: run.runMode,
    pancakePageId: run.pancakePageId,
    pageName: run.pageName,
    targetDate: run.targetDate.toISOString().slice(0, 10),
    processingMode: run.processingMode,
    businessTimezone: run.businessTimezone,
    requestedWindowStartAt: run.requestedWindowStartAt,
    requestedWindowEndExclusiveAt: run.requestedWindowEndExclusiveAt,
    windowStartAt: run.windowStartAt,
    windowEndExclusiveAt: run.windowEndExclusiveAt,
    status: run.status,
    snapshotVersion: run.snapshotVersion,
    isPublished: run.isPublished,
    runParamsJson: run.runParamsJson,
    metricsJson: run.metricsJson,
    errorText: run.errorText,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    createdAt: run.createdAt
  };
}

function groupRunsByRunGroup(runs: EtlRunRow[]) {
  const grouped = new Map<string, EtlRunRow[]>();
  for (const run of runs) {
    const bucket = grouped.get(run.runGroupId) ?? [];
    bucket.push(run);
    grouped.set(run.runGroupId, bucket);
  }
  return [...grouped.values()]
    .map((bucket) => buildRunGroupSummary(bucket))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

function buildRunGroupSummary(runs: EtlRunRow[]) {
  const sortedRuns = [...runs].sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime());
  const firstRun = sortedRuns[0]!;
  const lastRun = sortedRuns[sortedRuns.length - 1]!;
  const sortedDates = sortedRuns.map((run) => run.targetDate.toISOString().slice(0, 10)).sort();
  return {
    runGroupId: firstRun.runGroupId,
    connectedPageId: firstRun.connectedPageId,
    pancakePageId: firstRun.pancakePageId,
    pageName: firstRun.pageName,
    runMode: firstRun.runMode,
    status: deriveRunGroupStatus(sortedRuns),
    processingModes: [...new Set(sortedRuns.map((run) => run.processingMode))],
    childRunCount: sortedRuns.length,
    publishedChildCount: sortedRuns.filter((run) => run.isPublished).length,
    targetDateStart: sortedDates[0] ?? null,
    targetDateEnd: sortedDates[sortedDates.length - 1] ?? null,
    createdAt: firstRun.createdAt.toISOString(),
    startedAt: sortedRuns.find((run) => run.startedAt)?.startedAt?.toISOString() ?? null,
    finishedAt: lastRun.finishedAt?.toISOString() ?? null,
    childRuns: sortedRuns.map(serializeRunSummary)
  };
}

function deriveRunGroupStatus(runs: EtlRunRow[]) {
  const statuses = runs.map((run) => run.status);
  if (statuses.includes("failed")) {
    return "failed";
  }
  if (statuses.includes("running")) {
    return "running";
  }
  if (statuses.every((status) => status === "published")) {
    return "published";
  }
  if (statuses.every((status) => status === "loaded" || status === "published")) {
    return "loaded";
  }
  return runs[runs.length - 1]?.status ?? "queued";
}

function readStringProfileField(profileJson: unknown, key: string) {
  if (!profileJson || typeof profileJson !== "object" || Array.isArray(profileJson)) {
    return null;
  }
  const value = (profileJson as Record<string, unknown>)[key];
  return typeof value === "string" ? value : null;
}

function resolveManualJobName(job: ManualJobBody, page: ConnectedPageRecord): ManualJobBody {
  if (job.jobName && job.jobName !== "manual-run") {
    return job;
  }

  return {
    ...job,
    jobName: buildManualJobName(page.pageName, job)
  };
}

function buildManualJobName(pageName: string, job: ManualJobBody) {
  const pageSlug = slugifyForJob(pageName);
  if (job.runMode === "manual_range" && job.requestedWindowStartAt && job.requestedWindowEndExclusiveAt) {
    return `${pageSlug}-manual-range-${compactIsoToken(job.requestedWindowStartAt)}-${compactIsoToken(job.requestedWindowEndExclusiveAt)}`;
  }

  const targetDate = job.targetDate ?? formatDateInTimeZone(new Date(), "Asia/Ho_Chi_Minh");
  return `${pageSlug}-${job.processingMode}-${targetDate}`;
}

function buildManualRunParams(job: ManualJobBody) {
  return compactObject({
    max_conversations: job.maxConversations > 0 ? job.maxConversations : undefined,
    max_message_pages_per_conversation: job.maxMessagePagesPerConversation > 0 ? job.maxMessagePagesPerConversation : undefined
  });
}

function buildOnboardingRunParams(job: OnboardingJobBody) {
  return compactObject({
    initial_conversation_limit: job.initialConversationLimit,
    max_message_pages_per_conversation: job.maxMessagePagesPerConversation > 0 ? job.maxMessagePagesPerConversation : undefined
  });
}

function buildSchedulerRunParams(job: SchedulerJobBody) {
  return compactObject({
    max_conversations: job.maxConversations > 0 ? job.maxConversations : undefined,
    max_message_pages_per_conversation: job.maxMessagePagesPerConversation > 0 ? job.maxMessagePagesPerConversation : undefined
  });
}

function compactObject(value: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

function slugifyForJob(value: string) {
  const slug = value
    .toLowerCase()
    .normalize("NFKD")
    .replaceAll(/[^\w\s-]/g, "")
    .trim()
    .replaceAll(/[\s_-]+/g, "-");
  return slug || "chat-extractor";
}

function compactIsoToken(value: string) {
  return value.replaceAll(/[-:]/g, "").replaceAll(".000", "").replaceAll("T", "t").replaceAll("Z", "z").replaceAll("+", "p");
}

function formatDateInTimeZone(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  return formatter.format(date);
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

export function extractRunIDFromWorkerOutput(stdout: string) {
  const match = stdout.match(/etl_run_id=([0-9a-fA-F-]{36})/);
  return match?.[1] ?? null;
}

function buildPageTagCandidates(
  tags: RuntimeSamplePageTag[] | undefined,
  observedTagCountMap: Map<string, number>
): Array<{ pancakeTagId: string; text: string; count: number; isDeactive: boolean }> {
  const pageTags = Array.isArray(tags) ? tags : [];
  return pageTags
    .map((tag) => ({
      pancakeTagId: (tag.pancakeTagId ?? "").trim(),
      text: (tag.text ?? "").trim(),
      isDeactive: Boolean(tag.isDeactive)
    }))
    .filter((tag) => tag.pancakeTagId.length > 0 && tag.text.length > 0 && !tag.isDeactive)
    .map((tag) => ({
      ...tag,
      count: observedTagCountMap.get(normalizeKey(tag.text)) ?? 0
    }))
    .sort((left, right) => left.text.localeCompare(right.text));
}

function normalizeKey(value: string): string {
  return value.trim().toLowerCase();
}

function pickOpeningSampleConversation(conversations: RuntimeSampleConversationArtifact[]) {
  const rows = Array.isArray(conversations) ? conversations : [];
  if (rows.length === 0) {
    return null;
  }
  const withOpening = rows.find((item) => {
    const opening = asObject(item.openingBlocksJson);
    const window = opening.opening_candidate_window;
    return Array.isArray(window) && window.length > 0;
  });
  return withOpening ?? rows[0] ?? null;
}

function buildOpeningCandidatesFromSingleConversation(conversation: RuntimeSampleConversationArtifact | null) {
  if (!conversation) {
    return {
      topOpeningCandidateWindows: [] as Array<{ signature: string[]; count: number; exampleConversationIds: string[] }>,
      unmatchedOpeningTexts: [] as Array<{ text: string; count: number; exampleConversationIds: string[] }>,
      matchedOpeningSelections: [] as Array<{ signal: string; rawText: string; decision: string; count: number; exampleConversationIds: string[] }>
    };
  }
  const opening = asObject(conversation.openingBlocksJson);
  const signature = asArray(opening.opening_candidate_window)
    .map((item) => (typeof item?.redacted_text === "string" ? item.redacted_text.trim() : ""))
    .filter(Boolean);

  const unmatchedCount = new Map<string, number>();
  for (const text of asArray(opening.unmatched_candidate_texts)) {
    if (typeof text !== "string") {
      continue;
    }
    const normalized = text.trim();
    if (!normalized) {
      continue;
    }
    unmatchedCount.set(normalized, (unmatchedCount.get(normalized) ?? 0) + 1);
  }

  const matchedCount = new Map<string, { signal: string; rawText: string; decision: string; count: number }>();
  for (const row of asArray(opening.matched_selections)) {
    const signal = typeof row?.signal === "string" ? row.signal.trim() : "";
    const rawText = typeof row?.raw_text === "string" ? row.raw_text.trim() : "";
    const decision = typeof row?.decision === "string" ? row.decision.trim() : "";
    if (!signal || !rawText || !decision) {
      continue;
    }
    const key = JSON.stringify([signal, rawText, decision]);
    const bucket = matchedCount.get(key) ?? { signal, rawText, decision, count: 0 };
    bucket.count += 1;
    matchedCount.set(key, bucket);
  }

  return {
    topOpeningCandidateWindows: signature.length > 0
      ? [{
          signature,
          count: 1,
          exampleConversationIds: [conversation.conversationId]
        }]
      : [],
    unmatchedOpeningTexts: [...unmatchedCount.entries()]
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .map(([text, count]) => ({
        text,
        count,
        exampleConversationIds: [conversation.conversationId]
      })),
    matchedOpeningSelections: [...matchedCount.values()]
      .sort((left, right) => right.count - left.count || `${left.signal}:${left.rawText}:${left.decision}`.localeCompare(`${right.signal}:${right.rawText}:${right.decision}`))
      .map((item) => ({
        ...item,
        exampleConversationIds: [conversation.conversationId]
      }))
  };
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asArray(value: unknown): any[] {
  return Array.isArray(value) ? value : [];
}

export function compactPayload(value: string) {
  const trimmed = value.trim();
  if (trimmed.length <= 2000) {
    return trimmed;
  }
  return `${trimmed.slice(0, 2000)}...`;
}
