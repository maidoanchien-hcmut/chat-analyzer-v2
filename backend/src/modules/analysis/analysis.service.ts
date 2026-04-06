import { AppError } from "../../core/errors.ts";
import {
  ANALYSIS_BATCH_SIZE,
  ANALYSIS_OUTPUT_SCHEMA_VERSION,
  ANALYSIS_RUNTIME_MODEL_NAME,
  ANALYSIS_RUNTIME_PROFILE_ID,
  ANALYSIS_RUNTIME_PROFILE_VERSION,
  cloneJson,
  hashAnalysisEvidence
} from "./analysis.artifacts.ts";
import { conversationAnalysisClient, type ConversationAnalysisClient } from "./analysis.client.ts";
import { analysisRepository, type AnalysisPipelineRunRecord, type AnalysisRunRecord, type AnalysisThreadDayRecord } from "./analysis.repository.ts";
import type { AnalysisExecutionSummary, AnalysisRunIdentity, AnalysisRuntimeSnapshot, AnalysisUnitEnvelope, ConversationAnalysisResult, PersistedAnalysisResultInput } from "./analysis.types.ts";

type AnalysisServiceDeps = {
  repository?: typeof analysisRepository;
  client?: ConversationAnalysisClient;
  batchSize?: number;
};

type PreparedRuntimeIdentity = {
  promptHash: string;
  modelName: string;
  runtimeSnapshotJson: Record<string, unknown>;
  canReuseExistingRun: boolean;
};

export class AnalysisService {
  private readonly repository: typeof analysisRepository;
  private readonly client: ConversationAnalysisClient;
  private readonly batchSize: number;

  constructor(deps: AnalysisServiceDeps = {}) {
    this.repository = deps.repository ?? analysisRepository;
    this.client = deps.client ?? conversationAnalysisClient;
    this.batchSize = deps.batchSize ?? ANALYSIS_BATCH_SIZE;
  }

  async executeLoadedRun(pipelineRunId: string): Promise<AnalysisExecutionSummary> {
    const pipelineRun = await this.repository.getPipelineRunForAnalysis(pipelineRunId);
    if (!pipelineRun) {
      throw new AppError(404, "ANALYSIS_PIPELINE_RUN_NOT_FOUND", `Pipeline run ${pipelineRunId} không tồn tại.`);
    }
    if (!pipelineRun.runGroup.frozenConfigVersion.connectedPage.analysisEnabled) {
      throw new AppError(409, "ANALYSIS_DISABLED", `Page ${pipelineRun.runGroup.frozenConfigVersion.connectedPage.id} đang tắt analysis.`);
    }
    if (!["loaded", "failed"].includes(pipelineRun.status)) {
      throw new AppError(409, "ANALYSIS_PIPELINE_RUN_NOT_READY", "Chỉ được chạy analysis cho pipeline_run đã load xong hoặc cần retry.");
    }

    const threadDays = await this.repository.listThreadDaysForRun(pipelineRunId);
    const runtime = buildRuntimeSnapshot(pipelineRun);
    const preparedRuntime = await this.prepareRuntimeIdentity(runtime);
    const envelopes = threadDays.map((threadDay) => buildUnitEnvelope(pipelineRun, threadDay));
    const analysisRun = await this.resolveAnalysisRun(pipelineRun, runtime, preparedRuntime, envelopes);
    const existingResults = preparedRuntime.canReuseExistingRun
      ? await this.repository.listAnalysisResults(analysisRun.id)
      : [];
    const terminalResultByThreadDayId = new Map(
      existingResults
        .filter((result) => result.resultStatus === "succeeded" || result.resultStatus === "unknown")
        .map((result) => [result.threadDayId, result])
    );
    const pendingEnvelopes = envelopes.filter((item) => {
      const terminal = terminalResultByThreadDayId.get(item.bundle.threadDayId);
      if (!terminal) {
        return true;
      }
      return terminal.evidenceHash !== item.evidenceHash;
    });
    const skippedThreadDayIds = envelopes
      .filter((item) => {
        const terminal = terminalResultByThreadDayId.get(item.bundle.threadDayId);
        return terminal?.evidenceHash === item.evidenceHash;
      })
      .map((item) => item.bundle.threadDayId);

    if (pendingEnvelopes.length > 0) {
      await this.repository.markAnalysisRunRunning(analysisRun.id);
      for (const batch of chunk(pendingEnvelopes, this.batchSize)) {
        await this.processBatch(analysisRun, runtime, batch);
      }
    }

    const summary = await this.repository.refreshAnalysisRunSummary(analysisRun.id);
    summary.resumed = skippedThreadDayIds.length > 0;
    summary.skippedThreadDayIds = skippedThreadDayIds;
    await this.repository.updatePipelineRunAnalysisMetrics(pipelineRunId, summary);

    if (summary.status === "failed") {
      await this.repository.markPipelineRunAnalysisFailed(
        pipelineRunId,
        `Analysis run ${summary.analysisRunId} có unit thất bại; dùng endpoint retry để resume.`
      );
      return summary;
    }

    await this.repository.restorePipelineRunLoaded(pipelineRunId);
    return summary;
  }

