import { describe, expect, it } from "bun:test";
import type { BusinessFilters } from "../../core/types.ts";
import { sanitizePageComparisonFilters } from "./state.ts";

describe("page comparison state", () => {
  it("drops hidden one-page business filters before compare-page runtime uses them", () => {
    const sanitized = sanitizePageComparisonFilters({
      pageId: "page-a",
      slicePreset: "7d",
      startDate: "2026-04-01",
      endDate: "2026-04-07",
      publishSnapshot: "official",
      inboxBucket: "new",
      revisit: "revisit",
      need: "dat_lich",
      outcome: "booked",
      risk: "high",
      staff: "mai"
    } satisfies BusinessFilters);

    expect(sanitized).toEqual({
      pageId: "page-a",
      slicePreset: "7d",
      startDate: "2026-04-01",
      endDate: "2026-04-07",
      publishSnapshot: "official",
      inboxBucket: "all",
      revisit: "all",
      need: "all",
      outcome: "all",
      risk: "all",
      staff: "all"
    });
  });
});
