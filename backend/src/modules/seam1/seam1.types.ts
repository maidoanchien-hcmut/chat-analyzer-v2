import { z } from "zod";

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

export const pageConfigSchema = z
  .object({
    organization_id: z.string().min(1).default("default"),
    page_slug: z.string().min(1),
    page_id: z.string().min(1),
    page_name: z.string().min(1),
    user_access_token: z.string().min(1),
    business_timezone: z.string().min(1),
    initial_conversation_limit: z.number().int().positive(),
    auto_scraper: z.boolean(),
    auto_ai_analysis: z.boolean(),
    bot_signatures: z.array(botSignatureSchema).default([])
  })
  .transform((raw) => ({
    organizationId: raw.organization_id,
    pageSlug: raw.page_slug,
    pageId: raw.page_id,
    pageName: raw.page_name,
    pancakeUserAccessToken: raw.user_access_token,
    businessTimezone: raw.business_timezone,
    initialConversationLimit: raw.initial_conversation_limit,
    autoScraper: raw.auto_scraper,
    autoAiAnalysis: raw.auto_ai_analysis,
    botSignatures: raw.bot_signatures
  }));

export const pageBundleSchema = z
  .object({
    page: pageConfigSchema,
    tag_rules: z.array(tagRuleSchema).default([]),
    opening_rules: z.array(openingRuleSchema).default([]),
    customer_directory: z.array(customerDirectoryEntrySchema).default([]),
    bot_signatures: z.array(botSignatureSchema).default([])
  })
  .transform((raw) => ({
    page: raw.page,
    tagRules: raw.tag_rules,
    openingRules: raw.opening_rules,
    customerDirectory: raw.customer_directory,
    botSignatures: raw.bot_signatures
  }));

export const listPagesBodySchema = z.object({
  user_access_token: z.string().min(1)
});

export const registerPageBodySchema = z.object({
  organization_id: z.string().min(1).default("default"),
  page_slug: z.string().min(1),
  user_access_token: z.string().min(1),
  page_id: z.string().min(1),
  business_timezone: z.string().min(1),
  initial_conversation_limit: z.number().int().positive().default(25),
  auto_scraper: z.boolean().default(false),
  auto_ai_analysis: z.boolean().default(false)
});

export const manualJobBodySchema = z
  .object({
    job_name: z.string().min(1),
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

export const onboardingJobBodySchema = z
  .object({
    job_name: z.string().min(1),
    target_date: z.string().min(1),
    publish: z.boolean().optional(),
    initial_conversation_limit_override: z.number().int().positive().optional(),
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
    publish: raw.publish ?? false,
    initialConversationLimitOverride: raw.initial_conversation_limit_override ?? null,
    snapshotVersion: raw.snapshot_version ?? null,
    requestedWindowStartAt: raw.requested_window_start_at ?? null,
    requestedWindowEndExclusiveAt: raw.requested_window_end_exclusive_at ?? null,
    windowStartAt: raw.window_start_at ?? null,
    windowEndExclusiveAt: raw.window_end_exclusive_at ?? null,
    maxMessagePagesPerConversation: raw.max_message_pages_per_conversation ?? 0
  }));

export const schedulerJobBodySchema = z
  .object({
    job_name: z.string().min(1),
    target_date: z.string().min(1),
    snapshot_version: z.number().int().positive().optional(),
    is_published: z.boolean().optional(),
    requested_window_start_at: z.string().optional(),
    requested_window_end_exclusive_at: z.string().optional(),
    window_start_at: z.string().optional(),
    window_end_exclusive_at: z.string().optional(),
    max_conversations: z.number().int().min(0).optional(),
    max_message_pages_per_conversation: z.number().int().min(0).optional()
  })
  .transform((raw) => ({
    jobName: raw.job_name,
    targetDate: raw.target_date,
    snapshotVersion: raw.snapshot_version ?? null,
    isPublished: raw.is_published ?? true,
    requestedWindowStartAt: raw.requested_window_start_at ?? null,
    requestedWindowEndExclusiveAt: raw.requested_window_end_exclusive_at ?? null,
    windowStartAt: raw.window_start_at ?? null,
    windowEndExclusiveAt: raw.window_end_exclusive_at ?? null,
    maxConversations: raw.max_conversations ?? 0,
    maxMessagePagesPerConversation: raw.max_message_pages_per_conversation ?? 0
  }));

export const previewJobBodySchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("manual"),
    page_bundle: pageBundleSchema,
    job: manualJobBodySchema
  }),
  z.object({
    kind: z.literal("onboarding"),
    page_bundle: pageBundleSchema,
    job: onboardingJobBodySchema
  }),
  z.object({
    kind: z.literal("scheduler"),
    page_bundles: z.array(pageBundleSchema).min(1),
    job: schedulerJobBodySchema
  })
]);

export const executeJobBodySchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("manual"),
    page_bundle: pageBundleSchema,
    job: manualJobBodySchema,
    write_artifacts: z.boolean().default(true)
  }),
  z.object({
    kind: z.literal("onboarding"),
    page_bundle: pageBundleSchema,
    job: onboardingJobBodySchema,
    write_artifacts: z.boolean().default(true)
  }),
  z.object({
    kind: z.literal("scheduler"),
    page_bundles: z.array(pageBundleSchema).min(1),
    job: schedulerJobBodySchema,
    write_artifacts: z.boolean().default(true)
  })
]);

export type PageConfig = z.infer<typeof pageConfigSchema>;
export type PageBundle = z.infer<typeof pageBundleSchema>;
export type ManualJobBody = z.infer<typeof manualJobBodySchema>;
export type OnboardingJobBody = z.infer<typeof onboardingJobBodySchema>;
export type SchedulerJobBody = z.infer<typeof schedulerJobBodySchema>;
export type PreviewJobBody = z.infer<typeof previewJobBodySchema>;
export type ExecuteJobBody = z.infer<typeof executeJobBodySchema>;
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
