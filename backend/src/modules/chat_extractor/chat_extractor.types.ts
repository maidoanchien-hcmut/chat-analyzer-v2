import { z } from "zod";

export const processingModeSchema = z.enum(["etl_only", "etl_and_ai"]);
export const capabilityKeySchema = z.enum(["conversation_analysis", "thread_customer_mapping"]);

export const tagMappingEntrySchema = z.object({
  pancake_tag_id: z.string().min(1),
  raw_label: z.string().min(1),
  signal: z.string().min(1)
});

export const tagMappingSchema = z
  .object({
    version_no: z.number().int().positive().optional(),
    updated_at: z.string().optional(),
    default_signal: z.string().min(1).default("null"),
    entries: z.array(tagMappingEntrySchema).default([])
  })
  .transform((raw) => ({
    versionNo: raw.version_no ?? 1,
    updatedAt: raw.updated_at ?? null,
    defaultSignal: raw.default_signal,
    entries: raw.entries.map((entry) => ({
      pancakeTagId: entry.pancake_tag_id,
      rawLabel: entry.raw_label,
      signal: entry.signal
    }))
  }));

export const openingOptionSchema = z.object({
  raw_text: z.string().min(1),
  decision: z.string().min(1)
});

export const openingSelectorSchema = z.object({
  signal: z.string().min(1),
  allowed_message_types: z.array(z.string().min(1)).default(["postback", "quick_reply_selection", "template", "text"]),
  options: z.array(openingOptionSchema).min(1)
});

export const openingRulesSchema = z
  .object({
    version_no: z.number().int().positive().optional(),
    updated_at: z.string().optional(),
    boundary: z
      .object({
        mode: z.literal("until_first_meaningful_human_message").default("until_first_meaningful_human_message"),
        max_messages: z.number().int().positive().default(12)
      })
      .default({
        mode: "until_first_meaningful_human_message",
        max_messages: 12
      }),
    selectors: z.array(openingSelectorSchema).default([]),
    fallback: z
      .object({
        store_candidate_if_unmatched: z.boolean().default(true)
      })
      .default({
        store_candidate_if_unmatched: true
      })
  })
  .transform((raw) => ({
    versionNo: raw.version_no ?? 1,
    updatedAt: raw.updated_at ?? null,
    boundary: {
      mode: raw.boundary.mode,
      maxMessages: raw.boundary.max_messages
    },
    selectors: raw.selectors.map((selector) => ({
      signal: selector.signal,
      allowedMessageTypes: selector.allowed_message_types,
      options: selector.options.map((option) => ({
        rawText: option.raw_text,
        decision: option.decision
      }))
    })),
    fallback: {
      storeCandidateIfUnmatched: raw.fallback.store_candidate_if_unmatched
    }
  }));

export const notificationTargetsSchema = z.object({
  telegram_chat_ids: z.array(z.string().min(1)).default([]),
  email_recipients: z.array(z.string().email()).default([]),
  notify_on_new_tag: z.boolean().default(true),
  notify_on_pipeline_failure: z.boolean().default(true)
});

export const aiProfileJsonSchema = z.record(z.string(), z.any()).refine((value) => Object.keys(value).length > 0, {
  message: "profile_json must not be empty"
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
    etl_enabled: z.boolean().default(false),
    analysis_enabled: z.boolean().default(false)
  })
  .transform((raw) => ({
    pancakePageId: raw.pancake_page_id,
    userAccessToken: raw.user_access_token,
    businessTimezone: raw.business_timezone,
    etlEnabled: raw.etl_enabled,
    analysisEnabled: raw.analysis_enabled
  }));

export const setupSampleBodySchema = z
  .object({
    pancake_page_id: z.string().min(1),
    user_access_token: z.string().min(1),
    business_timezone: z.string().min(1).default("Asia/Ho_Chi_Minh"),
    processing_mode: processingModeSchema.default("etl_only"),
    initial_conversation_limit: z.number().int().positive(),
    active_tag_mapping_json: z.unknown().optional(),
    active_opening_rules_json: z.unknown().optional()
  })
  .transform((raw) => ({
    pancakePageId: raw.pancake_page_id,
    userAccessToken: raw.user_access_token,
    businessTimezone: raw.business_timezone,
    processingMode: raw.processing_mode,
    initialConversationLimit: raw.initial_conversation_limit,
    activeTagMappingJson: normalizeTagMappingConfig(raw.active_tag_mapping_json),
    activeOpeningRulesJson: normalizeOpeningRulesConfig(raw.active_opening_rules_json)
  }));

