import type { PipelineRunRecord } from "./chat_extractor.repository.ts";

type RunArtifactCounts = {
  threadCount: number;
  threadDayCount: number;
  messageCount: number;
  coveredThreadIds: string[];
};

export function buildRunDiagnostics(run: PipelineRunRecord, counts: RunArtifactCounts) {
  const metrics = asRecord(run.metricsJson);
  const analysis = asRecord(metrics?.analysis);
  const semanticMart = asRecord(metrics?.semantic_mart);

  return {
    artifact_counts: {
      thread_count: counts.threadCount,
      thread_day_count: counts.threadDayCount,
      message_count: counts.messageCount,
      covered_thread_ids: counts.coveredThreadIds
    },
    analysis_metrics: analysis
      ? {
        analysis_run_id: readString(analysis.analysis_run_id),
        status: readString(analysis.status),
        unit_count_planned: readNumber(analysis.unit_count_planned),
        unit_count_succeeded: readNumber(analysis.unit_count_succeeded),
        unit_count_unknown: readNumber(analysis.unit_count_unknown),
        unit_count_failed: readNumber(analysis.unit_count_failed),
        total_cost_micros: readNumber(analysis.total_cost_micros),
        prompt_hash: readString(analysis.prompt_hash),
        prompt_version: readString(analysis.prompt_version),
        taxonomy_version_id: readString(analysis.taxonomy_version_id),
        output_schema_version: readString(analysis.output_schema_version),
        resumed: readBoolean(analysis.resumed),
        skipped_thread_day_ids: readStringList(analysis.skipped_thread_day_ids)
      }
      : null,
    mart_metrics: semanticMart
      ? {
        materialized: readBoolean(semanticMart.materialized),
        analysis_run_id: readString(semanticMart.analysis_run_id),
        fact_thread_day_count: readNumber(semanticMart.fact_thread_day_count),
        fact_staff_thread_day_count: readNumber(semanticMart.fact_staff_thread_day_count),
        prompt_hash: readString(semanticMart.prompt_hash),
        prompt_version: readString(semanticMart.prompt_version),
        config_version_id: readString(semanticMart.config_version_id),
        config_version_no: readNumber(semanticMart.config_version_no),
        taxonomy_version_id: readString(semanticMart.taxonomy_version_id),
        taxonomy_version_code: readString(semanticMart.taxonomy_version_code)
      }
      : null,
    publish_warning: buildPublishWarning(run.publishEligibility),
    error_text: run.errorText
  };
}

function buildPublishWarning(publishEligibility: string) {
  if (publishEligibility === "not_publishable_old_partial") {
    return "Child run nay chi la partial ngay cu, nen operator chi duoc xem ket qua run va khong co quyen publish dashboard.";
  }
  if (publishEligibility === "provisional_current_day_partial") {
    return "Child run nay chi duoc publish provisional cho current-day dashboard cho toi khi co full-day official.";
  }
  return null;
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function readString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function readBoolean(value: unknown) {
  return value === true;
}

function readStringList(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}
