import { describe, expect, it } from "bun:test";
import { createBusinessAdapter } from "../adapters/demo/business-adapter.ts";
import { renderExploration } from "../features/exploration/render.ts";
import { renderOverview } from "../features/overview/render.ts";
import { renderPageComparison } from "../features/page-comparison/render.ts";
import { renderStaffPerformance } from "../features/staff-performance/render.ts";
import type { BusinessFilters, RouteState } from "../core/types.ts";
import { ensureExportWorkflowPage } from "./export-workflow.ts";
import { parseRouteState, serializeRouteState } from "./query-state.ts";

const filters: BusinessFilters = {
  pageId: "page-a",
  slicePreset: "yesterday",
  startDate: "2026-04-03",
  endDate: "2026-04-03",
  publishSnapshot: "official",
  inboxBucket: "all",
  revisit: "all",
  need: "all",
  outcome: "all",
  risk: "all",
  staff: "all"
};

describe("export workflow", () => {
  it("persists the export utility independently from the current business view", () => {
    const route = parseRouteState("?view=exploration&utility=export&page=page-b&slice=7d");
    expect(route.view).toBe("exploration");
    expect(route.utilityPanel).toBe("export");

    const next: RouteState = {
      ...route,
      utilityPanel: "export"
    };

    expect(serializeRouteState(next)).toContain("utility=export");
  });

  it("does not render per-view export buttons in business views", async () => {
    const adapter = createBusinessAdapter();

    expect(renderOverview(await adapter.getOverview(filters))).not.toContain("Xuất .xlsx");
    expect(renderExploration(await adapter.getExploration(filters))).not.toContain("Xuất .xlsx");
    expect(renderStaffPerformance(await adapter.getStaffPerformance(filters))).not.toContain("Xuất .xlsx");
    expect(renderPageComparison(
      await adapter.getPageComparison(filters, ["page-a", "page-b"]),
      {
        pages: [
          { id: "page-a", label: "Page Da Liễu Quận 1", pancakePageId: "pk_101", timezone: "Asia/Ho_Chi_Minh" },
          { id: "page-b", label: "Page Nha Khoa Thủ Đức", pancakePageId: "pk_202", timezone: "Asia/Ho_Chi_Minh" }
        ],
        comparePageIds: ["page-a", "page-b"],
        slicePreset: filters.slicePreset,
        startDate: filters.startDate,
        endDate: filters.endDate,
        publishSnapshot: filters.publishSnapshot
      }
    )).not.toContain("Xuất .xlsx");
  });

  it("builds export data from explicit page and date input and skips missing official dates", async () => {
    const adapter = createBusinessAdapter();
    const workbook = await adapter.getExportWorkbook({
      pageId: "page-b",
      startDate: "2026-04-01",
      endDate: "2026-04-05"
    });

    expect(workbook.allowed).toBe(true);
    expect(workbook.pageLabel).toBe("Page Nha Khoa Thủ Đức");
    expect(workbook.generatedAt).toMatch(/^2026-04-04T/);
    expect(workbook.rows.map((row) => row.date)).toEqual(["2026-04-02", "2026-04-03", "2026-04-04"]);
  });

  it("blocks export when the selected range has no official snapshot", async () => {
    const adapter = createBusinessAdapter();
    const workbook = await adapter.getExportWorkbook({
      pageId: "page-a",
      startDate: "2026-03-01",
      endDate: "2026-03-03"
    });

    expect(workbook.allowed).toBe(false);
    expect(workbook.reason).toContain("không có ngày nào");
  });

  it("replaces a stale export page selection with the first catalog page", () => {
    const next = ensureExportWorkflowPage({
      selectedPageId: "cp-101",
      startDate: "2026-04-01",
      endDate: "2026-04-05",
      workbook: null
    }, [
      { id: "11111111-1111-4111-8111-111111111111", label: "Page Da Liễu Quận 1", pancakePageId: "pk_101", timezone: "Asia/Ho_Chi_Minh" },
      { id: "22222222-2222-4222-8222-222222222222", label: "Page Nha Khoa Thủ Đức", pancakePageId: "pk_202", timezone: "Asia/Ho_Chi_Minh" }
    ]);

    expect(next.selectedPageId).toBe("11111111-1111-4111-8111-111111111111");
  });
});
