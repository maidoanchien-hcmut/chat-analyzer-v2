import type {
  ConnectedPageDetailViewModel,
  ControlPlaneAdapter,
  ManualRunInput,
  PublishEligibility,
  RunDetailViewModel,
  RunGroupViewModel,
  RunPreviewViewModel
} from "../contracts.ts";
import { requestJson } from "./client.ts";

type RawListedPage = {
  pageId: string;
  pageName: string;
};

type RawConfigVersion = {
  id: string;
  versionNo: number;
  promptText: string;
  tagMappingJson: unknown;
  openingRulesJson: unknown;
  schedulerJson: unknown;
  notificationTargetsJson: unknown;
  notes: string | null;
  analysisTaxonomyVersionId: string;
  analysisTaxonomyVersion: {
    versionCode: string;
  };
  createdAt: string;
};

type RawConnectedPageDetail = {
  id: string;
  pancakePageId: string;
  pageName: string;
  businessTimezone: string;
  etlEnabled: boolean;
  analysisEnabled: boolean;
  activeConfigVersionId: string | null;
  activeConfigVersion: RawConfigVersion | null;
  configVersions: RawConfigVersion[];
  updatedAt: string;
};

type RawRunSummary = {
  id: string;
  target_date: string;
  status: string;
  publish_state: string;
  publish_eligibility: string;
  window_start_at: string;
  window_end_exclusive_at: string;
  supersedes_run_id: string | null;
  published_at: string | null;
};

