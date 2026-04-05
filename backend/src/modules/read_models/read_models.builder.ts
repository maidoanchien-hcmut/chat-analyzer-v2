import { buildDisplayLabel } from "./read_models.labels.ts";
import type {
  DimDateRowInput,
  DimPageRowInput,
  DimStaffRowInput,
  FactStaffThreadDayRowInput,
  FactThreadDayRowInput,
  MartAnalysisResultRecord,
  MartMaterialization,
  MartMaterializationSource
} from "./read_models.types.ts";

type StaffAssessment = {
  staff_name: string;
  response_quality_code: string;
  issue_text: string | null;
  improvement_text: string | null;
};

type StaffMessageStats = {
  staff_name: string;
  message_count: number;
  first_message_at: string | null;
};

export function buildMartMaterialization(source: MartMaterializationSource): MartMaterialization {
  const { pipelineRun } = source;
  const latestAnalysisRun = pipelineRun.analysisRuns[0];
  if (!latestAnalysisRun) {
    throw new Error(`Pipeline run ${pipelineRun.id} has no analysis run to materialize.`);
  }

  const connectedPage = pipelineRun.runGroup.frozenConfigVersion.connectedPage;
  const taxonomyVersion = pipelineRun.runGroup.frozenConfigVersion.analysisTaxonomyVersion;
  const date = new Date(`${pipelineRun.targetDate.toISOString().slice(0, 10)}T00:00:00.000Z`);
  const dimDate = buildDimDate(date);
  const dimPage: DimPageRowInput = {
    connectedPageId: connectedPage.id,
    pageName: connectedPage.pageName,
    pancakePageId: connectedPage.pancakePageId,
    businessTimezone: connectedPage.businessTimezone
  };
  const analysisByThreadDayId = new Map(
    latestAnalysisRun.analysisResults.map((item) => [item.threadDayId, item])
  );

  const factThreadDays: FactThreadDayRowInput[] = [];
  const factStaffThreadDays: FactStaffThreadDayRowInput[] = [];
  const dimStaffByName = new Map<string, DimStaffRowInput>();

  for (const threadDay of pipelineRun.threadDays) {
    const analysisResult = analysisByThreadDayId.get(threadDay.id);
    if (!analysisResult) {
      continue;
    }

    const threadFact = buildFactThreadDay({
      analysisRunId: latestAnalysisRun.id,
      configVersionId: pipelineRun.runGroup.frozenConfigVersionId,
      taxonomyVersionId: pipelineRun.runGroup.frozenTaxonomyVersionId,
      taxonomyVersionCode: taxonomyVersion.versionCode,
      pipelineRunId: pipelineRun.id,
      dateKey: dimDate.dateKey,
      threadDay,
      analysisResult,
      latestAnalysisRun
    });
    factThreadDays.push(threadFact);

    const staffFacts = buildFactStaffThreadDays({
      analysisRunId: latestAnalysisRun.id,
      configVersionId: pipelineRun.runGroup.frozenConfigVersionId,
      taxonomyVersionId: pipelineRun.runGroup.frozenTaxonomyVersionId,
      taxonomyVersionCode: taxonomyVersion.versionCode,
      pipelineRunId: pipelineRun.id,
      dateKey: dimDate.dateKey,
      threadDay,
      analysisResult,
      latestAnalysisRun
    });

    for (const staffFact of staffFacts) {
      factStaffThreadDays.push(staffFact);
      if (!dimStaffByName.has(staffFact.staffName)) {
        dimStaffByName.set(staffFact.staffName, {
          connectedPageId: connectedPage.id,
          staffName: staffFact.staffName,
          displayLabel: staffFact.displayLabel
        });
      }
    }
  }

  return {
    pipelineRunId: pipelineRun.id,
    analysisRunId: latestAnalysisRun.id,
    connectedPageId: connectedPage.id,
    targetDate: pipelineRun.targetDate,
    publishEligibility: pipelineRun.publishEligibility,
    windowStartAt: pipelineRun.windowStartAt,
    windowEndExclusiveAt: pipelineRun.windowEndExclusiveAt,
    isFullDay: pipelineRun.isFullDay,
    promptHash: latestAnalysisRun.promptHash,
    promptVersion: latestAnalysisRun.promptVersion,
    configVersionId: pipelineRun.runGroup.frozenConfigVersionId,
    configVersionNo: pipelineRun.runGroup.frozenConfigVersion.versionNo,
    taxonomyVersionId: pipelineRun.runGroup.frozenTaxonomyVersionId,
    taxonomyVersionCode: taxonomyVersion.versionCode,
    dimDate,
    dimPage,
    dimStaff: [...dimStaffByName.values()],
    factThreadDays,
    factStaffThreadDays
  };
}

