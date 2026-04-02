export class ApiError extends Error {
  status: number;
  payload: unknown;

  constructor(status: number, message: string, payload: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
  }
}

type ApiRequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  token?: string | null;
  data?: unknown;
  signal?: AbortSignal;
};

const API_BASE_URL = resolveApiBaseUrl();

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const { method = "GET", token = null, data, signal } = options;
  const headers = new Headers();

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const hasJsonBody = data !== undefined && !(data instanceof FormData);

  if (hasJsonBody) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(new URL(path, API_BASE_URL), {
    method,
    credentials: "include",
    headers,
    body: hasJsonBody ? JSON.stringify(data) : (data as BodyInit | undefined),
    signal
  });

  const contentType = response.headers.get("content-type") ?? "";
  const payload = contentType.includes("application/json")
    ? await response.json().catch(() => null)
    : await response.text().catch(() => "");

  if (!response.ok) {
    throw new ApiError(response.status, readErrorMessage(payload, response.statusText), payload);
  }

  return payload as T;
}

export function readErrorMessage(payload: unknown, fallback = "Request failed"): string {
  if (typeof payload === "string" && payload.trim().length > 0) {
    return payload;
  }

  if (
    payload &&
    typeof payload === "object" &&
    "message" in payload &&
    typeof (payload as { message?: unknown }).message === "string"
  ) {
    return (payload as { message: string }).message;
  }

  return fallback;
}

function resolveApiBaseUrl() {
  const configuredBaseUrl = import.meta.env.VITE_BACKEND_API_BASE_URL?.trim();

  if (configuredBaseUrl) {
    try {
      return new URL(configuredBaseUrl).toString();
    } catch {
      throw new Error(
        `Invalid VITE_BACKEND_API_BASE_URL: "${configuredBaseUrl}". Expected an absolute URL such as "http://localhost:3000".`
      );
    }
  }

  if (import.meta.env.DEV) {
    return "http://localhost:3000/";
  }

  throw new Error(
    "Missing VITE_BACKEND_API_BASE_URL. Set it in frontend/.env, for example VITE_BACKEND_API_BASE_URL=\"http://localhost:3000\"."
  );
}
