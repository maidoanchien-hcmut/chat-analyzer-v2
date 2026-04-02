import { z } from "zod";

export const processingModeSchema = z.enum(["etl_only", "etl_and_ai"]);

export const botSignatureSchema = z.object({
  name: z.string().min(1),
  admin_name_contains: z.string().default(""),
  app_id: z.number().int().optional(),
  flow_id: z.number().int().optional()
});

export const tagRuleSchema = z.object({
  name: z.string().min(1),
  match_any_text: z.array(z.string().min(1)).min(1),
  signals: z.record(z.string(), z.any()),
  noise: z.boolean().optional()
});

export const openingRuleSchema = z.object({
  name: z.string().min(1),
  match_any_text: z.array(z.string().min(1)).min(1),
  signals: z.record(z.string(), z.any())
});

export const customerDirectoryEntrySchema = z.object({
  customer_id: z.string().min(1),
  phone_e164: z.string().min(1)
});

export const listPagesBodySchema = z.object({
  user_access_token: z.string().min(1)
});

export const registerPageBodySchema = z
  .object({
    pancake_page_id: z.string().min(1),
    user_access_token: z.string().min(1),
    business_timezone: z.string().min(1).default("Asia/Ho_Chi_Minh"),
    auto_scraper_enabled: z.boolean().default(false),
    auto_ai_analysis_enabled: z.boolean().default(false)
  })
  .transform((raw) => ({
    pancakePageId: raw.pancake_page_id,
    userAccessToken: raw.user_access_token,
    businessTimezone: raw.business_timezone,
    autoScraperEnabled: raw.auto_scraper_enabled,
    autoAiAnalysisEnabled: raw.auto_ai_analysis_enabled
  }));

export const updateConnectedPageBodySchema = z
  .object({
    business_timezone: z.string().min(1).optional(),
    auto_scraper_enabled: z.boolean().optional(),
    auto_ai_analysis_enabled: z.boolean().optional(),
    active_tag_mapping_json: z.array(tagRuleSchema).optional(),
    active_opening_rules_json: z.array(openingRuleSchema).optional(),
    active_bot_signatures_json: z.array(botSignatureSchema).optional(),
    is_active: z.boolean().optional()
  })
  .refine((raw) => Object.keys(raw).length > 0, {
    message: "At least one page config field must be provided."
  })
  .transform((raw) => ({
    businessTimezone: raw.business_timezone,
    autoScraperEnabled: raw.auto_scraper_enabled,
    autoAiAnalysisEnabled: raw.auto_ai_analysis_enabled,
    activeTagMappingJson: raw.active_tag_mapping_json,
    activeOpeningRulesJson: raw.active_opening_rules_json,
    activeBotSignaturesJson: raw.active_bot_signatures_json,
    isActive: raw.is_active
  }));

export const createPromptVersionBodySchema = z
  .object({
    prompt_text: z.string().min(1),
    notes: z.string().trim().optional()
  })
  .transform((raw) => ({
    promptText: raw.prompt_text,
    notes: normalizeOptionalText(raw.notes)
  }));

export const clonePromptVersionBodySchema = z
  .object({
    source_page_id: z.string().min(1),
    notes: z.string().trim().optional()
  })
  .transform((raw) => ({
    sourcePageId: raw.source_page_id,
    notes: normalizeOptionalText(raw.notes)
  }));

export const onboardingJobBodySchema = z
  .object({
    job_name: z.string().min(1).default("onboarding-sample"),
    target_date: z.string().min(1),
    processing_mode: processingModeSchema.default("etl_only"),
    initial_conversation_limit: z.number().int().positive(),
    snapshot_version: z.number().int().positive().optional(),
    requested_window_start_at: z.string().optional(),
    requested_window_end_exclusive_at: z.string().optional(),
    window_start_at: z.string().optional(),
    window_end_exclusive_at: z.string().optional(),
    max_message_pages_per_conversation: z.number().int().min(0).optional()
  })
  .transform((raw) => ({
    jobName: raw.job_name,
    targetDate: raw.target_date,
    processingMode: raw.processing_mode,
    initialConversationLimit: raw.initial_conversation_limit,
    snapshotVersion: raw.snapshot_version ?? null,
    requestedWindowStartAt: raw.requested_window_start_at ?? null,
    requestedWindowEndExclusiveAt: raw.requested_window_end_exclusive_at ?? null,
    windowStartAt: raw.window_start_at ?? null,
    windowEndExclusiveAt: raw.window_end_exclusive_at ?? null,
    maxMessagePagesPerConversation: raw.max_message_pages_per_conversation ?? 0
  }));

