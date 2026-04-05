import { resolve } from "node:path";
import grpc from "@grpc/grpc-js";
import protoLoader from "@grpc/proto-loader";
import { env } from "../../config/env.ts";
import { AppError } from "../../core/errors.ts";
import type {
  AnalysisRuntimeSnapshot,
  AnalysisUnitBundle,
  ConversationAnalysisRequest,
  ConversationAnalysisResponse,
  ConversationAnalysisResult
} from "./analysis.types.ts";

type ProtoServiceClient = {
  AnalyzeConversation: (
    request: Record<string, unknown>,
    metadata: grpc.Metadata,
    options: grpc.CallOptions,
    callback: (
      error: grpc.ServiceError | null,
      response?: {
        results?: Array<Record<string, unknown>>;
        runtime_metadata_json?: string;
      }
    ) => void
  ) => void;
};

export interface ConversationAnalysisClient {
  analyzeConversations(input: ConversationAnalysisRequest): Promise<ConversationAnalysisResponse>;
}

const protoPath = resolve(import.meta.dir, "../../../../proto/conversation_analysis.proto");

let cachedCtor: (new (address: string, credentials: grpc.ChannelCredentials) => ProtoServiceClient) | null = null;

export class GrpcConversationAnalysisClient implements ConversationAnalysisClient {
  private readonly client: ProtoServiceClient;

  constructor(
    target = env.analysisServiceGrpcTarget,
    private readonly timeoutMs = env.analysisServiceGrpcTimeoutMs
  ) {
    const ClientCtor = loadConversationAnalysisClient();
    this.client = new ClientCtor(target, grpc.credentials.createInsecure());
  }

  async analyzeConversations(input: ConversationAnalysisRequest): Promise<ConversationAnalysisResponse> {
    const deadline = Date.now() + this.timeoutMs;
    const request = {
      runtime: serializeRuntime(input.runtime),
      bundles: input.bundles.map(serializeBundle)
    };

    const response = await new Promise<{
      results?: Array<Record<string, unknown>>;
      runtime_metadata_json?: string;
    }>((resolveResponse, reject) => {
      this.client.AnalyzeConversation(
        request,
        new grpc.Metadata(),
        { deadline },
        (error, payload) => {
          if (error) {
            reject(error);
            return;
          }
          resolveResponse(payload ?? {});
        }
      );
    }).catch((error: unknown) => {
      throw new AppError(502, "ANALYSIS_SERVICE_UNAVAILABLE", compactGrpcError(error), {
        target: env.analysisServiceGrpcTarget
      });
    });

    return {
      results: (response.results ?? []).map((item) => deserializeResult(item)),
      runtimeMetadataJson: parseJson(readString(response.runtime_metadata_json, "{}"), {})
    };
  }
}

function loadConversationAnalysisClient() {
  if (cachedCtor) {
    return cachedCtor;
  }

  const definition = protoLoader.loadSync(protoPath, {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: false
  });
  const loaded = grpc.loadPackageDefinition(definition) as unknown as {
    chatanalyzer: {
      conversationanalysis: {
        v1: {
          ConversationAnalysisService: new (address: string, credentials: grpc.ChannelCredentials) => ProtoServiceClient;
        };
      };
    };
  };
  cachedCtor = loaded.chatanalyzer.conversationanalysis.v1.ConversationAnalysisService;
  return cachedCtor;
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
    taxonomy_json: JSON.stringify(runtime.taxonomyJson),
    generation_config_json: JSON.stringify(runtime.generationConfig),
    profile_json: JSON.stringify({
      ...runtime.profileJson,
      prompt_hash: runtime.promptHash,
      config_version_id: runtime.configVersionId,
      taxonomy_version_id: runtime.taxonomyVersionId,
      connected_page_id: runtime.connectedPageId
    })
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
    normalized_tag_signals_json: JSON.stringify(bundle.normalizedTagSignalsJson ?? {}),
    observed_tags_json: JSON.stringify(bundle.observedTagsJson ?? []),
    opening_block_json: JSON.stringify(bundle.openingBlockJson ?? {}),
    first_meaningful_message_id: bundle.firstMeaningfulMessageId ?? "",
    first_meaningful_message_text_redacted: bundle.firstMeaningfulMessageTextRedacted ?? "",
    first_meaningful_message_sender_role: bundle.firstMeaningfulMessageSenderRole ?? "",
    explicit_revisit_signal: bundle.explicitRevisitSignal ?? "",
    explicit_need_signal: bundle.explicitNeedSignal ?? "",
    explicit_outcome_signal: bundle.explicitOutcomeSignal ?? "",
    source_thread_json_redacted: JSON.stringify(bundle.sourceThreadJsonRedacted ?? {}),
    message_count: bundle.messageCount,
    first_staff_response_seconds: bundle.firstStaffResponseSeconds ?? 0,
    avg_staff_response_seconds: bundle.avgStaffResponseSeconds ?? 0,
    staff_participants_json: JSON.stringify(bundle.staffParticipantsJson ?? []),
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
    staffAssessmentsJson: parseJson(readString(raw.staff_assessments_json, "[]"), []),
    evidenceUsedJson: parseJson(readString(raw.evidence_used_json, "{}"), {}),
    fieldExplanationsJson: parseJson(readString(raw.field_explanations_json, "{}"), {}),
    supportingMessageIdsJson: parseJson(readString(raw.supporting_message_ids_json, "[]"), []),
    usageJson: parseJson(readUsageJson(raw.usage), {}),
    costMicros: Number(readString(raw.cost_micros, "0")),
    failureInfoJson: parseJson(readString(raw.failure_info_json, ""), null)
  };
}

function readUsageJson(value: unknown) {
  if (value && typeof value === "object" && "json" in value) {
    return readString((value as { json?: unknown }).json, "{}");
  }
  return "{}";
}

function readString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function readNullableString(value: unknown) {
  const parsed = readString(value).trim();
  return parsed.length > 0 ? parsed : null;
}

function parseJson<T>(raw: string, fallback: T): T {
  if (!raw) {
    return fallback;
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function compactGrpcError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export const conversationAnalysisClient: ConversationAnalysisClient = new GrpcConversationAnalysisClient();
