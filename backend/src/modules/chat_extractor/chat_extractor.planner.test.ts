import { describe, expect, it } from "bun:test";
import {
  buildFullDayRun,
  determinePublishEligibility,
  splitRequestedWindowByTargetDate
} from "./chat_extractor.planner.ts";

describe("chat_extractor planner", () => {
  it("splits cross-day manual range and marks publish eligibility per day", () => {
    const runs = splitRequestedWindowByTargetDate(
      "2026-01-24T00:00:00+07:00",
      "2026-01-25T10:00:00+07:00",
      "Asia/Ho_Chi_Minh",
      new Date("2026-01-25T12:00:00+07:00")
    );

    expect(runs).toHaveLength(2);
    expect(runs[0]).toMatchObject({
      targetDate: "2026-01-24",
      isFullDay: true,
      publishEligibility: "official_full_day",
      historicalOverwriteRequired: true
    });
    expect(runs[1]).toMatchObject({
      targetDate: "2026-01-25",
      isFullDay: false,
      publishEligibility: "provisional_current_day_partial",
      historicalOverwriteRequired: false
    });
  });

  it("rejects partial old day from publish path", () => {
    const publishEligibility = determinePublishEligibility({
      targetDate: "2026-01-24",
      isFullDay: false,
      businessTimezone: "Asia/Ho_Chi_Minh",
      now: new Date("2026-01-25T08:00:00+07:00")
    });

    expect(publishEligibility).toBe("not_publishable_old_partial");
  });

  it("marks full historical day as official with overwrite requirement", () => {
    const run = buildFullDayRun(
      "2026-01-24",
      "Asia/Ho_Chi_Minh",
      new Date("2026-01-25T08:00:00+07:00")
    );

    expect(run.publishEligibility).toBe("official_full_day");
    expect(run.historicalOverwriteRequired).toBe(true);
  });
});
