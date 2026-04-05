import { describe, expect, it } from "bun:test";
import { buildMartMaterialization, toDateKey } from "./read_models.builder.ts";

describe("read model mart builder", () => {
  it("builds fact rows from a materialization source without querying ODS at read time", () => {
    const result = buildMartMaterialization(createSource());

    expect(result.dimDate.dateKey).toBe(20260405);
    expect(result.factThreadDays).toHaveLength(2);
    expect(result.factThreadDays[0]?.officialRevisitLabel).toBe("revisit");
    expect(result.factThreadDays[0]?.primaryNeedCode).toBe("dat_lich");
    expect(result.factThreadDays[0]?.aiCostMicros).toBe(1200n);
    expect(result.factStaffThreadDays).toHaveLength(2);
    expect(result.factStaffThreadDays[0]?.staffName).toBe("Lan");
    expect(result.factStaffThreadDays[0]?.aiCostAllocatedMicros).toBe(1200n);
  });

  it("keeps draft materialization independent from active snapshot resolution", () => {
    const result = buildMartMaterialization(createSource());

    expect(result.publishEligibility).toBe("official_full_day");
    expect(result.windowStartAt.toISOString()).toBe("2026-04-05T00:00:00.000Z");
    expect(result.windowEndExclusiveAt.toISOString()).toBe("2026-04-06T00:00:00.000Z");
    expect(toDateKey(result.targetDate)).toBe(20260405);
  });
});

function createSource() {
  return {
    pipelineRun: {
      id: "run-1",
      targetDate: new Date("2026-04-05T00:00:00.000Z"),
      windowStartAt: new Date("2026-04-05T00:00:00.000Z"),
      windowEndExclusiveAt: new Date("2026-04-06T00:00:00.000Z"),
      isFullDay: true,
      publishEligibility: "official_full_day",
      runGroup: {
        id: "group-1",
        frozenConfigVersionId: "cfg-1",
        frozenTaxonomyVersionId: "tax-1",
        frozenCompiledPromptHash: "sha256:prompt",
        frozenPromptVersion: "Prompt A12",
        frozenConfigVersion: {
          id: "cfg-1",
          versionNo: 12,
          promptText: "uu tien dat lich",
          connectedPage: {
            id: "page-1",
            pageName: "Page Da Lieu Quan 1",
            pancakePageId: "pk_101",
            businessTimezone: "Asia/Ho_Chi_Minh"
          },
          analysisTaxonomyVersion: {
            id: "tax-1",
            versionCode: "tax-2026-04",
            taxonomyJson: {
              categories: {}
            }
          }
        }
      },
      analysisRuns: [
        {
          id: "analysis-run-1",
          status: "completed",
          modelName: "service-managed",
          promptHash: "sha256:prompt",
          promptVersion: "Prompt A12",
          outputSchemaVersion: "conversation_analysis.v2",
          createdAt: new Date("2026-04-05T01:00:00.000Z"),
          analysisResults: [
            {
              threadDayId: "thread-day-1",
              promptHash: "sha256:prompt",
              resultStatus: "succeeded",
              openingThemeCode: "hoi_gia",
              openingThemeReason: "Khach hoi gia va dat lich",
              customerMoodCode: "neutral",
              primaryNeedCode: "dat_lich",
              primaryTopicCode: "dat_lich",
              journeyCode: "revisit",
              closingOutcomeInferenceCode: "booked",
              processRiskLevelCode: "low",
              processRiskReasonText: null,
              staffAssessmentsJson: [
                {
                  staff_name: "Lan",
                  response_quality_code: "strong",
                  issue_text: null,
                  improvement_text: null
                }
              ],
              fieldExplanationsJson: {
                primary_need_code: "explicit need"
              },
              costMicros: 1200n
            },
            {
              threadDayId: "thread-day-2",
              promptHash: "sha256:prompt",
              resultStatus: "unknown",
              openingThemeCode: "unknown",
              openingThemeReason: null,
              customerMoodCode: "neutral",
              primaryNeedCode: "unknown",
              primaryTopicCode: "unknown",
              journeyCode: "not_revisit",
              closingOutcomeInferenceCode: "follow_up",
              processRiskLevelCode: "medium",
              processRiskReasonText: "Can goi lai",
              staffAssessmentsJson: [
                {
                  staff_name: "Mai",
                  response_quality_code: "needs_attention",
                  issue_text: "Cham phan hoi",
                  improvement_text: "Chot khung gio cu the"
                }
              ],
              fieldExplanationsJson: {},
              costMicros: 500n
            }
          ]
        }
      ],
      threadDays: [
        {
          id: "thread-day-1",
          threadId: "thread-1",
          isNewInbox: false,
          entrySourceType: "ads",
          entryPostId: "post-1",
          entryAdId: "ad-1",
          messageCount: 4,
          firstStaffResponseSeconds: 180,
          avgStaffResponseSeconds: 240,
          staffParticipantsJson: [{ staff_name: "Lan" }],
          staffMessageStatsJson: [{ staff_name: "Lan", message_count: 2, first_message_at: "2026-04-05T00:05:00.000Z" }],
          explicitRevisitSignal: "revisit",
          firstMeaningfulMessageTextRedacted: "Khach quay lai de dat lich"
        },
        {
          id: "thread-day-2",
          threadId: "thread-2",
          isNewInbox: true,
          entrySourceType: "post",
          entryPostId: "post-2",
          entryAdId: null,
          messageCount: 2,
          firstStaffResponseSeconds: 600,
          avgStaffResponseSeconds: 600,
          staffParticipantsJson: [{ staff_name: "Mai" }],
          staffMessageStatsJson: [{ staff_name: "Mai", message_count: 1, first_message_at: "2026-04-05T00:20:00.000Z" }],
          explicitRevisitSignal: null,
          firstMeaningfulMessageTextRedacted: "Xin bang gia"
        }
      ]
    }
  };
}
