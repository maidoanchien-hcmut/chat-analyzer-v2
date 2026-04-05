import { afterEach, describe, expect, it } from "bun:test";
import { formatDateInTimezone } from "../chat_extractor/chat_extractor.planner.ts";
import { readModelsRepository } from "./read_models.repository.ts";
import { readModelsService } from "./read_models.service.ts";

const restorers: Array<() => void> = [];

afterEach(() => {
  while (restorers.length > 0) {
    restorers.pop()?.();
  }
});

describe("read models service", () => {
  it("builds overview metrics from fact_thread_day rows resolved by published snapshots", async () => {
    patchValue(readModelsRepository, "listSnapshotsForPageRange", async () => [createSnapshot()]);
    patchValue(readModelsRepository, "listConnectedPagesForCatalog", async () => [createCatalogPage()]);
    patchValue(readModelsRepository, "listFactThreadDaysByRunIds", async () => [
      createThreadFact({
        threadId: "thread-1",
        isNewInbox: true,
        officialRevisitLabel: "not_revisit",
        openingThemeCode: "hoi_gia",
        primaryNeedCode: "hoi_gia",
        officialClosingOutcomeCode: "booked",
        processRiskLevelCode: "low",
        aiCostMicros: 1500n
      }),
      createThreadFact({
        threadId: "thread-2",
        isNewInbox: false,
        officialRevisitLabel: "revisit",
        openingThemeCode: "dat_lich",
        primaryNeedCode: "dat_lich",
        officialClosingOutcomeCode: "follow_up",
        processRiskLevelCode: "high",
        aiCostMicros: 2500n
      })
    ]);

    const overview = await readModelsService.getOverview(baseFilters());

    expect(overview.pageLabel).toBe("Page Da Lieu Quan 1");
    expect(overview.metrics[0]?.value).toBe("2");
    expect(overview.metrics[1]?.value).toBe("1");
    expect(overview.metrics[2]?.value).toBe("1");
    expect(overview.metrics[4]?.value).toBe("1");
    expect(overview.openingNew[0]?.label).toBe("Hoi gia");
  });

  it("builds staff performance from fact_staff_thread_day rows", async () => {
    patchValue(readModelsRepository, "listSnapshotsForPageRange", async () => [createSnapshot()]);
    patchValue(readModelsRepository, "listConnectedPagesForCatalog", async () => [createCatalogPage()]);
    patchValue(readModelsRepository, "listFactThreadDaysByRunIds", async () => [
      createThreadFact({
        threadId: "thread-1",
        isNewInbox: true,
        officialRevisitLabel: "not_revisit",
        openingThemeCode: "hoi_gia",
        primaryNeedCode: "hoi_gia",
        officialClosingOutcomeCode: "follow_up",
        processRiskLevelCode: "high",
        aiCostMicros: 1200n
      })
    ]);
    patchValue(readModelsRepository, "listFactStaffThreadDaysByRunIds", async () => [
      createStaffFact({
        threadId: "thread-1",
        primaryNeedCode: "hoi_gia",
        processRiskLevelCode: "high",
        responseQualityCode: "needs_attention",
        responseQualityIssueText: "Cham phan hoi",
        responseQualityImprovementText: "Chot buoc ke tiep"
      }, {
        staffName: "mai",
        displayLabel: "Mai"
      })
    ]);

    const staffPerformance = await readModelsService.getStaffPerformance(baseFilters());

    expect(staffPerformance.scorecards[0]?.value).toBe("1");
    expect(staffPerformance.rankingRows[0]?.staff).toBe("Mai");
    expect(staffPerformance.issueMatrix[0]?.need).toBe("Hoi gia");
    expect(staffPerformance.coachingInbox[0]?.issue).toContain("Cham");
  });

  it("exports only published_official snapshots in the selected range", async () => {
    patchValue(readModelsRepository, "listSnapshotsForPageRange", async () => [
      createSnapshot({
        pipelineRunId: "run-official",
        publishChannel: "official",
        targetDate: "2026-04-04"
      }),
      createSnapshot({
        pipelineRunId: "run-provisional",
        publishChannel: "provisional",
        targetDate: today()
      })
    ]);
    patchValue(readModelsRepository, "listConnectedPagesForCatalog", async () => [createCatalogPage()]);
    patchValue(readModelsRepository, "listFactThreadDaysByRunIds", async (runIds) => [
      createThreadFact({
        pipelineRunId: runIds[0] ?? "run-official",
        threadId: "thread-1",
        isNewInbox: true,
        officialRevisitLabel: "not_revisit",
        openingThemeCode: "hoi_gia",
        primaryNeedCode: "hoi_gia",
        officialClosingOutcomeCode: "booked",
        processRiskLevelCode: "low",
        aiCostMicros: 1500n
      }, "2026-04-04")
    ]);

    const workbook = await readModelsService.getExportWorkbook({
      pageId: "page-1",
      startDate: "2026-04-04",
      endDate: today()
    });

    expect(workbook.allowed).toBe(true);
    expect(workbook.rows).toHaveLength(1);
    expect(workbook.rows[0]?.date).toBe("2026-04-04");
  });

  it("builds thread history from persisted thread workspace and local CRM state", async () => {
    patchValue(readModelsRepository, "listSnapshotsForPageRange", async () => [createSnapshot()]);
    patchValue(readModelsRepository, "listConnectedPagesForCatalog", async () => [createCatalogPage()]);
    patchValue(readModelsRepository, "listFactThreadDaysByRunIds", async () => [
      createThreadFact({
        threadId: "thread-1",
        processRiskLevelCode: "high",
        officialClosingOutcomeCode: "booked",
        firstMeaningfulMessageTextRedacted: "Khach hoi gia va dat lich"
      }),
      createThreadFact({
        threadId: "thread-2",
        isNewInbox: false,
        officialRevisitLabel: "revisit",
        processRiskLevelCode: "low"
      }, "2026-04-03")
    ]);
    patchValue(readModelsRepository, "listThreadSummaries", async () => [
      {
        threadId: "thread-1",
        firstMeaningfulMessageTextRedacted: "Khach hoi gia va dat lich",
        pipelineRun: {
          targetDate: new Date("2026-04-04T00:00:00.000Z")
        },
        thread: {
          customerDisplayName: "Lan Anh"
        }
      },
      {
        threadId: "thread-2",
        firstMeaningfulMessageTextRedacted: "Khach tai kham",
        pipelineRun: {
          targetDate: new Date("2026-04-03T00:00:00.000Z")
        },
        thread: {
          customerDisplayName: "Bao Tram"
        }
      }
    ]);
    patchValue(readModelsRepository, "getThreadWorkspace", async () => ({
      id: "thread-1",
      customerDisplayName: "Lan Anh",
      customerLink: {
        customerId: "KH-7712",
        mappingMethod: "deterministic",
        mappingConfidenceScore: 0.97
      },
      linkDecisions: [
        {
          decisionSource: "deterministic",
          decisionStatus: "linked",
          selectedCustomerId: "KH-7712",
          createdAt: new Date("2026-04-04T09:00:00.000Z")
        }
      ],
      threadDays: [
        {
          id: "thread-day-1",
          firstMeaningfulMessageId: "msg-1",
          firstMeaningfulMessageTextRedacted: "Khach hoi gia va dat lich",
          pipelineRun: {
            targetDate: new Date("2026-04-04T00:00:00.000Z")
          },
          messages: [
            {
              id: "msg-1",
              insertedAt: new Date("2026-04-04T09:05:00.000Z"),
              senderRole: "customer",
              senderName: "Lan Anh",
              redactedText: "Cho em hoi gia va lich trong tuan nay"
            },
            {
              id: "msg-2",
              insertedAt: new Date("2026-04-04T09:07:00.000Z"),
              senderRole: "staff",
              senderName: "Mai",
              redactedText: "Chieu thu 5 con slot 16h"
            }
          ],
          analysisResults: [
            {
              openingThemeCode: "hoi_gia",
              primaryNeedCode: "dat_lich",
              closingOutcomeInferenceCode: "booked",
              customerMoodCode: "positive",
              processRiskLevelCode: "high",
              staffAssessmentsJson: [
                {
                  staff_name: "mai",
                  response_quality_code: "strong"
                }
              ],
              evidenceUsedJson: {
                opening_signal: "Khach hoi gia",
                closing_signal: "Staff dua slot cu the"
              },
              fieldExplanationsJson: {
                outcome: "Da co de xuat slot cu the trong cung nhip trao doi."
              },
              supportingMessageIdsJson: ["msg-1", "msg-2"],
              costMicros: 2400n,
              analysisRun: {
                modelName: "gpt-5.4-mini",
                promptVersion: "Prompt A12",
                promptHash: "sha256:prompt-a12",
                taxonomyVersion: {
                  versionCode: "tax-2026-04"
                }
              }
            }
          ]
        }
      ]
    }));

    const history = await readModelsService.getThreadHistory(baseFilters(), null, "ai-audit");

    expect(history.threads).toHaveLength(2);
    expect(history.activeThreadId).toBe("thread-1");
    expect(history.audit.promptVersion).toBe("Prompt A12");
    expect(history.audit.supportingMessageIds).toEqual(["msg-1", "msg-2"]);
    expect(history.crmLink.customer).toContain("KH-7712");
    expect(history.analysisHistory[0]?.quality).toBe("Tot");
  });

  it("keeps old partial-day runs available only through run preview", async () => {
    patchValue(readModelsRepository, "getRunDraftSummary", async () => ({
      run: {
        id: "run-old-partial",
        targetDate: new Date("2026-04-01T00:00:00.000Z"),
        windowStartAt: new Date("2026-04-01T00:00:00.000Z"),
        windowEndExclusiveAt: new Date("2026-04-01T08:00:00.000Z"),
        isFullDay: false,
        publishState: "draft",
        publishEligibility: "not_publishable_old_partial",
        status: "loaded",
        runGroup: {
          frozenPromptVersion: "Prompt A12",
          frozenCompiledPromptHash: "sha256:prompt-a12",
          frozenConfigVersion: {
            versionNo: 18,
            connectedPage: {
              id: "page-1",
              pageName: "Page Da Lieu Quan 1",
              businessTimezone: "Asia/Ho_Chi_Minh"
            },
            analysisTaxonomyVersion: {
              versionCode: "tax-2026-04"
            }
          }
        }
      },
      threadFactCount: 12,
      staffFactCount: 4
    }));

    const preview = await readModelsService.getRunPreview("run-old-partial");

    expect(preview.publishEligibility).toBe("not_publishable_old_partial");
    expect(preview.warning?.title).toContain("partial");
    expect(preview.threadFactCount).toBe(12);
  });
});