export const manualJobBodySchema = z
  .object({
    job_name: z.string().min(1).default("manual-run"),
    processing_mode: processingModeSchema.default("etl_only"),
    target_date: z.string().optional(),
    run_mode: z.enum(["manual_range", "backfill_day"]).optional(),
    requested_window_start_at: z.string().optional(),
    requested_window_end_exclusive_at: z.string().optional(),
    publish: z.boolean().optional(),
    snapshot_version: z.number().int().positive().optional(),
    run_group_id: z.string().optional(),
    window_start_at: z.string().optional(),
    window_end_exclusive_at: z.string().optional(),
    max_conversations: z.number().int().min(0).optional(),
    max_message_pages_per_conversation: z.number().int().min(0).optional()
  })
  .superRefine((raw, ctx) => {
    const hasDay = typeof raw.target_date === "string";
    const hasRange = typeof raw.requested_window_start_at === "string" || typeof raw.requested_window_end_exclusive_at === "string";
    const isMaterializedRun = typeof raw.run_mode === "string";

    if (!hasDay && !(raw.requested_window_start_at && raw.requested_window_end_exclusive_at)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "manual job must provide target_date or both requested_window_* fields"
      });
    }

    if (hasDay && hasRange && !isMaterializedRun) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "manual job cannot provide target_date together with requested_window_* fields"
      });
    }
  })
  .transform((raw) => ({
    jobName: raw.job_name,
    processingMode: raw.processing_mode,
    runMode: raw.run_mode ?? null,
    targetDate: raw.target_date ?? null,
    requestedWindowStartAt: raw.requested_window_start_at ?? null,
    requestedWindowEndExclusiveAt: raw.requested_window_end_exclusive_at ?? null,
    publish: raw.publish ?? false,
    runGroupId: raw.run_group_id ?? null,
    snapshotVersion: raw.snapshot_version ?? null,
    windowStartAt: raw.window_start_at ?? null,
    windowEndExclusiveAt: raw.window_end_exclusive_at ?? null,
    maxConversations: raw.max_conversations ?? 0,
    maxMessagePagesPerConversation: raw.max_message_pages_per_conversation ?? 0
  }));

export const schedulerJobBodySchema = z
  .object({
    job_name: z.string().min(1).default("scheduled-daily"),
    target_date: z.string().min(1),
    processing_mode: processingModeSchema.default("etl_only"),
    snapshot_version: z.number().int().positive().optional(),
    is_published: z.boolean().optional(),
    max_conversations: z.number().int().min(0).optional(),
    max_message_pages_per_conversation: z.number().int().min(0).optional()
  })
  .transform((raw) => ({
    jobName: raw.job_name,
    targetDate: raw.target_date,
    processingMode: raw.processing_mode,
    snapshotVersion: raw.snapshot_version ?? null,
    isPublished: raw.is_published ?? true,
    maxConversations: raw.max_conversations ?? 0,
    maxMessagePagesPerConversation: raw.max_message_pages_per_conversation ?? 0
  }));

export const previewJobBodySchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("manual"),
      connected_page_id: z.string().min(1),
      job: manualJobBodySchema
    })
    .transform((raw) => ({
      kind: "manual" as const,
      connectedPageId: raw.connected_page_id,
      job: raw.job
    })),
  z
    .object({
      kind: z.literal("onboarding"),
      connected_page_id: z.string().min(1),
      job: onboardingJobBodySchema
    })
    .transform((raw) => ({
      kind: "onboarding" as const,
      connectedPageId: raw.connected_page_id,
      job: raw.job
    })),
  z
    .object({
      kind: z.literal("scheduler"),
      job: schedulerJobBodySchema
    })
    .transform((raw) => ({
      kind: "scheduler" as const,
      job: raw.job
    }))
]);

