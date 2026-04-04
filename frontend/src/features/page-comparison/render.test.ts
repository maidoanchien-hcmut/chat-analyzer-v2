import { describe, expect, it } from "bun:test";
import type { BusinessPage } from "../../core/types.ts";
import { renderPageComparison } from "./render.ts";

describe("page comparison view", () => {
  it("renders multi-page filter controls instead of relying on one-page query string editing", () => {
    const html = renderPageComparison(
      {
        warning: null,
        comparedPages: ["Page Da Lieu Quan 1", "Page Nha Khoa Thu Duc"],
        trendRows: [
          {
            date: "2026-04-03",
            values: [
              { page: "Page Da Lieu Quan 1", volume: "184", conversion: "38.1%", aiCost: "81.000 đ" },
              { page: "Page Nha Khoa Thu Duc", volume: "137", conversion: "29.4%", aiCost: "63.000 đ" }
            ]
          }
        ],
        mixCards: [
          { title: "Need mix", summary: "Page Da Lieu có tỷ trọng đặt lịch cao hơn." }
        ]
      },
      {
        pages: [
          { id: "page-a", label: "Page Da Lieu Quan 1", pancakePageId: "pk_101", timezone: "Asia/Ho_Chi_Minh" },
          { id: "page-b", label: "Page Nha Khoa Thu Duc", pancakePageId: "pk_202", timezone: "Asia/Ho_Chi_Minh" }
        ] satisfies BusinessPage[],
        comparePageIds: ["page-a", "page-b"],
        slicePreset: "7d",
        startDate: "2026-03-28",
        endDate: "2026-04-03",
        publishSnapshot: "official"
      }
    );

    expect(html).toContain("data-form=\"page-comparison-filters\"");
    expect(html).toContain("name=\"comparePageIds\"");
    expect(html).toContain("Page đưa vào so sánh");
    expect(html).not.toContain("name=\"pageId\"");
  });
});