function patchValue<T extends object, K extends keyof T>(target: T, key: K, value: T[K]) {
  const original = target[key];
  target[key] = value;
  restorers.push(() => {
    target[key] = original;
  });
}

function baseFilters() {
  return {
    pageId: "page-1",
    startDate: "2026-04-04",
    endDate: today(),
    publishSnapshot: "official" as const,
    inboxBucket: "all" as const,
    revisit: "all" as const,
    need: "all",
    outcome: "all",
    risk: "all",
    staff: "all"
  };
}

function createCatalogPage() {
  return {
    id: "page-1",
    pageName: "Page Da Lieu Quan 1",
    pancakePageId: "pk_101",
    businessTimezone: "Asia/Ho_Chi_Minh"
  };
}

function createSnapshot(overrides?: Partial<Awaited<ReturnType<typeof readModelsRepository.listSnapshotsForPageRange>>[number]>) {
  return {
    pipelineRunId: "run-1",
    connectedPageId: "page-1",
    pageName: "Page Da Lieu Quan 1",
    pancakePageId: "pk_101",
    businessTimezone: "Asia/Ho_Chi_Minh",
    targetDate: "2026-04-04",
    publishChannel: "official" as const,
    promptHash: "sha256:prompt-a12",
    promptVersion: "Prompt A12",
    configVersionId: "cfg-18",
    configVersionNo: 18,
    taxonomyVersionId: "tax-1",
    taxonomyVersionCode: "tax-2026-04",
    taxonomyJson: { categories: {} },
    windowStartAt: new Date("2026-04-04T00:00:00.000Z"),
    windowEndExclusiveAt: new Date("2026-04-05T00:00:00.000Z"),
    isFullDay: true,
    publishedAt: new Date("2026-04-05T00:30:00.000Z"),
    ...overrides
  };
}

