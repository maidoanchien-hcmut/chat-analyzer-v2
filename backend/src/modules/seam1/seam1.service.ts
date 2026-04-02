import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, resolve } from "node:path";
import { AppError } from "../../core/errors.ts";
import { seam1Repository } from "./seam1.repository.ts";
import { splitRequestedWindowByTargetDate } from "./seam1.planner.ts";
import {
  botSignatureSchema,
  customerDirectoryEntrySchema,
  manualJobFileSchema,
  onboardingJobFileSchema,
  openingRuleSchema,
  pageConfigFileSchema,
  schedulerJobFileSchema,
  tagRuleSchema,
} from "./seam1.types.ts";
import type { JobPreview, ManualJobFile, OnboardingJobFile, OpeningRule, PageConfig, RunSlice, SchedulerJobFile, TagRule, WorkerJob } from "./seam1.types.ts";

const backendRoot = resolve(import.meta.dir, "../../..");
const seam1JsonRoot = resolve(backendRoot, "json", "seam1");
const workerRoot = resolve(backendRoot, "go-worker");

class Seam1Service {
  async listPages() {
    const pages = await this.loadAllPages();
    const recentRuns = await seam1Repository.listRecentRuns(100);
    const latestRunByPageId = new Map<string, (typeof recentRuns)[number]>();
    for (const run of recentRuns) {
      if (!latestRunByPageId.has(run.pageId)) {
        latestRunByPageId.set(run.pageId, run);
      }
    }

    return pages.map((page) => ({
      ...page,
      latestRun: latestRunByPageId.get(page.pageId) ?? null
    }));
  }

  async getPage(pageSlug: string) {
    const page = await this.loadPage(pageSlug);
    const [runs, botSignatures, tagRules, openingRules, customerDirectory] = await Promise.all([
      seam1Repository.listRunsByPageId(page.pageId, 20),
      this.loadBotSignatures(page),
      this.loadTagRules(page),
      this.loadOpeningRules(page),
      this.loadCustomerDirectory(page)
    ]);

    return {
      page,
      botSignatures,
      tagRules,
      openingRules,
      customerDirectory,
      recentRuns: runs
    };
  }

