import { z } from "zod";
import { defaultOpeningRulesConfig, defaultTagMappingConfig } from "./chat_extractor.artifacts.ts";

export const processingModeSchema = z.enum(["etl_only", "etl_and_ai"]);
export const runModeSchema = z.enum(["manual_range", "backfill_day", "official_daily", "onboarding_sample"]);
export const publishEligibilitySchema = z.enum([
  "official_full_day",
  "provisional_current_day_partial",
  "not_publishable_old_partial"
]);
export const publishAsSchema = z.enum(["official", "provisional"]);
export const tagRoleSchema = z.enum(["journey", "need", "outcome", "branch", "staff", "noise"]);
export const openingSignalRoleSchema = z.enum(["journey", "need", "outcome"]);
export const openingMatchModeSchema = z.enum(["exact", "casefold_exact"]);
export const businessTimezoneSchema = z.string().min(1).refine(isValidIanaTimezone, {
  message: "business_timezone phải là timezone IANA hợp lệ (vd: Asia/Ho_Chi_Minh)."
});

const rfc3339Schema = z.string().min(1);
const dateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, {
  message: "target_date phải theo định dạng YYYY-MM-DD."
});

const tagMappingEntryInputSchema = z.object({
  source_tag_id: z.string().min(1),
  source_tag_text: z.string().min(1),
  role: tagRoleSchema,
  canonical_code: z.string().trim().nullable().optional(),
  mapping_source: z.enum(["auto_default", "operator"]).default("operator"),
  status: z.enum(["active", "inactive"]).default("active")
});

const tagMappingInputSchema = z.object({
  version: z.literal(1).default(1),
  default_role: z.literal("noise").default("noise"),
  entries: z.array(tagMappingEntryInputSchema).default([])
});

const openingOptionInputSchema = z.object({
  raw_text: z.string().min(1),
  match_mode: openingMatchModeSchema.default("exact")
});

const openingSelectorInputSchema = z.object({
  selector_id: z.string().min(1),
  signal_role: openingSignalRoleSchema,
  signal_code: z.string().min(1),
  allowed_message_types: z.array(z.string().min(1)).min(1).default(["postback", "quick_reply_selection", "text"]),
  options: z.array(openingOptionInputSchema).default([])
});

const openingRulesInputSchema = z.object({
  version: z.literal(1).default(1),
  selectors: z.array(openingSelectorInputSchema).default([])
});

const schedulerInputSchema = z.object({
  version: z.literal(1).default(1),
  timezone: businessTimezoneSchema.default("Asia/Ho_Chi_Minh"),
  official_daily_time: z.string().regex(/^\d{2}:\d{2}$/).default("00:00"),
  lookback_hours: z.number().int().min(0).default(2),
  max_conversations_per_run: z.number().int().min(0).default(0),
  max_message_pages_per_thread: z.number().int().min(0).default(0)
});

const notificationTelegramTargetSchema = z.object({
  chat_id: z.string().min(1),
  events: z.array(z.enum(["run_failed", "publish_failed", "new_unmapped_tag", "opening_rule_miss_spike", "token_expiring"])).default([])
});

const notificationEmailTargetSchema = z.object({
  address: z.string().email(),
  events: z.array(z.enum(["run_failed", "publish_failed", "new_unmapped_tag", "opening_rule_miss_spike", "token_expiring"])).default([])
});

const notificationTargetsInputSchema = z.object({
  version: z.literal(1).default(1),
  telegram: z.array(notificationTelegramTargetSchema).default([]),
  email: z.array(notificationEmailTargetSchema).default([])
});

export const listPagesBodySchema = z.object({
  user_access_token: z.string().min(1)
});

export const registerPageBodySchema = z
  .object({
    pancake_page_id: z.string().min(1),
    user_access_token: z.string().min(1),
    business_timezone: businessTimezoneSchema.default("Asia/Ho_Chi_Minh"),
    etl_enabled: z.boolean().optional(),
    analysis_enabled: z.boolean().optional()
  })
  .transform((raw) => ({
    pancakePageId: raw.pancake_page_id,
    userAccessToken: raw.user_access_token,
    businessTimezone: raw.business_timezone,
    etlEnabled: raw.etl_enabled,
    analysisEnabled: raw.analysis_enabled
  }));