export const commitSetupBodySchema = z
  .object({
    pancake_page_id: z.string().min(1),
    user_access_token: z.string().min(1),
    business_timezone: z.string().min(1).default("Asia/Ho_Chi_Minh"),
    etl_enabled: z.boolean().default(true),
    analysis_enabled: z.boolean().default(true),
    active_tag_mapping_json: z.unknown().default({}),
    active_opening_rules_json: z.unknown().default({}),
    notification_targets_json: z.unknown().default({}),
    prompt_text: z.string().trim().optional(),
    prompt_notes: z.string().trim().optional(),
    conversation_analysis_profile_json: aiProfileJsonSchema.optional(),
    thread_customer_mapping_profile_json: aiProfileJsonSchema.optional(),
    onboarding_state_json: z.record(z.string(), z.any()).optional()
  })
  .superRefine((raw, ctx) => {
    const hasPromptText = (raw.prompt_text?.trim().length ?? 0) > 0;
    if (!hasPromptText && !raw.conversation_analysis_profile_json) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["prompt_text"],
        message: "prompt_text hoặc conversation_analysis_profile_json là bắt buộc"
      });
    }
  })
  .transform((raw) => ({
    pancakePageId: raw.pancake_page_id,
    userAccessToken: raw.user_access_token,
    businessTimezone: raw.business_timezone,
    etlEnabled: raw.etl_enabled,
    analysisEnabled: raw.analysis_enabled,
    activeTagMappingJson: normalizeTagMappingConfig(raw.active_tag_mapping_json),
    activeOpeningRulesJson: normalizeOpeningRulesConfig(raw.active_opening_rules_json),
    notificationTargetsJson: normalizeNotificationTargets(raw.notification_targets_json),
    conversationAnalysisProfileJson: raw.conversation_analysis_profile_json ?? buildPromptProfile(raw.prompt_text ?? "", raw.prompt_notes),
    threadCustomerMappingProfileJson: raw.thread_customer_mapping_profile_json ?? null,
    onboardingStateJson: raw.onboarding_state_json ?? null,
    promptNotes: normalizeOptionalText(raw.prompt_notes)
  }));

export const updateConnectedPageBodySchema = z
  .object({
    business_timezone: z.string().min(1).optional(),
    etl_enabled: z.boolean().optional(),
    analysis_enabled: z.boolean().optional(),
    active_tag_mapping_json: z.unknown().optional(),
    active_opening_rules_json: z.unknown().optional(),
    notification_targets_json: z.unknown().optional(),
    onboarding_state_json: z.record(z.string(), z.any()).optional()
  })
  .refine((raw) => Object.keys(raw).length > 0, {
    message: "At least one page config field must be provided."
  })
  .transform((raw) => ({
    businessTimezone: raw.business_timezone,
    etlEnabled: raw.etl_enabled,
    analysisEnabled: raw.analysis_enabled,
    activeTagMappingJson: raw.active_tag_mapping_json === undefined ? undefined : normalizeTagMappingConfig(raw.active_tag_mapping_json),
    activeOpeningRulesJson: raw.active_opening_rules_json === undefined ? undefined : normalizeOpeningRulesConfig(raw.active_opening_rules_json),
    notificationTargetsJson: raw.notification_targets_json === undefined ? undefined : normalizeNotificationTargets(raw.notification_targets_json),
    onboardingStateJson: raw.onboarding_state_json
  }));

export const createAiProfileVersionBodySchema = z
  .object({
    capability_key: capabilityKeySchema,
    profile_json: aiProfileJsonSchema,
    notes: z.string().trim().optional(),
    activate: z.boolean().default(false)
  })
  .transform((raw) => ({
    capabilityKey: raw.capability_key,
    profileJson: raw.profile_json,
    notes: normalizeOptionalText(raw.notes),
    activate: raw.activate
  }));

export const cloneAiProfileVersionBodySchema = z
  .object({
    source_page_id: z.string().min(1),
    capability_key: capabilityKeySchema,
    notes: z.string().trim().optional(),
    activate: z.boolean().default(false)
  })
  .transform((raw) => ({
    sourcePageId: raw.source_page_id,
    capabilityKey: raw.capability_key,
    notes: normalizeOptionalText(raw.notes),
    activate: raw.activate
  }));

