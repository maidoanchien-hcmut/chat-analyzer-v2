import { describe, expect, it } from "bun:test";
import type { BusinessPage } from "../core/types.ts";
import { createDefaultRouteState, reconcileRouteStateWithCatalog } from "./query-state.ts";

const pages: BusinessPage[] = [
  { id: "11111111-1111-4111-8111-111111111111", label: "Page Da Lieu Quan 1", pancakePageId: "pk_101", timezone: "Asia/Ho_Chi_Minh" },
  { id: "22222222-2222-4222-8222-222222222222", label: "Page Nha Khoa Thu Duc", pancakePageId: "pk_202", timezone: "Asia/Ho_Chi_Minh" }
];

describe("query state", () => {
  it("falls back to the first catalog page when the route pageId is stale", () => {
    const route = {
      ...createDefaultRouteState(),
      filters: {
        ...createDefaultRouteState().filters,
        pageId: "cp-101"
      }
    };

    expect(reconcileRouteStateWithCatalog(route, pages).filters.pageId).toBe("11111111-1111-4111-8111-111111111111");
  });

  it("drops compare page ids that are no longer present in catalog", () => {
    const route = {
      ...createDefaultRouteState(),
      filters: {
        ...createDefaultRouteState().filters,
        pageId: "11111111-1111-4111-8111-111111111111"
      },
      comparePageIds: ["22222222-2222-4222-8222-222222222222", "page-2"]
    };

    expect(reconcileRouteStateWithCatalog(route, pages).comparePageIds).toEqual(["22222222-2222-4222-8222-222222222222"]);
  });
});
