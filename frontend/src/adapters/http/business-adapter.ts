import type {
  BusinessAdapter,
  BusinessCatalog,
  ExportRequestInput,
  ExportWorkbookViewModel,
  ExplorationViewModel,
  OverviewViewModel,
  PageComparisonViewModel,
  StaffPerformanceViewModel,
  ThreadHistoryViewModel
} from "../contracts.ts";
import type { BusinessFilters } from "../../core/types.ts";
import { requestJson } from "./client.ts";

export function createHttpBusinessAdapter(getBaseUrl: () => string): BusinessAdapter {
  return {
    async loadCatalog() {
      const result = await requestJson<{ catalog: BusinessCatalog }>(
        getBaseUrl(),
        "GET",
        "/read-models/catalog"
      );
      return result.catalog;
    },
    async getOverview(filters) {
      const result = await requestJson<{ overview: OverviewViewModel }>(
        getBaseUrl(),
        "GET",
        `/read-models/overview?${buildFiltersQuery(filters)}`
      );
      return result.overview;
    },
    async getExploration(filters) {
      const result = await requestJson<{ exploration: ExplorationViewModel }>(
        getBaseUrl(),
        "GET",
        `/read-models/exploration?${buildFiltersQuery(filters)}`
      );
      return result.exploration;
    },
    async getStaffPerformance(filters) {
      const result = await requestJson<{ staffPerformance: StaffPerformanceViewModel }>(
        getBaseUrl(),
        "GET",
        `/read-models/staff-performance?${buildFiltersQuery(filters)}`
      );
      return result.staffPerformance;
    },
    async getThreadHistory(filters, threadId, threadDayId, tab) {
      const params = new URLSearchParams(buildFilterEntries(filters));
      if (threadId) {
        params.set("threadId", threadId);
      }
      if (threadDayId) {
        params.set("threadDayId", threadDayId);
      }
      params.set("threadTab", tab);
      const result = await requestJson<{ threadHistory: ThreadHistoryViewModel }>(
        getBaseUrl(),
        "GET",
        `/read-models/thread-history?${params.toString()}`
      );
      return result.threadHistory;
    },
    async getPageComparison(filters, comparePageIds) {
      const params = new URLSearchParams(buildFilterEntries(filters));
      if (comparePageIds.length > 0) {
        params.set("comparePageIds", comparePageIds.join(","));
      }
      const result = await requestJson<{ pageComparison: PageComparisonViewModel }>(
        getBaseUrl(),
        "GET",
        `/read-models/page-comparison?${params.toString()}`
      );
      return result.pageComparison;
    },
    async getExportWorkbook(input) {
      const result = await requestJson<{ workbook: ExportWorkbookViewModel }>(
        getBaseUrl(),
        "GET",
        `/read-models/export-workbook?${buildExportQuery(input)}`
      );
      return result.workbook;
    }
  };
}

function buildFiltersQuery(filters: BusinessFilters) {
  return new URLSearchParams(buildFilterEntries(filters)).toString();
}

function buildFilterEntries(filters: BusinessFilters) {
  return {
    pageId: filters.pageId,
    startDate: filters.startDate,
    endDate: filters.endDate,
    publishSnapshot: filters.publishSnapshot,
    inboxBucket: filters.inboxBucket,
    revisit: filters.revisit,
    need: filters.need,
    outcome: filters.outcome,
    risk: filters.risk,
    staff: filters.staff
  };
}

function buildExportQuery(input: ExportRequestInput) {
  return new URLSearchParams({
    pageId: input.pageId,
    startDate: input.startDate,
    endDate: input.endDate
  }).toString();
}
