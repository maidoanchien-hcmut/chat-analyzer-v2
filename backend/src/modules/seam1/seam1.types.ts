import { z } from "zod";

export const botSignatureSchema = z.object({
  name: z.string().min(1),
  admin_name_contains: z.string().default(""),
  app_id: z.number().int().optional(),
  flow_id: z.number().int().optional()
});

export const pageConfigFileSchema = z
  .object({
    organization_id: z.string().min(1).optional(),
    organization_key: z.string().min(1).optional(),
    page_slug: z.string().min(1).optional(),
    page_key: z.string().min(1).optional(),
    page_id: z.string().min(1),
    page_name: z.string().min(1),
    pancake_user_access_token: z.string().min(1).optional(),
    user_access_token: z.string().min(1).optional(),
    business_timezone: z.string().min(1),
    initial_conversation_limit: z.number().int().positive(),
    auto_scraper: z.boolean(),
    auto_ai_analysis: z.boolean(),
    tag_rules_file: z.string().optional(),
    opening_rules_file: z.string().optional(),
    customer_directory_file: z.string().optional(),
    bot_signatures_file: z.string().optional(),
    bot_signatures: z.array(botSignatureSchema).default([])
  })
  .superRefine((raw, ctx) => {
    if (!raw.organization_id && !raw.organization_key) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "organization_id or organization_key is required"
      });
    }
    if (!raw.page_slug && !raw.page_key) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "page_slug or page_key is required"
      });
    }
    if (!raw.pancake_user_access_token && !raw.user_access_token) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "pancake_user_access_token or user_access_token is required"
      });
    }
  })
  .transform((raw) => ({
    organizationId: raw.organization_id ?? raw.organization_key!,
    pageSlug: raw.page_slug ?? raw.page_key!,
    pageId: raw.page_id,
    pageName: raw.page_name,
    pancakeUserAccessToken: raw.pancake_user_access_token ?? raw.user_access_token!,
    businessTimezone: raw.business_timezone,
    initialConversationLimit: raw.initial_conversation_limit,
    autoScraper: raw.auto_scraper,
    autoAiAnalysis: raw.auto_ai_analysis,
    tagRulesFile: raw.tag_rules_file ?? null,
    openingRulesFile: raw.opening_rules_file ?? null,
    customerDirectoryFile: raw.customer_directory_file ?? null,
    botSignaturesFile: raw.bot_signatures_file ?? null,
    botSignatures: raw.bot_signatures
  }));

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

export const manualJobFileSchema = z
  .object({
    job_name: z.string().min(1),
    page_slug: z.string().min(1).optional(),
    page_key: z.string().min(1).optional(),
    mode: z.enum(["manual_extract"]).optional(),
    run_mode: z.enum(["manual_range", "backfill_day"]).optional(),
    target_date: z.string().optional(),
    requested_window_start_at: z.string().optional(),
    requested_window_end_exclusive_at: z.string().optional(),
    publish: z.boolean().optional(),
    is_published: z.boolean().optional(),
    run_group_id: z.string().optional(),
    snapshot_version: z.number().int().positive().optional(),
    window_start_at: z.string().optional(),
    window_end_exclusive_at: z.string().optional(),
    max_conversations: z.number().int().min(0).optional(),
    max_message_pages_per_conversation: z.number().int().min(0).optional()
  })
  .superRefine((raw, ctx) => {
    if (!raw.page_slug && !raw.page_key) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "page_slug or page_key is required"
      });
    }
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
    pageSlug: raw.page_slug ?? raw.page_key!,
    mode: raw.mode ?? "manual_extract",
    runMode: raw.run_mode ?? null,
    targetDate: raw.target_date ?? null,
    requestedWindowStartAt: raw.requested_window_start_at ?? null,
    requestedWindowEndExclusiveAt: raw.requested_window_end_exclusive_at ?? null,
    publish: raw.publish ?? raw.is_published ?? false,
    runGroupId: raw.run_group_id ?? null,
    snapshotVersion: raw.snapshot_version ?? null,
    windowStartAt: raw.window_start_at ?? null,
    windowEndExclusiveAt: raw.window_end_exclusive_at ?? null,
    maxConversations: raw.max_conversations ?? 0,
    maxMessagePagesPerConversation: raw.max_message_pages_per_conversation ?? 0
  }));

