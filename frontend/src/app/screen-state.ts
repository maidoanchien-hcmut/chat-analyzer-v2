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
  sourceTagId: string;
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

export type ConfigurationWorkspaceDraft = {
  token: string;
  tokenPages: OnboardingPageCandidate[];
  selectedPancakePageId: string;
  businessTimezone: string;
  selectedPageId: string;
  selectedConfigVersionId: string;
  etlEnabled: boolean;
  analysisEnabled: boolean;
  sampleConversationLimit: number;
  sampleMessagePageLimit: number;
  promptText: string;
  tagMappings: TagMappingDraft[];
  openingRules: OpeningRuleDraft[];
  scheduler: SchedulerDraft;
  notificationTargets: NotificationTargetDraft[];
  notes: string;
  activateAfterCreate: boolean;
  promptCloneSourceVersionId: string;
  promptCloneSourcePageId: string;
  promptCompareLeftVersionId: string;
  promptCompareRightVersionId: string;
  selectedPromptSampleConversationId: string;
};

export type OnboardingSampleSeedSummary = {
  tagSuggestionsApplied: number;
  openingSuggestionsApplied: number;
  tagOverridesPreserved: number;
  openingOverridesPreserved: number;
  observedTagCount: number;
  explicitOpeningSignalCount: number;
  promptDefaultsApplied: number;
  schedulerDefaultsApplied: number;
  notificationDefaultsApplied: number;
};

export type ConfigurationState = {
  activeTab: "page-info" | "taxonomy" | "opening-rules" | "prompt-profile" | "scheduler";
  connectedPages: ConnectedPageSummary[];
  pageDetail: ConnectedPageDetailViewModel | null;
  workspace: ConfigurationWorkspaceDraft;
  onboardingSamplePreview: OnboardingSamplePreviewViewModel | null;
  onboardingSampleSeedSummary: OnboardingSampleSeedSummary | null;
  promptWorkspaceSamplePreview: PromptWorkspaceSampleViewModel | null;
  promptWorkspaceSampleFingerprint: string | null;
  promptWorkspaceSampleStaleReason: string | null;
  promptPreviewComparison: PromptPreviewComparisonViewModel | null;
  promptPreviewComparisonFingerprint: string | null;
  promptPreviewComparisonStaleReason: string | null;
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
