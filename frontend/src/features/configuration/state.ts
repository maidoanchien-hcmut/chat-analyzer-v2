import type {
  ConnectedPageConfigVersion,
  CreateConfigVersionInput,
  OnboardingSamplePreviewViewModel,
  OnboardingSamplePreviewInput,
  PromptPreviewComparisonViewModel,
  PromptPreviewArtifactInput,
  PromptWorkspaceSampleInput,
  PromptWorkspaceSampleViewModel
} from "../../adapters/contracts.ts";
import type {
  NotificationTargetDraft,
  OnboardingSampleSeedSummary,
  OpeningRuleDraft,
  SchedulerDraft,
  TagMappingDraft
} from "../../app/screen-state.ts";

type ConfigDraftInput = {
  promptText: string;
  tagMappings: TagMappingDraft[];
  openingRules: OpeningRuleDraft[];
  scheduler: SchedulerDraft;
  notificationTargets: NotificationTargetDraft[];
  notes: string;
  activate: boolean;
  etlEnabled: boolean;
  analysisEnabled: boolean;
};

type PromptWorkspaceFingerprintInput = {
  tagMappings: TagMappingDraft[];
  openingRules: OpeningRuleDraft[];
  scheduler: SchedulerDraft;
  businessTimezone: string;
  sampleConversationLimit: number;
};

type PromptPreviewFreshnessInput = {
  workspaceFingerprint: string | null;
  comparisonFingerprint: string | null;
  currentWorkspaceFingerprint: string | null;
  currentComparisonFingerprint: string | null;
  hasSamplePreview: boolean;
  hasComparison: boolean;
};

export type PromptPreviewFreshnessState = {
  workspaceStaleReason: string | null;
  comparisonStaleReason: string | null;
  invalidateComparison: boolean;
};

export type OnboardingSampleSeedResult = {
  promptText: string;
  tagMappings: TagMappingDraft[];
  openingRules: OpeningRuleDraft[];
  scheduler: SchedulerDraft;
  notificationTargets: NotificationTargetDraft[];
  summary: OnboardingSampleSeedSummary;
};

export const DEFAULT_PAGE_LOCAL_PROMPT = [
  "Đánh giá hội thoại theo đúng quy trình vận hành của page này.",
  "Tập trung vào nhu cầu khách hàng, cách nhân viên phản hồi và kết quả chốt cuối ngày.",
  "Không suy diễn ngoài nội dung hội thoại."
].join(" ");

export function buildCreateConfigVersionInput(input: ConfigDraftInput): CreateConfigVersionInput {
  return {
    promptText: input.promptText,
    tagMappingJson: {
      version: 1,
      defaultRole: "noise",
      entries: input.tagMappings
        .filter((entry) => entry.rawTag.trim() && entry.role.trim())
        .map((entry) => ({
          sourceTagId: resolveTagSourceIdentity(entry),
          sourceTagText: entry.rawTag.trim(),
          role: mapTagRoleToBackend(entry.role),
          canonicalCode: entry.canonicalValue.trim() || null,
          mappingSource: entry.source === "operator_override" ? "operator" : "auto_default",
          status: "active"
        }))
    },
    openingRulesJson: {
      version: 1,
      selectors: input.openingRules
        .filter((entry) => entry.buttonTitle.trim() && entry.signalType.trim())
        .map((entry, index) => ({
          selectorId: `opening-rule-${index + 1}`,
          signalRole: mapOpeningSignalToBackend(entry.signalType),
          signalCode: entry.canonicalValue.trim(),
          allowedMessageTypes: ["postback", "quick_reply_selection", "text"],
          options: [
            {
              rawText: entry.buttonTitle.trim(),
              matchMode: "exact"
            }
          ]
        }))
    },
    schedulerJson: input.scheduler.useSystemDefaults
      ? null
      : {
        version: 1,
        timezone: input.scheduler.timezone,
        officialDailyTime: input.scheduler.officialDailyTime,
        lookbackHours: input.scheduler.lookbackHours,
        maxConversationsPerRun: 0,
        maxMessagePagesPerThread: 0
      },
    notificationTargetsJson: {
      version: 1,
      telegram: input.notificationTargets
        .filter((entry) => entry.channel.trim() === "telegram" && entry.value.trim())
        .map((entry) => ({
          chatId: entry.value.trim(),
          events: []
        })),
      email: input.notificationTargets
        .filter((entry) => entry.channel.trim() === "email" && entry.value.trim())
        .map((entry) => ({
          address: entry.value.trim(),
          events: []
        }))
    },
    notes: input.notes.trim() || null,
    activate: input.activate,
    etlEnabled: input.etlEnabled,
    analysisEnabled: input.analysisEnabled
  };
}

