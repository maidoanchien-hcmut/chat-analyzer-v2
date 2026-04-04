import type {
  AppState,
  ConnectedPageDetail,
  ListedPage,
  PreviewResult,
  RunDetailResult,
  RunGroupResult
} from "./types.ts";
import { normalizeBaseUrl, safeParseJson } from "./utils.ts";

export async function requestJson<T>(state: AppState, method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${normalizeBaseUrl(state.apiBaseUrl)}${path}`, {
    method,
    headers: {
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await response.text();
  const parsed = text ? safeParseJson(text) : null;
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}\n${typeof parsed === "string" ? parsed : JSON.stringify(parsed, null, 2)}`);
  }
  return parsed as T;
}

export async function listPagesFromToken(state: AppState, userAccessToken: string) {
  return requestJson<ListedPage[] | { pages: ListedPage[] }>(state, "POST", "/chat-extractor/control-center/pages/list-from-token", {
    userAccessToken
  });
}

export async function registerPage(state: AppState, input: {
  pancakePageId: string;
  userAccessToken: string;
  businessTimezone: string;
  etlEnabled: boolean;
  analysisEnabled: boolean;
}) {
  return requestJson<{ page: ConnectedPageDetail }>(state, "POST", "/chat-extractor/control-center/pages/register", input);
}

export async function listConnectedPages(state: AppState) {
  return requestJson<{ pages: ConnectedPageDetail[] }>(state, "GET", "/chat-extractor/control-center/pages");
}

export async function getConnectedPage(state: AppState, pageId: string) {
  return requestJson<{ page: ConnectedPageDetail }>(state, "GET", `/chat-extractor/control-center/pages/${encodeURIComponent(pageId)}`);
}

export async function createConfigVersion(state: AppState, pageId: string, input: Record<string, unknown>) {
  return requestJson<{ configVersion: unknown; active: boolean }>(
    state,
    "POST",
    `/chat-extractor/control-center/pages/${encodeURIComponent(pageId)}/config-versions`,
    input
  );
}

export async function activateConfigVersion(state: AppState, pageId: string, configVersionId: string) {
  return requestJson<{ page: ConnectedPageDetail }>(
    state,
    "POST",
    `/chat-extractor/control-center/pages/${encodeURIComponent(pageId)}/config-versions/${encodeURIComponent(configVersionId)}/activate`,
    {}
  );
}

export async function previewManualJob(state: AppState, body: Record<string, unknown>) {
  return requestJson<PreviewResult>(state, "POST", "/chat-extractor/jobs/preview", body);
}

export async function executeManualJob(state: AppState, body: Record<string, unknown>) {
  return requestJson<RunGroupResult>(state, "POST", "/chat-extractor/jobs/execute", body);
}

export async function getRunGroup(state: AppState, runGroupId: string) {
  return requestJson<RunGroupResult>(state, "GET", `/chat-extractor/run-groups/${encodeURIComponent(runGroupId)}`);
}

export async function getRun(state: AppState, runId: string) {
  return requestJson<RunDetailResult>(state, "GET", `/chat-extractor/runs/${encodeURIComponent(runId)}`);
}

export async function publishRun(state: AppState, runId: string, body: Record<string, unknown>) {
  return requestJson<RunDetailResult>(state, "POST", `/chat-extractor/runs/${encodeURIComponent(runId)}/publish`, body);
}
