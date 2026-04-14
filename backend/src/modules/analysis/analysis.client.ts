import { env } from "../../config/env.ts";
import { AppError } from "../../core/errors.ts";
import type {
  AnalysisRuntimeSnapshot,
  AnalysisUnitBundle,
  ConversationAnalysisRequest,
  ConversationAnalysisResponse,
  ConversationAnalysisResult
} from "./analysis.types.ts";

export interface ConversationAnalysisClient {
  analyzeConversations(input: ConversationAnalysisRequest): Promise<ConversationAnalysisResponse>;
}

export class HttpConversationAnalysisClient implements ConversationAnalysisClient {
  constructor(
    private readonly baseUrl = env.analysisServiceBaseUrl,
    private readonly sharedSecret = env.analysisServiceSharedSecret,
    private readonly timeoutMs = env.analysisServiceTimeoutMs
  ) {}

  async analyzeConversations(input: ConversationAnalysisRequest): Promise<ConversationAnalysisResponse> {
    const requestBody = {
      runtime: serializeRuntime(input.runtime),
      bundles: input.bundles.map(serializeBundle)
    };
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    const response = await fetch(buildAnalyzeUrl(this.baseUrl), {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.sharedSecret}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal
    }).catch((error: unknown) => {
      throw new AppError(502, "ANALYSIS_SERVICE_UNAVAILABLE", compactHttpError(error), {
        target: this.baseUrl
      });
    }).finally(() => {
      clearTimeout(timeout);
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new AppError(502, "ANALYSIS_SERVICE_UNAVAILABLE", compactHttpFailure(response.status, errorText), {
        target: this.baseUrl,
        status: response.status
      });
    }

    const payload = await response.json().catch((error: unknown) => {
      throw new AppError(502, "ANALYSIS_SERVICE_INVALID_RESPONSE", compactHttpError(error), {
        target: this.baseUrl
      });
    }) as {
      results?: Array<Record<string, unknown>>;
      runtime_metadata_json?: Record<string, unknown>;
    };

    return {
      results: (payload.results ?? []).map((item) => deserializeResult(item)),
      runtimeMetadataJson: readObject(payload.runtime_metadata_json)
    };
  }
}

function serializeRuntime(runtime: AnalysisRuntimeSnapshot) {
  return {
    profile_id: runtime.profileId,
    version_no: runtime.versionNo,
    model_name: runtime.modelName,
    prompt_version: runtime.promptVersion,
    output_schema_version: runtime.outputSchemaVersion,
    taxonomy_version: runtime.taxonomyVersionCode,
    page_prompt_text: runtime.pagePromptText,
    taxonomy_json: runtime.taxonomyJson,
    generation_config: runtime.generationConfig,
    profile_json: {
      ...runtime.profileJson,
      page_prompt_hash: runtime.pagePromptHash,
      page_prompt_version: runtime.promptVersion,
      config_version_id: runtime.configVersionId,
      taxonomy_version_id: runtime.taxonomyVersionId,
      connected_page_id: runtime.connectedPageId
    }
  };
}

function serializeBundle(bundle: AnalysisUnitBundle) {
  return {
    thread_day_id: bundle.threadDayId,
    thread_id: bundle.threadId,
    connected_page_id: bundle.connectedPageId,
    pipeline_run_id: bundle.pipelineRunId,
    run_group_id: bundle.runGroupId,
    target_date: bundle.targetDate,
    business_timezone: bundle.businessTimezone,
    customer_display_name: bundle.customerDisplayName ?? "",
    normalized_tag_signals_json: bundle.normalizedTagSignalsJson ?? {},
    observed_tags_json: bundle.observedTagsJson ?? [],
    opening_block_json: bundle.openingBlockJson ?? {},
    first_meaningful_message_id: bundle.firstMeaningfulMessageId ?? "",
    first_meaningful_message_text_redacted: bundle.firstMeaningfulMessageTextRedacted ?? "",
    first_meaningful_message_sender_role: bundle.firstMeaningfulMessageSenderRole ?? "",
    explicit_revisit_signal: bundle.explicitRevisitSignal ?? "",
    explicit_need_signal: bundle.explicitNeedSignal ?? "",
    explicit_outcome_signal: bundle.explicitOutcomeSignal ?? "",
    source_thread_json_redacted: bundle.sourceThreadJsonRedacted ?? {},
    message_count: bundle.messageCount,
    first_staff_response_seconds: bundle.firstStaffResponseSeconds,
    avg_staff_response_seconds: bundle.avgStaffResponseSeconds,
    staff_participants_json: bundle.staffParticipantsJson ?? [],
    messages: bundle.messages.map((message) => ({
      id: message.id,
      inserted_at: message.insertedAt,
      sender_role: message.senderRole,
      sender_name: message.senderName ?? "",
      message_type: message.messageType,
      redacted_text: message.redactedText ?? "",
      is_meaningful_human_message: message.isMeaningfulHumanMessage,
      is_opening_block_message: message.isOpeningBlockMessage
    }))
  };
}

function deserializeResult(raw: Record<string, unknown>): ConversationAnalysisResult {
  return {
    threadDayId: readString(raw.thread_day_id),
    resultStatus: readString(raw.result_status, "failed"),
    promptHash: readString(raw.prompt_hash),
    openingThemeCode: readString(raw.opening_theme_code, "unknown"),
    openingThemeReason: readNullableString(raw.opening_theme_reason),
    customerMoodCode: readString(raw.customer_mood_code, "unknown"),
    primaryNeedCode: readString(raw.primary_need_code, "unknown"),
    primaryTopicCode: readString(raw.primary_topic_code, "unknown"),
    journeyCode: readString(raw.journey_code, "unknown"),
    closingOutcomeInferenceCode: readString(raw.closing_outcome_inference_code, "unknown"),
    processRiskLevelCode: readString(raw.process_risk_level_code, "unknown"),
    processRiskReasonText: readNullableString(raw.process_risk_reason_text),
    staffAssessmentsJson: readArray(raw.staff_assessments_json),
    evidenceUsedJson: readObject(raw.evidence_used_json),
    fieldExplanationsJson: readObject(raw.field_explanations_json),
    supportingMessageIdsJson: readStringArray(raw.supporting_message_ids_json),
    usageJson: readObject(raw.usage_json),
    costMicros: readNumber(raw.cost_micros),
    failureInfoJson: readNullableObject(raw.failure_info_json)
  };
}

function readString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function readNullableString(value: unknown) {
  const parsed = readString(value).trim();
  return parsed.length > 0 ? parsed : null;
}

function readObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function readNullableObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function readArray<T = unknown>(value: unknown) {
  return Array.isArray(value) ? value as T[] : [];
}

function readStringArray(value: unknown) {
  return readArray(value).filter((item): item is string => typeof item === "string");
}

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function buildAnalyzeUrl(baseUrl: string) {
  return new URL("/internal/analyze", baseUrl).toString();
}

function compactHttpError(error: unknown) {
  if (error instanceof DOMException && error.name === "AbortError") {
    return `Request timeout sau ${env.analysisServiceTimeoutMs}ms`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function compactHttpFailure(status: number, errorText: string) {
  const detail = errorText.trim();
  return detail ? `HTTP ${status}: ${detail}` : `HTTP ${status}`;
}

export const conversationAnalysisClient: ConversationAnalysisClient = new HttpConversationAnalysisClient();
