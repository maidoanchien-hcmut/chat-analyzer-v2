import { describe, expect, it } from "bun:test";
import { splitRequestedWindowByTargetDate } from "./seam1.planner.ts";

describe("splitRequestedWindowByTargetDate", () => {
  it("splits a partial range into one run per target_date", () => {
    const slices = splitRequestedWindowByTargetDate(
      "2026-04-01T10:00:00+07:00",
      "2026-04-02T03:00:00+07:00",
      "Asia/Ho_Chi_Minh"
    );

    expect(slices).toHaveLength(2);
    const first = slices[0]!;
    const second = slices[1]!;
    expect(first).toMatchObject({
      targetDate: "2026-04-01",
      requestedWindowStartAt: "2026-04-01T10:00:00+07:00",
      requestedWindowEndExclusiveAt: "2026-04-02T03:00:00+07:00",
      isFullDay: false
    });
    expect(first.windowStartAt).toBe("2026-04-01T03:00:00.000Z");
    expect(first.windowEndExclusiveAt).toBe("2026-04-01T17:00:00.000Z");
    expect(second).toMatchObject({
      targetDate: "2026-04-02",
      requestedWindowStartAt: "2026-04-01T10:00:00+07:00",
      requestedWindowEndExclusiveAt: "2026-04-02T03:00:00+07:00",
      isFullDay: false
    });
    expect(second.windowStartAt).toBe("2026-04-01T17:00:00.000Z");
    expect(second.windowEndExclusiveAt).toBe("2026-04-01T20:00:00.000Z");
  });
});
