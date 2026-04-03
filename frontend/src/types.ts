export type View = "onboarding" | "dashboard" | "exploratory" | "history" | "comparison" | "settings";
export type ProcessingMode = "etl_only" | "etl_and_ai";
export type SortBy = "latest_message" | "target_date" | "messages" | "cost";
export type SortOrder = "asc" | "desc";
export type RunMode = "full_day" | "custom_range";
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export type ConnectedPageLite = {
  id: string;
  pageName: string;
  businessTimezone: string;
  etlEnabled: boolean;
  analysisEnabled: boolean;
  activeTagMappingJson: unknown;
  activeOpeningRulesJson: unknown;
};

export type ThreadSummary = {
  threadId: string;
  customerDisplayName: string | null;
  dayCount: number;
  totalMessages: number;
  totalCostMicros: string;
  latestTargetDate?: string;
  latestMessageAt: string | null;
  latestPrimaryNeed: string;
  latestCustomerMood: string;
  latestCustomerType?: string;
  latestRiskLevel: string;
  latestClosingOutcome?: string;
  latestOpeningTheme?: string;
  latestResponseQualityLabel?: string;
  latestProcessRiskReasonText?: string | null;
};

export type DashboardData = {
  kpis: {
    totalInbox: number;
    totalInboxNew: number;
    totalInboxOld: number;
    revisitCount: number;
    goodMoodCount: number;
    riskCount: number;
    totalMessages: number;
    totalAiCostMicros: string;
    conversionRate: number;
    conversionNumerator: number;
    conversionDenominator: number;
  };
  breakdown: Array<{ value: string; count: number }>;
  latestThreads: ThreadSummary[];
};

export type ThreadsData = {
  threads: ThreadSummary[];
  paging?: { total: number; offset: number; limit: number };
  sort?: { by: SortBy; order: SortOrder };
};

export type ThreadDetail = {
  thread: ThreadSummary;
  days: Array<{
    targetDate: string;
    runGroupId: string;
    messageCount: number;
    costMicros: string;
    primaryNeed: string;
    customerMood: string;
    contentCustomerType: string;
    processRiskLevel: string;
  }>;
  messages: Array<{
    insertedAt: string;
    targetDate: string;
    senderRole: string;
    senderName: string | null;
    messageType: string;
    redactedText: string | null;
  }>;
};

export type ComparisonData = {
  pages: Array<{
    connectedPageId: string;
    pageName: string;
    kpis: DashboardData["kpis"];
  }>;
};

export type RunGroupSummary = {
  runGroupId: string;
  runMode: string;
  status: string;
  childRunCount: number;
  publishedChildCount: number;
  targetDateStart: string | null;
  targetDateEnd: string | null;
};

export type RunGroupThread = {
  threadId: string;
  customerDisplayName: string | null;
  dayCount: number;
  totalMessages: number;
  totalCostMicros: string;
  latestPrimaryNeed: string;
  latestCustomerMood: string;
  latestRiskLevel: string;
};

export type MappingReviewItem = {
  id: string;
  runGroupId: string;
  threadId: string;
  decisionStatus: string;
  confidenceScore: number | null;
  selectedCustomerId: string | null;
  createdAt: string;
};

export type HealthSummary = {
  totals: {
    running: number;
    loaded: number;
    published: number;
    failed: number;
  };
};

export type OnboardingSample = {
  pageId: string;
  pageName: string;
  targetDate: string;
  businessTimezone: string;
  processingMode: ProcessingMode;
  initialConversationLimit: number;
  windowStartAt: string;
  windowEndExclusiveAt: string;
  metrics: Record<string, unknown>;
  tagCandidates: Array<{ pancakeTagId: string; text: string; count: number; isDeactive?: boolean }>;
  openingCandidates: {
    topOpeningCandidateWindows: Array<{ signature: string[]; count: number; exampleConversationIds?: string[] }>;
    unmatchedOpeningTexts: Array<{ text: string; count: number; exampleConversationIds?: string[] }>;
    matchedOpeningSelections?: Array<{ signal: string; rawText: string; decision: string; count: number; exampleConversationIds?: string[] }>;
  };
};

export type OnboardingTagCandidate = {
  pancakeTagId: string;
  rawLabel: string;
  count: number;
  signal: string;
};

export type OnboardingOpeningCandidate = {
  rawText: string;
  count: number;
  signal: string;
  decision: string;
  exampleConversationIds?: string[];
};

export type AppState = {
  apiBaseUrl: string;
  loading: string | null;
  error: string | null;
  info: string | null;
  view: View;
  pages: ConnectedPageLite[];
  pageId: string;
  startDate: string;
  endDate: string;
  mood: string;
  need: string;
  customerType: string;
  risk: string;
  dashboard: DashboardData | null;
  exploratory: ThreadsData | null;
  historyThreads: ThreadSummary[];
  historyThreadId: string;
  historyDetail: ThreadDetail | null;
  comparison: ComparisonData | null;
  search: string;
  minMessages: string;
  sortBy: SortBy;
  sortOrder: SortOrder;
  runGroups: RunGroupSummary[];
  selectedRunGroupId: string;
  runGroupThreads: RunGroupThread[];
  mappingReview: MappingReviewItem[];
  health: HealthSummary | null;
  settingTimezone: string;
  settingEtlEnabled: boolean;
  settingAnalysisEnabled: boolean;
  settingTagRulesText: string;
  settingOpeningRulesText: string;
  settingPrompt: string;
  activePrompt: string;
  runProcessingMode: ProcessingMode;
  runMode: RunMode;
  runTargetDate: string;
  runWindowStart: string;
  runWindowEnd: string;
  runMaxConversations: string;
  runMaxMessagePages: string;
  onboardingToken: string;
  onboardingPages: Array<{ pageId: string; pageName: string }>;
  onboardingPageId: string;
  onboardingTimezone: string;
  onboardingLimit: string;
  onboardingMode: ProcessingMode;
  onboardingEtlEnabled: boolean;
  onboardingAnalysisEnabled: boolean;
  onboardingTagCandidates: OnboardingTagCandidate[];
  onboardingOpeningCandidates: OnboardingOpeningCandidate[];
  onboardingOpeningMaxMessages: string;
  onboardingPrompt: string;
  onboardingSample: OnboardingSample | null;
};
