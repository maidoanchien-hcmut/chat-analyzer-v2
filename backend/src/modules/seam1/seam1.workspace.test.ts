import { describe, expect, it } from "bun:test";
import { seam1Service } from "./seam1.service.ts";

describe("seam1 http payload flow", () => {
  it("previews a manual job from direct HTTP request body", async () => {
    const result = await seam1Service.previewJobRequest({
      kind: "manual",
      job: {
        jobName: "demo-day-run",
        targetDate: "2026-04-01",
        runMode: null,
        requestedWindowStartAt: null,
        requestedWindowEndExclusiveAt: null,
        publish: false,
        runGroupId: null,
        snapshotVersion: 1,
        windowStartAt: null,
        windowEndExclusiveAt: null,
        maxConversations: 0,
        maxMessagePagesPerConversation: 0
      },
      page_bundle: {
        page: {
          organizationId: "default",
          pageSlug: "demo-clinic",
          pageId: "1406535699642677",
          pageName: "O2 SKIN - Tri Mun Chuan Y Khoa",
          pancakeUserAccessToken: "demo-user-token",
          businessTimezone: "Asia/Ho_Chi_Minh",
          initialConversationLimit: 25,
          autoScraper: false,
          autoAiAnalysis: false,
          botSignatures: []
        },
        tagRules: [
          {
            name: "vip",
            match_any_text: ["VIP"],
            signals: {
              lead_tier: "vip"
            }
          }
        ],
        openingRules: [],
        customerDirectory: [],
        botSignatures: []
      }
    });

    expect(result).toMatchObject({
      kind: "manual",
      jobName: "demo-day-run",
      pageSlug: "demo-clinic"
    });

    expect(result.workerJobs).toHaveLength(1);
    expect(result.workerJobs[0]).toMatchObject({
      page_id: "1406535699642677",
      target_date: "2026-04-01",
      snapshot_version: 1,
      tag_rules: [
        {
          name: "vip"
        }
      ]
    });
  });
});
