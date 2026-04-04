import { describe, expect, it } from "bun:test";
import type { OperationsState } from "../../app/screen-state.ts";
import { renderOperations } from "./render.ts";

describe("operations render", () => {
  it("renders historical overwrite confirmation with old and new snapshot metadata", () => {
    const html = renderOperations(createOperationsState());

    expect(html).toContain("Snapshot official 2026-04-03");
    expect(html).toContain("Prompt A10");
    expect(html).toContain("Prompt A12");
    expect(html).toContain("v17");
    expect(html).toContain("v18");
    expect(html).toContain("Export .xlsx của ngày này sẽ regenerate theo snapshot mới.");
  });
});

function createOperationsState(): OperationsState {
  return {
    activePanel: "run-monitor",
    connectedPages: [],
    selectedPageId: "",
    processingMode: "etl_only",
    targetDate: "2026-04-03",
    requestedWindowStartAt: "",
    requestedWindowEndExclusiveAt: "",
    previewResult: null,
    runGroup: {
      id: "rg-201",
      pageName: "Page Da Lieu Quan 1",
      runMode: "manual",
      status: "Đã load kết quả",
      publishIntent: "official",
      promptVersion: "Prompt A12",
      promptHash: "sha256:prompt-a12",
      configVersionId: "v18",
      createdAt: "2026-04-04T10:00:00.000Z",
      startedAt: "2026-04-04T10:01:00.000Z",
      finishedAt: "2026-04-04T10:03:00.000Z",
      childRuns: [
        {
          id: "run-201",
          targetDate: "2026-04-03",
          status: "Đã load kết quả",
          publishState: "Draft",
          publishEligibility: "official_full_day",
          windowStartAt: "2026-04-03T00:00:00.000Z",
          windowEndExclusiveAt: "2026-04-04T00:00:00.000Z",
          supersedesRunId: "run-155",
          historicalOverwrite: {
            replacedRunId: "run-155",
            replacedSnapshotLabel: "Snapshot official 2026-04-03",
            previousPromptVersion: "Prompt A10",
            previousConfigVersion: "v17",
            nextPromptVersion: "Prompt A12",
            nextConfigVersion: "v18",
            exportImpact: "Export .xlsx của ngày này sẽ regenerate theo snapshot mới."
          },
          publishedAt: null
        }
      ]
    },
    runDetail: null,
    inspectRunGroupId: "rg-201",
    inspectRunId: "run-201",
    publishRunId: "run-201",
    publishAs: "official",
    confirmHistoricalOverwrite: false,
    expectedReplacedRunId: "run-155",
    mappingQueue: []
  };
}
