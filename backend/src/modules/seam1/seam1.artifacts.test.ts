import { describe, expect, it } from "bun:test";
import { buildOnboardingArtifacts } from "./seam1.artifacts.ts";

describe("buildOnboardingArtifacts", () => {
  it("aggregates tags and opening candidates from seam 1 evidence", () => {
    const artifacts = buildOnboardingArtifacts([
      {
        conversationId: "conv-1",
        currentTagsJson: [{ text: "KH mới" }, { text: "Đặt lịch" }],
        openingBlocksJson: {
          opening_candidate_window: [{ redacted_text: "Bắt đầu" }, { redacted_text: "Đặt lịch hẹn" }],
          matched_rules: [{ name: "booking-choice" }],
          unmatched_candidate_texts: ["Khách hàng lần đầu"]
        }
      },
      {
        conversationId: "conv-2",
        currentTagsJson: [{ text: "KH mới" }],
        openingBlocksJson: {
          opening_candidate_window: [{ redacted_text: "Bắt đầu" }, { redacted_text: "Đặt lịch hẹn" }],
          unmatched_candidate_texts: ["Khách hàng lần đầu"]
        }
      }
    ]);

    expect(artifacts.topObservedTags[0]).toEqual({ text: "KH mới", count: 2 });
    expect(artifacts.topOpeningCandidateWindows[0]).toEqual({
      signature: ["Bắt đầu", "Đặt lịch hẹn"],
      count: 2,
      exampleConversationIds: ["conv-1", "conv-2"]
    });
    expect(artifacts.unmatchedOpeningTexts[0]).toEqual({ text: "Khách hàng lần đầu", count: 2 });
    expect(artifacts.matchedOpeningRules[0]).toEqual({ name: "booking-choice", count: 1 });
  });
});