  async getHealthSummary() {
    const runs = await seam1Repository.listRecentRuns(50);
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
          pageId: run.pageId,
          targetDate: run.targetDate,
          errorText: run.errorText,
          metricsJson: run.metricsJson,
          startedAt: run.startedAt,
          finishedAt: run.finishedAt
        }))
    };
  }

  async getRun(runId: string) {
    const run = await seam1Repository.getRunById(runId);
    if (!run) {
      throw new AppError(404, "SEAM1_RUN_NOT_FOUND", `Seam 1 run ${runId} was not found.`);
    }
    const counts = await seam1Repository.getRunCounts(runId);
    return {
      run,
      counts
    };
  }

  async previewJob(kind: "manual" | "onboarding" | "scheduler", name: string): Promise<JobPreview> {
    if (kind === "manual") {
      return this.previewManualJob(name);
    }
    if (kind === "onboarding") {
      return this.previewOnboardingJob(name);
    }
    return this.previewSchedulerJob(name);
  }

  async executeJob(kind: "manual" | "onboarding" | "scheduler", name: string) {
    const preview = await this.previewJob(kind, name);
    const executions = [];
    for (const workerJob of preview.workerJobs) {
      executions.push(await this.runWorker(workerJob));
    }
    return {
      preview,
      executions
    };
  }

  async previewManualJob(name: string): Promise<JobPreview> {
    const job = await this.loadManualJob(name);
    const page = await this.loadPage(job.pageSlug);
    const workerJobs = await this.buildWorkerJobsForManualJob(job, page);
    return {
      kind: "manual",
      jobName: job.jobName,
      pageSlug: job.pageSlug,
      workerJobs
    };
  }

  async previewOnboardingJob(name: string): Promise<JobPreview> {
    const job = await this.loadOnboardingJob(name);
    const page = await this.loadPage(job.pageSlug);
    const workerJobs = await this.buildWorkerJobsForOnboardingJob(job, page);
    return {
      kind: "onboarding",
      jobName: job.jobName,
      pageSlug: job.pageSlug,
      workerJobs
    };
  }

  async previewSchedulerJob(name: string): Promise<JobPreview> {
    const job = await this.loadSchedulerJob(name);
    const pages = await Promise.all(job.pageSlugs.map((pageSlug) => this.loadPage(pageSlug)));
    const workerJobs: WorkerJob[] = [];
    for (const page of pages) {
      if (!page.autoScraper) {
        continue;
      }
      const snapshotVersion = job.snapshotVersion ?? await seam1Repository.nextSnapshotVersion(page.pageId, job.targetDate);
      workerJobs.push(await this.buildWorkerJob({
        page,
        targetDate: job.targetDate,
        runMode: "scheduled_daily",
        runGroupId: null,
        snapshotVersion,
        isPublished: job.isPublished,
        requestedWindowStartAt: job.requestedWindowStartAt,
        requestedWindowEndExclusiveAt: job.requestedWindowEndExclusiveAt,
        windowStartAt: job.windowStartAt,
        windowEndExclusiveAt: job.windowEndExclusiveAt,
        maxConversations: job.maxConversations
      }));
    }

    return {
      kind: "scheduler",
      jobName: job.jobName,
      pageSlugs: job.pageSlugs,
      workerJobs
    };
  }

  async buildWorkerJobsForManualJob(job: ManualJobFile, page: PageConfig): Promise<WorkerJob[]> {
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
      const snapshotVersion = job.snapshotVersion ?? await seam1Repository.nextSnapshotVersion(page.pageId, slice.targetDate);
      workerJobs.push(
        await this.buildWorkerJob({
          page,
          targetDate: slice.targetDate,
          runMode: job.runMode ?? (slice.isFullDay ? "backfill_day" : "manual_range"),
          runGroupId,
          snapshotVersion,
          isPublished: job.publish && slice.isFullDay,
          requestedWindowStartAt: slice.requestedWindowStartAt,
          requestedWindowEndExclusiveAt: slice.requestedWindowEndExclusiveAt,
          windowStartAt: slice.windowStartAt,
          windowEndExclusiveAt: slice.windowEndExclusiveAt,
          maxConversations: job.maxConversations
        })
      );
    }
    return workerJobs;
  }

  async buildWorkerJobsForOnboardingJob(job: OnboardingJobFile, page: PageConfig): Promise<WorkerJob[]> {
    const snapshotVersion = job.snapshotVersion ?? await seam1Repository.nextSnapshotVersion(page.pageId, job.targetDate);
    return [
      await this.buildWorkerJob({
        page,
        targetDate: job.targetDate,
        runMode: "onboarding_sample",
        runGroupId: null,
        snapshotVersion,
        isPublished: false,
        requestedWindowStartAt: job.requestedWindowStartAt,
        requestedWindowEndExclusiveAt: job.requestedWindowEndExclusiveAt,
        windowStartAt: job.windowStartAt,
        windowEndExclusiveAt: job.windowEndExclusiveAt,
        maxConversations: job.initialConversationLimitOverride ?? page.initialConversationLimit
      })
    ];
  }

  async buildWorkerJob(input: {
    page: PageConfig;
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
  }): Promise<WorkerJob> {
    const [botSignatures, tagRules, openingRules, customerDirectory] = await Promise.all([
      this.loadBotSignatures(input.page),
      this.loadTagRules(input.page),
      this.loadOpeningRules(input.page),
      this.loadCustomerDirectory(input.page)
    ]);

    return {
      user_access_token: input.page.pancakeUserAccessToken,
      page_id: input.page.pageId,
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
      max_message_pages_per_conversation: 0,
      tag_rules: tagRules,
      opening_rules: openingRules,
      customer_directory: customerDirectory,
      bot_signatures: botSignatures
    };
  }

  async runWorker(workerJob: WorkerJob) {
    await mkdir(resolve(workerRoot, "tmp"), { recursive: true });
    const tempDir = await mkdtemp(resolve(tmpdir(), "chat-analyzer-seam1-"));
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

  async loadAllPages(): Promise<PageConfig[]> {
    const dir = resolve(seam1JsonRoot, "pages");
    const entries = await readdir(dir);
    const pages: PageConfig[] = [];
    for (const entry of entries) {
      if (!entry.endsWith(".json")) {
        continue;
      }
      const raw = await readFile(resolve(dir, entry), "utf8");
      pages.push(pageConfigFileSchema.parse(JSON.parse(raw)));
    }
    pages.sort((left, right) => left.pageSlug.localeCompare(right.pageSlug));
    return pages;
  }

  async loadPage(pageSlug: string): Promise<PageConfig> {
    const pages = await this.loadAllPages();
    const page = pages.find((item) => item.pageSlug === pageSlug);
    if (!page) {
      throw new AppError(404, "SEAM1_PAGE_NOT_FOUND", `Seam 1 page ${pageSlug} was not found in backend/json/seam1/pages.`);
    }
    return page;
  }

  async loadTagRules(page: PageConfig): Promise<TagRule[]> {
    if (!page.tagRulesFile) {
      return [];
    }
    const raw = await readFile(resolve(seam1JsonRoot, page.tagRulesFile), "utf8");
    return tagRuleSchema.array().parse(JSON.parse(raw));
  }

  async loadOpeningRules(page: PageConfig): Promise<OpeningRule[]> {
    if (!page.openingRulesFile) {
      return [];
    }
    const raw = await readFile(resolve(seam1JsonRoot, page.openingRulesFile), "utf8");
    return openingRuleSchema.array().parse(JSON.parse(raw));
  }

  async loadCustomerDirectory(page: PageConfig) {
    if (!page.customerDirectoryFile) {
      return [];
    }
    const raw = await readFile(resolve(seam1JsonRoot, page.customerDirectoryFile), "utf8");
    return customerDirectoryEntrySchema.array().parse(JSON.parse(raw));
  }

  async loadBotSignatures(page: PageConfig) {
    if (page.botSignaturesFile) {
      const raw = await readFile(resolve(seam1JsonRoot, page.botSignaturesFile), "utf8");
      return botSignatureSchema.array().parse(JSON.parse(raw));
    }
    return page.botSignatures;
  }

  async loadManualJob(name: string): Promise<ManualJobFile> {
    return this.loadJsonFile(resolve(seam1JsonRoot, "jobs", "manual", ensureJsonFilename(name)), manualJobFileSchema);
  }

  async loadOnboardingJob(name: string): Promise<OnboardingJobFile> {
    return this.loadJsonFile(resolve(seam1JsonRoot, "jobs", "onboarding", ensureJsonFilename(name)), onboardingJobFileSchema);
  }

  async loadSchedulerJob(name: string): Promise<SchedulerJobFile> {
    const filename = ensureJsonFilename(name);
    try {
      return await this.loadJsonFile(resolve(seam1JsonRoot, "scheduler", filename), schedulerJobFileSchema);
    } catch {
      return this.loadJsonFile(resolve(seam1JsonRoot, "jobs", "scheduled", filename), schedulerJobFileSchema);
    }
  }

  async loadJsonFile<T>(path: string, schema: { parse: (value: unknown) => T }): Promise<T> {
    try {
      const raw = await readFile(path, "utf8");
      return schema.parse(JSON.parse(raw));
    } catch (error) {
      throw new AppError(400, "SEAM1_JSON_LOAD_FAILED", `Failed to load JSON control-plane file ${basename(path)}.`, {
        path,
        cause: error instanceof Error ? error.message : String(error)
      });
    }
  }
}

function ensureJsonFilename(value: string): string {
  return value.endsWith(".json") ? value : `${value}.json`;
}

export const seam1Service = new Seam1Service();