export function buildOnboardingSamplePreviewInput(input: {
  pancakePageId: string;
  userAccessToken: string;
  pageName: string;
  businessTimezone: string;
  tagMappings: TagMappingDraft[];
  openingRules: OpeningRuleDraft[];
  scheduler: SchedulerDraft;
  sampleConversationLimit: number;
}): OnboardingSamplePreviewInput {
  const payload = buildCreateConfigVersionInput({
    promptText: "",
    tagMappings: input.tagMappings,
    openingRules: input.openingRules,
    scheduler: {
      ...input.scheduler,
      timezone: input.businessTimezone
    },
    notificationTargets: [],
    notes: "",
    activate: false,
    etlEnabled: false,
    analysisEnabled: false
  });

  return {
    pancakePageId: input.pancakePageId,
    userAccessToken: input.userAccessToken,
    pageName: input.pageName,
    businessTimezone: input.businessTimezone,
    tagMappingJson: payload.tagMappingJson,
    openingRulesJson: payload.openingRulesJson,
    schedulerJson: payload.schedulerJson ?? {
      version: 1,
      timezone: input.businessTimezone,
      officialDailyTime: input.scheduler.officialDailyTime,
      lookbackHours: input.scheduler.lookbackHours,
      maxConversationsPerRun: input.sampleConversationLimit,
      maxMessagePagesPerThread: 0
    },
    sampleConversationLimit: input.sampleConversationLimit
  };
}

export function buildPromptWorkspaceSampleInput(input: PromptWorkspaceFingerprintInput): PromptWorkspaceSampleInput {
  const payload = buildCreateConfigVersionInput({
    promptText: "",
    tagMappings: input.tagMappings,
    openingRules: input.openingRules,
    scheduler: {
      ...input.scheduler,
      timezone: input.businessTimezone
    },
    notificationTargets: [],
    notes: "",
    activate: false,
    etlEnabled: false,
    analysisEnabled: false
  });

  return {
    tagMappingJson: payload.tagMappingJson,
    openingRulesJson: payload.openingRulesJson,
    schedulerJson: payload.schedulerJson ?? {
      version: 1,
      timezone: input.businessTimezone,
      officialDailyTime: input.scheduler.officialDailyTime,
      lookbackHours: input.scheduler.lookbackHours,
      maxConversationsPerRun: input.sampleConversationLimit,
      maxMessagePagesPerThread: 0
    },
    sampleConversationLimit: input.sampleConversationLimit
  };
}

export function buildPromptPreviewArtifactInput(input: {
  promptText: string;
  samplePreview: PromptWorkspaceSampleViewModel;
  selectedConversationId: string;
}): PromptPreviewArtifactInput {
  const selectedConversation = input.samplePreview.conversations.find(
    (conversation) => conversation.conversationId === input.selectedConversationId
  );
  if (!selectedConversation) {
    throw new Error("Cần chọn hội thoại sample để chạy thử prompt.");
  }

  return {
    draftPromptText: input.promptText,
    sampleWorkspaceKey: input.samplePreview.sampleWorkspaceKey,
    selectedConversationId: selectedConversation.conversationId
  };
}

export function buildPromptWorkspaceSampleFingerprint(input: PromptWorkspaceFingerprintInput) {
  return JSON.stringify(buildPromptWorkspaceSampleInput(input));
}

export function buildConfigurationDraftFingerprint(input: ConfigDraftInput) {
  return JSON.stringify(buildCreateConfigVersionInput(input));
}

