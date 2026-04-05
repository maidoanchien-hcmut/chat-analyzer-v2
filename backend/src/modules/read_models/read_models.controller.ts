import { Elysia, t } from "elysia";
import { readModelsService } from "./read_models.service.ts";
import type { ExportWorkbookRequest, ReadModelFilterInput } from "./read_models.types.ts";

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
    exploration: await readModelsService.getExploration(parseFilters(query))
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
      parseThreadTab(query.threadTab)
    )
  }), {
    query: t.Any(),
    response: t.Any()
  })
  .get("/page-comparison", async ({ query }) => ({
    pageComparison: await readModelsService.getPageComparison(
      parseFilters(query),
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

function parseFilters(query: Record<string, unknown>): ReadModelFilterInput {
  return {
    pageId: readString(query.pageId),
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
    pageId: readString(query.pageId),
    startDate: readString(query.startDate),
    endDate: readString(query.endDate)
  };
}

function parseComparePageIds(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item)).filter(Boolean);
  }
  if (typeof value === "string") {
    return value.split(",").map((item) => item.trim()).filter(Boolean);
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
