import type {
  AppState,
  ComparisonData,
  DashboardData,
  JsonValue,
  OnboardingOpeningCandidate,
  OnboardingSample,
  OnboardingTagCandidate,
  ThreadDetail,
  ThreadsData
} from "./types.ts";
import {
  emptyAsNull,
  formatJson,
  normalizeBaseUrl,
  parseOpeningRulesText,
  parseTagRulesText,
  readOptionalInt,
  readRequiredPositiveInt,
  safeParseJson,
  openingRulesJsonToRulesText,
  tagMappingJsonToRulesText,
  withQuery
} from "./utils.ts";

export async function requestJson<T>(state: AppState, method: "GET" | "POST" | "PATCH", path: string, body?: unknown): Promise<T> {
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
    throw new Error(`${response.status} ${response.statusText}\n${formatJson(parsed)}`);
  }
  return parsed as T;
}

export async function loadPages(state: AppState) {
  const data = await requestJson<{ pages: AppState["pages"] }>(state, "GET", "/chat-extractor/control-center/pages-lite");
  state.pages = data.pages ?? [];
  const selected = state.pages.find((page) => page.id === state.pageId) ?? state.pages[0] ?? null;
  state.pageId = selected?.id ?? "";
}

export function requirePageId(state: AppState) {
  const pageId = state.pageId.trim();
  if (!pageId) {
    throw new Error("Cần chọn page.");
  }
  return pageId;
}

export function buildCommonFilterQuery(state: AppState) {
  return {
    startDate: state.startDate,
    endDate: state.endDate,
    mood: emptyAsNull(state.mood),
    primaryNeed: emptyAsNull(state.need),
    customerType: emptyAsNull(state.customerType),
    riskLevel: emptyAsNull(state.risk)
  };
}

export async function loadDashboard(state: AppState) {
  const pageId = requirePageId(state);
  const query = withQuery("/chat-extractor/control-center/dashboard", {
    ...buildCommonFilterQuery(state),
    connectedPageId: pageId,
    limitLatestThreads: 30
  });
  state.dashboard = await requestJson<DashboardData>(state, "GET", query);
}

export async function loadExploratoryThreads(state: AppState) {
  const pageId = requirePageId(state);
  const query = withQuery(`/chat-extractor/control-center/pages/${encodeURIComponent(pageId)}/threads`, {
    ...buildCommonFilterQuery(state),
    q: emptyAsNull(state.search),
    minMessages: readOptionalInt(state.minMessages),
    sortBy: state.sortBy,
    sortOrder: state.sortOrder,
    limit: 300,
    offset: 0
  });
  state.exploratory = await requestJson<ThreadsData>(state, "GET", query);
}

export async function loadHistoryThreads(state: AppState) {
  const pageId = requirePageId(state);
  const query = withQuery(`/chat-extractor/control-center/pages/${encodeURIComponent(pageId)}/threads`, {
    ...buildCommonFilterQuery(state),
    q: emptyAsNull(state.search),
    sortBy: "latest_message",
    sortOrder: "desc",
    limit: 300,
    offset: 0
  });
  const data = await requestJson<ThreadsData>(state, "GET", query);
  state.historyThreads = data.threads ?? [];
  if (!state.historyThreads.some((item) => item.threadId === state.historyThreadId)) {
    state.historyThreadId = state.historyThreads[0]?.threadId ?? "";
  }
}

export async function loadHistoryDetail(state: AppState, threadId: string) {
  const pageId = requirePageId(state);
  const query = withQuery(`/chat-extractor/control-center/pages/${encodeURIComponent(pageId)}/threads/${encodeURIComponent(threadId)}`, {
    startDate: state.startDate,
    endDate: state.endDate
  });
  state.historyDetail = await requestJson<ThreadDetail>(state, "GET", query);
}

export async function loadComparison(state: AppState) {
  const query = withQuery("/chat-extractor/control-center/comparison", {
    startDate: state.startDate,
    endDate: state.endDate
  });
  state.comparison = await requestJson<ComparisonData>(state, "GET", query);
}

