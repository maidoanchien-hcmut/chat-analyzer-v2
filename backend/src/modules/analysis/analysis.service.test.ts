import { describe, expect, it } from "bun:test";
import { ANALYSIS_OUTPUT_SCHEMA_VERSION, hashAnalysisEvidence } from "./analysis.artifacts.ts";
import { AnalysisService } from "./analysis.service.ts";
import type {
  AnalysisExecutionSummary,
  ConversationAnalysisRequest
} from "./analysis.types.ts";

describe("analysis service", () => {
  it("separates backend page prompt identity from service effective prompt metadata", async () => {
    const repository = createRepositoryStub({
      existingResults: [],
      hasExistingAnalysisRun: false
    });
    const service = new AnalysisService({
      repository: repository as never,
      client: {
        analyzeConversations: async (input) => ({
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
            staffAssessmentsJson: [],
            evidenceUsedJson: { source: "service" },
            fieldExplanationsJson: {},
            supportingMessageIdsJson: [bundle.firstMeaningfulMessageId ?? "message-1"],
            usageJson: {
              provider: "deterministic_dev",
              token_estimate: 9
            },
            costMicros: 13,
            failureInfoJson: null
          })),
          runtimeMetadataJson: {
            effective_prompt_hash: "service-effective-hash",
            system_prompt_version: "service_system.v2",
            provider: "openai_compatible",
            model_name: "gpt-live",
            generation_config: {
              temperature: 0.1,
              top_p: 1,
              max_output_tokens: 900
            }
          }
        })
      },
      batchSize: 10
    });

    const summary = await service.executeLoadedRun("pipeline-run-1");

    expect(repository.createdAnalysisRunInputs).toHaveLength(1);
    expect(repository.createdAnalysisRunInputs[0]?.promptHash).toBe("service-effective-hash");
    expect(repository.createdAnalysisRunInputs[0]?.modelName).toBe("gpt-live");
    expect(repository.updatedRuntimeSnapshots).toHaveLength(1);
    expect(repository.updatedRuntimeSnapshots[0]?.runtimeSnapshotJson).toMatchObject({
      service_runtime: {
        effective_prompt_hash: "service-effective-hash",
        system_prompt_version: "service_system.v2",
        provider: "openai_compatible",
        model_name: "gpt-live",
        generation_config: {
          temperature: 0.1,
          top_p: 1,
          max_output_tokens: 900
        }
      },
      backend_runtime: {
        profile_id: "conversation-analysis",
        version_no: 1,
        requested_model_name: "resolved-by-service",
        page_prompt_hash: "backend-page-prompt-hash",
        page_prompt_version: "A",
        taxonomy_version_id: "taxonomy-version-1",
        taxonomy_version_code: "default.v1",
        output_schema_version: "conversation_analysis.v2"
      }
    });
    expect(repository.updatedRuntimeSnapshots[0]?.runtimeSnapshotJson.backend_runtime).not.toHaveProperty("prompt_hash");
    expect(repository.updatedAnalysisRunPromptHashes).toEqual([
      {
        analysisRunId: "analysis-run-1",
        promptHash: "service-effective-hash"
      }
    ]);
    expect(repository.updatedAnalysisRunModelNames).toEqual([
      {
        analysisRunId: "analysis-run-1",
        modelName: "gpt-live"
      }
    ]);
    expect(summary.promptHash).toBe("service-effective-hash");
    expect(summary.promptVersion).toBe("A");
  });

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
              system_prompt_version: "service_system.v2"
            }
          };
        }
      },
      batchSize: 10
    });

    const summary = await service.executeLoadedRun("pipeline-run-1");

    expect(clientCalls).toHaveLength(2);
    expect(clientCalls[0]?.bundles).toHaveLength(0);
    expect(clientCalls[1]?.bundles).toHaveLength(1);
    expect(clientCalls[1]?.bundles[0]?.threadDayId).toBe("thread-day-2");
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
              system_prompt_version: "service_system.v2"
            }
          };
        }
      },
      batchSize: 10
    });

    const summary = await service.executeLoadedRun("pipeline-run-1");

    expect(clientCalls).toHaveLength(2);
    expect(clientCalls[0]?.bundles).toHaveLength(0);
    expect(clientCalls[1]?.bundles.map((bundle) => bundle.threadDayId)).toEqual(["thread-day-1", "thread-day-2"]);
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
          throw new Error("analysis service unavailable");
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
  hasExistingAnalysisRun?: boolean;
}) {
  const pipelineRun = createPipelineRun();
  const threadDays = createThreadDays();
  const analysisRun = createAnalysisRun();
  const hasExistingAnalysisRun = overrides?.hasExistingAnalysisRun ?? true;
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
    updatedAnalysisRunPromptHashes: [] as Array<{ analysisRunId: string; promptHash: string }>,
    updatedAnalysisRunModelNames: [] as Array<{ analysisRunId: string; modelName: string }>,
    createdAnalysisRunInputs: [] as Array<{ modelName: string; promptHash: string; promptVersion: string; runtimeSnapshotJson: Record<string, unknown> }>,
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
      return hasExistingAnalysisRun ? analysisRun : null;
    },
    async createAnalysisRun(input: { modelName: string; promptHash: string; promptVersion: string; runtimeSnapshotJson: Record<string, unknown> }) {
      repository.createdAnalysisRunInputs.push(input);
      analysisRun.modelName = input.modelName;
      analysisRun.promptHash = input.promptHash;
      analysisRun.promptVersion = input.promptVersion;
      analysisRun.runtimeSnapshotJson = input.runtimeSnapshotJson;
      return analysisRun;
    },
    async listAnalysisResults() {
      return existingResults;
    },
    async markAnalysisRunRunning(analysisRunId: string) {
      repository.markAnalysisRunRunningCalls.push(analysisRunId);
      return analysisRun;
    },
    async updateAnalysisRunRuntimeSnapshot(
      analysisRunId: string,
      runtimeSnapshotJson: Record<string, unknown>,
      options?: {
        promptHash?: string;
        modelName?: string;
      }
    ) {
      repository.updatedRuntimeSnapshots.push({ analysisRunId, runtimeSnapshotJson });
      if (options?.promptHash) {
        repository.updatedAnalysisRunPromptHashes.push({ analysisRunId, promptHash: options.promptHash });
        analysisRun.promptHash = options.promptHash;
      }
      if (options?.modelName) {
        repository.updatedAnalysisRunModelNames.push({ analysisRunId, modelName: options.modelName });
        analysisRun.modelName = options.modelName;
      }
      analysisRun.runtimeSnapshotJson = runtimeSnapshotJson;
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
        promptHash: analysisRun.promptHash,
        promptVersion: analysisRun.promptVersion,
        taxonomyVersionId: "taxonomy-version-1",
        outputSchemaVersion: "conversation_analysis.v2",
        runtimeSnapshotJson: analysisRun.runtimeSnapshotJson,
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
    modelName: "resolved-by-service",
    promptHash: "backend-page-prompt-hash",
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
      frozenCompiledPromptHash: "backend-page-prompt-hash",
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
      page_prompt_hash: pipelineRun.runGroup.frozenCompiledPromptHash,
      prompt_version: pipelineRun.runGroup.frozenPromptVersion,
      taxonomy_version_id: pipelineRun.runGroup.frozenTaxonomyVersionId,
      output_schema_version: ANALYSIS_OUTPUT_SCHEMA_VERSION
    }
  });
}