export const executeJobBodySchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("manual"),
      connected_page_id: z.string().min(1),
      job: manualJobBodySchema,
      write_artifacts: z.boolean().default(false)
    })
    .transform((raw) => ({
      kind: "manual" as const,
      connectedPageId: raw.connected_page_id,
      job: raw.job,
      writeArtifacts: raw.write_artifacts
    })),
  z
    .object({
      kind: z.literal("onboarding"),
      connected_page_id: z.string().min(1),
      job: onboardingJobBodySchema,
      write_artifacts: z.boolean().default(true)
    })
    .transform((raw) => ({
      kind: "onboarding" as const,
      connectedPageId: raw.connected_page_id,
      job: raw.job,
      writeArtifacts: raw.write_artifacts
    })),
  z
    .object({
      kind: z.literal("scheduler"),
      job: schedulerJobBodySchema,
      write_artifacts: z.boolean().default(false)
    })
    .transform((raw) => ({
      kind: "scheduler" as const,
      job: raw.job,
      writeArtifacts: raw.write_artifacts
    }))
]);

export type ProcessingMode = z.infer<typeof processingModeSchema>;
export type TagRule = z.infer<typeof tagRuleSchema>;
export type OpeningRule = z.infer<typeof openingRuleSchema>;
export type CustomerDirectoryEntry = z.infer<typeof customerDirectoryEntrySchema>;
export type BotSignature = z.infer<typeof botSignatureSchema>;
export type RegisterPageBody = z.infer<typeof registerPageBodySchema>;
export type UpdateConnectedPageBody = z.infer<typeof updateConnectedPageBodySchema>;
export type CreatePromptVersionBody = z.infer<typeof createPromptVersionBodySchema>;
export type ClonePromptVersionBody = z.infer<typeof clonePromptVersionBodySchema>;
export type ManualJobBody = z.infer<typeof manualJobBodySchema>;
export type OnboardingJobBody = z.infer<typeof onboardingJobBodySchema>;
export type SchedulerJobBody = z.infer<typeof schedulerJobBodySchema>;
export type PreviewJobBody = z.infer<typeof previewJobBodySchema>;
export type ExecuteJobBody = z.infer<typeof executeJobBodySchema>;

export type WorkerJob = {
  connected_page_id: string;
  processing_mode: ProcessingMode;
  run_params_json: Record<string, unknown>;
  user_access_token: string;
  page_id: string;
  target_date: string;
  business_timezone: string;
  run_mode: "scheduled_daily" | "manual_range" | "backfill_day" | "onboarding_sample";
  run_group_id: string | null;
  snapshot_version: number;
  is_published: boolean;
  requested_window_start_at: string | null;
  requested_window_end_exclusive_at: string | null;
  window_start_at: string | null;
  window_end_exclusive_at: string | null;
  max_conversations: number;
  max_message_pages_per_conversation: number;
  tag_rules: TagRule[];
  opening_rules: OpeningRule[];
  customer_directory: CustomerDirectoryEntry[];
  bot_signatures: BotSignature[];
};

export type RunSlice = {
  targetDate: string;
  requestedWindowStartAt: string | null;
  requestedWindowEndExclusiveAt: string | null;
  windowStartAt: string | null;
  windowEndExclusiveAt: string | null;
  isFullDay: boolean;
};

export type JobPreview =
  | {
      kind: "manual";
      jobName: string;
      connectedPageId: string;
      pageName: string;
      workerJobs: WorkerJob[];
    }
  | {
      kind: "onboarding";
      jobName: string;
      connectedPageId: string;
      pageName: string;
      workerJobs: WorkerJob[];
    }
  | {
      kind: "scheduler";
      jobName: string;
      pageNames: string[];
      workerJobs: WorkerJob[];
    };

export function parseTagRules(value: unknown): TagRule[] {
  const parsed = z.array(tagRuleSchema).safeParse(value);
  return parsed.success ? parsed.data : [];
}

export function parseOpeningRules(value: unknown): OpeningRule[] {
  const parsed = z.array(openingRuleSchema).safeParse(value);
  return parsed.success ? parsed.data : [];
}

export function parseBotSignatures(value: unknown): BotSignature[] {
  const parsed = z.array(botSignatureSchema).safeParse(value);
  return parsed.success ? parsed.data : [];
}

function normalizeOptionalText(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
