import type { BusinessFilters, BusinessPage, SelectOption } from "../core/types.ts";

export type WarningState = {
  title: string;
  body: string;
  tone: "warning" | "info" | "danger";
};

export type FieldExplanation = {
  field: string;
  explanation: string;
};

export type PromptWorkspaceSampleMessage = {
  messageId: string;
  insertedAt: string;
  senderRole: string;
  senderName: string | null;
  messageType: string;
  redactedText: string | null;
  isMeaningfulHumanMessage: boolean;
  isOpeningBlockMessage: boolean;
};

export type PromptWorkspaceSampleConversation = {
  conversationId: string;
  customerDisplayName: string;
  firstMeaningfulMessageId: string | null;
  firstMeaningfulMessageText: string;
  firstMeaningfulMessageSenderRole: string | null;
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
  messages: PromptWorkspaceSampleMessage[];
};

export type PromptWorkspaceSampleViewModel = {
  sampleWorkspaceKey: string;
  connectedPageId: string;
  pageId: string;
  pageName: string;
  targetDate: string;
  businessTimezone: string;
  windowStartAt: string;
  windowEndExclusiveAt: string;
  summary: {
    conversationsScanned: number;
    threadDaysBuilt: number;
    messagesSeen: number;
    messagesSelected: number;
  };
  pageTags: Array<{ pancakeTagId: string; text: string; isDeactive: boolean }>;
  conversations: PromptWorkspaceSampleConversation[];
};

export type PromptPreviewArtifactViewModel = {
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
  fieldExplanations: FieldExplanation[];
  supportingMessageIds: string[];
};

export type PromptPreviewComparisonViewModel = {
  sampleScope: {
    sampleScopeKey: string;
    targetDate: string;
    businessTimezone: string;
    windowStartAt: string;
    windowEndExclusiveAt: string;
    selectedConversationId: string;
  };
  activeArtifact: PromptPreviewArtifactViewModel;
  draftArtifact: PromptPreviewArtifactViewModel;
};

export type BusinessCatalog = {
  pages: BusinessPage[];
  needs: SelectOption[];
  outcomes: SelectOption[];
  risks: SelectOption[];
  staff: SelectOption[];
};

export type SnapshotDescriptor = {
  kind: "published_official" | "published_provisional";
  label: string;
  coverage: string;
  promptVersion: string;
  configVersion: string;
  taxonomyVersion: string;
};

export type MetricCard = {
  label: string;
  value: string;
  delta: string;
  hint: string;
};

export type SimpleBreakdown = {
  label: string;
  value: string;
  share: string;
  drillFilter?: Partial<BusinessFilters>;
};

export type ImprovementRow = {
  cluster: string;
  threadCount: number;
  outcome: string;
  risk: string;
  summary: string;
  drillLabel: string;
  drillRoute: string;
};

export type OverviewViewModel = {
  pageLabel: string;
  snapshot: SnapshotDescriptor;
  warning: WarningState | null;
  metrics: MetricCard[];
  openingNew: SimpleBreakdown[];
  openingRevisit: SimpleBreakdown[];
  needs: SimpleBreakdown[];
  outcomes: SimpleBreakdown[];
  sources: Array<{ source: string; threads: number; revisitRate: string; topNeed: string; topOutcome: string }>;
  priorities: ImprovementRow[];
};

export type ExplorationViewModel = {
  metric: string;
  breakdownBy: string;
  compareBy: string;
  chartSummary: string;
  rows: Array<{ dimension: string; metricValue: string; share: string; drillRoute: string }>;
  warning: WarningState | null;
};

export type StaffPerformanceViewModel = {
  warning: WarningState | null;
  scorecards: MetricCard[];
  rankingRows: Array<{ staff: string; threads: number; quality: string; responseTime: string; issue: string; suggestion: string }>;
  issueMatrix: Array<{ staff: string; need: string; quality: string; volume: string }>;
  coachingInbox: Array<{ staff: string; threadLabel: string; issue: string; improvement: string; openRoute: string }>;
};