export function buildPromptPreviewComparisonFingerprint(input: {
  promptText: string;
  samplePreview: PromptWorkspaceSampleViewModel;
  selectedConversationId: string;
}) {
  return JSON.stringify(buildPromptPreviewArtifactInput(input));
}

export function derivePromptPreviewFreshness(input: PromptPreviewFreshnessInput): PromptPreviewFreshnessState {
  const workspaceStale = input.hasSamplePreview
    && typeof input.workspaceFingerprint === "string"
    && typeof input.currentWorkspaceFingerprint === "string"
    && input.workspaceFingerprint !== input.currentWorkspaceFingerprint;
  if (workspaceStale) {
    return {
      workspaceStaleReason: "Tag mapping, opening rules hoặc scheduler đã đổi. Tải lại sample prompt để làm mới workspace trước khi chạy preview.",
      comparisonStaleReason: null,
      invalidateComparison: input.hasComparison
    };
  }

  const comparisonStale = input.hasComparison
    && typeof input.comparisonFingerprint === "string"
    && typeof input.currentComparisonFingerprint === "string"
    && input.comparisonFingerprint !== input.currentComparisonFingerprint;

  return {
    workspaceStaleReason: null,
    comparisonStaleReason: comparisonStale
      ? "Prompt draft hoặc hội thoại sample đã đổi. Chạy thử prompt lại để cập nhật so sánh active và draft."
      : null,
    invalidateComparison: comparisonStale
  };
}

export function configVersionToDraft(configVersion: ConnectedPageConfigVersion | null, fallbackTimezone = "Asia/Ho_Chi_Minh") {
  if (!configVersion) {
    return {
      promptText: "",
      tagMappings: [createEmptyTagMapping()],
      openingRules: [createEmptyOpeningRule()],
      scheduler: createDefaultScheduler(fallbackTimezone),
      notificationTargets: [createEmptyNotificationTarget()],
      notes: ""
    };
  }

  return {
    promptText: configVersion.promptText,
    tagMappings: parseTagMappings(configVersion.tagMappingJson),
    openingRules: parseOpeningRules(configVersion.openingRulesJson),
    scheduler: parseScheduler(configVersion.schedulerJson, fallbackTimezone),
    notificationTargets: parseNotificationTargets(configVersion.notificationTargetsJson),
    notes: configVersion.notes ?? ""
  };
}

export function createEmptyTagMapping(): TagMappingDraft {
  return {
    sourceTagId: "",
    rawTag: "",
    role: "noise",
    canonicalValue: "",
    source: "system_default"
  };
}

export function createEmptyOpeningRule(): OpeningRuleDraft {
  return {
    buttonTitle: "",
    signalType: "customer_journey",
    canonicalValue: ""
  };
}

export function createDefaultScheduler(timezone = "Asia/Ho_Chi_Minh"): SchedulerDraft {
  return {
    useSystemDefaults: true,
    timezone,
    officialDailyTime: "00:00",
    lookbackHours: 2
  };
}

export function createEmptyNotificationTarget(): NotificationTargetDraft {
  return {
    channel: "telegram",
    value: ""
  };
}

export function seedWorkspaceDraftFromOnboardingSample(input: {
  promptText: string;
  tagMappings: TagMappingDraft[];
  openingRules: OpeningRuleDraft[];
  scheduler: SchedulerDraft;
  notificationTargets: NotificationTargetDraft[];
  samplePreview: OnboardingSamplePreviewViewModel;
}): OnboardingSampleSeedResult {
  const tagSuggestions = collectTagSuggestions(input.samplePreview);
  const openingSuggestions = collectOpeningSuggestions(input.samplePreview);
  const tagMerge = mergeTagMappings(input.tagMappings, tagSuggestions);
  const openingMerge = mergeOpeningRules(input.openingRules, openingSuggestions);
  const promptSeed = seedPromptText(input.promptText);
  const schedulerSeed = seedScheduler(input.scheduler, input.samplePreview.businessTimezone);
  const notificationSeed = seedNotificationTargets(input.notificationTargets);

  return {
    promptText: promptSeed.promptText,
    tagMappings: tagMerge.entries,
    openingRules: openingMerge.entries,
    scheduler: schedulerSeed.scheduler,
    notificationTargets: notificationSeed.notificationTargets,
    summary: {
      tagSuggestionsApplied: tagMerge.applied,
      openingSuggestionsApplied: openingMerge.applied,
      tagOverridesPreserved: tagMerge.preserved,
      openingOverridesPreserved: openingMerge.preserved,
      observedTagCount: tagSuggestions.length,
      explicitOpeningSignalCount: openingSuggestions.length,
      promptDefaultsApplied: promptSeed.applied,
      schedulerDefaultsApplied: schedulerSeed.applied,
      notificationDefaultsApplied: notificationSeed.applied
    }
  };
}

