import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { AppError } from "../../core/errors.ts";
import { buildOnboardingArtifacts } from "./seam1.artifacts.ts";
import { splitRequestedWindowByTargetDate } from "./seam1.planner.ts";
import type {
  ExecuteJobBody,
  JobPreview,
  ManualJobBody,
  OnboardingJobBody,
  PageBundle,
  PageConfig,
  PreviewJobBody,
  RunSlice,
  SchedulerJobBody,
  WorkerJob
} from "./seam1.types.ts";
import type { seam1Repository as seam1RepositoryType } from "./seam1.repository.ts";

const backendRoot = resolve(import.meta.dir, "../../..");
const workerRoot = resolve(backendRoot, "go-worker");

let cachedRepository: typeof seam1RepositoryType | null = null;

async function getRepository() {
  if (cachedRepository) {
    return cachedRepository;
  }
  const module = await import("./seam1.repository.ts");
  cachedRepository = module.seam1Repository;
  return cachedRepository;
}

class Seam1Service {
  async listPagesFromToken(userAccessToken: string) {
    const endpoint = new URL("https://pages.fm/api/v1/pages");
    endpoint.searchParams.set("access_token", userAccessToken);

    const response = await fetch(endpoint, {
      headers: {
        Accept: "application/json",
        "User-Agent": "chat-analyzer-v2-seam1-control-plane/0.1"
      }
    });
    const raw = await response.text();
    if (!response.ok) {
      throw new AppError(400, "SEAM1_LIST_PAGES_FAILED", "Failed to list Pancake pages.", {
        status: response.status,
        body: compactPayload(raw)
      });
    }
    return parseListPagesResponse(raw);
  }

  async registerPageConfig(input: {
    organizationId: string;
    pageSlug: string;
    userAccessToken: string;
    pageId: string;
    businessTimezone: string;
    initialConversationLimit: number;
    autoScraper: boolean;
    autoAiAnalysis: boolean;
  }) {
    const pages = await this.listPagesFromToken(input.userAccessToken);
    const selectedPage = pages.find((page) => page.pageId === input.pageId);
    if (!selectedPage) {
      throw new AppError(400, "SEAM1_PAGE_SELECTION_INVALID", `Pancake page ${input.pageId} was not found for the provided user_access_token.`);
    }

    return {
      page: {
        organization_id: input.organizationId,
        page_slug: input.pageSlug,
        page_id: input.pageId,
        page_name: selectedPage.pageName,
        business_timezone: input.businessTimezone,
        initial_conversation_limit: input.initialConversationLimit,
        auto_scraper: input.autoScraper,
        auto_ai_analysis: input.autoAiAnalysis
      }
    };
  }

  async getHealthSummary() {
    const runs = await (await getRepository()).listRecentRuns(50);
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
    const repository = await getRepository();
    const run = await repository.getRunById(runId);
    if (!run) {
      throw new AppError(404, "SEAM1_RUN_NOT_FOUND", `Seam 1 run ${runId} was not found.`);
    }
    const counts = await repository.getRunCounts(runId);
    return {
      run,
      counts
    };
  }

  async previewJobRequest(body: PreviewJobBody): Promise<JobPreview> {
    if (body.kind === "manual") {
      const workerJobs = await this.buildWorkerJobsForManual(body.job, body.page_bundle);
      return {
        kind: "manual",
        jobName: body.job.jobName,
        pageSlug: body.page_bundle.page.pageSlug,
        workerJobs
      };
    }

    if (body.kind === "onboarding") {
      const workerJobs = await this.buildWorkerJobsForOnboarding(body.job, body.page_bundle);
      return {
        kind: "onboarding",
        jobName: body.job.jobName,
        pageSlug: body.page_bundle.page.pageSlug,
        workerJobs
      };
    }

    const workerJobs = await this.buildWorkerJobsForScheduler(body.job, body.page_bundles);
    return {
      kind: "scheduler",
      jobName: body.job.jobName,
      pageSlugs: body.page_bundles.map((entry) => entry.page.pageSlug),
      workerJobs
    };
  }

  async executeJobRequest(body: ExecuteJobBody) {
    const preview = await this.previewJobRequest(body);
    const executions = [];
    for (const workerJob of preview.workerJobs) {
      executions.push(await this.runWorker(workerJob));
    }

    const artifactWrites = [];
    if (body.write_artifacts) {
      for (const item of executions) {
        const runId = extractRunIDFromWorkerOutput(item.stdout);
        if (!runId) {
          continue;
        }
        const pageSlug = this.resolvePageSlugFromExecution(body, item.pageId);
        if (pageSlug) {
          artifactWrites.push(await this.generateOnboardingArtifacts(pageSlug, runId));
        }
      }
    }

    return {
      preview,
      executions,
      artifactWrites
    };
  }

