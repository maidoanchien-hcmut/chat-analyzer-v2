import { Prisma } from "@prisma/client";
import { prisma } from "../../infra/prisma.ts";
import { buildAnalysisSnapshotIdentityKey, cloneJson } from "./analysis.artifacts.ts";
import type {
  AnalysisExecutionSummary,
  AnalysisRunIdentity,
  PersistedAnalysisResultInput
} from "./analysis.types.ts";

export type AnalysisRunRecord = {
  id: string;
  pipelineRunId: string;
  configVersionId: string;
  taxonomyVersionId: string;
  snapshotIdentityKey: string;
  modelName: string;
  promptHash: string;
  promptVersion: string;
  runtimeSnapshotJson: Record<string, unknown>;
  outputSchemaVersion: string;
  status: string;
  unitCountPlanned: number;
  unitCountSucceeded: number;
  unitCountUnknown: number;
  totalUsageJson: Record<string, unknown>;
  totalCostMicros: number;
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
};

export type AnalysisResultRecord = {
  analysisRunId: string;
  threadDayId: string;
  evidenceHash: string;
  resultStatus: string;
};

export type AnalysisPipelineRunRecord = {
  id: string;
  runGroupId: string;
  status: string;
  targetDate: Date;
  metricsJson: Prisma.JsonValue;
  errorText: string | null;
  runGroup: {
    id: string;
    frozenConfigVersionId: string;
    frozenTaxonomyVersionId: string;
    frozenCompiledPromptHash: string;
    frozenPromptVersion: string;
    frozenConfigVersion: {
      id: string;
      promptText: string;
      connectedPage: {
        id: string;
        pageName: string;
        businessTimezone: string;
        analysisEnabled: boolean;
      };
      analysisTaxonomyVersion: {
        id: string;
        versionCode: string;
        taxonomyJson: Prisma.JsonValue;
      };
    };
  };
};

export type AnalysisThreadDayRecord = {
  id: string;
  threadId: string;
  normalizedTagSignalsJson: Prisma.JsonValue;
  observedTagsJson: Prisma.JsonValue;
  openingBlockJson: Prisma.JsonValue;
  firstMeaningfulMessageId: string | null;
  firstMeaningfulMessageTextRedacted: string | null;
  firstMeaningfulMessageSenderRole: string | null;
  explicitRevisitSignal: string | null;
  explicitNeedSignal: string | null;
  explicitOutcomeSignal: string | null;
  sourceThreadJsonRedacted: Prisma.JsonValue;
  firstStaffResponseSeconds: number | null;
  avgStaffResponseSeconds: number | null;
  staffParticipantsJson: Prisma.JsonValue;
  staffMessageStatsJson: Prisma.JsonValue;
  thread: {
    connectedPageId: string;
    customerDisplayName: string | null;
  };
  messages: Array<{
    id: string;
    insertedAt: Date;
    senderRole: string;
    senderName: string | null;
    messageType: string;
    redactedText: string | null;
    isMeaningfulHumanMessage: boolean;
    isOpeningBlockMessage: boolean;
  }>;
};

class AnalysisRepository {
  async getPipelineRunForAnalysis(pipelineRunId: string): Promise<AnalysisPipelineRunRecord | null> {
    return prisma.pipelineRun.findUnique({
      where: { id: pipelineRunId },
      select: {
        id: true,
        runGroupId: true,
        status: true,
        targetDate: true,
        metricsJson: true,
        errorText: true,
        runGroup: {
          select: {
            id: true,
            frozenConfigVersionId: true,
            frozenTaxonomyVersionId: true,
            frozenCompiledPromptHash: true,
            frozenPromptVersion: true,
            frozenConfigVersion: {
              select: {
                id: true,
                promptText: true,
                connectedPage: {
                  select: {
                    id: true,
                    pageName: true,
                    businessTimezone: true,
                    analysisEnabled: true
                  }
                },
                analysisTaxonomyVersion: {
                  select: {
                    id: true,
                    versionCode: true,
                    taxonomyJson: true
                  }
                }
              }
            }
          }
        }
      }
    });
  }