export function toDateKey(value: Date) {
  return Number(value.toISOString().slice(0, 10).replace(/-/g, ""));
}

function buildDimDate(value: Date): DimDateRowInput {
  return {
    dateKey: toDateKey(value),
    fullDate: value,
    dayOfWeek: value.getUTCDay(),
    monthNo: value.getUTCMonth() + 1,
    yearNo: value.getUTCFullYear()
  };
}

function buildFactThreadDay(input: {
  pipelineRunId: string;
  analysisRunId: string;
  configVersionId: string;
  taxonomyVersionId: string;
  taxonomyVersionCode: string;
  dateKey: number;
  threadDay: MartMaterializationSource["pipelineRun"]["threadDays"][number];
  analysisResult: MartAnalysisResultRecord;
  latestAnalysisRun: MartMaterializationSource["pipelineRun"]["analysisRuns"][number];
}): FactThreadDayRowInput {
  const { threadDay, analysisResult, latestAnalysisRun } = input;
  return {
    pipelineRunId: input.pipelineRunId,
    analysisRunId: input.analysisRunId,
    configVersionId: input.configVersionId,
    taxonomyVersionId: input.taxonomyVersionId,
    dateKey: input.dateKey,
    threadDayId: threadDay.id,
    threadId: threadDay.threadId,
    isNewInbox: threadDay.isNewInbox,
    officialRevisitLabel: buildRevisitLabel(threadDay.explicitRevisitSignal, analysisResult.journeyCode),
    openingThemeCode: normalizeCode(analysisResult.openingThemeCode),
    primaryNeedCode: normalizeCode(analysisResult.primaryNeedCode),
    primaryTopicCode: normalizeCode(analysisResult.primaryTopicCode),
    officialClosingOutcomeCode: normalizeCode(analysisResult.closingOutcomeInferenceCode),
    customerMoodCode: normalizeCode(analysisResult.customerMoodCode),
    processRiskLevelCode: normalizeCode(analysisResult.processRiskLevelCode),
    entrySourceType: normalizeNullableText(threadDay.entrySourceType),
    entryPostId: normalizeNullableText(threadDay.entryPostId),
    entryAdId: normalizeNullableText(threadDay.entryAdId),
    threadCount: 1,
    messageCount: Math.max(0, threadDay.messageCount),
    firstStaffResponseSeconds: clampNullableInt(threadDay.firstStaffResponseSeconds),
    avgStaffResponseSeconds: clampNullableInt(threadDay.avgStaffResponseSeconds),
    aiCostMicros: analysisResult.costMicros > 0n ? analysisResult.costMicros : 0n,
    promptHash: latestAnalysisRun.promptHash,
    promptVersion: latestAnalysisRun.promptVersion,
    modelName: latestAnalysisRun.modelName,
    outputSchemaVersion: latestAnalysisRun.outputSchemaVersion,
    taxonomyVersionCode: input.taxonomyVersionCode,
    analysisExplanationJson: buildAnalysisExplanationJson(analysisResult),
    firstMeaningfulMessageTextRedacted: normalizeNullableText(threadDay.firstMeaningfulMessageTextRedacted)
  };
}

