import { describe, expect, it } from "bun:test";
import { ANALYSIS_OUTPUT_SCHEMA_VERSION, hashAnalysisEvidence } from "./analysis.artifacts.ts";
import { AnalysisService } from "./analysis.service.ts";
import type {
  AnalysisExecutionSummary,
  ConversationAnalysisRequest
} from "./analysis.types.ts";

describe("analysis service", () => {
  it("resumes an existing analysis run and only sends pending thread days", async () => {
    const repository = createRepositoryStub();
    const clientCalls: ConversationAnalysisRequest[] = [];
    const service = new AnalysisService({
      repository: repository as never,
      client: {
        analyzeConversations: async (input) => {
          clientCalls.push(input);
          return {
            results: [
              {
                threadDayId: "thread-day-2",
                resultStatus: "succeeded",
                promptHash: "service-effective-hash",
                openingThemeCode: "appointment_booking",
                openingThemeReason: "Đặt lịch",
                customerMoodCode: "neutral",
                primaryNeedCode: "appointment_booking",
                primaryTopicCode: "appointment_booking",
                journeyCode: "revisit",
                closingOutcomeInferenceCode: "follow_up",
                processRiskLevelCode: "low",
                processRiskReasonText: null,
                staffAssessmentsJson: [
                  {
                    staff_name: "Lan",
                    response_quality_code: "adequate",
                    issue_text: null,
                    improvement_text: null
                  }
                ],
                evidenceUsedJson: {
                  source: "service"
                },
                fieldExplanationsJson: {},
                supportingMessageIdsJson: ["message-2"],
                usageJson: {
                  provider: "deterministic_dev",
                  token_estimate: 11
                },
                costMicros: 17,
                failureInfoJson: null
              }
            ],
            runtimeMetadataJson: {
              effective_prompt_hash: "service-effective-hash",
              system_prompt_version: "service_system.v1"
            }
          };
        }
      },
      batchSize: 10
    });

    const summary = await service.executeLoadedRun("pipeline-run-1");

    expect(clientCalls).toHaveLength(1);
    expect(clientCalls[0]?.bundles).toHaveLength(1);
    expect(clientCalls[0]?.bundles[0]?.threadDayId).toBe("thread-day-2");
    expect(repository.markAnalysisRunRunningCalls).toEqual(["analysis-run-1"]);
    expect(repository.upsertedResults).toHaveLength(1);
    expect(repository.upsertedResults[0]?.threadDayId).toBe("thread-day-2");
    expect(repository.updatedPipelineMetrics?.resumed).toBe(true);
    expect(repository.updatedPipelineMetrics?.skippedThreadDayIds).toEqual(["thread-day-1"]);
    expect(repository.restorePipelineRunLoadedCalls).toEqual(["pipeline-run-1"]);
    expect(repository.markPipelineRunAnalysisFailedCalls).toHaveLength(0);
    expect(summary.resumed).toBe(true);
    expect(summary.skippedThreadDayIds).toEqual(["thread-day-1"]);
  });

  it("reprocesses terminal units when the persisted evidence hash is stale", async () => {
    const repository = createRepositoryStub({
      existingResults: [
        {
          analysisRunId: "analysis-run-1",
          threadDayId: "thread-day-1",
          evidenceHash: "stale-evidence-hash",
          resultStatus: "succeeded"
        }
      ]
    });
    const clientCalls: ConversationAnalysisRequest[] = [];
    const service = new AnalysisService({
      repository: repository as never,
      client: {
        analyzeConversations: async (input) => {
          clientCalls.push(input);
          return {
            results: input.bundles.map((bundle) => ({
              threadDayId: bundle.threadDayId,
              resultStatus: "succeeded",
              promptHash: "service-effective-hash",
              openingThemeCode: "appointment_booking",
              openingThemeReason: "Đặt lịch",
              customerMoodCode: "neutral",
              primaryNeedCode: "appointment_booking",
              primaryTopicCode: "appointment_booking",
              journeyCode: "revisit",
              closingOutcomeInferenceCode: "follow_up",
              processRiskLevelCode: "low",
              processRiskReasonText: null,
              staffAssessmentsJson: [
                {
                  staff_name: "Lan",
                  response_quality_code: "adequate",
                  issue_text: null,
                  improvement_text: null
                }
              ],
              evidenceUsedJson: {
                source: "service"
              },
              fieldExplanationsJson: {},
              supportingMessageIdsJson: ["message-1"],
              usageJson: {
                provider: "deterministic_dev",
                token_estimate: 11
              },
              costMicros: 17,
              failureInfoJson: null
            })),
            runtimeMetadataJson: {
              effective_prompt_hash: "service-effective-hash",
              system_prompt_version: "service_system.v1"
            }
          };
        }
      },
      batchSize: 10
    });

    const summary = await service.executeLoadedRun("pipeline-run-1");

    expect(clientCalls).toHaveLength(1);
    expect(clientCalls[0]?.bundles.map((bundle) => bundle.threadDayId)).toEqual(["thread-day-1", "thread-day-2"]);
    expect(repository.updatedPipelineMetrics?.resumed).toBe(false);
    expect(repository.updatedPipelineMetrics?.skippedThreadDayIds).toEqual([]);
    expect(summary.skippedThreadDayIds).toEqual([]);
  });

  it("stores failed units and marks the pipeline run failed when the service call errors", async () => {
    const repository = createRepositoryStub({
      existingResults: [],
      summaryOverride: {
        status: "failed",
        unitCountSucceeded: 0,
        unitCountUnknown: 0,
        unitCountFailed: 2
      }
    });
    const service = new AnalysisService({
      repository: repository as never,
      client: {
        analyzeConversations: async () => {
          throw new Error("grpc unavailable");
        }
      },
      batchSize: 10
    });

    const summary = await service.executeLoadedRun("pipeline-run-1");

    expect(repository.upsertedResults).toHaveLength(2);
    expect(repository.upsertedResults.every((item) => item.resultStatus === "failed")).toBe(true);
    expect(repository.markPipelineRunAnalysisFailedCalls).toHaveLength(1);
    expect(repository.markPipelineRunAnalysisFailedCalls[0]?.pipelineRunId).toBe("pipeline-run-1");
    expect(repository.restorePipelineRunLoadedCalls).toHaveLength(0);
    expect(summary.status).toBe("failed");
  });
});