export const onboardingSamplePreviewBodySchema = z
  .object({
    user_access_token: z.string().min(1),
    pancake_page_id: z.string().min(1),
    business_timezone: businessTimezoneSchema.default("Asia/Ho_Chi_Minh"),
    tag_mapping_json: z.unknown().optional(),
    opening_rules_json: z.unknown().optional(),
    scheduler_json: z.union([z.null(), z.unknown()]).optional(),
    sample_conversation_limit: z.number().int().min(1).max(100).default(12),
    sample_message_page_limit: z.number().int().min(1).max(20).default(2)
  })
  .transform((raw) => ({
    userAccessToken: raw.user_access_token,
    pancakePageId: raw.pancake_page_id,
    businessTimezone: raw.business_timezone,
    tagMappingJson: raw.tag_mapping_json === undefined ? defaultTagMappingConfig() : normalizeTagMappingConfig(raw.tag_mapping_json),
    openingRulesJson: raw.opening_rules_json === undefined ? defaultOpeningRulesConfig() : normalizeOpeningRulesConfig(raw.opening_rules_json),
    schedulerJson: raw.scheduler_json === undefined
      ? null
      : raw.scheduler_json === null
        ? null
      : normalizeSchedulerConfig(raw.scheduler_json),
    sampleConversationLimit: raw.sample_conversation_limit,
    sampleMessagePageLimit: raw.sample_message_page_limit
  }));

export const promptWorkspaceSampleBodySchema = z
  .object({
    tag_mapping_json: z.unknown().optional(),
    opening_rules_json: z.unknown().optional(),
    scheduler_json: z.union([z.null(), z.unknown()]).optional(),
    sample_conversation_limit: z.number().int().min(1).max(100).default(12),
    sample_message_page_limit: z.number().int().min(1).max(20).default(2)
  })
  .transform((raw) => ({
    tagMappingJson: raw.tag_mapping_json === undefined ? undefined : normalizeTagMappingConfig(raw.tag_mapping_json),
    openingRulesJson: raw.opening_rules_json === undefined ? undefined : normalizeOpeningRulesConfig(raw.opening_rules_json),
    schedulerJson: raw.scheduler_json === undefined
      ? undefined
      : raw.scheduler_json === null
        ? null
        : normalizeSchedulerConfig(raw.scheduler_json),
    sampleConversationLimit: raw.sample_conversation_limit,
    sampleMessagePageLimit: raw.sample_message_page_limit
  }));

export const createConfigVersionBodySchema = z
  .object({
    tag_mapping_json: z.unknown().optional(),
    opening_rules_json: z.unknown().optional(),
    scheduler_json: z.union([z.null(), z.unknown()]).optional(),
    notification_targets_json: z.union([z.null(), z.unknown()]).optional(),
    prompt_text: z.string().trim().optional(),
    analysis_taxonomy_version_id: z.string().uuid().optional(),
    notes: z.string().trim().optional(),
    activate: z.boolean().default(false),
    etl_enabled: z.boolean().optional(),
    analysis_enabled: z.boolean().optional()
  })
  .transform((raw) => ({
    tagMappingJson: raw.tag_mapping_json === undefined ? undefined : normalizeTagMappingConfig(raw.tag_mapping_json),
    openingRulesJson: raw.opening_rules_json === undefined ? undefined : normalizeOpeningRulesConfig(raw.opening_rules_json),
    schedulerJson: raw.scheduler_json === undefined
      ? undefined
      : raw.scheduler_json === null
        ? null
        : normalizeSchedulerConfig(raw.scheduler_json),
    notificationTargetsJson: raw.notification_targets_json === undefined
      ? undefined
      : raw.notification_targets_json === null
        ? null
        : normalizeNotificationTargets(raw.notification_targets_json),
    promptText: normalizeOptionalText(raw.prompt_text),
    analysisTaxonomyVersionId: raw.analysis_taxonomy_version_id,
    notes: normalizeOptionalText(raw.notes),
    activate: raw.activate,
    etlEnabled: raw.etl_enabled,
    analysisEnabled: raw.analysis_enabled
  }));

export const promptPreviewArtifactBodySchema = z
  .object({
    draft_prompt_text: z.string().trim(),
    sample_workspace_key: z.string().uuid(),
    selected_conversation_id: z.string().min(1)
  })
  .transform((raw) => ({
    draftPromptText: raw.draft_prompt_text,
    sampleWorkspaceKey: raw.sample_workspace_key,
    selectedConversationId: raw.selected_conversation_id
  }));