  async getRunSummary(pipelineRunId: string) {
    return this.repository.getLatestAnalysisSummaryForPipelineRun(pipelineRunId);
  }

  private async resolveAnalysisRun(
    pipelineRun: AnalysisPipelineRunRecord,
    runtime: AnalysisRuntimeSnapshot,
    preparedRuntime: PreparedRuntimeIdentity,
    envelopes: AnalysisUnitEnvelope[]
  ) {
    const identity: AnalysisRunIdentity = {
      pipelineRunId: pipelineRun.id,
      configVersionId: pipelineRun.runGroup.frozenConfigVersionId,
      taxonomyVersionId: pipelineRun.runGroup.frozenTaxonomyVersionId,
      modelName: preparedRuntime.modelName,
      promptHash: preparedRuntime.promptHash,
      promptVersion: runtime.promptVersion,
      outputSchemaVersion: runtime.outputSchemaVersion,
      runtimeProfileId: runtime.profileId,
      runtimeProfileVersion: runtime.versionNo
    };
    if (preparedRuntime.canReuseExistingRun) {
      const existing = await this.repository.findLatestMatchingAnalysisRun(identity);
      if (existing) {
        return existing;
      }
    }

    return this.repository.createAnalysisRun({
      pipelineRunId: pipelineRun.id,
      configVersionId: pipelineRun.runGroup.frozenConfigVersionId,
      taxonomyVersionId: pipelineRun.runGroup.frozenTaxonomyVersionId,
      modelName: preparedRuntime.modelName,
      promptHash: preparedRuntime.promptHash,
      promptVersion: runtime.promptVersion,
      runtimeSnapshotJson: preparedRuntime.runtimeSnapshotJson,
      outputSchemaVersion: runtime.outputSchemaVersion,
      unitCountPlanned: envelopes.length,
      runtimeProfileId: runtime.profileId,
      runtimeProfileVersion: runtime.versionNo
    });
  }

  private async processBatch(
    analysisRun: AnalysisRunRecord,
    runtime: AnalysisRuntimeSnapshot,
    batch: AnalysisUnitEnvelope[]
  ) {
    try {
      const response = await this.client.analyzeConversations({
        runtime,
        bundles: batch.map((item) => item.bundle)
      });
      const effectivePromptHash = readEffectivePromptHash(response.runtimeMetadataJson, runtime.pagePromptHash);
      const effectiveModelName = readEffectiveModelName(response.runtimeMetadataJson, runtime.modelName);
      if (Object.keys(response.runtimeMetadataJson).length > 0) {
        await this.repository.updateAnalysisRunRuntimeSnapshot(
          analysisRun.id,
          mergeRuntimeSnapshot(
            analysisRun.runtimeSnapshotJson,
            response.runtimeMetadataJson,
            runtime
          ),
          {
            promptHash: effectivePromptHash,
            modelName: effectiveModelName
          }
        );
      }
      const resultMap = new Map(response.results.map((item) => [item.threadDayId, item]));
      const persistedResults = batch.map((item) => {
        const raw = resultMap.get(item.bundle.threadDayId);
        if (!raw) {
          return buildFailureResult(analysisRun.id, effectivePromptHash, item, {
            reason: "missing_service_result"
          });
        }
        return normalizeResult(analysisRun.id, effectivePromptHash, item, raw);
      });
      await this.repository.upsertAnalysisResults(persistedResults);
    } catch (error) {
      await this.repository.upsertAnalysisResults(
        batch.map((item) => buildFailureResult(analysisRun.id, runtime.pagePromptHash, item, {
          reason: "service_call_failed",
          message: error instanceof Error ? error.message : String(error)
        }))
      );
    }
  }