  async listThreadDaysForRun(pipelineRunId: string): Promise<AnalysisThreadDayRecord[]> {
    return prisma.threadDay.findMany({
      where: { pipelineRunId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        threadId: true,
        normalizedTagSignalsJson: true,
        observedTagsJson: true,
        openingBlockJson: true,
        firstMeaningfulMessageId: true,
        firstMeaningfulMessageTextRedacted: true,
        firstMeaningfulMessageSenderRole: true,
        explicitRevisitSignal: true,
        explicitNeedSignal: true,
        explicitOutcomeSignal: true,
        sourceThreadJsonRedacted: true,
        firstStaffResponseSeconds: true,
        avgStaffResponseSeconds: true,
        staffParticipantsJson: true,
        staffMessageStatsJson: true,
        thread: {
          select: {
            connectedPageId: true,
            customerDisplayName: true
          }
        },
        messages: {
          orderBy: [{ insertedAt: "asc" }, { id: "asc" }],
          select: {
            id: true,
            insertedAt: true,
            senderRole: true,
            senderName: true,
            messageType: true,
            redactedText: true,
            isMeaningfulHumanMessage: true,
            isOpeningBlockMessage: true
          }
        }
      }
    });
  }

  async findLatestMatchingAnalysisRun(identity: AnalysisRunIdentity): Promise<AnalysisRunRecord | null> {
    const snapshotIdentityKey = buildSnapshotIdentityKey(identity);
    const row = await prisma.analysisRun.findUnique({
      where: {
        pipelineRunId_snapshotIdentityKey: {
          pipelineRunId: identity.pipelineRunId,
          snapshotIdentityKey
        }
      }
    });
    return row ? mapAnalysisRun(row) : null;
  }

  async createAnalysisRun(input: {
    pipelineRunId: string;
    configVersionId: string;
    taxonomyVersionId: string;
    modelName: string;
    promptHash: string;
    promptVersion: string;
    runtimeSnapshotJson: Record<string, unknown>;
    outputSchemaVersion: string;
    unitCountPlanned: number;
    runtimeProfileId: string;
    runtimeProfileVersion: number;
  }): Promise<AnalysisRunRecord> {
    const snapshotIdentityKey = buildSnapshotIdentityKey({
      pipelineRunId: input.pipelineRunId,
      configVersionId: input.configVersionId,
      taxonomyVersionId: input.taxonomyVersionId,
      modelName: input.modelName,
      promptHash: input.promptHash,
      promptVersion: input.promptVersion,
      outputSchemaVersion: input.outputSchemaVersion,
      runtimeProfileId: input.runtimeProfileId,
      runtimeProfileVersion: input.runtimeProfileVersion
    });
    const row = await prisma.analysisRun.create({
      data: {
        pipelineRunId: input.pipelineRunId,
        configVersionId: input.configVersionId,
        taxonomyVersionId: input.taxonomyVersionId,
        snapshotIdentityKey,
        modelName: input.modelName,
        promptHash: input.promptHash,
        promptVersion: input.promptVersion,
        runtimeSnapshotJson: input.runtimeSnapshotJson as Prisma.InputJsonValue,
        outputSchemaVersion: input.outputSchemaVersion,
        status: "running",
        unitCountPlanned: input.unitCountPlanned,
        startedAt: new Date(),
        finishedAt: null
      }
    });
    return mapAnalysisRun(row);
  }

  async markAnalysisRunRunning(analysisRunId: string): Promise<AnalysisRunRecord> {
    const row = await prisma.analysisRun.update({
      where: { id: analysisRunId },
      data: {
        status: "running",
        startedAt: new Date(),
        finishedAt: null
      }
    });
    return mapAnalysisRun(row);
  }

  async updateAnalysisRunRuntimeSnapshot(
    analysisRunId: string,
    runtimeSnapshotJson: Record<string, unknown>,
    options?: {
      promptHash?: string;
      modelName?: string;
    }
  ): Promise<AnalysisRunRecord> {
    const row = await prisma.analysisRun.update({
      where: { id: analysisRunId },
      data: {
        runtimeSnapshotJson: runtimeSnapshotJson as Prisma.InputJsonValue,
        ...(options?.promptHash ? { promptHash: options.promptHash } : {}),
        ...(options?.modelName ? { modelName: options.modelName } : {})
      }
    });
    return mapAnalysisRun(row);
  }

  async listAnalysisResults(analysisRunId: string): Promise<AnalysisResultRecord[]> {
    return prisma.analysisResult.findMany({
      where: { analysisRunId },
      select: {
        analysisRunId: true,
        threadDayId: true,
        evidenceHash: true,
        resultStatus: true
      }
    });
  }

  async upsertAnalysisResults(inputs: PersistedAnalysisResultInput[]): Promise<void> {
    if (inputs.length === 0) {
      return;
    }
    await prisma.$transaction(
      inputs.map((input) => prisma.analysisResult.upsert({
        where: {
          analysisRunId_threadDayId: {
            analysisRunId: input.analysisRunId,
            threadDayId: input.threadDayId
          }
        },
        update: toAnalysisResultData(input),
        create: toAnalysisResultData(input)
      }))
    );
  }