export type ThreadMessage = {
  id: string;
  at: string;
  author: string;
  role: "customer" | "staff" | "system";
  text: string;
  emphasized?: boolean;
  isFirstMeaningful?: boolean;
  isStaffFirstResponse?: boolean;
  isSupportingEvidence?: boolean;
};

export type ThreadHistoryViewModel = {
  warning: WarningState | null;
  threads: Array<{ id: string; customer: string; snippet: string; updatedAt: string; badges: string[] }>;
  activeThreadId: string;
  activeThreadDayId: string | null;
  activeTab: "conversation" | "analysis-history" | "ai-audit" | "crm-link";
  workspace: {
    openingBlockMessages: Array<{ messageId: string | null; senderRole: string; messageType: string; text: string }>;
    explicitSignals: Array<{ signalRole: string; signalCode: string; rawText: string }>;
    normalizedTagSignals: Array<{ role: string; sourceTagId: string; sourceTagText: string; canonicalCode: string; mappingSource: string }>;
    sourceSignals: {
      explicitRevisit: string | null;
      explicitNeed: string | null;
      explicitOutcome: string | null;
    };
    structuredOutput: Array<{ field: string; code: string; label: string; reason: string | null }>;
    sourceThreadJsonRedacted: unknown;
  };
  transcript: ThreadMessage[];
  analysisHistory: Array<{ threadDayId: string; date: string; openingTheme: string; need: string; outcome: string; mood: string; risk: string; quality: string; aiCost: string; active: boolean }>;
  audit: {
    model: string;
    promptVersion: string;
    promptHash: string;
    taxonomyVersion: string;
    evidence: string[];
    explanations: FieldExplanation[];
    supportingMessageIds: string[];
    structuredOutput: Array<{ field: string; code: string; label: string; reason: string | null }>;
  };
  crmLink: {
    customer: string;
    method: string;
    confidence: string;
    history: string[];
  };
};

export type PageComparisonViewModel = {
  warning: WarningState | null;
  comparedPages: string[];
  trendRows: Array<{ date: string; values: Array<{ page: string; volume: string; conversion: string; aiCost: string }> }>;
  mixCards: Array<{ title: string; summary: string }>;
};

export type ExportRequestInput = {
  pageId: string;
  startDate: string;
  endDate: string;
};

export type ExportWorkbookRow = {
  date: string;
  totalInbox: number;
  inboxNew: number;
  revisit: number;
  bookedRate: string;
  highRisk: number;
  aiCost: string;
  promptVersion: string;
  configVersion: string;
  taxonomyVersion: string;
};

export type ExportWorkbookViewModel = {
  allowed: boolean;
  reason: string;
  fileName: string;
  pageId: string;
  pageLabel: string;
  startDate: string;
  endDate: string;
  generatedAt: string;
  promptVersion: string;
  configVersion: string;
  taxonomyVersion: string;
  rows: ExportWorkbookRow[];
};

export type OnboardingPageCandidate = {
  pageId: string;
  pageName: string;
};

export type ConnectedPageSummary = {
  id: string;
  pageName: string;
  pancakePageId: string;
  businessTimezone: string;
  tokenStatus: "missing" | "not_checked" | "valid" | "invalid";
  connectionStatus: "not_checked" | "connected" | "token_invalid" | "page_unavailable";
  tokenPreviewMasked: string | null;
  lastValidatedAt: string | null;
  etlEnabled: boolean;
  analysisEnabled: boolean;
  activeConfigVersionId: string | null;
  updatedAt: string;
};

export type ConnectedPageConfigVersion = {
  id: string;
  versionNo: number;
  promptText: string;
  tagMappingJson: unknown;
  openingRulesJson: unknown;
  schedulerJson: unknown;
  notificationTargetsJson: unknown;
  notes: string | null;
  analysisTaxonomyVersionId: string;
  analysisTaxonomyVersionCode: string;
  createdAt: string;
  promptVersionLabel: string;
  promptHash: string;
  evidenceBundle: string[];
  fieldExplanations: FieldExplanation[];
};

export type ConnectedPageDetailViewModel = ConnectedPageSummary & {
  configVersions: ConnectedPageConfigVersion[];
  activeConfigVersion: ConnectedPageConfigVersion | null;
};