export async function loadSettings(state: AppState) {
  const pageId = requirePageId(state);
  const [pageRes, promptsRes] = await Promise.all([
    requestJson<{ page: AppState["pages"][number] }>(state, "GET", `/chat-extractor/control-center/pages/${encodeURIComponent(pageId)}`),
    requestJson<{ prompts: Array<{ id: string; promptText: string }>; activePromptVersionId: string | null }>(state, "GET", `/chat-extractor/control-center/pages/${encodeURIComponent(pageId)}/prompts`)
  ]);

  const page = pageRes.page;
  state.settingTimezone = page.businessTimezone;
  state.settingEtlEnabled = page.etlEnabled;
  state.settingAnalysisEnabled = page.analysisEnabled;
  state.settingTagRulesText = tagMappingJsonToRulesText(page.activeTagMappingJson);
  state.settingOpeningRulesText = openingRulesJsonToRulesText(page.activeOpeningRulesJson);

  const activePrompt = promptsRes.prompts.find((item) => item.id === promptsRes.activePromptVersionId) ?? promptsRes.prompts[0] ?? null;
  state.settingPrompt = activePrompt?.promptText ?? "";
  state.activePrompt = activePrompt?.promptText ?? "";
}

export async function saveSettings(state: AppState) {
  const pageId = requirePageId(state);
  await requestJson(state, "PATCH", `/chat-extractor/control-center/pages/${encodeURIComponent(pageId)}`, {
    businessTimezone: state.settingTimezone.trim() || "Asia/Ho_Chi_Minh",
    etlEnabled: state.settingEtlEnabled,
    analysisEnabled: state.settingAnalysisEnabled,
    activeTagMappingJson: buildTagMappingFromRulesText(state.settingTagRulesText),
    activeOpeningRulesJson: buildOpeningRulesFromRulesText(state.settingOpeningRulesText)
  });
}

export async function savePrompt(state: AppState) {
  const pageId = requirePageId(state);
  const promptText = state.settingPrompt.trim();
  if (!promptText) {
    throw new Error("Prompt không được rỗng.");
  }
  const created = await requestJson<{ prompt: { id: string } }>(state, "POST", `/chat-extractor/control-center/pages/${encodeURIComponent(pageId)}/prompts`, {
    promptText
  });
  await requestJson(state, "POST", `/chat-extractor/control-center/pages/${encodeURIComponent(pageId)}/prompts/${encodeURIComponent(created.prompt.id)}/activate`, {});
  state.activePrompt = promptText;
}

export async function executeManualRun(state: AppState) {
  const pageId = requirePageId(state);
  const job: Record<string, JsonValue> = {
    processingMode: state.runProcessingMode
  };

  if (state.runMode === "full_day") {
    if (!state.runTargetDate) {
      throw new Error("Cần target_date.");
    }
    job.runMode = "backfill_day";
    job.targetDate = state.runTargetDate;
  } else {
    if (!state.runWindowStart || !state.runWindowEnd) {
      throw new Error("Cần window_start/window_end.");
    }
    job.runMode = "manual_range";
    job.requestedWindowStartAt = new Date(state.runWindowStart).toISOString();
    job.requestedWindowEndExclusiveAt = new Date(state.runWindowEnd).toISOString();
  }

  const maxConversations = readOptionalInt(state.runMaxConversations);
  const maxPages = readOptionalInt(state.runMaxMessagePages);
  if (maxConversations !== null) {
    job.maxConversations = maxConversations;
  }
  if (maxPages !== null) {
    job.maxMessagePagesPerConversation = maxPages;
  }

  const result = await requestJson<{
    preview: { jobName: string };
    executions: Array<{ ok: boolean; exitCode: number; stderr: string }>;
  }>(state, "POST", "/chat-extractor/jobs/execute", {
    kind: "manual",
    connectedPageId: pageId,
    job
  });

  const failed = result.executions.find((item) => !item.ok);
  if (failed) {
    throw new Error(`Manual run lỗi (exitCode=${failed.exitCode}): ${failed.stderr}`);
  }
  return result.preview.jobName;
}

export async function loadRunGroups(state: AppState) {
  const pageId = requirePageId(state);
  const data = await requestJson<{ runGroups: AppState["runGroups"] }>(state, "GET", `/chat-extractor/control-center/pages/${encodeURIComponent(pageId)}/run-groups`);
  state.runGroups = data.runGroups ?? [];
  if (!state.runGroups.some((item) => item.runGroupId === state.selectedRunGroupId)) {
    state.selectedRunGroupId = state.runGroups[0]?.runGroupId ?? "";
  }
}

export async function loadRunGroupThreads(state: AppState) {
  if (!state.selectedRunGroupId) {
    state.runGroupThreads = [];
    return;
  }
  const data = await requestJson<{ threads: AppState["runGroupThreads"] }>(state, "GET", withQuery(`/chat-extractor/control-center/run-groups/${encodeURIComponent(state.selectedRunGroupId)}/threads`, {
    limit: 300
  }));
  state.runGroupThreads = data.threads ?? [];
}

export async function loadMappingReview(state: AppState) {
  const pageId = requirePageId(state);
  const data = await requestJson<{ items: AppState["mappingReview"] }>(state, "GET", withQuery(`/chat-extractor/control-center/pages/${encodeURIComponent(pageId)}/mapping-review`, {
    limit: 200
  }));
  state.mappingReview = data.items ?? [];
}