function parseTagMappings(value: unknown): TagMappingDraft[] {
  const entries = readArrayField(value, "entries");
  const mapped = entries.map((entry) => ({
    sourceTagId: readString(entry, "sourceTagId"),
    rawTag: readString(entry, "sourceTagText"),
    role: mapTagRoleFromBackend(readString(entry, "role")),
    canonicalValue: readString(entry, "canonicalCode"),
    source: (readString(entry, "mappingSource") === "operator" ? "operator_override" : "system_default") as "system_default" | "operator_override"
  })).filter((entry) => entry.rawTag || entry.role !== "noise" || entry.canonicalValue || entry.source !== "system_default");
  return mapped.length > 0 ? mapped : [createEmptyTagMapping()];
}

function collectTagSuggestions(samplePreview: OnboardingSamplePreviewViewModel): TagMappingDraft[] {
  const suggestions = new Map<string, TagMappingDraft>();
  const upsertSuggestion = (entry: TagMappingDraft) => {
    const rawTag = entry.rawTag.trim();
    if (!rawTag) {
      return;
    }
    const key = normalizeKey(rawTag);
    const existing = suggestions.get(key);
    if (!existing || rankTagSuggestion(entry) > rankTagSuggestion(existing)) {
      suggestions.set(key, {
        sourceTagId: entry.sourceTagId.trim(),
        rawTag,
        role: entry.role,
        canonicalValue: entry.canonicalValue.trim(),
        source: entry.source
      });
    }
  };

  for (const pageTag of samplePreview.pageTags) {
    if (!pageTag.isDeactive) {
      upsertSuggestion({
        sourceTagId: pageTag.pancakeTagId,
        rawTag: pageTag.text,
        role: "noise",
        canonicalValue: "",
        source: "system_default"
      });
    }
  }

  for (const conversation of samplePreview.conversations) {
    for (const observedTag of conversation.observedTags) {
      upsertSuggestion({
        sourceTagId: observedTag.sourceTagId,
        rawTag: observedTag.sourceTagText || observedTag.sourceTagId,
        role: "noise",
        canonicalValue: "",
        source: "system_default"
      });
    }
    for (const signal of conversation.normalizedTagSignals) {
      upsertSuggestion({
        sourceTagId: signal.sourceTagId,
        rawTag: signal.sourceTagText,
        role: mapTagRoleFromBackend(signal.role),
        canonicalValue: signal.canonicalCode ?? "",
        source: signal.mappingSource === "operator" ? "operator_override" : "system_default"
      });
    }
  }

  return [...suggestions.values()].sort((left, right) => left.rawTag.localeCompare(right.rawTag));
}

function collectOpeningSuggestions(samplePreview: OnboardingSamplePreviewViewModel): OpeningRuleDraft[] {
  const suggestions = new Map<string, OpeningRuleDraft>();

  for (const conversation of samplePreview.conversations) {
    for (const signal of conversation.explicitSignals) {
      const buttonTitle = signal.rawText.trim();
      const signalType = mapOpeningSignalFromBackend(signal.signalRole);
      const canonicalValue = signal.signalCode.trim();
      if (!buttonTitle || !signalType || !canonicalValue) {
        continue;
      }
      const key = normalizeKey(buttonTitle);
      if (!suggestions.has(key)) {
        suggestions.set(key, {
          buttonTitle,
          signalType,
          canonicalValue
        });
      }
    }
  }

  return [...suggestions.values()].sort((left, right) => left.buttonTitle.localeCompare(right.buttonTitle));
}