export function createControlPlaneAdapter(getBaseUrl: () => string): ControlPlaneAdapter {
  return {
    async listPagesFromToken(userAccessToken) {
      const result = await requestJson<RawListedPage[] | { pages: RawListedPage[] }>(
        getBaseUrl(),
        "POST",
        "/chat-extractor/control-center/pages/list-from-token",
        { userAccessToken }
      );
      const rows = Array.isArray(result) ? result : result.pages ?? [];
      return rows.map((row) => ({
        pageId: row.pageId,
        pageName: row.pageName
      }));
    },
    async registerPage(input) {
      const result = await requestJson<{ page: RawConnectedPageDetail }>(
        getBaseUrl(),
        "POST",
        "/chat-extractor/control-center/pages/register",
        input
      );
      return mapConnectedPage(result.page);
    },
    async listConnectedPages() {
      const result = await requestJson<{ pages: RawConnectedPageDetail[] }>(
        getBaseUrl(),
        "GET",
        "/chat-extractor/control-center/pages"
      );
      return result.pages.map(mapConnectedPage);
    },
    async getConnectedPage(pageId) {
      const result = await requestJson<{ page: RawConnectedPageDetail }>(
        getBaseUrl(),
        "GET",
        `/chat-extractor/control-center/pages/${encodeURIComponent(pageId)}`
      );
      return mapConnectedPage(result.page);
    },
    async createConfigVersion(pageId, input) {
      await requestJson(
        getBaseUrl(),
        "POST",
        `/chat-extractor/control-center/pages/${encodeURIComponent(pageId)}/config-versions`,
        input
      );
    },
    async activateConfigVersion(pageId, configVersionId) {
      const result = await requestJson<{ page: RawConnectedPageDetail }>(
        getBaseUrl(),
        "POST",
        `/chat-extractor/control-center/pages/${encodeURIComponent(pageId)}/config-versions/${encodeURIComponent(configVersionId)}/activate`,
        {}
      );
      return mapConnectedPage(result.page);
    },
    async previewManualRun(input) {
      const result = await requestJson<{
        run_group: {
          page_name: string;
          requested_window_start_at: string | null;
          requested_window_end_exclusive_at: string | null;
          requested_target_date: string | null;
          will_use_config_version: number;
          will_use_prompt_version: string;
        };
        child_runs: Array<{
          target_date: string;
          window_start_at: string;
          window_end_exclusive_at: string;
          is_full_day: boolean;
          publish_eligibility: string;
          historical_overwrite_required: boolean;
        }>;
      }>(getBaseUrl(), "POST", "/chat-extractor/jobs/preview", buildManualRunBody(input));

      return {
        pageName: result.run_group.page_name,
        requestedWindow: result.run_group.requested_target_date
          ?? `${result.run_group.requested_window_start_at ?? "-"} -> ${result.run_group.requested_window_end_exclusive_at ?? "-"}`,
        promptVersion: result.run_group.will_use_prompt_version,
        configVersion: `v${String(result.run_group.will_use_config_version)}`,
        children: result.child_runs.map((child) => ({
          targetDate: child.target_date,
          windowStartAt: child.window_start_at,
          windowEndExclusiveAt: child.window_end_exclusive_at,
          isFullDay: child.is_full_day,
          publishEligibility: child.publish_eligibility as PublishEligibility,
          historicalOverwriteRequired: child.historical_overwrite_required
        }))
      };
    },
    async executeManualRun(input) {
      const result = await requestJson<{
        run_group: {
          id: string;
          run_mode: string;
          status: string;
          publish_intent: string;
          frozen_prompt_version: string;
          frozen_compiled_prompt_hash: string;
          frozen_config_version_id: string;
          created_at: string;
          started_at: string | null;
          finished_at: string | null;
          connected_page: { page_name: string };
        };
        child_runs: RawRunSummary[];
      }>(getBaseUrl(), "POST", "/chat-extractor/jobs/execute", buildManualRunBody(input));
      return mapRunGroup(result);
    },
    async getRunGroup(runGroupId) {
      const result = await requestJson<{
        run_group: {
          id: string;
          run_mode: string;
          status: string;
          publish_intent: string;
          frozen_prompt_version: string;
          frozen_compiled_prompt_hash: string;
          frozen_config_version_id: string;
          created_at: string;
          started_at: string | null;
          finished_at: string | null;
          connected_page: { page_name: string };
        };
        child_runs: RawRunSummary[];
      }>(getBaseUrl(), "GET", `/chat-extractor/run-groups/${encodeURIComponent(runGroupId)}`);
      return mapRunGroup(result);
    },
    async getRun(runId) {
      const result = await requestJson<{ run: RawRunSummary; counts: { threadDayCount: number; messageCount: number } }>(
        getBaseUrl(),
        "GET",
        `/chat-extractor/runs/${encodeURIComponent(runId)}`
      );
      return mapRunDetail(result.run, result.counts.threadDayCount, result.counts.messageCount);
    },
    async publishRun(runId, input) {
      const result = await requestJson<{ run: RawRunSummary; counts: { threadDayCount: number; messageCount: number } }>(
        getBaseUrl(),
        "POST",
        `/chat-extractor/runs/${encodeURIComponent(runId)}/publish`,
        {
          publishAs: input.publishAs,
          confirmHistoricalOverwrite: input.confirmHistoricalOverwrite,
          expectedReplacedRunId: input.expectedReplacedRunId
        }
      );
      return mapRunDetail(result.run, result.counts.threadDayCount, result.counts.messageCount);
    }
  };
}

function buildManualRunBody(input: ManualRunInput) {
  return {
    kind: "manual",
    connectedPageId: input.connectedPageId,
    job: {
      processingMode: input.processingMode,
      targetDate: input.targetDate,
      requestedWindowStartAt: input.requestedWindowStartAt,
      requestedWindowEndExclusiveAt: input.requestedWindowEndExclusiveAt
    }
  };
}

