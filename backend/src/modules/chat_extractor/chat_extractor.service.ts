import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { AppError } from "../../core/errors.ts";
import { buildOnboardingArtifacts } from "./chat_extractor.artifacts.ts";
import { splitRequestedWindowByTargetDate } from "./chat_extractor.planner.ts";
import {
  parseOpeningRules,
  parseTagRules,
  type CommitSetupBody,
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
  type CreatePagePromptVersionInput,
  type EtlRunRow,
  type PagePromptVersionRecord,
  type RunCounts,
  type UpdateConnectedPageInput,
  type UpsertConnectedPageInput
} from "./chat_extractor.repository.ts";

const backendRoot = resolve(import.meta.dir, "../../..");
const workerRoot = resolve(backendRoot, "go-worker");

type ListedPage = {
  pageId: string;
  pageName: string;
};

export type WorkerExecution = {
  connectedPageId: string;
  pageId: string;
  targetDate: string;
  exitCode: number;
  ok: boolean;
  stdout: string;
  stderr: string;
};

export type ChatExtractorRepositoryPort = {
  nextSnapshotVersion(connectedPageId: string, targetDate: string): Promise<number>;
  listRecentRuns(limit?: number): Promise<EtlRunRow[]>;
  listRunsForConnectedPage(connectedPageId: string, limit?: number): Promise<EtlRunRow[]>;
  getRunById(runId: string): Promise<EtlRunRow | null>;
  getRunCounts(runId: string): Promise<RunCounts>;
  listConversationArtifacts(runId: string): Promise<ConversationArtifactRow[]>;
  listConnectedPages(): Promise<ConnectedPageRecord[]>;
  getConnectedPageById(id: string): Promise<ConnectedPageRecord | null>;
  upsertConnectedPage(input: UpsertConnectedPageInput): Promise<ConnectedPageRecord>;
  updateConnectedPage(id: string, patch: UpdateConnectedPageInput): Promise<ConnectedPageRecord>;
  updateConnectedPageOnboardingState(id: string, onboardingStateJson: unknown): Promise<ConnectedPageRecord>;
  listSchedulerPages(): Promise<ConnectedPageRecord[]>;
  listPagePromptVersions(connectedPageId: string): Promise<PagePromptVersionRecord[]>;
  nextPromptVersionNo(connectedPageId: string): Promise<number>;
  createPagePromptVersion(input: CreatePagePromptVersionInput): Promise<PagePromptVersionRecord>;
  getPagePromptVersionById(id: string): Promise<PagePromptVersionRecord | null>;
  getActivePromptVersion(connectedPageId: string): Promise<PagePromptVersionRecord | null>;
  activatePagePromptVersion(connectedPageId: string, promptVersionId: string): Promise<ConnectedPageRecord>;
};

type ChatExtractorServiceDependencies = {
  repository: ChatExtractorRepositoryPort;
  listPagesFromToken: (userAccessToken: string) => Promise<ListedPage[]>;
  runWorker: (workerJob: WorkerJob) => Promise<WorkerExecution>;
  runRuntimeSample: (workerJob: WorkerJob) => Promise<RuntimeSamplePreview>;
};

type RuntimeSampleConversationArtifact = {
  conversationId: string;
  currentTagsJson: unknown;
  openingBlocksJson: unknown;
};