export const createPromptVersionBodySchema = z
  .object({
    prompt_text: z.string().min(1),
    notes: z.string().trim().optional(),
    model_name: z.string().trim().optional(),
    output_schema_version: z.string().trim().optional()
  })
  .transform((raw) => ({
    promptText: raw.prompt_text,
    notes: normalizeOptionalText(raw.notes),
    modelName: normalizeOptionalText(raw.model_name),
    outputSchemaVersion: normalizeOptionalText(raw.output_schema_version)
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
    run_group_id: z.string().uuid().optional(),
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
export type CapabilityKey = z.infer<typeof capabilityKeySchema>;
export type TagMappingConfig = ReturnType<typeof normalizeTagMappingConfig>;
export type OpeningRulesConfig = ReturnType<typeof normalizeOpeningRulesConfig>;
export type NotificationTargetsConfig = ReturnType<typeof normalizeNotificationTargets>;
export type CustomerDirectoryEntry = z.infer<typeof customerDirectoryEntrySchema>;
export type RegisterPageBody = z.infer<typeof registerPageBodySchema>;
export type SetupSampleBody = z.infer<typeof setupSampleBodySchema>;
export type CommitSetupBody = z.infer<typeof commitSetupBodySchema>;
export type UpdateConnectedPageBody = z.infer<typeof updateConnectedPageBodySchema>;
export type CreateAiProfileVersionBody = z.infer<typeof createAiProfileVersionBodySchema>;
export type CloneAiProfileVersionBody = z.infer<typeof cloneAiProfileVersionBodySchema>;
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
  run_group_id: string;
  snapshot_version: number;
  is_published: boolean;
  requested_window_start_at: string | null;
  requested_window_end_exclusive_at: string | null;
  window_start_at: string | null;
  window_end_exclusive_at: string | null;
  max_conversations: number;
  max_message_pages_per_conversation: number;
  tag_mapping: {
    default_signal: string;
    entries: Array<{
      pancake_tag_id: string;
      raw_label: string;
      signal: string;
    }>;
  };
  opening_rules: {
    boundary: {
      mode: "until_first_meaningful_human_message";
      max_messages: number;
    };
    selectors: Array<{
      signal: string;
      allowed_message_types: string[];
      options: Array<{
        raw_text: string;
        decision: string;
      }>;
    }>;
    fallback: {
      store_candidate_if_unmatched: boolean;
    };
  };
  customer_directory: CustomerDirectoryEntry[];
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

export function normalizeTagMappingConfig(value: unknown) {
  const parsed = tagMappingSchema.safeParse(value ?? {});
  const config = parsed.success
    ? parsed.data
    : {
        versionNo: 1,
        updatedAt: null,
        defaultSignal: "null",
        entries: [] as Array<{ pancakeTagId: string; rawLabel: string; signal: string }>
      };
  return {
    versionNo: config.versionNo,
    updatedAt: config.updatedAt,
    defaultSignal: config.defaultSignal,
    entries: config.entries
  };
}

export function normalizeOpeningRulesConfig(value: unknown) {
  const parsed = openingRulesSchema.safeParse(value ?? {});
  const config = parsed.success
    ? parsed.data
    : {
        versionNo: 1,
        updatedAt: null,
        boundary: {
          mode: "until_first_meaningful_human_message" as const,
          maxMessages: 12
        },
        selectors: [] as Array<{
          signal: string;
          allowedMessageTypes: string[];
          options: Array<{ rawText: string; decision: string }>;
        }>,
        fallback: {
          storeCandidateIfUnmatched: true
        }
      };
  return config;
}

export function normalizeNotificationTargets(value: unknown) {
  const parsed = notificationTargetsSchema.safeParse(value ?? {});
  return parsed.success
    ? {
        telegramChatIds: parsed.data.telegram_chat_ids,
        emailRecipients: parsed.data.email_recipients,
        notifyOnNewTag: parsed.data.notify_on_new_tag,
        notifyOnPipelineFailure: parsed.data.notify_on_pipeline_failure
      }
    : {
        telegramChatIds: [] as string[],
        emailRecipients: [] as string[],
        notifyOnNewTag: true,
        notifyOnPipelineFailure: true
      };
}

export function toWorkerTagMapping(config: TagMappingConfig): WorkerJob["tag_mapping"] {
  return {
    default_signal: config.defaultSignal,
    entries: config.entries.map((entry) => ({
      pancake_tag_id: entry.pancakeTagId,
      raw_label: entry.rawLabel,
      signal: entry.signal
    }))
  };
}

export function toWorkerOpeningRules(config: OpeningRulesConfig): WorkerJob["opening_rules"] {
  return {
    boundary: {
      mode: config.boundary.mode,
      max_messages: config.boundary.maxMessages
    },
    selectors: config.selectors.map((selector) => ({
      signal: selector.signal,
      allowed_message_types: selector.allowedMessageTypes,
      options: selector.options.map((option) => ({
        raw_text: option.rawText,
        decision: option.decision
      }))
    })),
    fallback: {
      store_candidate_if_unmatched: config.fallback.storeCandidateIfUnmatched
    }
  };
}

export function parseTagMappingConfig(value: unknown): TagMappingConfig {
  return normalizeTagMappingConfig(value);
}

export function parseOpeningRulesConfig(value: unknown): OpeningRulesConfig {
  return normalizeOpeningRulesConfig(value);
}

export function parseNotificationTargets(value: unknown): NotificationTargetsConfig {
  return normalizeNotificationTargets(value);
}

export function buildPromptProfile(promptText: string, notes?: string | null, overrides?: { modelName?: string | null; outputSchemaVersion?: string | null }) {
  return {
    prompt_template: promptText.trim(),
    model_name: overrides?.modelName ?? "gemini-2.5-flash",
    output_schema_version: overrides?.outputSchemaVersion ?? "conversation_analysis.v1",
    generation_config: {
      temperature: 0.2,
      top_p: 0.95
    },
    notes: notes ?? null
  };
}

function normalizeOptionalText(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
