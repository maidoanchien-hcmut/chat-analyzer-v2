import { credentials, loadPackageDefinition, type CallOptions, type Client, type ClientUnaryCall, type GrpcObject, type ServiceClientConstructor, type ServiceError } from "@grpc/grpc-js";
import { loadSync } from "@grpc/proto-loader";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "../../config/env.ts";
import type { AnalysisRuntimeSnapshot, AnalysisUnitBundle, AnalysisUnitResult } from "./analysis.types.ts";

const currentDir = dirname(fileURLToPath(import.meta.url));
const protoPath = resolve(currentDir, "../../../../proto/conversation_analysis.proto");
const maxGrpcMessageLength = 64 * 1024 * 1024;

type AnalyzeConversationRequestMessage = {
  runtime: {
    profileId: string;
    versionNo: number;
    modelName: string;
    outputSchemaVersion: string;
    promptTemplate: string;
    generationConfigJson: string;
    profileJson: string;
  };
  bundles: Array<{
    conversationDayId: string;
    conversationId: string;
    connectedPageId: string;
    etlRunId: string;
    runGroupId: string;
    targetDate: string;
    businessTimezone: string;
    customerDisplayName: string;
    normalizedTagSignalsJson: string;
    observedTagsJson: string;
    openingBlocksJson: string;
    firstMeaningfulHumanMessageId: string;
    firstMeaningfulHumanSenderRole: string;
    sourceConversationJsonRedacted: string;
    messages: Array<{
      id: string;
      insertedAt: string;
      senderRole: string;
      senderName: string;
      messageType: string;
      redactedText: string;
      isMeaningfulHumanMessage: boolean;
      isOpeningBlockMessage: boolean;
    }>;
  }>;
};

type AnalyzeConversationResponseMessage = {
  results?: Array<{
    conversationDayId?: string;
    resultStatus?: string;
    promptHash?: string;
    openingTheme?: string;
    customerMood?: string;
    primaryNeed?: string;
    primaryTopic?: string;
    contentCustomerType?: string;
    closingOutcomeAsOfDay?: string;
    responseQualityLabel?: string;
    processRiskLevel?: string;
    responseQualityIssueText?: string;
    responseQualityImprovementText?: string;
    processRiskReasonText?: string;
    usage?: { json?: string };
    costMicros?: string;
    failureInfoJson?: string;
  }>;
};

type ConversationAnalysisServiceClient = Client & {
  AnalyzeConversation(
    request: AnalyzeConversationRequestMessage,
    options: CallOptions,
    callback: (error: ServiceError | null, response: AnalyzeConversationResponseMessage) => void
  ): ClientUnaryCall;
};

type AnalyzerPort = {
  analyzeUnits(input: { runtime: AnalysisRuntimeSnapshot; bundles: AnalysisUnitBundle[] }): Promise<AnalysisUnitResult[]>;
};

const packageDefinition = loadSync(protoPath, {
  keepCase: false,
  longs: String,
  enums: String,
  defaults: true,
  arrays: true,
  objects: true,
  oneofs: true
});

const grpcObject = loadPackageDefinition(packageDefinition) as GrpcObject;
const chatAnalyzerPackage = grpcObject.chatanalyzer as GrpcObject;
const conversationAnalysisPackage = (chatAnalyzerPackage.conversationanalysis as GrpcObject).v1 as GrpcObject;
const ConversationAnalysisService = conversationAnalysisPackage.ConversationAnalysisService as ServiceClientConstructor;

const client = new ConversationAnalysisService(env.analysisServiceGrpcTarget, credentials.createInsecure(), {
  "grpc.max_send_message_length": maxGrpcMessageLength,
  "grpc.max_receive_message_length": maxGrpcMessageLength
}) as unknown as ConversationAnalysisServiceClient;