export async function loadHealth(state: AppState) {
  state.health = await requestJson<AppState["health"]>(state, "GET", "/chat-extractor/health/summary");
}

export async function loadOnboardingPages(state: AppState) {
  if (!state.onboardingToken.trim()) {
    throw new Error("Cần token Pancake.");
  }
  const data = await requestJson<AppState["onboardingPages"] | { pages: AppState["onboardingPages"] }>(state, "POST", "/chat-extractor/pages/list-from-token", {
    userAccessToken: state.onboardingToken.trim()
  });
  state.onboardingPages = Array.isArray(data) ? data : data.pages ?? [];
  state.onboardingPageId = state.onboardingPages[0]?.pageId ?? "";
}

export async function loadOnboardingSample(state: AppState) {
  if (!state.onboardingPageId) {
    throw new Error("Cần chọn page.");
  }
  const data = await requestJson<{ sample: AppState["onboardingSample"] }>(state, "POST", "/chat-extractor/control-center/setup/sample", {
    pancakePageId: state.onboardingPageId,
    userAccessToken: state.onboardingToken.trim(),
    businessTimezone: state.onboardingTimezone.trim() || "Asia/Ho_Chi_Minh",
    processingMode: state.onboardingMode,
    initialConversationLimit: readRequiredPositiveInt(state.onboardingLimit, "initialConversationLimit phải > 0"),
    activeTagMappingJson: buildTagMappingFromCandidateSelections(state.onboardingTagCandidates),
    activeOpeningRulesJson: buildOpeningRulesFromCandidateSelections(state.onboardingOpeningCandidates, state.onboardingOpeningMaxMessages)
  });
  const sample = data.sample ?? null;
  state.onboardingSample = sample;
  if (sample) {
    hydrateOnboardingCandidatesFromSample(state, sample);
  }
}

export async function commitOnboarding(state: AppState) {
  if (!state.onboardingPageId) {
    throw new Error("Cần chọn page.");
  }
  if (!state.onboardingPrompt.trim()) {
    throw new Error("Prompt không được rỗng.");
  }
  await requestJson(state, "POST", "/chat-extractor/control-center/setup/commit", {
    pancakePageId: state.onboardingPageId,
    userAccessToken: state.onboardingToken.trim(),
    businessTimezone: state.onboardingTimezone.trim() || "Asia/Ho_Chi_Minh",
    etlEnabled: state.onboardingEtlEnabled,
    analysisEnabled: state.onboardingAnalysisEnabled,
    activeTagMappingJson: buildTagMappingFromCandidateSelections(state.onboardingTagCandidates),
    activeOpeningRulesJson: buildOpeningRulesFromCandidateSelections(state.onboardingOpeningCandidates, state.onboardingOpeningMaxMessages),
    notificationTargetsJson: {},
    promptText: state.onboardingPrompt.trim()
  });
}

function buildTagMappingFromRulesText(value: string) {
  const entries = parseTagRulesText(value);
  return {
    version_no: 1,
    default_signal: "null",
    entries: entries.map((entry, index) => ({
      pancake_tag_id: buildStableTagId(entry.rawLabel, index),
      raw_label: entry.rawLabel,
      signal: entry.signal
    }))
  };
}

function buildOpeningRulesFromRulesText(value: string) {
  const rows = parseOpeningRulesText(value);
  const bySignal = new Map<string, Array<{ decision: string; raw_text: string }>>();
  for (const row of rows) {
    const bucket = bySignal.get(row.signal) ?? [];
    bucket.push({
      decision: row.decision,
      raw_text: row.rawText
    });
    bySignal.set(row.signal, bucket);
  }
  return {
    version_no: 1,
    boundary: {
      mode: "until_first_meaningful_human_message",
      max_messages: 12
    },
    selectors: [...bySignal.entries()].map(([signal, options]) => ({
      signal,
      allowed_message_types: ["postback", "quick_reply_selection", "template", "text"],
      options
    })),
    fallback: {
      store_candidate_if_unmatched: true
    }
  };
}

function buildTagMappingFromCandidateSelections(candidates: OnboardingTagCandidate[]) {
  const filtered = candidates
    .map((item) => ({
      rawLabel: item.rawLabel.trim(),
      signal: item.signal.trim()
    }))
    .filter((item) => item.rawLabel.length > 0 && item.signal.length > 0);

  return {
    version_no: 1,
    default_signal: "null",
    entries: filtered.map((item, index) => ({
      pancake_tag_id: buildStableTagId(item.rawLabel, index),
      raw_label: item.rawLabel,
      signal: item.signal
    }))
  };
}