  private async prepareRuntimeIdentity(runtime: AnalysisRuntimeSnapshot): Promise<PreparedRuntimeIdentity> {
    try {
      const response = await this.client.analyzeConversations({
        runtime,
        bundles: []
      });
      if (Object.keys(response.runtimeMetadataJson).length === 0) {
        return {
          promptHash: runtime.pagePromptHash,
          modelName: runtime.modelName,
          runtimeSnapshotJson: buildInitialRuntimeSnapshotJson(runtime),
          canReuseExistingRun: false
        };
      }
      return {
        promptHash: readEffectivePromptHash(response.runtimeMetadataJson, runtime.pagePromptHash),
        modelName: readEffectiveModelName(response.runtimeMetadataJson, runtime.modelName),
        runtimeSnapshotJson: mergeRuntimeSnapshot(
          buildInitialRuntimeSnapshotJson(runtime),
          response.runtimeMetadataJson,
          runtime
        ),
        canReuseExistingRun: true
      };
    } catch {
      return {
        promptHash: runtime.pagePromptHash,
        modelName: runtime.modelName,
        runtimeSnapshotJson: buildInitialRuntimeSnapshotJson(runtime),
        canReuseExistingRun: false
      };
    }
  }
}

function buildRuntimeSnapshot(pipelineRun: AnalysisPipelineRunRecord): AnalysisRuntimeSnapshot {
  const taxonomyVersion = pipelineRun.runGroup.frozenConfigVersion.analysisTaxonomyVersion;
  const connectedPage = pipelineRun.runGroup.frozenConfigVersion.connectedPage;

  return {
    profileId: ANALYSIS_RUNTIME_PROFILE_ID,
    versionNo: ANALYSIS_RUNTIME_PROFILE_VERSION,
    modelName: ANALYSIS_RUNTIME_MODEL_NAME,
    outputSchemaVersion: ANALYSIS_OUTPUT_SCHEMA_VERSION,
    pagePromptHash: pipelineRun.runGroup.frozenCompiledPromptHash,
    promptVersion: pipelineRun.runGroup.frozenPromptVersion,
    configVersionId: pipelineRun.runGroup.frozenConfigVersionId,
    taxonomyVersionId: taxonomyVersion.id,
    taxonomyVersionCode: taxonomyVersion.versionCode,
    connectedPageId: connectedPage.id,
    pagePromptText: pipelineRun.runGroup.frozenConfigVersion.promptText,
    taxonomyJson: cloneJson(taxonomyVersion.taxonomyJson),
    generationConfig: {},
    profileJson: {
      connected_page_id: connectedPage.id,
      page_name: connectedPage.pageName,
      business_timezone: connectedPage.businessTimezone,
      config_version_id: pipelineRun.runGroup.frozenConfigVersionId,
      taxonomy_version_id: taxonomyVersion.id,
      taxonomy_version_code: taxonomyVersion.versionCode,
      page_prompt_hash: pipelineRun.runGroup.frozenCompiledPromptHash,
      page_prompt_version: pipelineRun.runGroup.frozenPromptVersion
    }
  };
}

function buildInitialRuntimeSnapshotJson(runtime: AnalysisRuntimeSnapshot) {
  return cloneJson({
    profile_id: runtime.profileId,
    version_no: runtime.versionNo,
    requested_model_name: runtime.modelName,
    prompt_version: runtime.promptVersion,
    output_schema_version: runtime.outputSchemaVersion,
    taxonomy_version_id: runtime.taxonomyVersionId,
    taxonomy_version_code: runtime.taxonomyVersionCode,
    page_prompt_hash: runtime.pagePromptHash,
    page_prompt_version: runtime.promptVersion,
    page_prompt_text: runtime.pagePromptText,
    taxonomy_json: runtime.taxonomyJson,
    profile_json: runtime.profileJson
  });
}

