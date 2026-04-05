import { resolveBusinessLabel } from "./read_models.labels.ts";
import { readModelsRepository } from "./read_models.repository.ts";
import type { WarningView } from "./read_models.types.ts";

type ThreadFactRow = Awaited<ReturnType<typeof readModelsRepository.listFactThreadDaysByRunIds>>[number];
type ThreadSummaryRow = Awaited<ReturnType<typeof readModelsRepository.listThreadSummaries>>[number];
type ThreadWorkspaceRow = Awaited<ReturnType<typeof readModelsRepository.getThreadWorkspace>>;
type ActiveTab = "conversation" | "analysis-history" | "ai-audit" | "crm-link";

type BuildThreadHistoryViewInput = {
  warning: WarningView | null;
  businessTimezone: string;
  taxonomyJson: unknown;
  requestedThreadId: string | null;
  activeTab: ActiveTab;
  threadFacts: ThreadFactRow[];
  threadSummaries: ThreadSummaryRow[];
  workspace: NonNullable<ThreadWorkspaceRow> | null;
};

export function buildThreadHistoryView(input: BuildThreadHistoryViewInput) {
  const threads = buildThreadList(input.threadFacts, input.threadSummaries);
  const activeThreadId = input.requestedThreadId && threads.some((thread) => thread.id === input.requestedThreadId)
    ? input.requestedThreadId
    : (threads[0]?.id ?? "");
  const threadDays = input.workspace?.threadDays ?? [];
  const activeThreadDay = threadDays[0] ?? null;
  const activeResult = activeThreadDay?.analysisResults[0] ?? null;

  return {
    warning: input.warning,
    threads,
    activeThreadId,
    activeTab: input.activeTab,
    transcript: (activeThreadDay?.messages ?? []).map((message) => ({
      at: formatDateTime(message.insertedAt, input.businessTimezone),
      author: message.senderName?.trim() || defaultAuthorLabel(message.senderRole),
      role: normalizeMessageRole(message.senderRole),
      text: message.redactedText?.trim() || "(message redacted)",
      emphasized: message.id === activeThreadDay?.firstMeaningfulMessageId
    })),
    analysisHistory: threadDays
      .filter((threadDay) => threadDay.analysisResults.length > 0)
      .map((threadDay) => buildAnalysisHistoryRow(threadDay, input.taxonomyJson)),
    audit: buildAudit(activeResult, activeThreadDay?.firstMeaningfulMessageTextRedacted),
    crmLink: buildCrmLink(input.workspace)
  };
}

export function resolveActiveThreadId(
  threadFacts: ThreadFactRow[],
  threadSummaries: ThreadSummaryRow[],
  requestedThreadId: string | null
) {
  const threads = buildThreadList(threadFacts, threadSummaries);
  if (requestedThreadId && threads.some((thread) => thread.id === requestedThreadId)) {
    return requestedThreadId;
  }
  return threads[0]?.id ?? null;
}

function buildThreadList(threadFacts: ThreadFactRow[], threadSummaries: ThreadSummaryRow[]) {
  const factsByThread = groupBy(threadFacts, (row) => row.threadId);
  const latestSummaryByThread = new Map<string, ThreadSummaryRow>();
  for (const row of threadSummaries) {
    if (!latestSummaryByThread.has(row.threadId)) {
      latestSummaryByThread.set(row.threadId, row);
    }
  }

  return Object.entries(factsByThread)
    .map(([threadId, rows]) => {
      const latestSummary = latestSummaryByThread.get(threadId);
      const updatedAt = latestSummary?.pipelineRun.targetDate.toISOString().slice(0, 10)
        ?? rows[rows.length - 1]?.date.fullDate.toISOString().slice(0, 10)
        ?? "";
      return {
        id: threadId,
        customer: latestSummary?.thread.customerDisplayName?.trim() || `Thread ${threadId.slice(0, 8)}`,
        snippet: latestSummary?.firstMeaningfulMessageTextRedacted?.trim()
          || rows.find((row) => row.firstMeaningfulMessageTextRedacted)?.firstMeaningfulMessageTextRedacted?.trim()
          || "Chua co tom tat hoi thoai.",
        updatedAt,
        badges: buildBadges(rows)
      };
    })
    .sort((left, right) => {
      if (left.updatedAt !== right.updatedAt) {
        return right.updatedAt.localeCompare(left.updatedAt);
      }
      return left.customer.localeCompare(right.customer);
    });
}

