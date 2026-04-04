export function normalizeBaseUrl(value: string) {
  const trimmed = value.trim().replace(/\/+$/, "");
  return trimmed || "http://localhost:3000";
}

export function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

export function prettyJson(value: unknown) {
  try {
    return JSON.stringify(value ?? null, null, 2);
  } catch {
    return String(value);
  }
}

export function safeParseJson(raw: string) {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString("vi-VN");
}

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
  return ["Asia/Ho_Chi_Minh", "UTC"];
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

export function toDatetimeLocalValue(value: string | null | undefined) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

export function toIsoStringOrNull(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Mốc thời gian không hợp lệ.");
  }
  return date.toISOString();
}

export function parseJsonText(value: string, fieldLabel: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    throw new Error(`${fieldLabel} phải là JSON hợp lệ.`);
  }
}
