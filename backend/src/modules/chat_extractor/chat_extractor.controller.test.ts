import { describe, expect, it } from "bun:test";
import { normalizeBodyKeys } from "./chat_extractor.controller.ts";

describe("normalizeBodyKeys", () => {
  it("converts nested camelCase request payloads into the snake_case contract expected by zod parsing", () => {
    const normalized = normalizeBodyKeys({
      connectedPageId: "connected-page-1",
      writeArtifacts: true,
      job: {
        jobName: "manual-run",
        processingMode: "etl_only",
        targetDate: "2026-04-01",
        maxConversations: 25,
        requestedWindowStartAt: "2026-04-01T00:00:00+07:00"
      }
    });

    expect(normalized).toEqual({
      connected_page_id: "connected-page-1",
      write_artifacts: true,
      job: {
        job_name: "manual-run",
        processing_mode: "etl_only",
        target_date: "2026-04-01",
        max_conversations: 25,
        requested_window_start_at: "2026-04-01T00:00:00+07:00"
      }
    });
  });
});
