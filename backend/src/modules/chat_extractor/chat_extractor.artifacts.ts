import { createHash } from "node:crypto";
import type {
  NotificationTargetsConfig,
  OpeningRulesConfig,
  SchedulerConfig,
  TagMappingConfig
} from "./chat_extractor.types.ts";

export const DEFAULT_PAGE_PROMPT = [
  "Đánh giá hội thoại theo đúng quy trình vận hành của page này.",
  "Tập trung vào nhu cầu khách hàng, cách nhân viên phản hồi và kết quả chốt cuối ngày.",
  "Không suy diễn ngoài nội dung hội thoại."
].join(" ");

export const OUTPUT_CONTRACT_VERSION = "conversation_analysis.v1";
export const PAGE_PROMPT_IDENTITY_VERSION = "page_prompt_identity.v1";
export const DEFAULT_ANALYSIS_TAXONOMY = {
  version: 1,
  categories: {}
};

const BUILTIN_OPENING_RULE_SELECTORS: OpeningRulesConfig["selectors"] = [
  {
    selectorId: "builtin-journey-new-to-clinic",
    signalRole: "journey",
    signalCode: "new_to_clinic",
    allowedMessageTypes: ["template", "text"],
    options: [
      {
        rawText: "Khách hàng lần đầu",
        matchMode: "casefold_exact"
      }
    ]
  },
  {
    selectorId: "builtin-journey-revisit",
    signalRole: "journey",
    signalCode: "revisit",
    allowedMessageTypes: ["template", "text"],
    options: [
      {
        rawText: "Khách hàng tái khám",
        matchMode: "casefold_exact"
      }
    ]
  },
  {
    selectorId: "builtin-need-consultation-call",
    signalRole: "need",
    signalCode: "consultation",
    allowedMessageTypes: ["template", "text"],
    options: [
      {
        rawText: "Tôi muốn gọi tư vấn",
        matchMode: "casefold_exact"
      }
    ]
  },
  {
    selectorId: "builtin-need-consultation-chat",
    signalRole: "need",
    signalCode: "consultation",
    allowedMessageTypes: ["template", "text"],
    options: [
      {
        rawText: "Tôi muốn chat tư vấn",
        matchMode: "casefold_exact"
      }
    ]
  },
  {
    selectorId: "builtin-need-appointment-booking",
    signalRole: "need",
    signalCode: "appointment_booking",
    allowedMessageTypes: ["template", "text"],
    options: [
      {
        rawText: "Đặt lịch hẹn",
        matchMode: "casefold_exact"
      }
    ]
  }
];

export function defaultTagMappingConfig(): TagMappingConfig {
  return {
    version: 1,
    defaultRole: "noise",
    entries: []
  };
}

export function defaultOpeningRulesConfig(): OpeningRulesConfig {
  return cloneJsonValue({
    version: 1,
    selectors: BUILTIN_OPENING_RULE_SELECTORS
  });
}

export function defaultSchedulerConfig(timezone: string): SchedulerConfig {
  return {
    version: 1,
    timezone,
    officialDailyTime: "00:00",
    lookbackHours: 2,
    maxConversationsPerRun: 0,
    maxMessagePagesPerThread: 0
  };
}

export function buildPagePromptIdentityText(input: {
  promptText: string;
  taxonomyJson: unknown;
}) {
  return [
    `page_prompt_identity_version=${PAGE_PROMPT_IDENTITY_VERSION}`,
    `output_contract_version=${OUTPUT_CONTRACT_VERSION}`,
    `taxonomy=${stableStringify(input.taxonomyJson)}`,
    `page_prompt=${input.promptText.trim()}`
  ].join("\n\n");
}

export function hashPagePromptIdentity(promptIdentityText: string) {
  return hashStableValue({ promptIdentityText });
}

export function hashEtlConfig(input: {
  tagMapping: TagMappingConfig;
  openingRules: OpeningRulesConfig;
  scheduler: SchedulerConfig | null;
}) {
  return hashStableValue({
    tagMapping: input.tagMapping,
    openingRules: input.openingRules,
    scheduler: input.scheduler
  });
}

export function hashPromptPreviewSampleScope(input: {
  connectedPageId: string;
  targetDate: string;
  businessTimezone: string;
  windowStartAt: string;
  windowEndExclusiveAt: string;
  sampleConversation: unknown;
}) {
  return hashStableValue({
    connectedPageId: input.connectedPageId,
    targetDate: input.targetDate,
    businessTimezone: input.businessTimezone,
    windowStartAt: input.windowStartAt,
    windowEndExclusiveAt: input.windowEndExclusiveAt,
    sampleConversation: input.sampleConversation
  });
}

export function nextPromptVersion(existingVersions: string[]) {
  const normalized = new Set(existingVersions.map((value) => value.trim()).filter(Boolean));
  let cursor = 1;
  while (true) {
    const candidate = toAlphabetLabel(cursor);
    if (!normalized.has(candidate)) {
      return candidate;
    }
    cursor += 1;
  }
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(sortDeep(value));
}

export function cloneJsonValue<T>(value: T): T {
  return JSON.parse(stableStringify(value)) as T;
}

export function normalizeNullableConfig<T>(value: T | null | undefined, fallback: T): T {
  return value == null ? fallback : cloneJsonValue(value);
}

export function normalizeNullableOptionalConfig<T>(value: T | null | undefined): T | null {
  return value == null ? null : cloneJsonValue(value);
}

function hashStableValue(value: unknown) {
  return `sha256:${createHash("sha256").update(stableStringify(value)).digest("hex")}`;
}

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sortDeep(item));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, sortDeep(item)])
    );
  }

  return value;
}

function toAlphabetLabel(index: number) {
  let cursor = index;
  let label = "";
  while (cursor > 0) {
    const remainder = (cursor - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    cursor = Math.floor((cursor - 1) / 26);
  }
  return label;
}