  async refreshAnalysisRunSummary(analysisRunId: string): Promise<AnalysisExecutionSummary> {
    const [analysisRun, rows] = await Promise.all([
      prisma.analysisRun.findUniqueOrThrow({
        where: { id: analysisRunId }
      }),
      prisma.analysisResult.findMany({
        where: { analysisRunId }
      })
    ]);

    const unitCountSucceeded = rows.filter((row) => row.resultStatus === "succeeded").length;
    const unitCountUnknown = rows.filter((row) => row.resultStatus === "unknown").length;
    const unitCountFailed = rows.filter((row) => row.resultStatus === "failed").length;
    const totalCostMicros = rows.reduce((sum, row) => sum + Number(row.costMicros), 0);
    const totalUsageJson = aggregateUsage(rows.map((row) => row.usageJson as Record<string, unknown>));
    const status = rows.length < analysisRun.unitCountPlanned
      ? "running"
      : unitCountFailed > 0
        ? "failed"
        : "completed";

    const updated = await prisma.analysisRun.update({
      where: { id: analysisRunId },
      data: {
        status,
        unitCountSucceeded,
        unitCountUnknown,
        totalUsageJson,
        totalCostMicros,
        finishedAt: status === "running" ? null : new Date()
      }
    });

    return {
      pipelineRunId: updated.pipelineRunId,
      analysisRunId: updated.id,
      status: updated.status,
      unitCountPlanned: updated.unitCountPlanned,
      unitCountSucceeded,
      unitCountUnknown,
      unitCountFailed,
      totalCostMicros,
      totalUsageJson,
      promptHash: updated.promptHash,
      promptVersion: updated.promptVersion,
      taxonomyVersionId: updated.taxonomyVersionId,
      outputSchemaVersion: updated.outputSchemaVersion,
      runtimeSnapshotJson: cloneJson(updated.runtimeSnapshotJson as Record<string, unknown>),
      resumed: false,
      skippedThreadDayIds: []
    };
  }

  async updatePipelineRunAnalysisMetrics(
    pipelineRunId: string,
    summary: AnalysisExecutionSummary
  ): Promise<void> {
    const pipelineRun = await prisma.pipelineRun.findUniqueOrThrow({
      where: { id: pipelineRunId },
      select: {
        metricsJson: true
      }
    });

    const baseMetrics = isRecord(pipelineRun.metricsJson) ? cloneJson(pipelineRun.metricsJson) : {};
    await prisma.pipelineRun.update({
      where: { id: pipelineRunId },
      data: {
        metricsJson: {
          ...baseMetrics,
          analysis: {
            analysis_run_id: summary.analysisRunId,
            status: summary.status,
            unit_count_planned: summary.unitCountPlanned,
            unit_count_succeeded: summary.unitCountSucceeded,
            unit_count_unknown: summary.unitCountUnknown,
            unit_count_failed: summary.unitCountFailed,
            total_cost_micros: summary.totalCostMicros,
            prompt_hash: summary.promptHash,
            prompt_version: summary.promptVersion,
            taxonomy_version_id: summary.taxonomyVersionId,
            output_schema_version: summary.outputSchemaVersion,
            resumed: summary.resumed,
            skipped_thread_day_ids: cloneJson(summary.skippedThreadDayIds)
          }
        } as Prisma.InputJsonValue
      }
    });
  }

  async markPipelineRunAnalysisFailed(pipelineRunId: string, errorText: string): Promise<void> {
    await prisma.pipelineRun.update({
      where: { id: pipelineRunId },
      data: {
        status: "failed",
        errorText
      }
    });
  }

  async restorePipelineRunLoaded(pipelineRunId: string): Promise<void> {
    await prisma.pipelineRun.update({
      where: { id: pipelineRunId },
      data: {
        status: "loaded",
        errorText: null
      }
    });
  }