export type OnboardingSamplePreviewViewModel = {
  pageId: string;
  pageName: string;
  targetDate: string;
  businessTimezone: string;
  windowStartAt: string;
  windowEndExclusiveAt: string;
  summary: {
    conversationsScanned: number;
    threadDaysBuilt: number;
    messagesSeen: number;
    messagesSelected: number;
  };
  pageTags: Array<{ pancakeTagId: string; text: string; isDeactive: boolean }>;
  conversations: Array<{
    conversationId: string;
    customerDisplayName: string;
    firstMeaningfulMessageText: string;
    observedTags: Array<{ sourceTagId: string; sourceTagText: string }>;
    normalizedTagSignals: Array<{ role: string; sourceTagId: string; sourceTagText: string; canonicalCode: string; mappingSource: string }>;
    openingMessages: Array<{ senderRole: string; messageType: string; redactedText: string }>;
    explicitSignals: Array<{ signalRole: string; signalCode: string; rawText: string }>;
    cutReason: string;
  }>;
};

export type HistoricalOverwriteViewModel = {
  replacedRunId: string;
  replacedSnapshotLabel: string;
  previousPromptVersion: string;
  previousConfigVersion: string;
  nextPromptVersion: string;
  nextConfigVersion: string;
  exportImpact: string;
};

export type PublishEligibility =
  | "official_full_day"
  | "provisional_current_day_partial"
  | "not_publishable_old_partial";

export type RunPreviewChild = {
  targetDate: string;
  windowStartAt: string;
  windowEndExclusiveAt: string;
  isFullDay: boolean;
  publishEligibility: PublishEligibility;
  historicalOverwriteRequired: boolean;
};

export type RunPreviewViewModel = {
  pageName: string;
  requestedWindow: string;
  promptVersion: string;
  configVersion: string;
  children: RunPreviewChild[];
};

export type RunSummaryViewModel = {
  id: string;
  targetDate: string;
  status: string;
  publishState: string;
  publishEligibility: PublishEligibility;
  windowStartAt: string;
  windowEndExclusiveAt: string;
  supersedesRunId: string | null;
  historicalOverwrite: HistoricalOverwriteViewModel | null;
  publishedAt: string | null;
};

export type MappingQueueStatus = "pending" | "approved" | "rejected" | "remapped";

export type MappingQueueItem = {
  id: string;
  threadLabel: string;
  candidateCustomer: string;
  confidence: string;
  evidence: string;
  status: MappingQueueStatus;
};

export type HealthCardViewModel = {
  key: string;
  label: string;
  status: "ready" | "warning" | "danger";
  detail: string;
};

export type HealthSummaryViewModel = {
  generatedAt: string;
  cards: HealthCardViewModel[];
};

export type RunGroupViewModel = {
  id: string;
  pageName: string;
  runMode: string;
  status: string;
  publishIntent: string;
  promptVersion: string;
  promptHash: string;
  configVersionId: string;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  childRuns: RunSummaryViewModel[];
};

export type RunAnalysisMetricsViewModel = {
  analysisRunId: string;
  status: string;
  unitCountPlanned: number;
  unitCountSucceeded: number;
  unitCountUnknown: number;
  unitCountFailed: number;
  totalCostMicros: number;
  promptHash: string;
  promptVersion: string;
  taxonomyVersionId: string;
  outputSchemaVersion: string;
  resumed: boolean;
  skippedThreadDayIds: string[];
};

export type RunMartMetricsViewModel = {
  materialized: boolean;
  analysisRunId: string;
  factThreadDayCount: number;
  factStaffThreadDayCount: number;
  promptHash: string;
  promptVersion: string;
  configVersionId: string;
  configVersionNo: number;
  taxonomyVersionId: string;
  taxonomyVersionCode: string;
};

export type RunDetailViewModel = {
  run: RunSummaryViewModel;
  threadCount: number;
  threadDayCount: number;
  messageCount: number;
  coveredThreadIds: string[];
  analysisMetrics: RunAnalysisMetricsViewModel | null;
  martMetrics: RunMartMetricsViewModel | null;
  publishWarning: string | null;
  errorText: string | null;
};

