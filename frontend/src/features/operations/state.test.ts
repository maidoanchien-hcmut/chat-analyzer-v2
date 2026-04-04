import { describe, expect, it } from "bun:test";
import type { MappingQueueItem, PublishEligibility } from "../../adapters/contracts.ts";
import { applyMappingQueueAction, derivePublishAction } from "./state.ts";

describe("operations state", () => {
  it("derives publish CTA from publish eligibility instead of leaving publish open-ended", () => {
    const official = derivePublishAction("official_full_day");
    const provisional = derivePublishAction("provisional_current_day_partial");
    const blocked = derivePublishAction("not_publishable_old_partial");

    expect(official.canPublish).toBe(true);
    expect(official.publishAs).toBe("official");
    expect(official.label).toBe("Publish chính thức");

    expect(provisional.canPublish).toBe(true);
    expect(provisional.publishAs).toBe("provisional");
    expect(provisional.label).toBe("Publish tạm thời");

    expect(blocked.canPublish).toBe(false);
    expect(blocked.publishAs).toBe(null);
    expect(blocked.label).toBe("Không được publish dashboard");
  });

  it("updates mapping queue items through approve, reject, and remap actions", () => {
    const queue: MappingQueueItem[] = [
      {
        id: "map-1",
        threadLabel: "T-1001",
        candidateCustomer: "CRM KH-8821",
        confidence: "0.98",
        evidence: "Phone match + recent revisit",
        status: "pending"
      }
    ];

    const approved = applyMappingQueueAction(queue, { type: "approve", itemId: "map-1" });
    expect(approved[0]?.status).toBe("approved");

    const rejected = applyMappingQueueAction(queue, { type: "reject", itemId: "map-1" });
    expect(rejected[0]?.status).toBe("rejected");

    const remapped = applyMappingQueueAction(queue, {
      type: "remap",
      itemId: "map-1",
      candidateCustomer: "CRM KH-2201",
      confidence: "0.73",
      evidence: "Manual remap sau khi kiểm tra lịch sử toa"
    });
    expect(remapped[0]?.status).toBe("remapped");
    expect(remapped[0]?.candidateCustomer).toBe("CRM KH-2201");
    expect(remapped[0]?.confidence).toBe("0.73");
  });
});
