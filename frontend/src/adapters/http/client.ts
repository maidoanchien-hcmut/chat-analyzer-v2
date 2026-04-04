import { DEFAULT_API_BASE_URL } from "../../core/config.ts";

export function normalizeBaseUrl(value: string) {
  const trimmed = value.trim().replace(/\/+$/, "");
  return trimmed || DEFAULT_API_BASE_URL;
}

export async function requestJson<T>(baseUrl: string, method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${normalizeBaseUrl(baseUrl)}${path}`, {
    method,
    headers: {
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });

  const text = await response.text();
  const payload = text ? parseJsonSafely(text) : null;

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}\n${typeof payload === "string" ? payload : JSON.stringify(payload, null, 2)}`);
  }

  return payload as T;
}

function parseJsonSafely(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}