export const onboardingJobFileSchema = z
  .object({
    job_name: z.string().min(1),
    page_slug: z.string().min(1).optional(),
    page_key: z.string().min(1).optional(),
    mode: z.enum(["onboarding_sample"]).optional(),
    run_mode: z.enum(["onboarding_sample"]).optional(),
    target_date: z.string().min(1),
    publish: z.boolean().optional(),
    is_published: z.boolean().optional(),
    initial_conversation_limit_override: z.number().int().positive().optional(),
    snapshot_version: z.number().int().positive().optional(),
    requested_window_start_at: z.string().optional(),
    requested_window_end_exclusive_at: z.string().optional(),
    window_start_at: z.string().optional(),
    window_end_exclusive_at: z.string().optional(),
    max_conversations: z.number().int().min(0).optional(),
    max_message_pages_per_conversation: z.number().int().min(0).optional()
  })
  .transform((raw) => ({
    jobName: raw.job_name,
    pageSlug: raw.page_slug ?? raw.page_key!,
    mode: raw.mode ?? raw.run_mode ?? "onboarding_sample",
    targetDate: raw.target_date,
    publish: raw.publish ?? raw.is_published ?? false,
    initialConversationLimitOverride: raw.initial_conversation_limit_override ?? raw.max_conversations ?? null,
    snapshotVersion: raw.snapshot_version ?? null,
    requestedWindowStartAt: raw.requested_window_start_at ?? null,
    requestedWindowEndExclusiveAt: raw.requested_window_end_exclusive_at ?? null,
    windowStartAt: raw.window_start_at ?? null,
    windowEndExclusiveAt: raw.window_end_exclusive_at ?? null,
    maxMessagePagesPerConversation: raw.max_message_pages_per_conversation ?? 0
  }));

export const schedulerJobFileSchema = z
  .object({
    job_name: z.string().min(1),
    target_date: z.string().min(1),
    page_slugs: z.array(z.string().min(1)).min(1).optional(),
    page_keys: z.array(z.string().min(1)).min(1).optional(),
    page_key: z.string().min(1).optional(),
    run_mode: z.enum(["scheduled_daily"]).optional(),
    snapshot_version: z.number().int().positive().optional(),
    is_published: z.boolean().optional(),
    requested_window_start_at: z.string().optional(),
    requested_window_end_exclusive_at: z.string().optional(),
    window_start_at: z.string().optional(),
    window_end_exclusive_at: z.string().optional(),
    max_conversations: z.number().int().min(0).optional(),
    max_message_pages_per_conversation: z.number().int().min(0).optional()
  })
  .superRefine((raw, ctx) => {
    if (!raw.page_slugs && !raw.page_keys && !raw.page_key) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "page_slugs, page_keys, or page_key is required"
      });
    }
  })
  .transform((raw) => ({
    jobName: raw.job_name,
    targetDate: raw.target_date,
    pageSlugs: raw.page_slugs ?? raw.page_keys ?? [raw.page_key!],
    snapshotVersion: raw.snapshot_version ?? null,
    isPublished: raw.is_published ?? true,
    requestedWindowStartAt: raw.requested_window_start_at ?? null,
    requestedWindowEndExclusiveAt: raw.requested_window_end_exclusive_at ?? null,
    windowStartAt: raw.window_start_at ?? null,
    windowEndExclusiveAt: raw.window_end_exclusive_at ?? null,
    maxConversations: raw.max_conversations ?? 0,
    maxMessagePagesPerConversation: raw.max_message_pages_per_conversation ?? 0
  }));

export type PageConfig = z.infer<typeof pageConfigFileSchema>;
export type ManualJobFile = z.infer<typeof manualJobFileSchema>;
export type OnboardingJobFile = z.infer<typeof onboardingJobFileSchema>;
export type SchedulerJobFile = z.infer<typeof schedulerJobFileSchema>;
export type TagRule = z.infer<typeof tagRuleSchema>;
export type OpeningRule = z.infer<typeof openingRuleSchema>;
export type CustomerDirectoryEntry = z.infer<typeof customerDirectoryEntrySchema>;

export type WorkerJob = {
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
  bot_signatures: z.infer<typeof botSignatureSchema>[];
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
      pageSlug: string;
      workerJobs: WorkerJob[];
    }
  | {
      kind: "onboarding";
      jobName: string;
      pageSlug: string;
      workerJobs: WorkerJob[];
    }
  | {
      kind: "scheduler";
      jobName: string;
      pageSlugs: string[];
      workerJobs: WorkerJob[];
    };