function mergeTagMappings(current: TagMappingDraft[], suggestions: TagMappingDraft[]) {
  const entries = shouldReplaceEmptyTagMappings(current) ? [] : current.map((entry) => ({ ...entry }));
  const indices = new Map(entries.map((entry, index) => [tagIdentityKey(entry), index]));
  let applied = 0;
  let preserved = 0;

  for (const suggestion of suggestions) {
    const key = tagIdentityKey(suggestion);
    const existingIndex = indices.get(key);
    if (existingIndex === undefined) {
      entries.push({ ...suggestion });
      indices.set(key, entries.length - 1);
      applied += 1;
      continue;
    }

    const existing = entries[existingIndex]!;
    if (existing.source === "operator_override") {
      preserved += 1;
      continue;
    }
    if (isBlankTagMapping(existing)) {
      entries[existingIndex] = { ...suggestion };
      applied += 1;
      continue;
    }
  }

  return {
    entries: entries.length > 0 ? entries : [createEmptyTagMapping()],
    applied,
    preserved
  };
}

function mergeOpeningRules(current: OpeningRuleDraft[], suggestions: OpeningRuleDraft[]) {
  const entries = shouldReplaceEmptyOpeningRules(current) ? [] : current.map((entry) => ({ ...entry }));
  const indices = new Map(entries.map((entry, index) => [normalizeKey(entry.buttonTitle), index]));
  let applied = 0;
  let preserved = 0;

  for (const suggestion of suggestions) {
    const key = normalizeKey(suggestion.buttonTitle);
    const existingIndex = indices.get(key);
    if (existingIndex === undefined) {
      entries.push({ ...suggestion });
      indices.set(key, entries.length - 1);
      applied += 1;
      continue;
    }

    const existing = entries[existingIndex]!;
    if (isBlankOpeningRule(existing)) {
      entries[existingIndex] = { ...suggestion };
      applied += 1;
      continue;
    }
    preserved += 1;
  }

  return {
    entries: entries.length > 0 ? entries : [createEmptyOpeningRule()],
    applied,
    preserved
  };
}

function seedPromptText(promptText: string) {
  const trimmed = promptText.trim();
  if (trimmed) {
    return {
      promptText,
      applied: 0
    };
  }
  return {
    promptText: DEFAULT_PAGE_LOCAL_PROMPT,
    applied: 1
  };
}

function seedScheduler(current: SchedulerDraft, businessTimezone: string) {
  if (!current.useSystemDefaults) {
    return {
      scheduler: { ...current },
      applied: 0
    };
  }

  if (current.timezone.trim() === businessTimezone.trim()) {
    return {
      scheduler: { ...current },
      applied: 0
    };
  }

  return {
    scheduler: {
      ...current,
      timezone: businessTimezone
    },
    applied: 1
  };
}

function seedNotificationTargets(current: NotificationTargetDraft[]) {
  if (current.some((entry) => entry.channel.trim() || entry.value.trim())) {
    return {
      notificationTargets: current.map((entry) => ({ ...entry })),
      applied: 0
    };
  }

  if (current.length > 0) {
    return {
      notificationTargets: current.map((entry) => ({ ...entry })),
      applied: 0
    };
  }

  return {
    notificationTargets: [createEmptyNotificationTarget()],
    applied: 1
  };
}

function parseOpeningRules(value: unknown): OpeningRuleDraft[] {
  const selectors = readArrayField(value, "selectors");
  const mapped = selectors.map((entry) => ({
    buttonTitle: readArrayField(entry, "options").map((option) => readString(option, "rawText")).find(Boolean) ?? "",
    signalType: mapOpeningSignalFromBackend(readString(entry, "signalRole")),
    canonicalValue: readString(entry, "signalCode")
  })).filter((entry) => entry.buttonTitle.trim() && entry.signalType.trim());
  return mapped.length > 0 ? mapped : [createEmptyOpeningRule()];
}