type RuntimeSamplePreview = {
  pageId: string;
  targetDate: string;
  businessTimezone: string;
  windowStartAt: string;
  windowEndExclusiveAt: string;
  summary: Record<string, unknown>;
  conversations: RuntimeSampleConversationArtifact[];
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

  async listPageRuns(connectedPageId: string) {
    await this.requireConnectedPage(connectedPageId);
    const runs = await this.repository.listRunsForConnectedPage(connectedPageId, 30);
    return {
      runs: runs.map(serializeRunSummary)
    };
  }

  async registerPageConfig(input: {
    pancakePageId: string;
    userAccessToken: string;
    businessTimezone: string;
    autoScraperEnabled: boolean;
    autoAiAnalysisEnabled: boolean;
  }) {
    const selectedPage = await this.resolveListedPage(input.userAccessToken, input.pancakePageId);

    const page = await this.repository.upsertConnectedPage({
      pancakePageId: input.pancakePageId,
      pageName: selectedPage.pageName,
      pancakeUserAccessToken: input.userAccessToken,
      businessTimezone: input.businessTimezone,
      autoScraperEnabled: input.autoScraperEnabled,
      autoAiAnalysisEnabled: input.autoAiAnalysisEnabled
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
      runGroupId: null,
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
        tagCandidates: artifacts.topObservedTags,
        openingCandidates: {
          topOpeningCandidateWindows: artifacts.topOpeningCandidateWindows,
          unmatchedOpeningTexts: artifacts.unmatchedOpeningTexts,
          matchedOpeningRules: artifacts.matchedOpeningRules
        }
      }
    };
  }

  async commitSetupPage(input: CommitSetupBody) {
    const selectedPage = await this.resolveListedPage(input.userAccessToken, input.pancakePageId);

    const page = await this.repository.upsertConnectedPage({
      pancakePageId: input.pancakePageId,
      pageName: selectedPage.pageName,
      pancakeUserAccessToken: input.userAccessToken,
      businessTimezone: input.businessTimezone,
      autoScraperEnabled: input.autoScraperEnabled,
      autoAiAnalysisEnabled: input.autoAiAnalysisEnabled
    });
    await this.repository.updateConnectedPage(page.id, {
      activeTagMappingJson: input.activeTagMappingJson,
      activeOpeningRulesJson: input.activeOpeningRulesJson,
      isActive: input.isActive
    });

    const versionNo = await this.repository.nextPromptVersionNo(page.id);
    const prompt = await this.repository.createPagePromptVersion({
      connectedPageId: page.id,
      versionNo,
      promptText: input.promptText,
      notes: input.promptNotes
    });

    let finalPage = await this.repository.activatePagePromptVersion(page.id, prompt.id);
    if (input.onboardingStateJson) {
      finalPage = await this.repository.updateConnectedPageOnboardingState(page.id, input.onboardingStateJson);
    }

    return {
      page: serializeConnectedPage(finalPage),
      prompt: serializePromptVersion(prompt)
    };
  }

  async updateConnectedPage(id: string, patch: UpdateConnectedPageBody) {
    await this.requireConnectedPage(id);
    const page = await this.repository.updateConnectedPage(id, patch);
    return {
      page: serializeConnectedPage(page)
    };
  }

  async listPagePrompts(connectedPageId: string) {
    const page = await this.requireConnectedPage(connectedPageId);
    const prompts = await this.repository.listPagePromptVersions(connectedPageId);
    return {
      connectedPageId: page.id,
      activePromptVersionId: page.activePromptVersionId,
      prompts: prompts.map(serializePromptVersion)
    };
  }

  async createPromptVersion(connectedPageId: string, input: { promptText: string; notes: string | null }) {
    await this.requireConnectedPage(connectedPageId);
    const versionNo = await this.repository.nextPromptVersionNo(connectedPageId);
    const prompt = await this.repository.createPagePromptVersion({
      connectedPageId,
      versionNo,
      promptText: input.promptText,
      notes: input.notes
    });
    return {
      prompt: serializePromptVersion(prompt)
    };
  }

  async clonePromptVersion(connectedPageId: string, input: { sourcePageId: string; notes: string | null }) {
    await this.requireConnectedPage(connectedPageId);
    await this.requireConnectedPage(input.sourcePageId);
    const activePrompt = await this.repository.getActivePromptVersion(input.sourcePageId);
    if (!activePrompt) {
      throw new AppError(400, "CHAT_EXTRACTOR_SOURCE_PROMPT_NOT_FOUND", `Source page ${input.sourcePageId} does not have an active prompt to clone.`);
    }

    const versionNo = await this.repository.nextPromptVersionNo(connectedPageId);
    const prompt = await this.repository.createPagePromptVersion({
      connectedPageId,
      versionNo,
      promptText: activePrompt.promptText,
      notes: input.notes
    });

    return {
      prompt: serializePromptVersion(prompt)
    };
  }

  async activatePromptVersion(connectedPageId: string, promptVersionId: string) {
    await this.requireConnectedPage(connectedPageId);
    const prompt = await this.repository.getPagePromptVersionById(promptVersionId);
    if (!prompt || prompt.connectedPageId !== connectedPageId) {
      throw new AppError(404, "CHAT_EXTRACTOR_PROMPT_NOT_FOUND", `Prompt version ${promptVersionId} does not belong to page ${connectedPageId}.`);
    }

    const page = await this.repository.activatePagePromptVersion(connectedPageId, promptVersionId);
    return {
      page: serializeConnectedPage(page)
    };
  }

  async getHealthSummary() {
    const runs = await this.repository.listRecentRuns(50);
    const totals = {
      running: 0,
      loaded: 0,
      published: 0,
      failed: 0
    };

    for (const run of runs) {
      if (run.status === "running") {
        totals.running++;
      } else if (run.status === "loaded") {
        totals.loaded++;
      } else if (run.status === "published") {
        totals.published++;
      } else if (run.status === "failed") {
        totals.failed++;
      }
    }

    return {
      totals,
      recentRuns: runs,
      recentFailures: runs
        .filter((run) => run.status === "failed")
        .slice(0, 20)
        .map((run) => ({
          id: run.id,
          connectedPageId: run.connectedPageId,
          pageId: run.pageId,
          pageName: run.pageName,
          targetDate: run.targetDate,
          processingMode: run.processingMode,
          errorText: run.errorText,
          metricsJson: run.metricsJson,
          startedAt: run.startedAt,
          finishedAt: run.finishedAt
        }))
    };
  }

  async getRun(runId: string) {
    const run = await this.repository.getRunById(runId);
    if (!run) {
      throw new AppError(404, "CHAT_EXTRACTOR_RUN_NOT_FOUND", `Chat extractor run ${runId} was not found.`);
    }
    const counts = await this.repository.getRunCounts(runId);
    return {
      run,
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
      latestOnboardingTargetDate: run.run.targetDate.toISOString().slice(0, 10),
      generatedAt: new Date().toISOString(),
      status: "ready",
      tagCandidates: artifacts.topObservedTags,
      openingCandidates: {
        topOpeningCandidateWindows: artifacts.topOpeningCandidateWindows,
        unmatchedOpeningTexts: artifacts.unmatchedOpeningTexts,
        matchedOpeningRules: artifacts.matchedOpeningRules
      }
    };

    const page = await this.repository.updateConnectedPageOnboardingState(connectedPageId, onboardingState);
    return {
      page: serializeConnectedPage(page),
      runId,
      onboardingState
    };
  }

  private async buildWorkerJobsForManual(job: ManualJobBody, page: ConnectedPageRecord): Promise<WorkerJob[]> {
    const slices = job.windowStartAt || job.windowEndExclusiveAt
      ? [
          {
            targetDate: job.targetDate!,
            requestedWindowStartAt: job.requestedWindowStartAt,
            requestedWindowEndExclusiveAt: job.requestedWindowEndExclusiveAt,
            windowStartAt: job.windowStartAt,
            windowEndExclusiveAt: job.windowEndExclusiveAt,
            isFullDay: !(job.windowStartAt || job.windowEndExclusiveAt)
          } satisfies RunSlice
        ]
      : job.targetDate
      ? [
          {
            targetDate: job.targetDate,
            requestedWindowStartAt: null,
            requestedWindowEndExclusiveAt: null,
            windowStartAt: null,
            windowEndExclusiveAt: null,
            isFullDay: true
          } satisfies RunSlice
        ]
      : splitRequestedWindowByTargetDate(
          job.requestedWindowStartAt!,
          job.requestedWindowEndExclusiveAt!,
          page.businessTimezone
        );

    const runGroupId = job.runGroupId ?? (slices.length > 1 ? randomUUID() : null);
    const workerJobs: WorkerJob[] = [];

    for (const slice of slices) {
      const snapshotVersion = job.snapshotVersion ?? await this.repository.nextSnapshotVersion(page.id, slice.targetDate);
      workerJobs.push(
        this.buildWorkerJob({
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
        })
      );
    }

    return workerJobs;
  }

  private async buildWorkerJobsForOnboarding(job: OnboardingJobBody, page: ConnectedPageRecord): Promise<WorkerJob[]> {
    const snapshotVersion = job.snapshotVersion ?? await this.repository.nextSnapshotVersion(page.id, job.targetDate);
    return [
      this.buildWorkerJob({
        page,
        processingMode: job.processingMode,
        runParamsJson: buildOnboardingRunParams(job),
        targetDate: job.targetDate,
        runMode: "onboarding_sample",
        runGroupId: null,
        snapshotVersion,
        isPublished: false,
        requestedWindowStartAt: job.requestedWindowStartAt,
        requestedWindowEndExclusiveAt: job.requestedWindowEndExclusiveAt,
        windowStartAt: job.windowStartAt,
        windowEndExclusiveAt: job.windowEndExclusiveAt,
        maxConversations: job.initialConversationLimit,
        maxMessagePagesPerConversation: job.maxMessagePagesPerConversation
      })
    ];
  }

  private async buildWorkerJobsForScheduler(job: SchedulerJobBody, pages: ConnectedPageRecord[]): Promise<WorkerJob[]> {
    const workerJobs: WorkerJob[] = [];

    for (const page of pages) {
      const snapshotVersion = job.snapshotVersion ?? await this.repository.nextSnapshotVersion(page.id, job.targetDate);
      workerJobs.push(
        this.buildWorkerJob({
          page,
          processingMode: job.processingMode,
          runParamsJson: buildSchedulerRunParams(job),
          targetDate: job.targetDate,
          runMode: "scheduled_daily",
          runGroupId: null,
          snapshotVersion,
          isPublished: job.isPublished,
          requestedWindowStartAt: null,
          requestedWindowEndExclusiveAt: null,
          windowStartAt: null,
          windowEndExclusiveAt: null,
          maxConversations: job.maxConversations,
          maxMessagePagesPerConversation: job.maxMessagePagesPerConversation
        })
      );
    }

    return workerJobs;
  }

  private buildWorkerJob(input: {
    page: ConnectedPageRecord;
    processingMode: WorkerJob["processing_mode"];
    runParamsJson: WorkerJob["run_params_json"];
    targetDate: string;
    runMode: WorkerJob["run_mode"];
    runGroupId: string | null;
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
      tag_rules: parseTagRules(input.page.activeTagMappingJson),
      opening_rules: parseOpeningRules(input.page.activeOpeningRulesJson),
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
      "User-Agent": "chat-analyzer-v2-chat-extractor-control-plane/0.1"
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
    autoScraperEnabled: false,
    autoAiAnalysisEnabled: false,
    activePromptVersionId: null,
    activeTagMappingJson: input.activeTagMappingJson,
    activeOpeningRulesJson: input.activeOpeningRulesJson,
    onboardingStateJson: {},
    isActive: false,
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
    autoScraperEnabled: page.autoScraperEnabled,
    autoAiAnalysisEnabled: page.autoAiAnalysisEnabled,
    activePromptVersionId: page.activePromptVersionId,
    activeTagMappingJson: parseTagRules(page.activeTagMappingJson),
    activeOpeningRulesJson: parseOpeningRules(page.activeOpeningRulesJson),
    onboardingStateJson: page.onboardingStateJson,
    isActive: page.isActive,
    createdAt: page.createdAt,
    updatedAt: page.updatedAt
  };
}

function serializePromptVersion(prompt: PagePromptVersionRecord) {
  return {
    id: prompt.id,
    connectedPageId: prompt.connectedPageId,
    versionNo: prompt.versionNo,
    promptText: prompt.promptText,
    notes: prompt.notes,
    createdAt: prompt.createdAt
  };
}

function serializeRunSummary(run: EtlRunRow) {
  return {
    id: run.id,
    runMode: run.runMode,
    processingMode: run.processingMode,
    status: run.status,
    targetDate: run.targetDate,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    snapshotVersion: run.snapshotVersion,
    isPublished: run.isPublished
  };
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

export function extractRunIDFromWorkerOutput(stdout: string): string | null {
  const match = stdout.match(/etl_run_id=([0-9a-fA-F-]{36})/);
  return match?.[1] ?? null;
}

export function compactPayload(value: string) {
  const trimmed = value.trim();
  if (trimmed.length <= 2000) {
    return trimmed;
  }
  return `${trimmed.slice(0, 2000)}...`;
}