export const manualJobBodySchema = z
  .object({
    processing_mode: processingModeSchema.default("etl_only"),
    target_date: dateOnlySchema.optional(),
    requested_window_start_at: rfc3339Schema.optional(),
    requested_window_end_exclusive_at: rfc3339Schema.optional()
  })
  .superRefine((raw, ctx) => {
    const hasTargetDate = typeof raw.target_date === "string";
    const hasRangeStart = typeof raw.requested_window_start_at === "string";
    const hasRangeEnd = typeof raw.requested_window_end_exclusive_at === "string";

    if (!hasTargetDate && !(hasRangeStart && hasRangeEnd)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "job phải có target_date hoặc đủ requested_window_start_at + requested_window_end_exclusive_at."
      });
    }

    if (hasTargetDate && (hasRangeStart || hasRangeEnd)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "job không được gửi đồng thời target_date và requested_window_*."
      });
    }
  })
  .transform((raw) => ({
    processingMode: raw.processing_mode,
    targetDate: raw.target_date ?? null,
    requestedWindowStartAt: raw.requested_window_start_at ?? null,
    requestedWindowEndExclusiveAt: raw.requested_window_end_exclusive_at ?? null
  }));

export const officialDailyJobBodySchema = z
  .object({
    processing_mode: processingModeSchema.default("etl_only"),
    target_date: dateOnlySchema
  })
  .transform((raw) => ({
    processingMode: raw.processing_mode,
    targetDate: raw.target_date
  }));

const previewManualJobBodySchema = z
  .object({
    kind: z.literal("manual"),
    connected_page_id: z.string().uuid(),
    job: manualJobBodySchema
  })
  .transform((raw) => ({
    kind: "manual" as const,
    connectedPageId: raw.connected_page_id,
    job: raw.job
  }));

const previewOfficialDailyJobBodySchema = z
  .object({
    kind: z.literal("official_daily"),
    connected_page_id: z.string().uuid(),
    job: officialDailyJobBodySchema
  })
  .transform((raw) => ({
    kind: "official_daily" as const,
    connectedPageId: raw.connected_page_id,
    job: raw.job
  }));

export const previewJobBodySchema = z.discriminatedUnion("kind", [
  previewManualJobBodySchema,
  previewOfficialDailyJobBodySchema
]);

const executeManualJobBodySchema = z
  .object({
    kind: z.literal("manual"),
    connected_page_id: z.string().uuid(),
    job: manualJobBodySchema
  })
  .transform((raw) => ({
    kind: "manual" as const,
    connectedPageId: raw.connected_page_id,
    job: raw.job
  }));

const executeOfficialDailyJobBodySchema = z
  .object({
    kind: z.literal("official_daily"),
    connected_page_id: z.string().uuid(),
    job: officialDailyJobBodySchema
  })
  .transform((raw) => ({
    kind: "official_daily" as const,
    connectedPageId: raw.connected_page_id,
    job: raw.job
  }));

export const executeJobBodySchema = z.discriminatedUnion("kind", [
  executeManualJobBodySchema,
  executeOfficialDailyJobBodySchema
]);

export const publishRunBodySchema = z
  .object({
    publish_as: publishAsSchema,
    confirm_historical_overwrite: z.boolean().default(false),
    expected_replaced_run_id: z.string().uuid().nullable().optional()
  })
  .transform((raw) => ({
    publishAs: raw.publish_as,
    confirmHistoricalOverwrite: raw.confirm_historical_overwrite,
    expectedReplacedRunId: raw.expected_replaced_run_id ?? null
  }));

export type ProcessingMode = z.infer<typeof processingModeSchema>;
export type RunMode = z.infer<typeof runModeSchema>;
export type PublishEligibility = z.infer<typeof publishEligibilitySchema>;
export type PublishAs = z.infer<typeof publishAsSchema>;
export type TagRole = z.infer<typeof tagRoleSchema>;

export type TagMappingConfig = ReturnType<typeof normalizeTagMappingConfig>;
export type OpeningRulesConfig = ReturnType<typeof normalizeOpeningRulesConfig>;
export type SchedulerConfig = ReturnType<typeof normalizeSchedulerConfig>;
export type NotificationTargetsConfig = ReturnType<typeof normalizeNotificationTargets>;
export type RegisterPageBody = z.infer<typeof registerPageBodySchema>;
export type OnboardingSamplePreviewBody = z.infer<typeof onboardingSamplePreviewBodySchema>;
export type PromptWorkspaceSampleBody = z.infer<typeof promptWorkspaceSampleBodySchema>;
export type CreateConfigVersionBody = z.infer<typeof createConfigVersionBodySchema>;
export type PromptPreviewArtifactBody = z.infer<typeof promptPreviewArtifactBodySchema>;
export type ManualJobBody = z.infer<typeof manualJobBodySchema>;
export type OfficialDailyJobBody = z.infer<typeof officialDailyJobBodySchema>;
export type PreviewJobBody = z.infer<typeof previewJobBodySchema>;
export type ExecuteJobBody = z.infer<typeof executeJobBodySchema>;
export type PublishRunBody = z.infer<typeof publishRunBodySchema>;