function buildBadges(rows: ThreadFactRow[]) {
  const badges: string[] = [];
  if (rows.some((row) => row.isNewInbox)) {
    badges.push("Inbox moi");
  }
  if (rows.some((row) => row.officialRevisitLabel === "revisit")) {
    badges.push("Tai kham");
  }
  if (rows.some((row) => row.processRiskLevelCode === "high")) {
    badges.push("Risk cao");
  }
  if (rows.some((row) => row.officialClosingOutcomeCode === "booked")) {
    badges.push("Da chot hen");
  }
  return badges.slice(0, 3);
}

function buildAnalysisHistoryRow(
  threadDay: NonNullable<NonNullable<ThreadWorkspaceRow>["threadDays"]>[number],
  taxonomyJson: unknown
) {
  const result = threadDay.analysisResults[0]!;
  return {
    date: threadDay.pipelineRun.targetDate.toISOString().slice(0, 10),
    openingTheme: resolveBusinessLabel(taxonomyJson, "opening_theme", result.openingThemeCode),
    need: resolveBusinessLabel(taxonomyJson, "primary_need", result.primaryNeedCode),
    outcome: resolveBusinessLabel(taxonomyJson, "closing_outcome", result.closingOutcomeInferenceCode),
    mood: resolveBusinessLabel(null, "customer_mood", result.customerMoodCode),
    risk: resolveBusinessLabel(null, "process_risk_level", result.processRiskLevelCode),
    quality: resolveBusinessLabel(null, "response_quality", dominantStaffQualityCode(result.staffAssessmentsJson)),
    aiCost: formatMoney(toBigInt(result.costMicros))
  };
}

function buildAudit(
  result: NonNullable<NonNullable<NonNullable<ThreadWorkspaceRow>["threadDays"]>[number]["analysisResults"]>[number] | null,
  firstMeaningfulMessageText: string | null | undefined
) {
  const evidence = uniqueValues([
    ...extractStrings(result?.evidenceUsedJson),
    ...(firstMeaningfulMessageText?.trim() ? [firstMeaningfulMessageText.trim()] : [])
  ]).slice(0, 8);

  return {
    model: result?.analysisRun.modelName ?? "Khong co du lieu",
    promptVersion: result?.analysisRun.promptVersion ?? "Khong co du lieu",
    promptHash: result?.analysisRun.promptHash ?? "Khong co du lieu",
    taxonomyVersion: result?.analysisRun.taxonomyVersion.versionCode ?? "Khong co du lieu",
    evidence,
    explanations: buildFieldExplanations(result?.fieldExplanationsJson),
    supportingMessageIds: extractStrings(result?.supportingMessageIdsJson)
  };
}

function buildCrmLink(workspace: NonNullable<ThreadWorkspaceRow> | null) {
  const confidence = workspace?.customerLink?.mappingConfidenceScore;
  return {
    customer: workspace?.customerLink?.customerId
      ? `CRM ${workspace.customerLink.customerId}`
      : "Chua co lien ket local",
    method: workspace?.customerLink?.mappingMethod ?? "read_only_local",
    confidence: formatConfidence(confidence),
    history: workspace?.linkDecisions.length
      ? workspace.linkDecisions.map((decision) => {
        const selectedCustomer = decision.selectedCustomerId ? ` -> ${decision.selectedCustomerId}` : "";
        return `${decision.createdAt.toISOString()} | ${decision.decisionSource} -> ${decision.decisionStatus}${selectedCustomer}`;
      })
      : ["Chua co decision history local. CRM action van bi gate cho toi khi contract CRM duoc pin."]
  };
}