  async generateOnboardingArtifacts(pageSlug: string, runId: string) {
    const repository = await getRepository();
    const [run, conversations] = await Promise.all([
      this.getRun(runId),
      repository.listConversationArtifacts(runId)
    ]);

    return {
      payload: {
        page_slug: pageSlug,
        run_id: runId,
        target_date: run.run.targetDate.toISOString().slice(0, 10),
        generated_at: new Date().toISOString(),
        artifacts: buildOnboardingArtifacts(conversations)
      }
    };
  }

  async buildWorkerJobsForManual(job: ManualJobBody, pageBundle: PageBundle): Promise<WorkerJob[]> {
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
          pageBundle.page.businessTimezone
        );

    const runGroupId = job.runGroupId ?? (slices.length > 1 ? randomUUID() : null);
    let repository: Awaited<ReturnType<typeof getRepository>> | null = null;
    const workerJobs: WorkerJob[] = [];

    for (const slice of slices) {
      const snapshotVersion =
        job.snapshotVersion ??
        await ((repository ??= await getRepository()).nextSnapshotVersion(pageBundle.page.pageId, slice.targetDate));

      workerJobs.push(
        this.buildWorkerJob({
          pageBundle,
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

  async buildWorkerJobsForOnboarding(job: OnboardingJobBody, pageBundle: PageBundle): Promise<WorkerJob[]> {
    const snapshotVersion =
      job.snapshotVersion ?? await (await getRepository()).nextSnapshotVersion(pageBundle.page.pageId, job.targetDate);

    return [
      this.buildWorkerJob({
        pageBundle,
        targetDate: job.targetDate,
        runMode: "onboarding_sample",
        runGroupId: null,
        snapshotVersion,
        isPublished: false,
        requestedWindowStartAt: job.requestedWindowStartAt,
        requestedWindowEndExclusiveAt: job.requestedWindowEndExclusiveAt,
        windowStartAt: job.windowStartAt,
        windowEndExclusiveAt: job.windowEndExclusiveAt,
        maxConversations: job.initialConversationLimitOverride ?? pageBundle.page.initialConversationLimit,
        maxMessagePagesPerConversation: job.maxMessagePagesPerConversation
      })
    ];
  }

  async buildWorkerJobsForScheduler(job: SchedulerJobBody, pageBundles: PageBundle[]): Promise<WorkerJob[]> {
    let repository: Awaited<ReturnType<typeof getRepository>> | null = null;
    const workerJobs: WorkerJob[] = [];

    for (const pageBundle of pageBundles) {
      if (!pageBundle.page.autoScraper) {
        continue;
      }

      const snapshotVersion =
        job.snapshotVersion ??
        await ((repository ??= await getRepository()).nextSnapshotVersion(pageBundle.page.pageId, job.targetDate));

      workerJobs.push(
        this.buildWorkerJob({
          pageBundle,
          targetDate: job.targetDate,
          runMode: "scheduled_daily",
          runGroupId: null,
          snapshotVersion,
          isPublished: job.isPublished,
          requestedWindowStartAt: job.requestedWindowStartAt,
          requestedWindowEndExclusiveAt: job.requestedWindowEndExclusiveAt,
          windowStartAt: job.windowStartAt,
          windowEndExclusiveAt: job.windowEndExclusiveAt,
          maxConversations: job.maxConversations,
          maxMessagePagesPerConversation: job.maxMessagePagesPerConversation
        })
      );
    }

    return workerJobs;
  }

  buildWorkerJob(input: {
    pageBundle: PageBundle;
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
    const { pageBundle } = input;
    return {
      user_access_token: pageBundle.page.pancakeUserAccessToken,
      page_id: pageBundle.page.pageId,
      target_date: input.targetDate,
      business_timezone: pageBundle.page.businessTimezone,
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
      tag_rules: pageBundle.tagRules,
      opening_rules: pageBundle.openingRules,
      customer_directory: pageBundle.customerDirectory,
      bot_signatures: pageBundle.botSignatures.length > 0 ? pageBundle.botSignatures : pageBundle.page.botSignatures
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

  resolvePageSlugFromExecution(body: ExecuteJobBody, pageId: string) {
    if (body.kind === "scheduler") {
      return body.page_bundles.find((entry) => entry.page.pageId === pageId)?.page.pageSlug ?? null;
    }
    return body.page_bundle.page.pageId === pageId ? body.page_bundle.page.pageSlug : null;
  }
}

export const seam1Service = new Seam1Service();

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
