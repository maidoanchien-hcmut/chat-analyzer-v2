import type { ConnectedPageConfigVersion, CreateConfigVersionInput } from "../../adapters/contracts.ts";
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
        .map((entry) => ({
          rawTag: entry.rawTag.trim(),
          role: entry.role.trim(),
          canonicalValue: entry.canonicalValue.trim(),
          source: entry.source
        }))
    },
    openingRulesJson: {
      version: 1,
      selectors: input.openingRules
        .filter((entry) => entry.buttonTitle.trim() && entry.signalType.trim())
        .map((entry) => ({
          buttonTitle: entry.buttonTitle.trim(),
          signalType: entry.signalType.trim(),
          canonicalValue: entry.canonicalValue.trim()
        }))
    },
    schedulerJson: {
      useSystemDefaults: input.scheduler.useSystemDefaults,
      officialDailyTime: input.scheduler.officialDailyTime,
      lookbackHours: input.scheduler.lookbackHours
    },
    notificationTargetsJson: {
      channels: input.notificationTargets
        .filter((entry) => entry.channel.trim() && entry.value.trim())
        .map((entry) => ({
          channel: entry.channel.trim(),
          value: entry.value.trim()
        }))
    },
    notes: input.notes.trim() || null,
    activate: input.activate,
    etlEnabled: input.etlEnabled,
    analysisEnabled: input.analysisEnabled
  };
}

export function configVersionToDraft(configVersion: ConnectedPageConfigVersion | null) {
  if (!configVersion) {
    return {
      promptText: "",
      tagMappings: [createEmptyTagMapping()],
      openingRules: [createEmptyOpeningRule()],
      scheduler: createDefaultScheduler(),
      notificationTargets: [createEmptyNotificationTarget()],
      notes: ""
    };
  }

  return {
    promptText: configVersion.promptText,
    tagMappings: parseTagMappings(configVersion.tagMappingJson),
    openingRules: parseOpeningRules(configVersion.openingRulesJson),
    scheduler: parseScheduler(configVersion.schedulerJson),
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

export function createDefaultScheduler(): SchedulerDraft {
  return {
    useSystemDefaults: true,
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
    rawTag: readString(entry, "rawTag"),
    role: readString(entry, "role"),
    canonicalValue: readString(entry, "canonicalValue"),
    source: (readString(entry, "source") === "operator_override" ? "operator_override" : "system_default") as "system_default" | "operator_override"
  }));
  return mapped.length > 0 ? mapped : [createEmptyTagMapping()];
}

function parseOpeningRules(value: unknown): OpeningRuleDraft[] {
  const selectors = readArrayField(value, "selectors");
  const mapped = selectors.map((entry) => ({
    buttonTitle: readString(entry, "buttonTitle"),
    signalType: readString(entry, "signalType"),
    canonicalValue: readString(entry, "canonicalValue")
  }));
  return mapped.length > 0 ? mapped : [createEmptyOpeningRule()];
}

function parseScheduler(value: unknown): SchedulerDraft {
  if (!value || typeof value !== "object") {
    return createDefaultScheduler();
  }
  return {
    useSystemDefaults: readBoolean(value, "useSystemDefaults", true),
    officialDailyTime: readString(value, "officialDailyTime") || "00:00",
    lookbackHours: readNumber(value, "lookbackHours", 2)
  };
}

function parseNotificationTargets(value: unknown): NotificationTargetDraft[] {
  const channels = readArrayField(value, "channels");
  const mapped = channels.map((entry) => ({
    channel: readString(entry, "channel"),
    value: readString(entry, "value")
  }));
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
