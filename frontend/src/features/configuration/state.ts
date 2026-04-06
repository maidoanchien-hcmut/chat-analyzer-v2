import type { ConnectedPageConfigVersion, CreateConfigVersionInput, OnboardingSamplePreviewInput } from "../../adapters/contracts.ts";
import type { NotificationTargetDraft, OpeningRuleDraft, SchedulerDraft, TagMappingDraft } from "../../app/screen-state.ts";

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

export function buildCreateConfigVersionInput(input: ConfigDraftInput): CreateConfigVersionInput {
  return {
    promptText: input.promptText,
    tagMappingJson: {
      version: 1,
      defaultRole: "noise",
      entries: input.tagMappings
        .filter((entry) => entry.rawTag.trim() && entry.role.trim())
        .map((entry, index) => ({
          sourceTagId: `tag-${index + 1}`,
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
  sampleMessagePageLimit: number;
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
      maxMessagePagesPerThread: input.sampleMessagePageLimit
    },
    sampleConversationLimit: input.sampleConversationLimit,
    sampleMessagePageLimit: input.sampleMessagePageLimit
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

function parseTagMappings(value: unknown): TagMappingDraft[] {
  const entries = readArrayField(value, "entries");
  const mapped = entries.map((entry) => ({
    rawTag: readString(entry, "sourceTagText"),
    role: mapTagRoleFromBackend(readString(entry, "role")),
    canonicalValue: readString(entry, "canonicalCode"),
    source: (readString(entry, "mappingSource") === "operator" ? "operator_override" : "system_default") as "system_default" | "operator_override"
  })).filter((entry) => entry.rawTag || entry.role !== "noise" || entry.canonicalValue || entry.source !== "system_default");
  return mapped.length > 0 ? mapped : [createEmptyTagMapping()];
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
