import type { BusinessFilters } from "../../core/types.ts";

export function sanitizePageComparisonFilters(filters: BusinessFilters): BusinessFilters {
  return {
    ...filters,
    inboxBucket: "all",
    revisit: "all",
    need: "all",
    outcome: "all",
    risk: "all",
    staff: "all"
  };
}
