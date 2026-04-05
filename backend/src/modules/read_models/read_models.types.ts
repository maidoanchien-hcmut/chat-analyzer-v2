import type { Prisma } from "@prisma/client";

export type PublishChannel = "official" | "provisional";

export type MartAnalysisResultRecord = {
  threadDayId: string;
  promptHash: string;
  resultStatus: string;
  openingThemeCode: string;
  openingThemeReason: string | null;
  customerMoodCode: string;
  primaryNeedCode: string;
  primaryTopicCode: string;
  journeyCode: string;
  closingOutcomeInferenceCode: string;
  processRiskLevelCode: string;
  processRiskReasonText: string | null;
  staffAssessmentsJson: Prisma.JsonValue;
  fieldExplanationsJson: Prisma.JsonValue;
  costMicros: bigint;
};

export type MartAnalysisRunRecord = {
  id: string;
  status: string;
  modelName: string;
  promptHash: string;
  promptVersion: string;
  outputSchemaVersion: string;
  createdAt: Date;
  analysisResults: MartAnalysisResultRecord[];
};

export type MartThreadDayRecord = {
  id: string;
  threadId: string;
  isNewInbox: boolean;
  entrySourceType: string | null;
  entryPostId: string | null;
  entryAdId: string | null;
  messageCount: number;
  firstStaffResponseSeconds: number | null;
  avgStaffResponseSeconds: number | null;
  staffParticipantsJson: Prisma.JsonValue;
  staffMessageStatsJson: Prisma.JsonValue;
  explicitRevisitSignal: string | null;
  firstMeaningfulMessageTextRedacted: string | null;
};

export type MartMaterializationSource = {
  pipelineRun: {
    id: string;
    targetDate: Date;
    windowStartAt: Date;
    windowEndExclusiveAt: Date;
    isFullDay: boolean;
    publishEligibility: string;
    runGroup: {
      id: string;
      frozenConfigVersionId: string;
      frozenTaxonomyVersionId: string;
      frozenCompiledPromptHash: string;
      frozenPromptVersion: string;
      frozenConfigVersion: {
        id: string;
        versionNo: number;
        promptText: string;
        connectedPage: {
          id: string;
          pageName: string;
          pancakePageId: string;
          businessTimezone: string;
        };
        analysisTaxonomyVersion: {
          id: string;
          versionCode: string;
          taxonomyJson: Prisma.JsonValue;
        };
      };
    };
    analysisRuns: MartAnalysisRunRecord[];
    threadDays: MartThreadDayRecord[];
  };
};

export type DimDateRowInput = {
  dateKey: number;
  fullDate: Date;
  dayOfWeek: number;
  monthNo: number;
  yearNo: number;
};

export type DimPageRowInput = {
  connectedPageId: string;
  pageName: string;
  pancakePageId: string;
  businessTimezone: string;
};

export type DimStaffRowInput = {
  connectedPageId: string;
  staffName: string;
  displayLabel: string;
};

export type FactThreadDayRowInput = {
  pipelineRunId: string;
  analysisRunId: string;
  configVersionId: string;
  taxonomyVersionId: string;
  dateKey: number;
  threadDayId: string;
  threadId: string;
  isNewInbox: boolean;
  officialRevisitLabel: string;
  openingThemeCode: string;
  primaryNeedCode: string;
  primaryTopicCode: string;
  officialClosingOutcomeCode: string;
  customerMoodCode: string;
  processRiskLevelCode: string;
  entrySourceType: string | null;
  entryPostId: string | null;
  entryAdId: string | null;
  threadCount: number;
  messageCount: number;
  firstStaffResponseSeconds: number | null;
  avgStaffResponseSeconds: number | null;
  aiCostMicros: bigint;
  promptHash: string;
  promptVersion: string;
  modelName: string;
  outputSchemaVersion: string;
  taxonomyVersionCode: string;
  analysisExplanationJson: Record<string, unknown>;
  firstMeaningfulMessageTextRedacted: string | null;
};

export type FactStaffThreadDayRowInput = {
  pipelineRunId: string;
  analysisRunId: string;
  configVersionId: string;
  taxonomyVersionId: string;
  dateKey: number;
  threadDayId: string;
  threadId: string;
  staffName: string;
  displayLabel: string;
  primaryNeedCode: string;
  processRiskLevelCode: string;
  responseQualityCode: string;
  staffMessageCount: number;
  staffFirstResponseSecondsIfOwner: number | null;
  aiCostAllocatedMicros: bigint;
  responseQualityIssueText: string | null;
  responseQualityImprovementText: string | null;
  promptHash: string;
  promptVersion: string;
  modelName: string;
  outputSchemaVersion: string;
  taxonomyVersionCode: string;
};

export type MartMaterialization = {
  pipelineRunId: string;
  analysisRunId: string;
  connectedPageId: string;
  targetDate: Date;
  publishEligibility: string;
  windowStartAt: Date;
  windowEndExclusiveAt: Date;
  isFullDay: boolean;
  promptHash: string;
  promptVersion: string;
  configVersionId: string;
  configVersionNo: number;
  taxonomyVersionId: string;
  taxonomyVersionCode: string;
  dimDate: DimDateRowInput;
  dimPage: DimPageRowInput;
  dimStaff: DimStaffRowInput[];
  factThreadDays: FactThreadDayRowInput[];
  factStaffThreadDays: FactStaffThreadDayRowInput[];
};

export type ActiveSnapshotRecord = {
  pipelineRunId: string;
  connectedPageId: string;
  pageKey: string;
  targetDateKey: number;
  publishChannel: PublishChannel;
  configVersionId: string;
  taxonomyVersionId: string;
  promptHash: string;
  promptVersion: string;
  taxonomyVersionCode: string;
  windowStartAt: Date;
  windowEndExclusiveAt: Date;
  isFullDay: boolean;
  publishedAt: Date;
  replacedRunIds: string[];
};

export type ReadModelFilterInput = {
  pageId: string;
  startDate: string;
  endDate: string;
  publishSnapshot: "official" | "provisional";
  inboxBucket: "all" | "new" | "old";
  revisit: "all" | "revisit" | "not_revisit";
  need: string;
  outcome: string;
  risk: string;
  staff: string;
};

export type ExportWorkbookRequest = {
  pageId: string;
  startDate: string;
  endDate: string;
};

export type ResolvedSnapshotRow = {
  pipelineRunId: string;
  connectedPageId: string;
  pageName: string;
  pancakePageId: string;
  businessTimezone: string;
  targetDate: string;
  publishChannel: PublishChannel;
  promptHash: string;
  promptVersion: string;
  configVersionId: string;
  configVersionNo: number;
  taxonomyVersionId: string;
  taxonomyVersionCode: string;
  taxonomyJson: unknown;
  windowStartAt: Date;
  windowEndExclusiveAt: Date;
  isFullDay: boolean;
  publishedAt: Date;
};

export type SnapshotDescriptorView = {
  kind: "published_official" | "published_provisional";
  label: string;
  coverage: string;
  promptVersion: string;
  configVersion: string;
  taxonomyVersion: string;
};

export type WarningView = {
  title: string;
  body: string;
  tone: "warning" | "info" | "danger";
};

export type SliceResolution = {
  pageId: string;
  pageName: string;
  businessTimezone: string;
  snapshots: ResolvedSnapshotRow[];
  snapshot: SnapshotDescriptorView;
  warning: WarningView | null;
  mixedVersion: boolean;
};
