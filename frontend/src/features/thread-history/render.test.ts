import { describe, expect, it } from "bun:test";
import type { ThreadHistoryViewModel } from "../../adapters/contracts.ts";
import { renderThreadHistory } from "./render.ts";

describe("thread history render", () => {
  it("renders workspace audit fields and structured output from the backend contract", () => {
    const conversationHtml = renderThreadHistory(createThreadHistoryViewModel("conversation"));
    expect(conversationHtml).toContain("Opening block");
    expect(conversationHtml).toContain("Explicit signals");
    expect(conversationHtml).toContain("Normalized tag signals");
    expect(conversationHtml).toContain("Source thread");
    expect(conversationHtml).toContain("opening_theme");
    expect(conversationHtml).toContain("KH mới");

    const auditHtml = renderThreadHistory(createThreadHistoryViewModel("ai-audit"));
    expect(auditHtml).toContain("Structured output");
    expect(auditHtml).toContain("Supporting messages");
    expect(auditHtml).toContain("msg-1");
    expect(auditHtml).toContain("Khách mở đầu bằng câu hỏi giá.");
  });
});

function createThreadHistoryViewModel(
  activeTab: ThreadHistoryViewModel["activeTab"]
): ThreadHistoryViewModel {
  return {
    warning: null,
    threads: [
      {
        id: "thread-1",
        customer: "Khách A",
        snippet: "Cho mình hỏi lịch tái khám.",
        updatedAt: "2026-04-04",
        badges: ["Inbox moi", "Tai kham"]
      }
    ],
    activeThreadId: "thread-1",
    activeThreadDayId: "thread-day-1",
    activeTab,
    workspace: {
      openingBlockMessages: [
        {
          messageId: "msg-1",
          senderRole: "customer",
          messageType: "text",
          text: "Cho mình hỏi lịch tái khám."
        }
      ],
      explicitSignals: [
        {
          signalRole: "journey",
          signalCode: "revisit",
          rawText: "Khách hàng tái khám"
        }
      ],
      normalizedTagSignals: [
        {
          role: "journey",
          sourceTagId: "11",
          sourceTagText: "KH mới",
          canonicalCode: "new_to_clinic",
          mappingSource: "operator"
        }
      ],
      sourceSignals: {
        explicitRevisit: "revisit",
        explicitNeed: "dat_lich",
        explicitOutcome: "booked"
      },
      structuredOutput: [
        {
          field: "opening_theme",
          code: "hoi_gia",
          label: "Hoi gia",
          reason: "Khách mở đầu bằng câu hỏi giá."
        }
      ],
      sourceThreadJsonRedacted: {
        tags: ["KH mới"]
      }
    },
    transcript: [
      {
        id: "msg-1",
        at: "2026-04-04 09:05",
        author: "Khách A",
        role: "customer",
        text: "Cho mình hỏi lịch tái khám.",
        emphasized: true,
        isFirstMeaningful: true,
        isSupportingEvidence: true
      }
    ],
    analysisHistory: [
      {
        threadDayId: "thread-day-1",
        date: "2026-04-04",
        openingTheme: "Hoi gia",
        need: "Dat lich",
        outcome: "Booked",
        mood: "Positive",
        risk: "High",
        quality: "Tot",
        aiCost: "2 đ",
        active: true
      }
    ],
    audit: {
      model: "gpt-5.4-mini",
      promptVersion: "Prompt A12",
      promptHash: "sha256:prompt-a12",
      taxonomyVersion: "tax-2026-04",
      evidence: ["Cho mình hỏi lịch tái khám."],
      explanations: [
        {
          field: "opening_theme",
          explanation: "Khách mở đầu bằng câu hỏi giá."
        }
      ],
      supportingMessageIds: ["msg-1"],
      structuredOutput: [
        {
          field: "opening_theme",
          code: "hoi_gia",
          label: "Hoi gia",
          reason: "Khách mở đầu bằng câu hỏi giá."
        }
      ]
    },
    crmLink: {
      customer: "CRM KH-001",
      method: "read_only_local",
      confidence: "0.87",
      history: ["2026-04-04T09:10:00.000Z | local_rule -> linked -> KH-001"]
    }
  };
}
