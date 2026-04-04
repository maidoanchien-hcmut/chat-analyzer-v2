export type ProcessingMode = "etl_only" | "etl_and_ai";
export type PublishAs = "official" | "provisional";

export type ListedPage = {
  pageId: string;
  pageName: string;
};

export type AnalysisTaxonomyVersion = {
  id: string;
  versionCode: string;
  taxonomyJson: unknown;
  isActive: boolean;
};

export type PageConfigVersion = {
  id: string;
  versionNo: number;
  tagMappingJson: unknown;
  openingRulesJson: unknown;
  schedulerJson: unknown;
  notificationTargetsJson: unknown;
  promptText: string;
  analysisTaxonomyVersionId: string;
  analysisTaxonomyVersion: AnalysisTaxonomyVersion;
  notes: string | null;
  createdAt: string;
};

export type ConnectedPageDetail = {
  id: string;
  pancakePageId: string;
  pageName: string;
  businessTimezone: string;
  etlEnabled: boolean;
  analysisEnabled: boolean;
  activeConfigVersionId: string | null;
  activeConfigVersion: PageConfigVersion | null;
  configVersions: PageConfigVersion[];
  createdAt: string;
  updatedAt: string;
};

export type PreviewResult = {
  run_group: {
    run_mode: string;
    connected_page_id: string;
    page_name: string;
    requested_window_start_at: string | null;
    requested_window_end_exclusive_at: string | null;
    requested_target_date: string | null;
    will_use_config_version: number;
    will_use_prompt_version: string;
    will_use_compiled_prompt_hash: string;
  };
  child_runs: Array<{
    target_date: string;
    window_start_at: string;
    window_end_exclusive_at: string;
    is_full_day: boolean;
    publish_eligibility: string;
    historical_overwrite_required: boolean;
  }>;
};

export type WorkerExecution = {
  pipelineRunId: string;
  exitCode: number;
  ok: boolean;
  stdout: string;
  stderr: string;
};

export type RunGroupResult = {
  run_group: {
    id: string;
    run_mode: string;
    status: string;
    requested_window_start_at: string | null;
    requested_window_end_exclusive_at: string | null;
    requested_target_date: string | null;
    publish_intent: string;
    frozen_config_version_id: string;
    frozen_taxonomy_version_id: string;
    frozen_compiled_prompt_hash: string;
    frozen_prompt_version: string;
    created_by: string;
    created_at: string;
    started_at: string | null;
    finished_at: string | null;
    connected_page: {
      id: string;
      pancake_page_id: string;
      page_name: string;
      business_timezone: string;
    };
  };
  child_runs: RunSummary[];
  executions?: WorkerExecution[];
};

export type RunSummary = {
  id: string;
  run_group_id: string;
  target_date: string;
  window_start_at: string;
  window_end_exclusive_at: string;
  requested_window_start_at: string | null;
  requested_window_end_exclusive_at: string | null;
  is_full_day: boolean;
  run_mode: string;
  status: string;
  publish_state: string;
  publish_eligibility: string;
  supersedes_run_id: string | null;
  superseded_by_run_id: string | null;
  request_json: unknown;
  metrics_json: unknown;
  reuse_summary_json: unknown;
  error_text: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  published_at: string | null;
};

export type RunDetailResult = {
  run: RunSummary;
  counts: {
    threadDayCount: number;
    messageCount: number;
  };
};

export type AppState = {
  apiBaseUrl: string;
  loading: string | null;
  error: string | null;
  info: string | null;
  registerToken: string;
  tokenPages: ListedPage[];
  registerSelectedPancakePageId: string;
  registerTimezone: string;
  registerEtlEnabled: boolean;
  registerAnalysisEnabled: boolean;
  pages: ConnectedPageDetail[];
  selectedPageId: string;
  selectedPage: ConnectedPageDetail | null;
  selectedConfigVersionId: string;
  configPromptText: string;
  configTagMappingText: string;
  configOpeningRulesText: string;
  configSchedulerText: string;
  configNotificationTargetsText: string;
  configNotes: string;
  configActivate: boolean;
  configEtlEnabled: boolean;
  configAnalysisEnabled: boolean;
  jobProcessingMode: ProcessingMode;
  jobTargetDate: string;
  jobRequestedWindowStartAt: string;
  jobRequestedWindowEndExclusiveAt: string;
  previewResult: PreviewResult | null;
  executeResult: RunGroupResult | null;
  inspectRunGroupId: string;
  runGroupResult: RunGroupResult | null;
  inspectRunId: string;
  runDetailResult: RunDetailResult | null;
  publishRunId: string;
  publishAs: PublishAs;
  confirmHistoricalOverwrite: boolean;
  expectedReplacedRunId: string;
  publishResult: RunDetailResult | null;
};