function buildFieldExplanations(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [];
  }

  return Object.entries(value)
    .map(([field, rawExplanation]) => {
      const explanation = stringifyExplanation(rawExplanation);
      return explanation ? { field, explanation } : null;
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);
}

function dominantStaffQualityCode(value: unknown) {
  if (!Array.isArray(value) || value.length === 0) {
    return "unknown";
  }

  const counts = new Map<string, number>();
  for (const item of value) {
    const code = readQualityCode(item);
    if (!code) {
      continue;
    }
    counts.set(code, (counts.get(code) ?? 0) + 1);
  }

  const ranked = [...counts.entries()].sort((left, right) => right[1] - left[1]);
  return ranked[0]?.[0] ?? "unknown";
}

function readQualityCode(value: unknown) {
  if (!value || typeof value !== "object") {
    return "";
  }
  if ("response_quality_code" in value && typeof (value as { response_quality_code?: unknown }).response_quality_code === "string") {
    return (value as { response_quality_code: string }).response_quality_code.trim();
  }
  if ("responseQualityCode" in value && typeof (value as { responseQualityCode?: unknown }).responseQualityCode === "string") {
    return (value as { responseQualityCode: string }).responseQualityCode.trim();
  }
  return "";
}

function extractStrings(value: unknown): string[] {
  const bucket: string[] = [];
  collectStrings(value, bucket);
  return uniqueValues(bucket.map((item) => item.trim()).filter(Boolean));
}

function collectStrings(value: unknown, bucket: string[]) {
  if (typeof value === "string") {
    bucket.push(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectStrings(item, bucket);
    }
    return;
  }
  if (value && typeof value === "object") {
    for (const item of Object.values(value)) {
      collectStrings(item, bucket);
    }
  }
}

function stringifyExplanation(value: unknown): string | null {
  if (typeof value === "string") {
    return value.trim() || null;
  }
  if (Array.isArray(value)) {
    const collected = value
      .map((item) => stringifyExplanation(item))
      .filter((item): item is string => Boolean(item));
    return collected.length > 0 ? collected.join(" | ") : null;
  }
  if (value && typeof value === "object") {
    const collected = Object.values(value)
      .map((item) => stringifyExplanation(item))
      .filter((item): item is string => Boolean(item));
    return collected.length > 0 ? collected.join(" | ") : null;
  }
  return null;
}

function formatDateTime(value: Date, businessTimezone: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: businessTimezone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(value);
}

function defaultAuthorLabel(role: string) {
  if (role === "customer") {
    return "Khach hang";
  }
  if (role === "staff") {
    return "Nhan vien";
  }
  return "System";
}

function normalizeMessageRole(role: string) {
  if (role === "customer" || role === "staff") {
    return role;
  }
  return "system";
}

function formatMoney(value: bigint) {
  return `${new Intl.NumberFormat("vi-VN").format(Number(value) / 1000)} đ`;
}

function toBigInt(value: unknown) {
  if (typeof value === "bigint") {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return BigInt(Math.trunc(value));
  }
  if (typeof value === "string" && value.trim()) {
    return BigInt(value);
  }
  return 0n;
}

function formatConfidence(value: unknown) {
  if (value === null || value === undefined) {
    return "-";
  }
  const numeric = Number(String(value));
  return Number.isFinite(numeric) ? numeric.toFixed(2) : String(value);
}

function groupBy<T>(rows: T[], keySelector: (row: T) => string) {
  return rows.reduce<Record<string, T[]>>((acc, row) => {
    const key = keySelector(row);
    acc[key] = acc[key] ?? [];
    acc[key]!.push(row);
    return acc;
  }, {});
}

function uniqueValues<T>(values: T[]) {
  return [...new Set(values)];
}
