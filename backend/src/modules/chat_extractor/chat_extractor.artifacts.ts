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

export const SYSTEM_PROMPT_TEXT = [
  "Bạn là hệ thống phân tích hội thoại cho một công ty duy nhất tại Việt Nam.",
  "Nhiệm vụ của bạn là đọc hội thoại đã được ETL chuẩn hóa và chuẩn bị cho các bước AI downstream."
].join(" ");

export const OUTPUT_CONTRACT_VERSION = "conversation_analysis.v1";
export const DEFAULT_ANALYSIS_TAXONOMY = {
  version: 1,
  categories: {}
};

export function defaultTagMappingConfig(): TagMappingConfig {
  return {
    version: 1,
    defaultRole: "noise",
    entries: []
  };
}

export function defaultOpeningRulesConfig(): OpeningRulesConfig {
  return {
    version: 1,
    selectors: []
  };
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

export function buildCompiledPromptText(input: {
  promptText: string;
  taxonomyJson: unknown;
}) {
  return [
    SYSTEM_PROMPT_TEXT,
    `output_contract_version=${OUTPUT_CONTRACT_VERSION}`,
    `taxonomy=${stableStringify(input.taxonomyJson)}`,
    `page_prompt=${input.promptText.trim()}`
  ].join("\n\n");
}

export function hashCompiledPrompt(compiledPromptText: string) {
  return hashStableValue({ compiledPromptText });
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