function createRepositoryStub(overrides?: {
  existingResults?: Array<{ analysisRunId: string; threadDayId: string; evidenceHash: string; resultStatus: string }>;
  summaryOverride?: Partial<AnalysisExecutionSummary>;
}) {
  const pipelineRun = createPipelineRun();
  const threadDays = createThreadDays();
  const analysisRun = createAnalysisRun();
  const existingResults = overrides?.existingResults ?? [
    {
      analysisRunId: "analysis-run-1",
      threadDayId: "thread-day-1",
      evidenceHash: buildExpectedEvidenceHash(threadDays[0]!),
      resultStatus: "succeeded"
    }
  ];

  const repository = {
    markAnalysisRunRunningCalls: [] as string[],
    updatedRuntimeSnapshots: [] as Array<{ analysisRunId: string; runtimeSnapshotJson: Record<string, unknown> }>,
    upsertedResults: [] as any[],
    updatedPipelineMetrics: null as AnalysisExecutionSummary | null,
    restorePipelineRunLoadedCalls: [] as string[],
    markPipelineRunAnalysisFailedCalls: [] as Array<{ pipelineRunId: string; errorText: string }>,
    async getPipelineRunForAnalysis() {
      return pipelineRun;
    },
    async listThreadDaysForRun() {
      return threadDays;
    },
    async findLatestMatchingAnalysisRun() {
      return analysisRun;
    },
    async createAnalysisRun() {
      throw new Error("createAnalysisRun should not be called in this test");
    },
    async listAnalysisResults() {
      return existingResults;
    },
    async markAnalysisRunRunning(analysisRunId: string) {
      repository.markAnalysisRunRunningCalls.push(analysisRunId);
      return analysisRun;
    },
    async updateAnalysisRunRuntimeSnapshot(analysisRunId: string, runtimeSnapshotJson: Record<string, unknown>) {
      repository.updatedRuntimeSnapshots.push({ analysisRunId, runtimeSnapshotJson });
      return analysisRun;
    },
    async upsertAnalysisResults(inputs: any[]) {
      repository.upsertedResults.push(...inputs);
    },
    async refreshAnalysisRunSummary() {
      return {
        pipelineRunId: pipelineRun.id,
        analysisRunId: analysisRun.id,
        status: overrides?.summaryOverride?.status ?? "completed",
        unitCountPlanned: 2,
        unitCountSucceeded: overrides?.summaryOverride?.unitCountSucceeded ?? 1,
        unitCountUnknown: overrides?.summaryOverride?.unitCountUnknown ?? 0,
        unitCountFailed: overrides?.summaryOverride?.unitCountFailed ?? 0,
        totalCostMicros: 17,
        totalUsageJson: {
          token_estimate_total: 11
        },
        promptHash: "backend-prompt-hash",
        promptVersion: "A",
        taxonomyVersionId: "taxonomy-version-1",
        outputSchemaVersion: "conversation_analysis.v2",
        runtimeSnapshotJson: {
          service_runtime: {
            effective_prompt_hash: "service-effective-hash"
          }
        },
        resumed: false,
        skippedThreadDayIds: []
      };
    },
    async updatePipelineRunAnalysisMetrics(pipelineRunId: string, summary: AnalysisExecutionSummary) {
      expect(pipelineRunId).toBe("pipeline-run-1");
      repository.updatedPipelineMetrics = summary;
    },
    async markPipelineRunAnalysisFailed(pipelineRunId: string, errorText: string) {
      repository.markPipelineRunAnalysisFailedCalls.push({ pipelineRunId, errorText });
    },
    async restorePipelineRunLoaded(pipelineRunId: string) {
      repository.restorePipelineRunLoadedCalls.push(pipelineRunId);
    },
    async getLatestAnalysisSummaryForPipelineRun() {
      return null;
    }
  };

  return repository;
}

