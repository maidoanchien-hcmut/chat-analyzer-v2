import type {
  ConnectedPageDetailViewModel,
  ConnectedPageSummary,
  HealthSummaryViewModel,
  MappingQueueItem,
  OnboardingSamplePreviewViewModel,
  OnboardingPageCandidate,
  PromptPreviewComparisonViewModel,
  PromptWorkspaceSampleViewModel,
  RunDetailViewModel,
  RunGroupViewModel,
  RunPreviewViewModel
} from "../adapters/contracts.ts";

export type TagMappingDraft = {
  rawTag: string;
  role: string;
  canonicalValue: string;
  source: "system_default" | "operator_override";
};

export type OpeningRuleDraft = {
  buttonTitle: string;
  signalType: string;
  canonicalValue: string;
};

export type SchedulerDraft = {
  useSystemDefaults: boolean;
  timezone: string;
  officialDailyTime: string;
  lookbackHours: number;
};

export type NotificationTargetDraft = {
  channel: string;
  value: string;
};

export type OnboardingState = {
  token: string;
  tokenPages: OnboardingPageCandidate[];
  selectedPancakePageId: string;
  timezone: string;
  etlEnabled: boolean;
  analysisEnabled: boolean;
  sampleConversationLimit: number;
  sampleMessagePageLimit: number;
};

export type ConfigurationState = {
  activeTab: "page-info" | "taxonomy" | "opening-rules" | "prompt-profile" | "scheduler";
  connectedPages: ConnectedPageSummary[];
  selectedPageId: string;
  pageDetail: ConnectedPageDetailViewModel | null;
  selectedConfigVersionId: string;
  promptText: string;
  tagMappings: TagMappingDraft[];
  openingRules: OpeningRuleDraft[];
  scheduler: SchedulerDraft;
  notificationTargets: NotificationTargetDraft[];
  notes: string;
  activateAfterCreate: boolean;
  etlEnabled: boolean;
  analysisEnabled: boolean;
  onboardingSamplePreview: OnboardingSamplePreviewViewModel | null;
  promptWorkspaceSamplePreview: PromptWorkspaceSampleViewModel | null;
  promptWorkspaceSampleFingerprint: string | null;
  promptWorkspaceSampleStaleReason: string | null;
  selectedPromptSampleConversationId: string;
  promptPreviewComparison: PromptPreviewComparisonViewModel | null;
  promptPreviewComparisonFingerprint: string | null;
  promptPreviewComparisonStaleReason: string | null;
  promptCloneSourceVersionId: string;
  promptCloneSourcePageId: string;
  promptCompareLeftVersionId: string;
  promptCompareRightVersionId: string;
};

export type OperationsState = {
  activePanel: "manual-run" | "run-monitor" | "run-detail";
  connectedPages: ConnectedPageSummary[];
  selectedPageId: string;
  processingMode: "etl_only" | "etl_and_ai";
  targetDate: string;
  requestedWindowStartAt: string;
  requestedWindowEndExclusiveAt: string;
  previewResult: RunPreviewViewModel | null;
  runGroup: RunGroupViewModel | null;
  runDetail: RunDetailViewModel | null;
  inspectRunGroupId: string;
  inspectRunId: string;
  publishRunId: string;
  publishAs: "official" | "provisional";
  confirmHistoricalOverwrite: boolean;
  expectedReplacedRunId: string;
  mappingQueue: MappingQueueItem[];
  healthSummary: HealthSummaryViewModel | null;
};