  async getLatestAnalysisSummaryForPipelineRun(pipelineRunId: string): Promise<AnalysisExecutionSummary | null> {
    const row = await prisma.analysisRun.findFirst({
      where: { pipelineRunId },
      orderBy: [{ createdAt: "desc" }]
    });
    if (!row) {
      return null;
    }

    const results = await prisma.analysisResult.findMany({
      where: { analysisRunId: row.id }
    });

    return {
      pipelineRunId,
      analysisRunId: row.id,
      status: row.status,
      unitCountPlanned: row.unitCountPlanned,
      unitCountSucceeded: row.unitCountSucceeded,
      unitCountUnknown: row.unitCountUnknown,
      unitCountFailed: results.filter((item) => item.resultStatus === "failed").length,
      totalCostMicros: Number(row.totalCostMicros),
      totalUsageJson: cloneJson(row.totalUsageJson as Record<string, unknown>),
      promptHash: row.promptHash,
      promptVersion: row.promptVersion,
      taxonomyVersionId: row.taxonomyVersionId,
      outputSchemaVersion: row.outputSchemaVersion,
      runtimeSnapshotJson: cloneJson(row.runtimeSnapshotJson as Record<string, unknown>),
      resumed: false,
      skippedThreadDayIds: []
    };
  }
}

function buildSnapshotIdentityKey(identity: AnalysisRunIdentity) {
  return buildAnalysisSnapshotIdentityKey(identity);
}

function toAnalysisResultData(input: PersistedAnalysisResultInput) {
  return {
    analysisRunId: input.analysisRunId,
    threadDayId: input.threadDayId,
    evidenceHash: input.evidenceHash,
    resultStatus: input.resultStatus,
    promptHash: input.promptHash,
    openingThemeCode: input.openingThemeCode,
    openingThemeReason: input.openingThemeReason,
    customerMoodCode: input.customerMoodCode,
    primaryNeedCode: input.primaryNeedCode,
    primaryTopicCode: input.primaryTopicCode,
    journeyCode: input.journeyCode,
    closingOutcomeInferenceCode: input.closingOutcomeInferenceCode,
    processRiskLevelCode: input.processRiskLevelCode,
    processRiskReasonText: input.processRiskReasonText,
    staffAssessmentsJson: input.staffAssessmentsJson as Prisma.InputJsonValue,
    evidenceUsedJson: input.evidenceUsedJson as Prisma.InputJsonValue,
    fieldExplanationsJson: input.fieldExplanationsJson as Prisma.InputJsonValue,
    supportingMessageIdsJson: input.supportingMessageIdsJson as Prisma.InputJsonValue,
    usageJson: input.usageJson as Prisma.InputJsonValue,
    costMicros: BigInt(Math.max(0, Math.trunc(input.costMicros))),
    failureInfoJson: input.failureInfoJson === null ? Prisma.JsonNull : input.failureInfoJson as Prisma.InputJsonValue
  };
}

function aggregateUsage(usages: Array<Record<string, unknown>>) {
  let tokenEstimateTotal = 0;
  const providers: Record<string, number> = {};

  for (const usage of usages) {
    const tokenEstimate = Number(usage.token_estimate ?? 0);
    tokenEstimateTotal += Number.isFinite(tokenEstimate) ? tokenEstimate : 0;
    const provider = typeof usage.provider === "string" && usage.provider.length > 0
      ? usage.provider
      : "unknown";
    providers[provider] = (providers[provider] ?? 0) + 1;
  }

  return {
    token_estimate_total: tokenEstimateTotal,
    provider_counts: providers
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function mapAnalysisRun(row: {
  id: string;
  pipelineRunId: string;
  configVersionId: string;
  taxonomyVersionId: string;
  snapshotIdentityKey: string;
  modelName: string;
  promptHash: string;
  promptVersion: string;
  runtimeSnapshotJson: Prisma.JsonValue;
  outputSchemaVersion: string;
  status: string;
  unitCountPlanned: number;
  unitCountSucceeded: number;
  unitCountUnknown: number;
  totalUsageJson: Prisma.JsonValue;
  totalCostMicros: bigint;
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
}): AnalysisRunRecord {
  return {
    id: row.id,
    pipelineRunId: row.pipelineRunId,
    configVersionId: row.configVersionId,
    taxonomyVersionId: row.taxonomyVersionId,
    snapshotIdentityKey: row.snapshotIdentityKey,
    modelName: row.modelName,
    promptHash: row.promptHash,
    promptVersion: row.promptVersion,
    runtimeSnapshotJson: cloneJson(row.runtimeSnapshotJson as Record<string, unknown>),
    outputSchemaVersion: row.outputSchemaVersion,
    status: row.status,
    unitCountPlanned: row.unitCountPlanned,
    unitCountSucceeded: row.unitCountSucceeded,
    unitCountUnknown: row.unitCountUnknown,
    totalUsageJson: cloneJson(row.totalUsageJson as Record<string, unknown>),
    totalCostMicros: Number(row.totalCostMicros),
    createdAt: row.createdAt,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt
  };
}

export const analysisRepository = new AnalysisRepository();