function parseScheduler(value: unknown, fallbackTimezone: string): SchedulerDraft {
  if (!value || typeof value !== "object") {
    return createDefaultScheduler(fallbackTimezone);
  }
  return {
    useSystemDefaults: false,
    timezone: readString(value, "timezone") || fallbackTimezone,
    officialDailyTime: readString(value, "officialDailyTime") || "00:00",
    lookbackHours: readNumber(value, "lookbackHours", 2)
  };
}

function parseNotificationTargets(value: unknown): NotificationTargetDraft[] {
  const telegram = readArrayField(value, "telegram").map((entry) => ({
    channel: "telegram",
    value: readString(entry, "chatId")
  }));
  const email = readArrayField(value, "email").map((entry) => ({
    channel: "email",
    value: readString(entry, "address")
  }));
  const mapped = [...telegram, ...email].filter((entry) => entry.value.trim());
  return mapped.length > 0 ? mapped : [createEmptyNotificationTarget()];
}

function readArrayField(value: unknown, key: string) {
  if (!value || typeof value !== "object") {
    return [];
  }
  const entries = (value as Record<string, unknown>)[key];
  return Array.isArray(entries) ? entries : [];
}

function normalizeKey(value: string) {
  return value.trim().toLocaleLowerCase();
}

function rankTagSuggestion(entry: TagMappingDraft) {
  let score = entry.source === "operator_override" ? 4 : 2;
  if (entry.sourceTagId.trim()) {
    score += 2;
  }
  if (entry.role !== "noise") {
    score += 2;
  }
  if (entry.canonicalValue.trim()) {
    score += 1;
  }
  return score;
}

function shouldReplaceEmptyTagMappings(entries: TagMappingDraft[]) {
  return entries.length === 0 || entries.every((entry) => isBlankTagMapping(entry));
}

function shouldReplaceEmptyOpeningRules(entries: OpeningRuleDraft[]) {
  return entries.length === 0 || entries.every((entry) => isBlankOpeningRule(entry));
}

function isBlankTagMapping(entry: TagMappingDraft) {
  return !entry.sourceTagId.trim()
    && !entry.rawTag.trim()
    && entry.role === "noise"
    && !entry.canonicalValue.trim()
    && entry.source === "system_default";
}

function resolveTagSourceIdentity(entry: TagMappingDraft) {
  const sourceTagId = entry.sourceTagId.trim();
  if (sourceTagId) {
    return sourceTagId;
  }
  return `manual:${normalizeKey(entry.rawTag)}`;
}

function tagIdentityKey(entry: TagMappingDraft) {
  return entry.sourceTagId.trim() || normalizeKey(entry.rawTag);
}

function isBlankOpeningRule(entry: OpeningRuleDraft) {
  return !entry.buttonTitle.trim()
    && entry.signalType === "customer_journey"
    && !entry.canonicalValue.trim();
}

function readString(value: unknown, key: string) {
  if (!value || typeof value !== "object") {
    return "";
  }
  const result = (value as Record<string, unknown>)[key];
  return typeof result === "string" ? result : "";
}

function readBoolean(value: unknown, key: string, fallback: boolean) {
  if (!value || typeof value !== "object") {
    return fallback;
  }
  const result = (value as Record<string, unknown>)[key];
  return typeof result === "boolean" ? result : fallback;
}

function readNumber(value: unknown, key: string, fallback: number) {
  if (!value || typeof value !== "object") {
    return fallback;
  }
  const result = (value as Record<string, unknown>)[key];
  return typeof result === "number" ? result : fallback;
}

function mapTagRoleToBackend(role: string) {
  if (role === "customer_journey") {
    return "journey";
  }
  return role.trim();
}

function mapTagRoleFromBackend(role: string) {
  if (role === "journey") {
    return "customer_journey";
  }
  return role;
}

function mapOpeningSignalToBackend(signalType: string) {
  if (signalType === "customer_journey") {
    return "journey";
  }
  return signalType.trim();
}

function mapOpeningSignalFromBackend(signalRole: string) {
  if (signalRole === "journey") {
    return "customer_journey";
  }
  return signalRole;
}