export type WorkerManifest = {
  manifest_version: 1;
  pipeline_run_id: string;
  run_group_id: string;
  connected_page_id: string;
  page_id: string;
  user_access_token: string;
  business_timezone: string;
  target_date: string;
  run_mode: RunMode;
  processing_mode: ProcessingMode;
  publish_eligibility: PublishEligibility;
  requested_window_start_at: string | null;
  requested_window_end_exclusive_at: string | null;
  window_start_at: string;
  window_end_exclusive_at: string;
  is_full_day: boolean;
  etl_config: {
    config_version_id: string;
    etl_config_hash: string;
    tag_mapping: TagMappingConfig;
    opening_rules: OpeningRulesConfig;
    scheduler: SchedulerConfig | null;
  };
};

export function normalizeTagMappingConfig(value: unknown) {
  const parsed = tagMappingInputSchema.safeParse(value ?? {});
  const source = parsed.success ? parsed.data : {
    version: 1 as const,
    default_role: "noise" as const,
    entries: [] as Array<z.input<typeof tagMappingEntryInputSchema>>
  };

  const deduped = new Map<string, {
    sourceTagId: string;
    sourceTagText: string;
    role: TagRole;
    canonicalCode: string | null;
    mappingSource: "auto_default" | "operator";
    status: "active" | "inactive";
  }>();

  for (const entry of source.entries) {
    const sourceTagId = entry.source_tag_id.trim();
    const sourceTagText = entry.source_tag_text.trim();
    const role = entry.role;
    const canonicalCode = normalizeOptionalText(entry.canonical_code ?? undefined);
    if (!sourceTagId || !sourceTagText) {
      continue;
    }
    if (role !== "noise" && !canonicalCode) {
      continue;
    }
    if (canonicalCode === "revisit" && role !== "journey") {
      continue;
    }
    deduped.set(sourceTagId, {
      sourceTagId,
      sourceTagText,
      role,
      canonicalCode,
      mappingSource: entry.mapping_source ?? "operator",
      status: entry.status ?? "active"
    });
  }

  return {
    version: 1 as const,
    defaultRole: "noise" as const,
    entries: [...deduped.values()].sort((left, right) => left.sourceTagText.localeCompare(right.sourceTagText))
  };
}

export function normalizeOpeningRulesConfig(value: unknown) {
  const parsed = openingRulesInputSchema.safeParse(value ?? {});
  const source = parsed.success ? parsed.data : {
    version: 1 as const,
    selectors: [] as Array<z.input<typeof openingSelectorInputSchema>>
  };

  const selectors = source.selectors
    .map((selector) => ({
      selectorId: selector.selector_id.trim(),
      signalRole: selector.signal_role,
      signalCode: selector.signal_code.trim(),
      allowedMessageTypes: (selector.allowed_message_types ?? []).map((value) => value.trim()).filter(Boolean),
      options: (selector.options ?? [])
        .map((option) => ({
          rawText: option.raw_text.trim(),
          matchMode: option.match_mode ?? "exact"
        }))
        .filter((option) => option.rawText.length > 0)
    }))
    .filter((selector) => selector.selectorId.length > 0 && selector.signalCode.length > 0 && selector.allowedMessageTypes.length > 0)
    .sort((left, right) => left.selectorId.localeCompare(right.selectorId));

  return {
    version: 1 as const,
    selectors
  };
}

export function normalizeSchedulerConfig(value: unknown) {
  const source = schedulerInputSchema.parse(value ?? {});

  return {
    version: 1 as const,
    timezone: source.timezone,
    officialDailyTime: source.official_daily_time,
    lookbackHours: source.lookback_hours,
    maxConversationsPerRun: source.max_conversations_per_run,
    maxMessagePagesPerThread: source.max_message_pages_per_thread
  };
}

export function normalizeNotificationTargets(value: unknown) {
  const parsed = notificationTargetsInputSchema.safeParse(value ?? {});
  const source = parsed.success ? parsed.data : {
    version: 1 as const,
    telegram: [] as Array<z.input<typeof notificationTelegramTargetSchema>>,
    email: [] as Array<z.input<typeof notificationEmailTargetSchema>>
  };

  return {
    version: 1 as const,
    telegram: source.telegram.map((item) => ({
      chatId: item.chat_id,
      events: [...(item.events ?? [])].sort()
    })),
    email: source.email.map((item) => ({
      address: item.address,
      events: [...(item.events ?? [])].sort()
    }))
  };
}

function normalizeOptionalText(value: string | undefined | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function isValidIanaTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}