export type PublishRunInput = {
  publishAs: "official" | "provisional";
  confirmHistoricalOverwrite: boolean;
  expectedReplacedRunId: string | null;
};

export type CreateConfigVersionInput = {
  promptText: string;
  tagMappingJson: unknown;
  openingRulesJson: unknown;
  schedulerJson: unknown;
  notificationTargetsJson: unknown;
  notes: string | null;
  activate: boolean;
  etlEnabled: boolean;
  analysisEnabled: boolean;
};

export type RegisterPageInput = {
  pancakePageId: string;
  userAccessToken: string;
  businessTimezone: string;
  tagMappingJson?: unknown;
  openingRulesJson?: unknown;
  schedulerJson?: unknown;
  notificationTargetsJson?: unknown;
  promptText?: string | null;
  analysisTaxonomyVersionId?: string;
  notes?: string | null;
  activate?: boolean;
  etlEnabled: boolean;
  analysisEnabled: boolean;
};

export type OnboardingSamplePreviewInput = {
  pancakePageId: string;
  userAccessToken: string;
  pageName: string;
  businessTimezone: string;
  tagMappingJson: unknown;
  openingRulesJson: unknown;
  schedulerJson: unknown;
  sampleConversationLimit: number;
};

export type PromptWorkspaceSampleInput = {
  tagMappingJson: unknown;
  openingRulesJson: unknown;
  schedulerJson: unknown;
  sampleConversationLimit: number;
};

export type PromptPreviewArtifactInput = {
  draftPromptText: string;
  sampleWorkspaceKey: string;
  selectedConversationId: string;
};

export type ManualRunInput = {
  connectedPageId: string;
  processingMode: "etl_only" | "etl_and_ai";
  targetDate?: string;
  requestedWindowStartAt?: string;
  requestedWindowEndExclusiveAt?: string;
};

export interface BusinessAdapter {
  loadCatalog(): Promise<BusinessCatalog>;
  getOverview(filters: BusinessFilters): Promise<OverviewViewModel>;
  getExploration(filters: BusinessFilters): Promise<ExplorationViewModel>;
  getStaffPerformance(filters: BusinessFilters): Promise<StaffPerformanceViewModel>;
  getThreadHistory(
    filters: BusinessFilters,
    threadId: string | null,
    threadDayId: string | null,
    tab: ThreadHistoryViewModel["activeTab"]
  ): Promise<ThreadHistoryViewModel>;
  getPageComparison(filters: BusinessFilters, comparePageIds: string[]): Promise<PageComparisonViewModel>;
  getExportWorkbook(input: ExportRequestInput): Promise<ExportWorkbookViewModel>;
}

export interface ControlPlaneAdapter {
  listPagesFromToken(userAccessToken: string): Promise<OnboardingPageCandidate[]>;
  registerPage(input: RegisterPageInput): Promise<ConnectedPageDetailViewModel>;
  previewOnboardingSample(input: OnboardingSamplePreviewInput): Promise<OnboardingSamplePreviewViewModel>;
  previewPromptWorkspaceSample(pageId: string, input: PromptWorkspaceSampleInput): Promise<PromptWorkspaceSampleViewModel>;
  previewPromptArtifacts(pageId: string, input: PromptPreviewArtifactInput): Promise<PromptPreviewComparisonViewModel>;
  listConnectedPages(): Promise<ConnectedPageSummary[]>;
  getConnectedPage(pageId: string): Promise<ConnectedPageDetailViewModel>;
  createConfigVersion(pageId: string, input: CreateConfigVersionInput): Promise<ConnectedPageConfigVersion>;
  activateConfigVersion(pageId: string, configVersionId: string): Promise<ConnectedPageDetailViewModel>;
  previewManualRun(input: ManualRunInput): Promise<RunPreviewViewModel>;
  executeManualRun(input: ManualRunInput): Promise<RunGroupViewModel>;
  getRunGroup(runGroupId: string): Promise<RunGroupViewModel>;
  getRun(runId: string): Promise<RunDetailViewModel>;
  publishRun(runId: string, input: PublishRunInput): Promise<RunDetailViewModel>;
  getHealthSummary(): Promise<HealthSummaryViewModel>;
}