function createThreadFact(
  overrides?: Partial<Awaited<ReturnType<typeof readModelsRepository.listFactThreadDaysByRunIds>>[number]>,
  date = "2026-04-04"
) {
  return {
    pipelineRunId: "run-1",
    threadId: "thread-1",
    isNewInbox: true,
    officialRevisitLabel: "not_revisit",
    openingThemeCode: "hoi_gia",
    primaryNeedCode: "hoi_gia",
    primaryTopicCode: "hoi_gia",
    officialClosingOutcomeCode: "booked",
    customerMoodCode: "neutral",
    processRiskLevelCode: "low",
    entrySourceType: "ads",
    entryPostId: "post-1",
    entryAdId: "ad-1",
    threadCount: 1,
    messageCount: 3,
    firstStaffResponseSeconds: 180,
    avgStaffResponseSeconds: 180,
    aiCostMicros: 1000n,
    taxonomyVersionCode: "tax-2026-04",
    firstMeaningfulMessageTextRedacted: "Khach hoi gia",
    date: {
      fullDate: new Date(`${date}T00:00:00.000Z`)
    },
    page: {
      connectedPageId: "page-1",
      pageName: "Page Da Lieu Quan 1"
    },
    ...overrides
  };
}

function createStaffFact(
  overrides?: Partial<Awaited<ReturnType<typeof readModelsRepository.listFactStaffThreadDaysByRunIds>>[number]>,
  staff = { staffName: "mai", displayLabel: "Mai" }
) {
  return {
    pipelineRunId: "run-1",
    threadId: "thread-1",
    primaryNeedCode: "hoi_gia",
    processRiskLevelCode: "high",
    responseQualityCode: "needs_attention",
    staffMessageCount: 2,
    staffFirstResponseSecondsIfOwner: 240,
    aiCostAllocatedMicros: 500n,
    responseQualityIssueText: "Cham phan hoi",
    responseQualityImprovementText: "Chot buoc ke tiep",
    taxonomyVersionCode: "tax-2026-04",
    date: {
      fullDate: new Date("2026-04-04T00:00:00.000Z")
    },
    page: {
      connectedPageId: "page-1",
      pageName: "Page Da Lieu Quan 1"
    },
    staff,
    ...overrides
  };
}

function today() {
  return formatDateInTimezone(new Date(), "Asia/Ho_Chi_Minh");
}