export const conversationAnalysisGrpcClient: AnalyzerPort = {
  async analyzeUnits({ runtime, bundles }) {
    const response = await callAnalyzeConversation({
      runtime: {
        profileId: runtime.profileId,
        versionNo: runtime.versionNo,
        modelName: runtime.modelName,
        outputSchemaVersion: runtime.outputSchemaVersion,
        promptTemplate: runtime.promptTemplate,
        generationConfigJson: stringifyJson(runtime.generationConfig),
        profileJson: stringifyJson(runtime.profileJson)
      },
      bundles: bundles.map((bundle) => ({
        conversationDayId: bundle.conversationDayId,
        conversationId: bundle.conversationId,
        connectedPageId: bundle.connectedPageId,
        etlRunId: bundle.etlRunId,
        runGroupId: bundle.runGroupId,
        targetDate: bundle.targetDate,
        businessTimezone: bundle.businessTimezone,
        customerDisplayName: nullableString(bundle.customerDisplayName),
        normalizedTagSignalsJson: stringifyJson(bundle.normalizedTagSignalsJson),
        observedTagsJson: stringifyJson(bundle.observedTagsJson),
        openingBlocksJson: stringifyJson(bundle.openingBlocksJson),
        firstMeaningfulHumanMessageId: nullableString(bundle.firstMeaningfulHumanMessageId),
        firstMeaningfulHumanSenderRole: nullableString(bundle.firstMeaningfulHumanSenderRole),
        sourceConversationJsonRedacted: stringifyJson(bundle.sourceConversationJsonRedacted),
        messages: bundle.messages.map((message) => ({
          id: message.id,
          insertedAt: message.insertedAt.toISOString(),
          senderRole: message.senderRole,
          senderName: nullableString(message.senderName),
          messageType: message.messageType,
          redactedText: nullableString(message.redactedText),
          isMeaningfulHumanMessage: message.isMeaningfulHumanMessage,
          isOpeningBlockMessage: message.isOpeningBlockMessage
        }))
      }))
    });

    return (response.results ?? []).map((result) => ({
      conversationDayId: result.conversationDayId ?? "",
      resultStatus: result.resultStatus === "succeeded" ? "succeeded" : "unknown",
      promptHash: result.promptHash ?? "",
      openingTheme: result.openingTheme ?? "",
      customerMood: result.customerMood ?? "",
      primaryNeed: result.primaryNeed ?? "",
      primaryTopic: result.primaryTopic ?? "",
      contentCustomerType: result.contentCustomerType ?? "",
      closingOutcomeAsOfDay: result.closingOutcomeAsOfDay ?? "",
      responseQualityLabel: result.responseQualityLabel ?? "",
      processRiskLevel: result.processRiskLevel ?? "",
      responseQualityIssueText: emptyToNull(result.responseQualityIssueText),
      responseQualityImprovementText: emptyToNull(result.responseQualityImprovementText),
      processRiskReasonText: emptyToNull(result.processRiskReasonText),
      usageJson: parseRecord(result.usage?.json),
      costMicros: BigInt(result.costMicros ?? "0"),
      failureInfoJson: parseNullableRecord(result.failureInfoJson)
    }));
  }
};

function callAnalyzeConversation(request: AnalyzeConversationRequestMessage): Promise<AnalyzeConversationResponseMessage> {
  return new Promise((resolvePromise, rejectPromise) => {
    client.AnalyzeConversation(
      request,
      {
        deadline: new Date(Date.now() + env.analysisServiceGrpcTimeoutMs)
      },
      (error, response) => {
        if (error) {
          rejectPromise(error);
          return;
        }
        resolvePromise(response ?? { results: [] });
      }
    );
  });
}

function stringifyJson(value: unknown) {
  return JSON.stringify(value ?? null);
}

function nullableString(value: string | null) {
  return value ?? "";
}

function emptyToNull(value: string | null | undefined) {
  return value && value.length > 0 ? value : null;
}

function parseRecord(value: string | undefined) {
  try {
    const parsed = JSON.parse(value ?? "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function parseNullableRecord(value: string | undefined) {
  if (!value) {
    return null;
  }
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}
