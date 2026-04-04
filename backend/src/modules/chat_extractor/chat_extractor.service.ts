import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { AppError } from "../../core/errors.ts";
import {
  buildCompiledPromptText,
  DEFAULT_PAGE_PROMPT,
  defaultOpeningRulesConfig,
  defaultSchedulerConfig,
  defaultTagMappingConfig,
  hashCompiledPrompt,
  hashEtlConfig,
  nextPromptVersion
} from "./chat_extractor.artifacts.ts";
import {
  buildFullDayRun,
  determinePublishEligibility,
  formatDateInTimezone,
  isHistoricalTargetDate,
  splitRequestedWindowByTargetDate,
  type PlannedChildRun
} from "./chat_extractor.planner.ts";
import {
  chatExtractorRepository,
  type ConnectedPageDetailRecord,
  type ConnectedPageRecord,
  type PageConfigVersionRecord,
  type PagePromptIdentityRecord,
  type PipelineRunRecord
} from "./chat_extractor.repository.ts";
import type {
  ExecuteJobBody,
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
};

type RuntimeSnapshot = {
  configVersion: PageConfigVersionRecord;
  compiledPromptText: string;
  compiledPromptHash: string;
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

export class ChatExtractorService {
  private readonly listPagesFromTokenImpl: ChatExtractorServiceDependencies["listPagesFromToken"];
  private readonly runWorkerImpl: ChatExtractorServiceDependencies["runWorker"];

  constructor(deps: Partial<ChatExtractorServiceDependencies> = {}) {
    this.listPagesFromTokenImpl = deps.listPagesFromToken ?? fetchPancakePages;
    this.runWorkerImpl = deps.runWorker ?? runWorkerManifest;
  }

  async listPagesFromToken(userAccessToken: string) {
    return this.listPagesFromTokenImpl(userAccessToken);
  }

  async listConnectedPages() {
    const pages = await chatExtractorRepository.listConnectedPages();
    return {
      pages: pages.map((item) => serializeConnectedPageDetail(item))
    };
  }

  async getConnectedPage(id: string) {
    const page = await this.requireConnectedPage(id);
    return {
      page: serializeConnectedPageDetail(page)
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
    if (!activeConfig) {
      const configVersion = await chatExtractorRepository.createPageConfigVersion({
        connectedPageId: page.id,
        versionNo: await chatExtractorRepository.nextConfigVersionNo(page.id),
        tagMappingJson: defaultTagMappingConfig(),
        openingRulesJson: defaultOpeningRulesConfig(),
        schedulerJson: null,
        notificationTargetsJson: null,
        promptText: DEFAULT_PAGE_PROMPT,
        analysisTaxonomyVersionId: defaultTaxonomy.id,
        notes: null
      });
      await chatExtractorRepository.activateConfigVersion(page.id, configVersion.id);
    }

    return this.getConnectedPage(page.id);
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
        will_use_compiled_prompt_hash: snapshot.compiledPromptHash
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
      frozenCompiledPromptHash: snapshot.compiledPromptHash,
      frozenPromptVersion: snapshot.promptIdentity.promptVersion,
      publishIntent: derivePublishIntent(plannedRuns),
      status: "queued",
      createdBy: "operator",
      childRuns: runRows
    });

    const executions: WorkerExecution[] = [];
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
          executions.push(await this.runWorkerImpl(manifest));
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
      executions
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
      counts
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

  private async resolveRuntimeSnapshot(page: ConnectedPageDetailRecord, persistPromptIdentity = false): Promise<RuntimeSnapshot> {
    const configVersion = page.activeConfigVersion;
    if (!configVersion) {
      throw new AppError(400, "CHAT_EXTRACTOR_ACTIVE_CONFIG_REQUIRED", `Page ${page.page.id} chưa có active config version.`);
    }

    const compiledPromptText = buildCompiledPromptText({
      promptText: configVersion.promptText,
      taxonomyJson: configVersion.analysisTaxonomyVersion.taxonomyJson
    });
    const compiledPromptHash = hashCompiledPrompt(compiledPromptText);
    const existingIdentity = await chatExtractorRepository.getPromptIdentityByHash(page.page.id, compiledPromptHash);
    const promptIdentity = existingIdentity ?? {
      id: null,
      connectedPageId: page.page.id,
      compiledPromptHash,
      promptVersion: nextPromptVersion((await chatExtractorRepository.listPromptIdentities(page.page.id)).map((item) => item.promptVersion)),
      compiledPromptText,
      createdAt: null
    };

    if (persistPromptIdentity && promptIdentity.id === null) {
      const created = await chatExtractorRepository.createPromptIdentity({
        connectedPageId: page.page.id,
        compiledPromptHash,
        promptVersion: promptIdentity.promptVersion,
        compiledPromptText
      });
      return {
        configVersion,
        compiledPromptText,
        compiledPromptHash,
        promptIdentity: created,
        etlConfigHash: hashEtlConfig({
          tagMapping: configVersion.tagMappingJson,
          openingRules: configVersion.openingRulesJson,
          scheduler: configVersion.schedulerJson
        })
      };
    }

    return {
      configVersion,
      compiledPromptText,
      compiledPromptHash,
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
      return [buildFullDayRun(job.targetDate, businessTimezone)];
    }

    return job.targetDate
      ? [buildFullDayRun(job.targetDate, businessTimezone)]
      : splitRequestedWindowByTargetDate(
          job.requestedWindowStartAt!,
          job.requestedWindowEndExclusiveAt!,
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

function serializeConnectedPageDetail(record: ConnectedPageDetailRecord) {
  return {
    id: record.page.id,
    pancakePageId: record.page.pancakePageId,
    pageName: record.page.pageName,
    businessTimezone: record.page.businessTimezone,
    etlEnabled: record.page.etlEnabled,
    analysisEnabled: record.page.analysisEnabled,
    activeConfigVersionId: record.page.activeConfigVersionId,
    activeConfigVersion: record.activeConfigVersion ? serializeConfigVersion(record.activeConfigVersion) : null,
    configVersions: record.configVersions.map((item) => serializeConfigVersion(item)),
    createdAt: record.page.createdAt,
    updatedAt: record.page.updatedAt
  };
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
    will_use_compiled_prompt_hash: snapshot.compiledPromptHash
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
