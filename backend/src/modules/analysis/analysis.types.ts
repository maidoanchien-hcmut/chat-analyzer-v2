export type AnalysisRuntimeSnapshot = {
  profileId: string;
  versionNo: number;
  modelName: string;
  promptVersion: string;
  outputSchemaVersion: string;
  pagePromptHash: string;
  configVersionId: string;
  taxonomyVersionId: string;
  taxonomyVersionCode: string;
  connectedPageId: string;
  pagePromptText: string;
  taxonomyJson: unknown;
  generationConfig: Record<string, unknown>;
  profileJson: Record<string, unknown>;
};

export type AnalysisMessageBundle = {
  id: string;
  insertedAt: string;
  senderRole: string;
  senderName: string | null;
  messageType: string;
  redactedText: string | null;
  isMeaningfulHumanMessage: boolean;
  isOpeningBlockMessage: boolean;
};

export type AnalysisUnitBundle = {
  threadDayId: string;
  threadId: string;
  connectedPageId: string;
  pipelineRunId: string;
  runGroupId: string;
  targetDate: string;
  businessTimezone: string;
  customerDisplayName: string | null;
  normalizedTagSignalsJson: unknown;
  observedTagsJson: unknown;
  openingBlockJson: unknown;
  firstMeaningfulMessageId: string | null;
  firstMeaningfulMessageTextRedacted: string | null;
  firstMeaningfulMessageSenderRole: string | null;
  explicitRevisitSignal: string | null;
  explicitNeedSignal: string | null;
  explicitOutcomeSignal: string | null;
  sourceThreadJsonRedacted: unknown;
  messageCount: number;
  firstStaffResponseSeconds: number | null;
  avgStaffResponseSeconds: number | null;
  staffParticipantsJson: unknown;
  staffMessageStatsJson: unknown;
  messages: AnalysisMessageBundle[];
};

export type AnalysisUnitEnvelope = {
  evidenceHash: string;
  bundle: AnalysisUnitBundle;
};

export type AnalysisStaffAssessment = {
  staff_name: string | null;
  response_quality_code: string;
  issue_text: string | null;
  improvement_text: string | null;
};

export type ConversationAnalysisRequest = {
  runtime: AnalysisRuntimeSnapshot;
  bundles: AnalysisUnitBundle[];
};

export type ConversationAnalysisResponse = {
  results: ConversationAnalysisResult[];
  runtimeMetadataJson: Record<string, unknown>;
};

export type ConversationAnalysisResult = {
  threadDayId: string;
  resultStatus: string;
  promptHash: string;
  openingThemeCode: string;
  openingThemeReason: string | null;
  customerMoodCode: string;
  primaryNeedCode: string;
  primaryTopicCode: string;
  journeyCode: string;
  closingOutcomeInferenceCode: string;
  processRiskLevelCode: string;
  processRiskReasonText: string | null;
  staffAssessmentsJson: AnalysisStaffAssessment[];
  evidenceUsedJson: Record<string, unknown>;
  fieldExplanationsJson: Record<string, unknown>;
  supportingMessageIdsJson: string[];
  usageJson: Record<string, unknown>;
  costMicros: number;
  failureInfoJson: Record<string, unknown> | null;
};

export type PersistedAnalysisResultInput = ConversationAnalysisResult & {
  analysisRunId: string;
  evidenceHash: string;
};

export type AnalysisExecutionSummary = {
  pipelineRunId: string;
  analysisRunId: string;
  status: string;
  unitCountPlanned: number;
  unitCountSucceeded: number;
  unitCountUnknown: number;
  unitCountFailed: number;
  totalCostMicros: number;
  totalUsageJson: Record<string, unknown>;
  promptHash: string;
  promptVersion: string;
  taxonomyVersionId: string;
  outputSchemaVersion: string;
  runtimeSnapshotJson: Record<string, unknown>;
  resumed: boolean;
  skippedThreadDayIds: string[];
};

export type AnalysisRunIdentity = {
  pipelineRunId: string;
  configVersionId: string;
  taxonomyVersionId: string;
  modelName: string;
  promptHash: string;
  promptVersion: string;
  outputSchemaVersion: string;
  runtimeProfileId: string;
  runtimeProfileVersion: number;
};