function buildOpeningRulesFromCandidateSelections(candidates: OnboardingOpeningCandidate[], maxMessagesRaw: string) {
  const bySignal = new Map<string, Array<{ decision: string; raw_text: string }>>();
  for (const candidate of candidates) {
    const signal = candidate.signal.trim();
    const decision = candidate.decision.trim();
    const rawText = candidate.rawText.trim();
    if (!signal || !decision || !rawText) {
      continue;
    }
    const bucket = bySignal.get(signal) ?? [];
    if (!bucket.some((item) => item.decision === decision && item.raw_text === rawText)) {
      bucket.push({ decision, raw_text: rawText });
    }
    bySignal.set(signal, bucket);
  }
  for (const bucket of bySignal.values()) {
    bucket.sort((left, right) => left.raw_text.localeCompare(right.raw_text));
  }
  return {
    version_no: 1,
    boundary: {
      mode: "until_first_meaningful_human_message",
      max_messages: normalizePositiveIntOrDefault(maxMessagesRaw, 12)
    },
    selectors: [...bySignal.entries()].map(([signal, options]) => ({
      signal,
      allowed_message_types: ["postback", "quick_reply_selection", "template", "text"],
      options
    })),
    fallback: {
      store_candidate_if_unmatched: true
    }
  };
}

function hydrateOnboardingCandidatesFromSample(state: AppState, sample: OnboardingSample) {
  const existingTagSignals = new Map<string, string>();
  for (const item of state.onboardingTagCandidates) {
    const key = normalizeKey(item.rawLabel);
    if (key) {
      existingTagSignals.set(key, item.signal.trim());
    }
  }
  state.onboardingTagCandidates = (sample.tagCandidates ?? [])
    .map((item) => ({
      rawLabel: item.text.trim(),
      count: item.count,
      signal: existingTagSignals.get(normalizeKey(item.text)) ?? ""
    }))
    .filter((item) => item.rawLabel.length > 0);

  const matchedByText = new Map<string, { signal: string; decision: string }>();
  const matchedSelections = sample.openingCandidates?.matchedOpeningSelections ?? [];
  for (const item of matchedSelections) {
    const key = normalizeKey(item.rawText);
    if (!key) {
      continue;
    }
    matchedByText.set(key, {
      signal: item.signal.trim(),
      decision: item.decision.trim()
    });
  }

  const existingOpening = new Map<string, { signal: string; decision: string }>();
  for (const item of state.onboardingOpeningCandidates) {
    const key = normalizeKey(item.rawText);
    if (key) {
      existingOpening.set(key, {
        signal: item.signal.trim(),
        decision: item.decision.trim()
      });
    }
  }

  const textCount = new Map<string, number>();
  for (const row of sample.openingCandidates?.unmatchedOpeningTexts ?? []) {
    addCount(textCount, row.text, row.count);
  }
  for (const row of sample.openingCandidates?.topOpeningCandidateWindows ?? []) {
    for (const text of row.signature) {
      addCount(textCount, text, row.count);
    }
  }
  for (const row of matchedSelections) {
    addCount(textCount, row.rawText, row.count);
  }

  state.onboardingOpeningCandidates = [...textCount.entries()]
    .map(([rawText, count]) => {
      const key = normalizeKey(rawText);
      const matched = key ? matchedByText.get(key) : undefined;
      const existing = key ? existingOpening.get(key) : undefined;
      return {
        rawText,
        count,
        signal: matched?.signal ?? existing?.signal ?? "",
        decision: matched?.decision ?? existing?.decision ?? ""
      };
    })
    .sort((left, right) => right.count - left.count || left.rawText.localeCompare(right.rawText));
}

function addCount(map: Map<string, number>, rawText: string, amount: number) {
  const text = rawText.trim();
  if (!text) {
    return;
  }
  const count = Number.isFinite(amount) && amount > 0 ? amount : 1;
  map.set(text, (map.get(text) ?? 0) + count);
}

function normalizePositiveIntOrDefault(raw: string, fallback: number) {
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value <= 0) {
    return fallback;
  }
  return value;
}

function normalizeKey(raw: string) {
  return raw.trim().toLowerCase();
}

function buildStableTagId(rawLabel: string, fallbackIndex: number) {
  const normalized = rawLabel
    .trim()
    .toLowerCase()
    .replaceAll(/[^\p{L}\p{N}]+/gu, "_")
    .replaceAll(/^_+|_+$/g, "");
  if (normalized) {
    return `tag_${normalized}`;
  }
  return `tag_${fallbackIndex + 1}`;
}
