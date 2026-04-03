import { createHash } from "node:crypto";
import { AppError } from "../../core/errors.ts";
import { conversationAnalysisGrpcClient } from "./analysis.grpc.ts";
import { analysisRepository, type AnalysisRunSummary, type ConnectedPageSummary, type EtlRunSummary, type PageAiProfileSummary } from "./analysis.repository.ts";
import type { AnalysisRuntimeSnapshot, AnalysisUnitBundle, AnalysisUnitResult, ExecuteAnalysisRunBody } from "./analysis.types.ts";

type AnalyzerPort = {
  analyzeUnits(input: { runtime: AnalysisRuntimeSnapshot; bundles: AnalysisUnitBundle[] }): Promise<AnalysisUnitResult[]>;
};

export class AnalysisService {
  constructor(
    private readonly repository = analysisRepository,
    private readonly analyzer: AnalyzerPort = conversationAnalysisGrpcClient
  ) {}

  async listPageRuns(connectedPageId: string) {
    const page = await this.requirePage(connectedPageId);
    const runs = await this.repository.listAnalysisRunsForPage(connectedPageId, 100);
    return {
      page: {
        id: page.id,
        pageName: page.pageName
      },
      runs: runs.map(serializeAnalysisRun)
    };
  }

  async getRun(id: string) {
    const run = await this.repository.getAnalysisRunById(id);
    if (!run) {
      throw new AppError(404, "ANALYSIS_RUN_NOT_FOUND", `Analysis run ${id} was not found.`);
    }
    const results = await this.repository.listAnalysisResults(id);
    return {
      run: serializeAnalysisRun(run),
      results
    };
  }