function createAnalysisRun() {
  return {
    id: "analysis-run-1",
    pipelineRunId: "pipeline-run-1",
    configVersionId: "config-version-1",
    taxonomyVersionId: "taxonomy-version-1",
    snapshotIdentityKey: "snapshot-key-1",
    modelName: "service-managed",
    promptHash: "backend-prompt-hash",
    promptVersion: "A",
    runtimeSnapshotJson: {},
    outputSchemaVersion: "conversation_analysis.v2",
    status: "running",
    unitCountPlanned: 2,
    unitCountSucceeded: 1,
    unitCountUnknown: 0,
    totalUsageJson: {},
    totalCostMicros: 0,
    createdAt: new Date("2026-04-05T00:00:00.000Z"),
    startedAt: new Date("2026-04-05T00:00:00.000Z"),
    finishedAt: null
  };
}

function createPipelineRun() {
  return {
    id: "pipeline-run-1",
    runGroupId: "run-group-1",
    status: "loaded",
    targetDate: new Date("2026-04-05T00:00:00.000Z"),
    metricsJson: {},
    errorText: null,
    runGroup: {
      id: "run-group-1",
      frozenConfigVersionId: "config-version-1",
      frozenTaxonomyVersionId: "taxonomy-version-1",
      frozenCompiledPromptHash: "backend-prompt-hash",
      frozenPromptVersion: "A",
      frozenConfigVersion: {
        id: "config-version-1",
        promptText: "Ưu tiên đặt lịch.",
        connectedPage: {
          id: "page-1",
          pageName: "O2 Skin",
          businessTimezone: "Asia/Saigon",
          analysisEnabled: true
        },
        analysisTaxonomyVersion: {
          id: "taxonomy-version-1",
          versionCode: "default.v1",
          taxonomyJson: {
            categories: {}
          }
        }
      }
    }
  };
}

function createThreadDays() {
  return [
    createThreadDay("thread-day-1", "message-1"),
    createThreadDay("thread-day-2", "message-2")
  ];
}