function buildUnitEnvelope(
  pipelineRun: AnalysisPipelineRunRecord,
  threadDay: AnalysisThreadDayRecord
): AnalysisUnitEnvelope {
  const bundle = {
    threadDayId: threadDay.id,
    threadId: threadDay.threadId,
    connectedPageId: threadDay.thread.connectedPageId,
    pipelineRunId: pipelineRun.id,
    runGroupId: pipelineRun.runGroupId,
    targetDate: pipelineRun.targetDate.toISOString().slice(0, 10),
    businessTimezone: pipelineRun.runGroup.frozenConfigVersion.connectedPage.businessTimezone,
    customerDisplayName: threadDay.thread.customerDisplayName,
    normalizedTagSignalsJson: cloneJson(threadDay.normalizedTagSignalsJson),
    observedTagsJson: cloneJson(threadDay.observedTagsJson),
    openingBlockJson: cloneJson(threadDay.openingBlockJson),
    firstMeaningfulMessageId: threadDay.firstMeaningfulMessageId,
    firstMeaningfulMessageTextRedacted: threadDay.firstMeaningfulMessageTextRedacted,
    firstMeaningfulMessageSenderRole: threadDay.firstMeaningfulMessageSenderRole,
    explicitRevisitSignal: threadDay.explicitRevisitSignal,
    explicitNeedSignal: threadDay.explicitNeedSignal,
    explicitOutcomeSignal: threadDay.explicitOutcomeSignal,
    sourceThreadJsonRedacted: cloneJson(threadDay.sourceThreadJsonRedacted),
    messageCount: threadDay.messages.length,
    firstStaffResponseSeconds: threadDay.firstStaffResponseSeconds,
    avgStaffResponseSeconds: threadDay.avgStaffResponseSeconds,
    staffParticipantsJson: cloneJson(threadDay.staffParticipantsJson),
    staffMessageStatsJson: cloneJson(threadDay.staffMessageStatsJson),
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
  };

  return {
    evidenceHash: hashAnalysisEvidence({
      bundle,
      runtime_identity: {
        page_prompt_hash: pipelineRun.runGroup.frozenCompiledPromptHash,
        prompt_version: pipelineRun.runGroup.frozenPromptVersion,
        taxonomy_version_id: pipelineRun.runGroup.frozenTaxonomyVersionId,
        output_schema_version: ANALYSIS_OUTPUT_SCHEMA_VERSION
      }
    }),
    bundle
  };
}

function normalizeResult(
  analysisRunId: string,
  expectedPromptHash: string,
  envelope: AnalysisUnitEnvelope,
  raw: ConversationAnalysisResult
): PersistedAnalysisResultInput {
  if (raw.threadDayId !== envelope.bundle.threadDayId) {
    return buildFailureResult(analysisRunId, expectedPromptHash, envelope, {
      reason: "thread_day_id_mismatch",
      returned_thread_day_id: raw.threadDayId
    });
  }

  if (raw.primaryNeedCode === "revisit") {
    return buildFailureResult(analysisRunId, expectedPromptHash, envelope, {
      reason: "invalid_primary_need_code",
      primary_need_code: raw.primaryNeedCode
    });
  }

  const staffParticipants = new Set(extractStaffNames(envelope.bundle.staffParticipantsJson));
  const filteredStaffAssessments = raw.staffAssessmentsJson.filter((assessment) => {
    if (!assessment.staff_name) {
      return false;
    }
    return staffParticipants.has(assessment.staff_name);
  });

  return {
    analysisRunId,
    threadDayId: envelope.bundle.threadDayId,
    evidenceHash: envelope.evidenceHash,
    resultStatus: normalizeResultStatus(raw.resultStatus),
    promptHash: raw.promptHash || expectedPromptHash,
    openingThemeCode: normalizeCode(raw.openingThemeCode),
    openingThemeReason: normalizeNullableText(raw.openingThemeReason),
    customerMoodCode: normalizeCode(raw.customerMoodCode),
    primaryNeedCode: normalizeCode(raw.primaryNeedCode),
    primaryTopicCode: normalizeCode(raw.primaryTopicCode),
    journeyCode: normalizeCode(raw.journeyCode),
    closingOutcomeInferenceCode: normalizeCode(raw.closingOutcomeInferenceCode),
    processRiskLevelCode: normalizeCode(raw.processRiskLevelCode),
    processRiskReasonText: normalizeNullableText(raw.processRiskReasonText),
    staffAssessmentsJson: filteredStaffAssessments,
    evidenceUsedJson: normalizeObject(raw.evidenceUsedJson),
    fieldExplanationsJson: normalizeObject(raw.fieldExplanationsJson),
    supportingMessageIdsJson: normalizeStringList(raw.supportingMessageIdsJson),
    usageJson: normalizeObject(raw.usageJson),
    costMicros: Number.isFinite(raw.costMicros) ? Math.max(0, Math.trunc(raw.costMicros)) : 0,
    failureInfoJson: raw.failureInfoJson ? normalizeObject(raw.failureInfoJson) : null
  };
}