  async executeRun(input: ExecuteAnalysisRunBody) {
    const etlRun = await this.resolveEtlRun(input);
    if (etlRun.status !== "published" && etlRun.status !== "loaded") {
      throw new AppError(400, "ANALYSIS_ETL_RUN_NOT_READY", `ETL run ${etlRun.id} is not ready for analysis.`);
    }

    const page = await this.requirePage(etlRun.connectedPageId);
    const profile = await this.repository.getActiveConversationAnalysisProfile(page.id);
    if (!profile) {
      throw new AppError(400, "ANALYSIS_PROFILE_NOT_CONFIGURED", `Page ${page.id} does not have an active conversation_analysis profile.`);
    }

    const bundles = await this.repository.listAnalysisUnitBundles(etlRun.id);
    const runtime = buildRuntimeSnapshot(profile);
    const shouldPublish = input.runMode !== "manual_slice" && input.publish;
    const runOutcome = shouldPublish ? "published_clean" : "diagnostic_only";
    const startedAt = new Date();

    const analysisRun = await this.repository.createAnalysisRun({
      connectedPageId: page.id,
      runGroupId: etlRun.runGroupId,
      runMode: input.runMode,
      sourceEtlRunId: etlRun.id,
      runOutcome,
      aiProfileVersionId: profile.id,
      modelName: runtime.modelName,
      outputSchemaVersion: runtime.outputSchemaVersion,
      runtimeSnapshotJson: {
        profile_id: runtime.profileId,
        version_no: runtime.versionNo,
        model_name: runtime.modelName,
        output_schema_version: runtime.outputSchemaVersion,
        prompt_template: runtime.promptTemplate,
        generation_config: runtime.generationConfig
      },
      unitCountPlanned: bundles.length,
      createdByUserId: input.createdByUserId,
      startedAt
    });

    try {
      const rawResults = await this.analyzer.analyzeUnits({ runtime, bundles });
      const results = coerceAnalyzerResults(runtime, bundles, rawResults);
      const unknownCount = results.filter((item) => item.resultStatus === "unknown").length;
      const succeededCount = results.length - unknownCount;
      const totalUsageJson = summarizeUsage(results);
      const totalCostMicros = results.reduce((sum, item) => sum + item.costMicros, 0n);
      const publishedAt = shouldPublish ? new Date() : null;
      const publishState = shouldPublish ? "published" : "diagnostic";
      const finalRunOutcome = shouldPublish
        ? unknownCount > 0 ? "published_with_unknowns" : "published_clean"
        : "diagnostic_only";

      if (shouldPublish) {
        await this.repository.markPublishedResultsSuperseded(results.map((item) => item.conversationDayId));
      }

      await this.repository.createAnalysisResults(analysisRun.id, publishState, publishedAt, results);
      await this.repository.completeAnalysisRun({
        analysisRunId: analysisRun.id,
        jobStatus: "completed",
        runOutcome: finalRunOutcome,
        unitCountSucceeded: succeededCount,
        unitCountUnknown: unknownCount,
        totalUsageJson,
        totalCostMicros,
        finishedAt: new Date(),
        publishedAt
      });

      return this.getRun(analysisRun.id);
    } catch (error) {
      await this.repository.failAnalysisRun(analysisRun.id, new Date(), {
        message: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  private async resolveEtlRun(input: ExecuteAnalysisRunBody): Promise<EtlRunSummary> {
    if (input.sourceEtlRunId) {
      const run = await this.repository.getEtlRunById(input.sourceEtlRunId);
      if (!run) {
        throw new AppError(404, "ANALYSIS_SOURCE_ETL_RUN_NOT_FOUND", `ETL run ${input.sourceEtlRunId} was not found.`);
      }
      return run;
    }

    const run = await this.repository.findLatestPublishedEtlRun(input.connectedPageId!, input.targetDate!);
    if (!run) {
      throw new AppError(404, "ANALYSIS_SOURCE_ETL_RUN_NOT_FOUND", `Published ETL run for page ${input.connectedPageId} and target date ${input.targetDate} was not found.`);
    }
    return run;
  }

  private async requirePage(id: string): Promise<ConnectedPageSummary> {
    const page = await this.repository.getConnectedPageById(id);
    if (!page) {
      throw new AppError(404, "ANALYSIS_CONNECTED_PAGE_NOT_FOUND", `Connected page ${id} was not found.`);
    }
    return page;
  }
}

function buildRuntimeSnapshot(profile: PageAiProfileSummary): AnalysisRuntimeSnapshot {
  const profileJson = asObject(profile.profileJson);
  return {
    profileId: profile.id,
    versionNo: profile.versionNo,
    modelName: readString(profileJson, "model_name") ?? "gemini-2.5-flash",
    outputSchemaVersion: readString(profileJson, "output_schema_version") ?? "conversation_analysis.v1",
    promptTemplate: readString(profileJson, "prompt_template") ?? "",
    generationConfig: asObject(profileJson.generation_config),
    profileJson: profile.profileJson
  };
}

function serializeAnalysisRun(run: AnalysisRunSummary) {
  return {
    ...run,
    totalCostMicros: run.totalCostMicros.toString()
  };
}

function coerceAnalyzerResults(runtime: AnalysisRuntimeSnapshot, bundles: AnalysisUnitBundle[], rawResults: AnalysisUnitResult[]) {
  const resultsByConversationDayId = new Map(rawResults.map((result) => [result.conversationDayId, result]));
  return bundles.map((bundle) => sanitizeAnalysisResult(runtime, bundle, resultsByConversationDayId.get(bundle.conversationDayId)));
}

function sanitizeAnalysisResult(runtime: AnalysisRuntimeSnapshot, bundle: AnalysisUnitBundle, raw: AnalysisUnitResult | undefined): AnalysisUnitResult {
  if (!raw) {
    return buildUnknownResult(runtime, bundle, "missing_result_from_service");
  }

  return {
    conversationDayId: bundle.conversationDayId,
    resultStatus: raw.resultStatus === "succeeded" ? "succeeded" : "unknown",
    promptHash: nonEmpty(raw.promptHash) ?? buildPromptHash(runtime, bundle.conversationDayId),
    openingTheme: nonEmpty(raw.openingTheme) ?? "unknown",
    customerMood: nonEmpty(raw.customerMood) ?? "unknown",
    primaryNeed: nonEmpty(raw.primaryNeed) ?? "unknown",
    primaryTopic: nonEmpty(raw.primaryTopic) ?? "unknown",
    contentCustomerType: nonEmpty(raw.contentCustomerType) ?? "unknown",
    closingOutcomeAsOfDay: nonEmpty(raw.closingOutcomeAsOfDay) ?? "unknown",
    responseQualityLabel: nonEmpty(raw.responseQualityLabel) ?? "unknown",
    processRiskLevel: nonEmpty(raw.processRiskLevel) ?? "unknown",
    responseQualityIssueText: raw.responseQualityIssueText ?? null,
    responseQualityImprovementText: raw.responseQualityImprovementText ?? null,
    processRiskReasonText: raw.processRiskReasonText ?? null,
    usageJson: asObject(raw.usageJson),
    costMicros: raw.costMicros,
    failureInfoJson: raw.resultStatus === "succeeded"
      ? raw.failureInfoJson
      : raw.failureInfoJson ?? { reason: "service_returned_unknown" }
  };
}

function buildUnknownResult(runtime: AnalysisRuntimeSnapshot, bundle: AnalysisUnitBundle, reason: string): AnalysisUnitResult {
  return {
    conversationDayId: bundle.conversationDayId,
    resultStatus: "unknown",
    promptHash: buildPromptHash(runtime, bundle.conversationDayId),
    openingTheme: "unknown",
    customerMood: "unknown",
    primaryNeed: "unknown",
    primaryTopic: "unknown",
    contentCustomerType: "unknown",
    closingOutcomeAsOfDay: "unknown",
    responseQualityLabel: "unknown",
    processRiskLevel: "unknown",
    responseQualityIssueText: null,
    responseQualityImprovementText: null,
    processRiskReasonText: null,
    usageJson: {},
    costMicros: 0n,
    failureInfoJson: { reason }
  };
}

function buildPromptHash(runtime: AnalysisRuntimeSnapshot, conversationDayId: string) {
  return createHash("sha256")
    .update(JSON.stringify({
      promptTemplate: runtime.promptTemplate,
      outputSchemaVersion: runtime.outputSchemaVersion,
      conversationDayId
    }))
    .digest("hex");
}

function summarizeUsage(results: AnalysisUnitResult[]) {
  const providerUsage = new Map<string, { unitCount: number; tokenEstimate: number }>();

  for (const result of results) {
    const usage = asObject(result.usageJson);
    const provider = stringField(usage, "provider") ?? "unknown";
    const tokenEstimate = numberField(usage, "token_estimate") ?? 0;
    const bucket = providerUsage.get(provider) ?? { unitCount: 0, tokenEstimate: 0 };
    bucket.unitCount += 1;
    bucket.tokenEstimate += tokenEstimate;
    providerUsage.set(provider, bucket);
  }

  return {
    provider_breakdown: Array.from(providerUsage.entries()).map(([provider, value]) => ({
      provider,
      unit_count: value.unitCount,
      token_estimate: value.tokenEstimate
    }))
  };
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function readString(obj: Record<string, unknown>, key: string) {
  const value = obj[key];
  return typeof value === "string" ? value : null;
}

function nonEmpty(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function stringField(obj: Record<string, unknown>, key: string) {
  const value = obj[key];
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function numberField(obj: Record<string, unknown>, key: string) {
  const value = obj[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export const analysisService = new AnalysisService();
