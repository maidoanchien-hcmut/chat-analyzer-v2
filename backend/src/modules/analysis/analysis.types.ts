import { z } from "zod";

export const analysisRunModeSchema = z.enum(["scheduled_daily", "manual_day", "manual_slice"]);

export const executeAnalysisRunBodySchema = z
  .object({
    connected_page_id: z.string().uuid().optional(),
    source_etl_run_id: z.string().uuid().optional(),
    target_date: z.string().optional(),
    run_mode: analysisRunModeSchema.default("manual_day"),
    publish: z.boolean().optional(),
    created_by_user_id: z.number().int().positive().optional()
  })
  .superRefine((raw, ctx) => {
    if (!raw.source_etl_run_id && !(raw.connected_page_id && raw.target_date)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "source_etl_run_id hoặc cặp connected_page_id + target_date là bắt buộc"
      });
    }
  })
  .transform((raw) => ({
    connectedPageId: raw.connected_page_id ?? null,
    sourceEtlRunId: raw.source_etl_run_id ?? null,
    targetDate: raw.target_date ?? null,
    runMode: raw.run_mode,
    publish: raw.publish ?? raw.run_mode !== "manual_slice",
    createdByUserId: raw.created_by_user_id ?? null
  }));

export type ExecuteAnalysisRunBody = z.infer<typeof executeAnalysisRunBodySchema>;

export type AnalysisUnitMessage = {
  id: string;
  insertedAt: Date;
  senderRole: string;
  senderName: string | null;
  messageType: string;
  redactedText: string | null;
  isMeaningfulHumanMessage: boolean;
  isOpeningBlockMessage: boolean;
};

export type AnalysisUnitBundle = {
  conversationDayId: string;
  conversationId: string;
  connectedPageId: string;
  etlRunId: string;
  runGroupId: string;
  targetDate: string;
  businessTimezone: string;
  customerDisplayName: string | null;
  normalizedTagSignalsJson: unknown;
  observedTagsJson: unknown;
  openingBlocksJson: unknown;
  firstMeaningfulHumanMessageId: string | null;
  firstMeaningfulHumanSenderRole: string | null;
  sourceConversationJsonRedacted: unknown;
  messages: AnalysisUnitMessage[];
};

export type AnalysisRuntimeSnapshot = {
  profileId: string;
  versionNo: number;
  modelName: string;
  outputSchemaVersion: string;
  promptTemplate: string;
  generationConfig: Record<string, unknown>;
  profileJson: unknown;
};

export type AnalysisUnitResult = {
  conversationDayId: string;
  resultStatus: "succeeded" | "unknown";
  promptHash: string;
  openingTheme: string;
  customerMood: string;
  primaryNeed: string;
  primaryTopic: string;
  contentCustomerType: string;
  closingOutcomeAsOfDay: string;
  responseQualityLabel: string;
  processRiskLevel: string;
  responseQualityIssueText: string | null;
  responseQualityImprovementText: string | null;
  processRiskReasonText: string | null;
  usageJson: Record<string, unknown>;
  costMicros: bigint;
  failureInfoJson: Record<string, unknown> | null;
};