function createThreadDay(id: string, messageId: string) {
  return {
    id,
    threadId: `thread-${id}`,
    normalizedTagSignalsJson: {},
    observedTagsJson: [],
    openingBlockJson: {},
    firstMeaningfulMessageId: messageId,
    firstMeaningfulMessageTextRedacted: "Khách tái khám muốn đặt lịch",
    firstMeaningfulMessageSenderRole: "customer",
    explicitRevisitSignal: "revisit",
    explicitNeedSignal: "appointment_booking",
    explicitOutcomeSignal: null,
    sourceThreadJsonRedacted: {},
    firstStaffResponseSeconds: 120,
    avgStaffResponseSeconds: 120,
    staffParticipantsJson: [
      {
        staff_name: "Lan",
        sender_source_id: "staff-1",
        message_count: 1
      }
    ],
    staffMessageStatsJson: [],
    thread: {
      connectedPageId: "page-1",
      customerDisplayName: "Khách A"
    },
    messages: [
      {
        id: messageId,
        insertedAt: new Date("2026-04-05T00:00:00.000Z"),
        senderRole: "customer",
        senderName: "Khách A",
        messageType: "text",
        redactedText: "Khách tái khám muốn đặt lịch",
        isMeaningfulHumanMessage: true,
        isOpeningBlockMessage: false
      }
    ]
  };
}

function buildExpectedEvidenceHash(threadDay: ReturnType<typeof createThreadDay>) {
  const pipelineRun = createPipelineRun();
  return hashAnalysisEvidence({
    bundle: {
      threadDayId: threadDay.id,
      threadId: threadDay.threadId,
      connectedPageId: threadDay.thread.connectedPageId,
      pipelineRunId: pipelineRun.id,
      runGroupId: pipelineRun.runGroupId,
      targetDate: pipelineRun.targetDate.toISOString().slice(0, 10),
      businessTimezone: pipelineRun.runGroup.frozenConfigVersion.connectedPage.businessTimezone,
      customerDisplayName: threadDay.thread.customerDisplayName,
      normalizedTagSignalsJson: threadDay.normalizedTagSignalsJson,
      observedTagsJson: threadDay.observedTagsJson,
      openingBlockJson: threadDay.openingBlockJson,
      firstMeaningfulMessageId: threadDay.firstMeaningfulMessageId,
      firstMeaningfulMessageTextRedacted: threadDay.firstMeaningfulMessageTextRedacted,
      firstMeaningfulMessageSenderRole: threadDay.firstMeaningfulMessageSenderRole,
      explicitRevisitSignal: threadDay.explicitRevisitSignal,
      explicitNeedSignal: threadDay.explicitNeedSignal,
      explicitOutcomeSignal: threadDay.explicitOutcomeSignal,
      sourceThreadJsonRedacted: threadDay.sourceThreadJsonRedacted,
      messageCount: threadDay.messages.length,
      firstStaffResponseSeconds: threadDay.firstStaffResponseSeconds,
      avgStaffResponseSeconds: threadDay.avgStaffResponseSeconds,
      staffParticipantsJson: threadDay.staffParticipantsJson,
      staffMessageStatsJson: threadDay.staffMessageStatsJson,
      messages: threadDay.messages.map((message) => ({
        id: message.id,
        insertedAt: message.insertedAt.toISOString(),
        senderRole: message.senderRole,
        senderName: message.senderName,
        messageType: message.messageType,
        redactedText: message.redactedText,
        isMeaningfulHumanMessage: message.isMeaningfulHumanMessage,
        isOpeningBlockMessage: message.isOpeningBlockMessage
      }))
    },
    runtime_identity: {
      prompt_hash: pipelineRun.runGroup.frozenCompiledPromptHash,
      prompt_version: pipelineRun.runGroup.frozenPromptVersion,
      taxonomy_version_id: pipelineRun.runGroup.frozenTaxonomyVersionId,
      output_schema_version: ANALYSIS_OUTPUT_SCHEMA_VERSION
    }
  });
}
