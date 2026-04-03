import type { ProcessingMode, RunMode, SortBy, SortOrder, View } from "./types.ts";

export function addDays(input: Date, days: number) {
  const next = new Date(input.getTime());
  next.setDate(next.getDate() + days);
  return next;
}

export function dateToken(input: Date) {
  const year = input.getFullYear();
  const month = String(input.getMonth() + 1).padStart(2, "0");
  const day = String(input.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const FALLBACK_TIMEZONES = [
  "Asia/Ho_Chi_Minh",
  "Asia/Bangkok",
  "Asia/Singapore",
  "Asia/Tokyo",
  "UTC"
];

export function listTimezones() {
  const supportedValues = (Intl as unknown as {
    supportedValuesOf?: (key: string) => string[];
  }).supportedValuesOf;
  if (typeof supportedValues === "function") {
    const values = supportedValues("timeZone");
    if (Array.isArray(values) && values.length > 0) {
      return values;
    }
  }
  return FALLBACK_TIMEZONES;
}

export function normalizeBaseUrl(value: string) {
  const trimmed = value.trim().replace(/\/+$/, "");
  return trimmed || "http://localhost:3000";
}

export function parseView(value: string | undefined): View {
  if (value === "onboarding" || value === "dashboard" || value === "exploratory" || value === "history" || value === "comparison" || value === "settings") {
    return value;
  }
  return "dashboard";
}

export function parseProcessingMode(value: string): ProcessingMode {
  return value === "etl_only" ? "etl_only" : "etl_and_ai";
}

export function parseRunMode(value: string): RunMode {
  return value === "custom_range" ? "custom_range" : "full_day";
}

export function parseSortBy(value: string): SortBy {
  if (value === "target_date" || value === "messages" || value === "cost") {
    return value;
  }
  return "latest_message";
}

export function parseSortOrder(value: string): SortOrder {
  return value === "asc" ? "asc" : "desc";
}

export function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString("vi-VN");
}

export function shortId(value: string) {
  return value.slice(0, 8);
}

export function compactText(value: string, limit: number) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length <= limit ? normalized : `${normalized.slice(0, limit)}...`;
}

export function readInput(selector: string, fallback: string) {
  const element = document.querySelector<HTMLInputElement>(selector);
  return element?.value ?? fallback;
}

export function readTextArea(selector: string, fallback: string) {
  const element = document.querySelector<HTMLTextAreaElement>(selector);
  return element?.value ?? fallback;
}

export function readSelect(selector: string, fallback: string) {
  const element = document.querySelector<HTMLSelectElement>(selector);
  return element?.value ?? fallback;
}

export function readCheck(selector: string, fallback: boolean) {
  const element = document.querySelector<HTMLInputElement>(selector);
  return element?.checked ?? fallback;
}

export function parseJsonInput(raw: string, fieldName: string) {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new Error(`${fieldName} phải là JSON hợp lệ.`);
  }
}

export function readRequiredPositiveInt(raw: string, error: string) {
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(error);
  }
  return parsed;
}

export function readOptionalInt(raw: string) {
  if (!raw.trim()) {
    return null;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error("Số không hợp lệ.");
  }
  return parsed;
}

export function emptyAsNull(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function withQuery(path: string, values: Record<string, string | number | null | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value === null || value === undefined || value === "") {
      continue;
    }
    params.set(key, String(value));
  }
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

export function prettyJson(value: unknown) {
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return "{}";
  }
}

export type TagRuleLine = {
  rawLabel: string;
  signal: string;
};

export type OpeningRuleLine = {
  signal: string;
  decision: string;
  rawText: string;
};

export function parseTagRulesText(value: string): TagRuleLine[] {
  const rows: TagRuleLine[] = [];
  for (const line of value.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    const parts = trimmed.split("=>").map((item) => item.trim()).filter(Boolean);
    if (parts.length < 2) {
      throw new Error("Tag classification phải theo định dạng: raw_tag => signal");
    }
    rows.push({
      rawLabel: parts[0],
      signal: parts[1]
    });
  }
  return rows;
}

export function parseOpeningRulesText(value: string): OpeningRuleLine[] {
  const rows: OpeningRuleLine[] = [];
  for (const line of value.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    const parts = trimmed.split("|").map((item) => item.trim()).filter(Boolean);
    if (parts.length < 3) {
      throw new Error("Opening rules phải theo định dạng: signal | decision | raw_text");
    }
    rows.push({
      signal: parts[0],
      decision: parts[1],
      rawText: parts.slice(2).join(" | ")
    });
  }
  return rows;
}

export function tagMappingJsonToRulesText(value: unknown) {
  const source = value && typeof value === "object" && !Array.isArray(value)
    ? (value as { entries?: Array<{ raw_label?: unknown; signal?: unknown }> })
    : {};
  const entries = Array.isArray(source.entries) ? source.entries : [];
  return entries
    .map((entry) => {
      const raw = typeof entry.raw_label === "string" ? entry.raw_label.trim() : "";
      const signal = typeof entry.signal === "string" ? entry.signal.trim() : "";
      return raw && signal ? `${raw} => ${signal}` : "";
    })
    .filter(Boolean)
    .join("\n");
}

export function openingRulesJsonToRulesText(value: unknown) {
  const source = value && typeof value === "object" && !Array.isArray(value)
    ? (value as {
        selectors?: Array<{
          signal?: unknown;
          options?: Array<{ decision?: unknown; raw_text?: unknown }>;
        }>;
      })
    : {};
  const selectors = Array.isArray(source.selectors) ? source.selectors : [];
  const lines: string[] = [];
  for (const selector of selectors) {
    const signal = typeof selector.signal === "string" ? selector.signal.trim() : "";
    const options = Array.isArray(selector.options) ? selector.options : [];
    for (const option of options) {
      const decision = typeof option.decision === "string" ? option.decision.trim() : "";
      const rawText = typeof option.raw_text === "string" ? option.raw_text.trim() : "";
      if (signal && decision && rawText) {
        lines.push(`${signal} | ${decision} | ${rawText}`);
      }
    }
  }
  return lines.join("\n");
}

export function safeParseJson(raw: string) {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
}

export function formatJson(value: unknown) {
  if (typeof value === "string") {
    return value;
  }
  if (!value) {
    return "Không có dữ liệu.";
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}