function mergeRuntimeSnapshot(
  current: Record<string, unknown>,
  runtimeMetadataJson: Record<string, unknown>,
  runtime: AnalysisRuntimeSnapshot
) {
  return {
    ...cloneJson(current),
    service_runtime: cloneJson(runtimeMetadataJson),
    backend_runtime: {
      profile_id: runtime.profileId,
      version_no: runtime.versionNo,
      requested_model_name: runtime.modelName,
      page_prompt_hash: runtime.pagePromptHash,
      page_prompt_version: runtime.promptVersion,
      taxonomy_version_id: runtime.taxonomyVersionId,
      taxonomy_version_code: runtime.taxonomyVersionCode,
      output_schema_version: runtime.outputSchemaVersion
    }
  };
}

function readEffectivePromptHash(runtimeMetadataJson: Record<string, unknown>, fallback: string) {
  const value = runtimeMetadataJson.effective_prompt_hash;
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

function readEffectiveModelName(runtimeMetadataJson: Record<string, unknown>, fallback: string) {
  const value = runtimeMetadataJson.model_name;
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

function buildFailureResult(
  analysisRunId: string,
  promptHash: string,
  envelope: AnalysisUnitEnvelope,
  failureInfo: Record<string, unknown>
): PersistedAnalysisResultInput {
  return {
    analysisRunId,
    threadDayId: envelope.bundle.threadDayId,
    evidenceHash: envelope.evidenceHash,
    resultStatus: "failed",
    promptHash,
    openingThemeCode: "unknown",
    openingThemeReason: null,
    customerMoodCode: "unknown",
    primaryNeedCode: "unknown",
    primaryTopicCode: "unknown",
    journeyCode: "unknown",
    closingOutcomeInferenceCode: "unknown",
    processRiskLevelCode: "unknown",
    processRiskReasonText: null,
    staffAssessmentsJson: [],
    evidenceUsedJson: {
      failed_thread_day_id: envelope.bundle.threadDayId
    },
    fieldExplanationsJson: {},
    supportingMessageIdsJson: [],
    usageJson: {},
    costMicros: 0,
    failureInfoJson: failureInfo
  };
}

function normalizeResultStatus(value: string) {
  return ["succeeded", "unknown"].includes(value) ? value : "failed";
}

function normalizeCode(value: string) {
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : "unknown";
}

function normalizeNullableText(value: string | null) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function normalizeObject(value: Record<string, unknown>) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? cloneJson(value)
    : {};
}

function normalizeStringList(value: string[]) {
  return value.filter((item) => item.trim().length > 0);
}

function extractStaffNames(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => {
      if (typeof item === "string") {
        return item.trim();
      }
      if (item && typeof item === "object" && "staffName" in item && typeof (item as { staffName?: unknown }).staffName === "string") {
        return ((item as { staffName: string }).staffName).trim();
      }
      if (item && typeof item === "object" && "staff_name" in item && typeof (item as { staff_name?: unknown }).staff_name === "string") {
        return ((item as { staff_name: string }).staff_name).trim();
      }
      return "";
    })
    .filter(Boolean);
}

function chunk<T>(items: T[], size: number) {
  if (items.length === 0) {
    return [];
  }
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

export const analysisService = new AnalysisService();