function mapConnectedPage(input: RawConnectedPageDetail): ConnectedPageDetailViewModel {
  return {
    id: input.id,
    pageName: input.pageName,
    pancakePageId: input.pancakePageId,
    businessTimezone: input.businessTimezone,
    etlEnabled: input.etlEnabled,
    analysisEnabled: input.analysisEnabled,
    activeConfigVersionId: input.activeConfigVersionId,
    updatedAt: input.updatedAt,
    configVersions: input.configVersions.map((configVersion) => ({
      id: configVersion.id,
      versionNo: configVersion.versionNo,
      promptText: configVersion.promptText,
      tagMappingJson: configVersion.tagMappingJson,
      openingRulesJson: configVersion.openingRulesJson,
      schedulerJson: configVersion.schedulerJson,
      notificationTargetsJson: configVersion.notificationTargetsJson,
      notes: configVersion.notes,
      analysisTaxonomyVersionId: configVersion.analysisTaxonomyVersionId,
      analysisTaxonomyVersionCode: configVersion.analysisTaxonomyVersion.versionCode,
      createdAt: configVersion.createdAt
    })),
    activeConfigVersion: input.activeConfigVersion
      ? {
        id: input.activeConfigVersion.id,
        versionNo: input.activeConfigVersion.versionNo,
        promptText: input.activeConfigVersion.promptText,
        tagMappingJson: input.activeConfigVersion.tagMappingJson,
        openingRulesJson: input.activeConfigVersion.openingRulesJson,
        schedulerJson: input.activeConfigVersion.schedulerJson,
        notificationTargetsJson: input.activeConfigVersion.notificationTargetsJson,
        notes: input.activeConfigVersion.notes,
        analysisTaxonomyVersionId: input.activeConfigVersion.analysisTaxonomyVersionId,
        analysisTaxonomyVersionCode: input.activeConfigVersion.analysisTaxonomyVersion.versionCode,
        createdAt: input.activeConfigVersion.createdAt
      }
      : null
  };
}

function mapRunGroup(input: {
  run_group: {
    id: string;
    run_mode: string;
    status: string;
    publish_intent: string;
    frozen_prompt_version: string;
    frozen_compiled_prompt_hash: string;
    frozen_config_version_id: string;
    created_at: string;
    started_at: string | null;
    finished_at: string | null;
    connected_page: { page_name: string };
  };
  child_runs: RawRunSummary[];
}): RunGroupViewModel {
  return {
    id: input.run_group.id,
    pageName: input.run_group.connected_page.page_name,
    runMode: input.run_group.run_mode,
    status: input.run_group.status,
    publishIntent: input.run_group.publish_intent,
    promptVersion: input.run_group.frozen_prompt_version,
    promptHash: input.run_group.frozen_compiled_prompt_hash,
    configVersionId: input.run_group.frozen_config_version_id,
    createdAt: input.run_group.created_at,
    startedAt: input.run_group.started_at,
    finishedAt: input.run_group.finished_at,
    childRuns: input.child_runs.map(mapRunSummary)
  };
}

function mapRunSummary(input: RawRunSummary) {
  return {
    id: input.id,
    targetDate: input.target_date,
    status: describeRunStatus(input.status),
    publishState: describePublishState(input.publish_state),
    publishEligibility: input.publish_eligibility as PublishEligibility,
    windowStartAt: input.window_start_at,
    windowEndExclusiveAt: input.window_end_exclusive_at,
    supersedesRunId: input.supersedes_run_id,
    publishedAt: input.published_at
  };
}

function mapRunDetail(run: RawRunSummary, threadDayCount: number, messageCount: number): RunDetailViewModel {
  return {
    run: mapRunSummary(run),
    threadDayCount,
    messageCount,
    publishWarning: run.publish_eligibility === "not_publishable_old_partial"
      ? "Child run này chỉ là partial ngày cũ, nên operator chỉ được xem kết quả run và không có quyền publish dashboard."
      : null
  };
}

function describePublishState(value: string) {
  if (value === "draft") {
    return "Draft";
  }
  if (value === "published_official") {
    return "Published official";
  }
  if (value === "published_provisional") {
    return "Published provisional";
  }
  if (value === "superseded") {
    return "Đã bị supersede";
  }
  return value;
}

function describeRunStatus(value: string) {
  if (value === "queued") {
    return "Đang chờ xử lý";
  }
  if (value === "running") {
    return "Đang chạy";
  }
  if (value === "loaded") {
    return "Đã load kết quả";
  }
  if (value === "published") {
    return "Đã publish";
  }
  if (value === "failed") {
    return "Thất bại";
  }
  return value;
}