function buildFactStaffThreadDays(input: {
  pipelineRunId: string;
  analysisRunId: string;
  configVersionId: string;
  taxonomyVersionId: string;
  taxonomyVersionCode: string;
  dateKey: number;
  threadDay: MartMaterializationSource["pipelineRun"]["threadDays"][number];
  analysisResult: MartAnalysisResultRecord;
  latestAnalysisRun: MartMaterializationSource["pipelineRun"]["analysisRuns"][number];
}): FactStaffThreadDayRowInput[] {
  const { analysisResult, latestAnalysisRun, threadDay } = input;
  const assessments = readStaffAssessments(analysisResult.staffAssessmentsJson);
  const statsByName = new Map(
    readStaffMessageStats(threadDay.staffMessageStatsJson).map((item) => [item.staff_name, item])
  );
  const fallbackNames = readStaffParticipants(threadDay.staffParticipantsJson);
  const staffNames = uniqueNames([
    ...assessments.map((item) => item.staff_name),
    ...fallbackNames
  ]);
  const allocatedCost = allocateStaffCost(analysisResult.costMicros, staffNames.length);

  return staffNames.map((staffName) => {
    const assessment = assessments.find((item) => item.staff_name === staffName) ?? null;
    const stats = statsByName.get(staffName) ?? null;
    return {
      pipelineRunId: input.pipelineRunId,
      analysisRunId: input.analysisRunId,
      configVersionId: input.configVersionId,
      taxonomyVersionId: input.taxonomyVersionId,
      dateKey: input.dateKey,
      threadDayId: threadDay.id,
      threadId: threadDay.threadId,
      staffName,
      displayLabel: buildDisplayLabel(staffName),
      primaryNeedCode: normalizeCode(analysisResult.primaryNeedCode),
      processRiskLevelCode: normalizeCode(analysisResult.processRiskLevelCode),
      responseQualityCode: normalizeCode(assessment?.response_quality_code ?? "unknown"),
      staffMessageCount: Math.max(0, stats?.message_count ?? 0),
      staffFirstResponseSecondsIfOwner: buildStaffFirstResponseSeconds(stats, threadDay.firstStaffResponseSeconds),
      aiCostAllocatedMicros: allocatedCost,
      responseQualityIssueText: normalizeNullableText(assessment?.issue_text ?? null),
      responseQualityImprovementText: normalizeNullableText(assessment?.improvement_text ?? null),
      promptHash: latestAnalysisRun.promptHash,
      promptVersion: latestAnalysisRun.promptVersion,
      modelName: latestAnalysisRun.modelName,
      outputSchemaVersion: latestAnalysisRun.outputSchemaVersion,
      taxonomyVersionCode: input.taxonomyVersionCode
    };
  });
}

function buildAnalysisExplanationJson(result: MartAnalysisResultRecord) {
  const fieldExplanations = readRecord(result.fieldExplanationsJson);
  return {
    opening_theme_reason: normalizeNullableText(result.openingThemeReason),
    process_risk_reason_text: normalizeNullableText(result.processRiskReasonText),
    field_explanations: fieldExplanations
  };
}

function buildRevisitLabel(explicitRevisitSignal: string | null, journeyCode: string) {
  return normalizeCode(explicitRevisitSignal ?? "") === "revisit" || normalizeCode(journeyCode) === "revisit"
    ? "revisit"
    : "not_revisit";
}

function buildStaffFirstResponseSeconds(stats: StaffMessageStats | null, fallback: number | null) {
  if (!stats?.first_message_at || fallback == null) {
    return clampNullableInt(fallback);
  }
  return clampNullableInt(fallback);
}

function allocateStaffCost(totalCostMicros: bigint, staffCount: number) {
  if (totalCostMicros <= 0n || staffCount <= 0) {
    return 0n;
  }
  return totalCostMicros / BigInt(staffCount);
}

function readStaffAssessments(value: unknown): StaffAssessment[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const items: StaffAssessment[] = [];
  for (const item of value) {
    const record = readRecord(item);
    const staffName = normalizeNullableText(readString(record?.staff_name));
    if (!staffName) {
      continue;
    }
    items.push({
      staff_name: staffName,
      response_quality_code: normalizeCode(readString(record?.response_quality_code) || "unknown"),
      issue_text: normalizeNullableText(readString(record?.issue_text)),
      improvement_text: normalizeNullableText(readString(record?.improvement_text))
    });
  }
  return items;
}

function readStaffMessageStats(value: unknown): StaffMessageStats[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const items: StaffMessageStats[] = [];
  for (const item of value) {
    const record = readRecord(item);
    const staffName = normalizeNullableText(readString(record?.staff_name));
    if (!staffName) {
      continue;
    }
    items.push({
      staff_name: staffName,
      message_count: Math.max(0, readNumber(record?.message_count)),
      first_message_at: normalizeNullableText(readString(record?.first_message_at))
    });
  }
  return items;
}

function readStaffParticipants(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => {
      if (typeof item === "string") {
        return normalizeNullableText(item);
      }
      const record = readRecord(item);
      return normalizeNullableText(readString(record?.staff_name) || readString(record?.staffName));
    })
    .filter((item): item is string => Boolean(item));
}

function uniqueNames(values: string[]) {
  return [...new Set(values.map((item) => item.trim()).filter(Boolean))];
}

function clampNullableInt(value: number | null) {
  return Number.isFinite(value) && value != null ? Math.max(0, Math.trunc(value)) : null;
}

function normalizeCode(value: string) {
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : "unknown";
}

function normalizeNullableText(value: string | null) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function readRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function readString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : 0;
}
