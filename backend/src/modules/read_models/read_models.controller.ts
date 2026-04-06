import { Elysia, t } from "elysia";
import { AppError } from "../../core/errors.ts";
import { readModelsService } from "./read_models.service.ts";
import type {
  ExportWorkbookRequest,
  ExplorationQueryInput,
  ReadModelFilterInput
} from "./read_models.types.ts";

const runIdParamsSchema = t.Object({
  id: t.String()
});

export const readModelsController = new Elysia({ prefix: "/read-models" })
  .get("/catalog", async () => ({
    catalog: await readModelsService.loadCatalog()
  }), {
    response: t.Any()
  })
  .post("/runs/:id/materialize", async ({ params }) => ({
    materialization: await readModelsService.materializeRun(params.id)
  }), {
    params: runIdParamsSchema,
    response: t.Any()
  })
  .get("/runs/:id/preview", async ({ params }) => ({
    preview: await readModelsService.getRunPreview(params.id)
  }), {
    params: runIdParamsSchema,
    response: t.Any()
  })
  .get("/overview", async ({ query }) => ({
    overview: await readModelsService.getOverview(parseFilters(query))
  }), {
    query: t.Any(),
    response: t.Any()
  })
  .get("/exploration", async ({ query }) => ({
    exploration: await readModelsService.getExploration(
      parseFilters(query),
      parseExplorationQuery(query)
    )
  }), {
    query: t.Any(),
    response: t.Any()
  })
  .get("/staff-performance", async ({ query }) => ({
    staffPerformance: await readModelsService.getStaffPerformance(parseFilters(query))
  }), {
    query: t.Any(),
    response: t.Any()
  })
  .get("/thread-history", async ({ query }) => ({
    threadHistory: await readModelsService.getThreadHistory(
      parseFilters(query),
      readString(query.threadId) || null,
      readString(query.threadDayId) || null,
      parseThreadTab(query.threadTab)
    )
  }), {
    query: t.Any(),
    response: t.Any()
  })
  .get("/page-comparison", async ({ query }) => ({
    pageComparison: await readModelsService.getPageComparison(
      parseFilters(query, { requirePageId: false }),
      parseComparePageIds(query.comparePageIds)
    )
  }), {
    query: t.Any(),
    response: t.Any()
  })
  .get("/health", async () => ({
    healthSummary: await readModelsService.getHealthSummary()
  }), {
    response: t.Any()
  })
  .get("/export-workbook", async ({ query }) => ({
    workbook: await readModelsService.getExportWorkbook(parseExportRequest(query))
  }), {
    query: t.Any(),
    response: t.Any()
  });

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseFilters(query: Record<string, unknown>, options?: { requirePageId?: boolean }): ReadModelFilterInput {
  const requirePageId = options?.requirePageId ?? true;
  return {
    pageId: requirePageId ? readConnectedPageId(query.pageId) : readString(query.pageId),
    startDate: readString(query.startDate),
    endDate: readString(query.endDate),
    publishSnapshot: readString(query.publishSnapshot) === "provisional" ? "provisional" : "official",
    inboxBucket: normalizeUnion(readString(query.inboxBucket), ["all", "new", "old"], "all"),
    revisit: normalizeUnion(readString(query.revisit), ["all", "revisit", "not_revisit"], "all"),
    need: readString(query.need) || "all",
    outcome: readString(query.outcome) || "all",
    risk: readString(query.risk) || "all",
    staff: readString(query.staff) || "all"
  };
}

function parseExportRequest(query: Record<string, unknown>): ExportWorkbookRequest {
  return {
    pageId: readConnectedPageId(query.pageId),
    startDate: readString(query.startDate),
    endDate: readString(query.endDate)
  };
}

function parseExplorationQuery(query: Record<string, unknown>): ExplorationQueryInput {
  return {
    metric: normalizeUnion(
      readString(query.metric),
      ["thread_count", "new_inbox_count", "revisit_count", "booked_rate", "ai_cost", "first_response_seconds"],
      "thread_count"
    ),
    breakdownBy: normalizeUnion(
      readString(query.breakdownBy),
      ["day", "opening_theme", "primary_need", "primary_topic", "closing_outcome", "customer_mood", "process_risk_level", "source"],
      "opening_theme"
    ),
    compareBy: normalizeUnion(
      readString(query.compareBy),
      ["none", "page", "inbox_bucket", "revisit"],
      "none"
    )
  };
}

function parseComparePageIds(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((item) => readConnectedPageId(item, "comparePageIds")).filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => readConnectedPageId(item, "comparePageIds"));
  }
  return [];
}

function normalizeUnion<T extends string>(value: string, allowed: T[], fallback: T): T {
  return allowed.includes(value as T) ? value as T : fallback;
}

function parseThreadTab(value: unknown) {
  return normalizeUnion(
    readString(value),
    ["conversation", "analysis-history", "ai-audit", "crm-link"],
    "conversation"
  );
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readConnectedPageId(value: unknown, field = "pageId") {
  const normalized = readString(value);
  if (!UUID_PATTERN.test(normalized)) {
    throw new AppError(
      400,
      field === "comparePageIds" ? "READ_MODELS_INVALID_COMPARE_PAGE_IDS" : "READ_MODELS_INVALID_PAGE_ID",
      `${field} phải là connected_page_id UUID hợp lệ.`
    );
  }
  return normalized;
}
