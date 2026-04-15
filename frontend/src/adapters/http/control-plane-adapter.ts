import type {
  ConnectedPageDetailViewModel,
  ControlPlaneAdapter,
  FieldExplanation,
  HealthSummaryViewModel,
  OnboardingSamplePreviewInput,
  ManualRunInput,
  PromptPreviewArtifactInput,
  PromptPreviewComparisonViewModel,
  PromptWorkspaceSampleInput,
  PromptWorkspaceSampleViewModel,
  PublishEligibility,
  RunDetailViewModel,
  RunGroupViewModel,
  RunPreviewViewModel
} from "../contracts.ts";
import { requestJson } from "./client.ts";

type RawListedPage = {
  pageId: string;
  pageName: string;
};

type RawConfigVersion = {
  id: string;
  versionNo: number;
  promptText: string;
  tagMappingJson: unknown;
  openingRulesJson: unknown;
  schedulerJson: unknown;
  notificationTargetsJson: unknown;
  notes: string | null;
  analysisTaxonomyVersionId: string;
  analysisTaxonomyVersion: {
    versionCode: string;
  };
  createdAt: string;
  promptVersionLabel?: string;
  promptHash?: string;
  evidenceBundle?: string[];
  fieldExplanations?: FieldExplanation[];
};

type RawHistoricalOverwrite = {
  replaced_run_id: string;
  replaced_snapshot_label: string;
  previous_prompt_version: string;
  previous_config_version: string;
  next_prompt_version: string;
  next_config_version: string;
  export_impact: string;
};

type RawConnectedPageDetail = {
  id: string;
  pancakePageId: string;
  pageName: string;
  businessTimezone: string;
  tokenStatus?: string;
  connectionStatus?: string;
  tokenPreviewMasked?: string | null;
  lastValidatedAt?: string | null;
  etlEnabled: boolean;
  analysisEnabled: boolean;
  activeConfigVersionId: string | null;
  activeConfigVersion: RawConfigVersion | null;
  configVersions: RawConfigVersion[];
  updatedAt: string;
};

type RawRunSummary = {
  id: string;
  target_date: string;
  status: string;
  publish_state: string;
  publish_eligibility: string;
  window_start_at: string;
  window_end_exclusive_at: string;
  supersedes_run_id: string | null;
  historical_overwrite?: RawHistoricalOverwrite | null;
  published_at: string | null;
};

type RawRunDetail = {
  run: RawRunSummary;
  artifact_counts: {
    thread_count: number;
    thread_day_count: number;
    message_count: number;
    covered_thread_ids?: string[];
  };
  analysis_metrics: {
    analysis_run_id: string;
    status: string;
    unit_count_planned: number;
    unit_count_succeeded: number;
    unit_count_unknown: number;
    unit_count_failed: number;
    total_cost_micros: number;
    prompt_hash: string;
    prompt_version: string;
    taxonomy_version_id: string;
    output_schema_version: string;
    resumed: boolean;
    skipped_thread_day_ids: string[];
  } | null;
  mart_metrics: {
    materialized: boolean;
    analysis_run_id: string;
    fact_thread_day_count: number;
    fact_staff_thread_day_count: number;
    prompt_hash: string;
    prompt_version: string;
    config_version_id: string;
    config_version_no: number;
    taxonomy_version_id: string;
    taxonomy_version_code: string;
  } | null;
  publish_warning: string | null;
  error_text: string | null;
};

type RawOnboardingConversation = {
  conversationId: string;
  customerDisplayName?: string;
  firstMeaningfulMessageText?: string;
  observedTagsJson: unknown;
  normalizedTagSignalsJson?: unknown;
  openingBlockJson: unknown;
};

type RawOnboardingSamplePreview = {
  pageId: string;
  targetDate: string;
  businessTimezone: string;
  windowStartAt: string;
  windowEndExclusiveAt: string;
  summary: Record<string, unknown>;
  pageTags: Array<{ pancakeTagId: string; text: string; isDeactive: boolean }>;
  conversations: RawOnboardingConversation[];
};

type RawPromptWorkspaceConversation = RawOnboardingConversation & {
  firstMeaningfulMessageId?: string;
  firstMeaningfulMessageSenderRole?: string;
  explicitRevisitSignal?: string | null;
  explicitNeedSignal?: string | null;
  explicitOutcomeSignal?: string | null;
  sourceThreadJsonRedacted?: unknown;
  messageCount?: number;
  firstStaffResponseSeconds?: number | null;
  avgStaffResponseSeconds?: number | null;
  staffParticipantsJson?: unknown;
  messages?: Array<{
    messageId?: string;
    insertedAt?: string;
    senderRole?: string;
    senderName?: string | null;
    messageType?: string;
    redactedText?: string | null;
    isMeaningfulHumanMessage?: boolean;
    isOpeningBlockMessage?: boolean;
  }>;
};

type RawPromptWorkspaceSamplePreview = Omit<RawOnboardingSamplePreview, "conversations"> & {
  sampleWorkspaceKey: string;
  connectedPageId: string;
  pageName: string;
  conversations: RawPromptWorkspaceConversation[];
};

type RawPromptPreviewArtifact = {
  id: string;
  promptVersionLabel: string;
  promptHash: string;
  taxonomyVersionCode: string;
  sampleScopeKey: string;
  sampleConversationId: string;
  customerDisplayName: string;
  createdAt: string;
  runtimeMetadata: Record<string, unknown>;
  result: Record<string, unknown>;
  evidenceBundle: string[];
  fieldExplanations: FieldExplanation[];
  supportingMessageIds: string[];
};

export function createControlPlaneAdapter(getBaseUrl: () => string): ControlPlaneAdapter {
  return {
    async listPagesFromToken(userAccessToken) {
      const result = await requestJson<RawListedPage[] | { pages: RawListedPage[] }>(
        getBaseUrl(),
        "POST",
        "/chat-extractor/control-center/pages/list-from-token",
        { userAccessToken }
      );
      const rows = Array.isArray(result) ? result : result.pages ?? [];
      return rows.map((row) => ({
        pageId: row.pageId,
        pageName: row.pageName
      }));
    },
    async registerPage(input) {
      const result = await requestJson<{ page: RawConnectedPageDetail }>(
        getBaseUrl(),
        "POST",
        "/chat-extractor/control-center/pages/register",
        {
          pancakePageId: input.pancakePageId,
          userAccessToken: input.userAccessToken,
          businessTimezone: input.businessTimezone,
          tagMappingJson: input.tagMappingJson,
          openingRulesJson: input.openingRulesJson,
          schedulerJson: input.schedulerJson,
          notificationTargetsJson: input.notificationTargetsJson,
          promptText: input.promptText,
          analysisTaxonomyVersionId: input.analysisTaxonomyVersionId,
          notes: input.notes,
          activate: input.activate,
          etlEnabled: input.etlEnabled,
          analysisEnabled: input.analysisEnabled
        }
      );
      return mapConnectedPage(result.page);
    },
    async previewOnboardingSample(input: OnboardingSamplePreviewInput) {
      const result = await requestJson<{
        samplePreview: RawOnboardingSamplePreview;
      }>(
        getBaseUrl(),
        "POST",
        "/chat-extractor/control-center/pages/onboarding-sample/preview",
        {
          pancakePageId: input.pancakePageId,
          userAccessToken: input.userAccessToken,
          businessTimezone: input.businessTimezone,
          tagMappingJson: input.tagMappingJson,
          openingRulesJson: input.openingRulesJson,
          schedulerJson: input.schedulerJson,
          sampleConversationLimit: input.sampleConversationLimit
        }
      );
      return mapOnboardingSamplePreview(result.samplePreview, input.pageName);
    },
    async previewPromptWorkspaceSample(pageId: string, input: PromptWorkspaceSampleInput) {
      const result = await requestJson<{
        samplePreview: RawPromptWorkspaceSamplePreview;
      }>(
        getBaseUrl(),
        "POST",
        `/chat-extractor/control-center/pages/${encodeURIComponent(pageId)}/prompt-workspace/sample`,
        {
          tagMappingJson: input.tagMappingJson,
          openingRulesJson: input.openingRulesJson,
          schedulerJson: input.schedulerJson,
          sampleConversationLimit: input.sampleConversationLimit
        }
      );
      return mapPromptWorkspaceSamplePreview(result.samplePreview);
    },
    async previewPromptArtifacts(pageId: string, input: PromptPreviewArtifactInput) {
      const result = await requestJson<{
        sample_scope: {
          sample_scope_key: string;
          target_date: string;
          business_timezone: string;
          window_start_at: string;
          window_end_exclusive_at: string;
          selected_conversation_id: string;
        };
        active_artifact: RawPromptPreviewArtifact;
        draft_artifact: RawPromptPreviewArtifact;
      }>(
        getBaseUrl(),
        "POST",
        `/chat-extractor/control-center/pages/${encodeURIComponent(pageId)}/prompt-preview-artifacts`,
        {
          draftPromptText: input.draftPromptText,
          sampleWorkspaceKey: input.sampleWorkspaceKey,
          selectedConversationId: input.selectedConversationId
        }
      );
      return {
        sampleScope: {
          sampleScopeKey: result.sample_scope.sample_scope_key,
          targetDate: result.sample_scope.target_date,
          businessTimezone: result.sample_scope.business_timezone,
          windowStartAt: result.sample_scope.window_start_at,
          windowEndExclusiveAt: result.sample_scope.window_end_exclusive_at,
          selectedConversationId: result.sample_scope.selected_conversation_id
        },
        activeArtifact: mapPromptPreviewArtifact(result.active_artifact),
        draftArtifact: mapPromptPreviewArtifact(result.draft_artifact)
      };
    },
    async listConnectedPages() {
      const result = await requestJson<{ pages: RawConnectedPageDetail[] }>(
        getBaseUrl(),
        "GET",
        "/chat-extractor/control-center/pages"
      );
      return result.pages.map(mapConnectedPage);
    },
    async getConnectedPage(pageId) {
      const result = await requestJson<{ page: RawConnectedPageDetail }>(
        getBaseUrl(),
        "GET",
        `/chat-extractor/control-center/pages/${encodeURIComponent(pageId)}`
      );
      return mapConnectedPage(result.page);
    },
    async createConfigVersion(pageId, input) {
      const result = await requestJson<{ configVersion: RawConfigVersion }>(
        getBaseUrl(),
        "POST",
        `/chat-extractor/control-center/pages/${encodeURIComponent(pageId)}/config-versions`,
        input
      );
      return mapConfigVersion(result.configVersion);
    },
    async activateConfigVersion(pageId, configVersionId) {
      const result = await requestJson<{ page: RawConnectedPageDetail }>(
        getBaseUrl(),
        "POST",
        `/chat-extractor/control-center/pages/${encodeURIComponent(pageId)}/config-versions/${encodeURIComponent(configVersionId)}/activate`,
        {}
      );
      return mapConnectedPage(result.page);
    },
    async previewManualRun(input) {
      const result = await requestJson<{
        run_group: {
          page_name: string;
          requested_window_start_at: string | null;
          requested_window_end_exclusive_at: string | null;
          requested_target_date: string | null;
          will_use_config_version: number;
          will_use_prompt_version: string;
        };
        child_runs: Array<{
          target_date: string;
          window_start_at: string;
          window_end_exclusive_at: string;
          is_full_day: boolean;
          publish_eligibility: string;
          historical_overwrite_required: boolean;
        }>;
      }>(getBaseUrl(), "POST", "/chat-extractor/jobs/preview", buildManualRunBody(input));

      return {
        pageName: result.run_group.page_name,
        requestedWindow: result.run_group.requested_target_date
          ?? `${result.run_group.requested_window_start_at ?? "-"} -> ${result.run_group.requested_window_end_exclusive_at ?? "-"}`,
        promptVersion: result.run_group.will_use_prompt_version,
        configVersion: `v${String(result.run_group.will_use_config_version)}`,
        children: result.child_runs.map((child) => ({
          targetDate: child.target_date,
          windowStartAt: child.window_start_at,
          windowEndExclusiveAt: child.window_end_exclusive_at,
          isFullDay: child.is_full_day,
          publishEligibility: child.publish_eligibility as PublishEligibility,
          historicalOverwriteRequired: child.historical_overwrite_required
        }))
      };
    },
    async executeManualRun(input) {
      const result = await requestJson<{
        run_group: {
          id: string;
          run_mode: string;
          status: string;
          publish_intent: string;
          frozen_prompt_version: string;
          frozen_compiled_prompt_hash: string;
          frozen_config_version_id: string;
          created_at: string;
          started_at: string | null;
          finished_at: string | null;
          connected_page: { page_name: string };
        };
        child_runs: RawRunSummary[];
      }>(getBaseUrl(), "POST", "/chat-extractor/jobs/execute", buildManualRunBody(input));
      return mapRunGroup(result);
    },
    async getRunGroup(runGroupId) {
      const result = await requestJson<{
        run_group: {
          id: string;
          run_mode: string;
          status: string;
          publish_intent: string;
          frozen_prompt_version: string;
          frozen_compiled_prompt_hash: string;
          frozen_config_version_id: string;
          created_at: string;
          started_at: string | null;
          finished_at: string | null;
          connected_page: { page_name: string };
        };
        child_runs: RawRunSummary[];
      }>(getBaseUrl(), "GET", `/chat-extractor/run-groups/${encodeURIComponent(runGroupId)}`);
      return mapRunGroup(result);
    },
    async getRun(runId) {
      const result = await requestJson<RawRunDetail>(
        getBaseUrl(),
        "GET",
        `/chat-extractor/runs/${encodeURIComponent(runId)}`
      );
      return mapRunDetail(result);
    },
    async publishRun(runId, input) {
      const result = await requestJson<RawRunDetail>(
        getBaseUrl(),
        "POST",
        `/chat-extractor/runs/${encodeURIComponent(runId)}/publish`,
        {
          publishAs: input.publishAs,
          confirmHistoricalOverwrite: input.confirmHistoricalOverwrite,
          expectedReplacedRunId: input.expectedReplacedRunId
        }
      );
      return mapRunDetail(result);
    },
    async getHealthSummary() {
      const result = await requestJson<{ healthSummary: HealthSummaryViewModel }>(
        getBaseUrl(),
        "GET",
        "/read-models/health"
      );
      return result.healthSummary;
    }
  };
}

function readString(value: unknown, key: string) {
  if (!value || typeof value !== "object") {
    return "";
  }
  const result = (value as Record<string, unknown>)[key];
  return typeof result === "string" ? result : "";
}

function readNumber(value: unknown) {
  return typeof value === "number" ? value : 0;
}

function readArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function mapOnboardingSamplePreview(input: RawOnboardingSamplePreview, pageName: string) {
  return {
    pageId: input.pageId,
    pageName,
    targetDate: input.targetDate,
    businessTimezone: input.businessTimezone,
    windowStartAt: input.windowStartAt,
    windowEndExclusiveAt: input.windowEndExclusiveAt,
    summary: {
      conversationsScanned: readNumber(input.summary?.conversations_scanned),
      threadDaysBuilt: readNumber(input.summary?.thread_days_built),
      messagesSeen: readNumber(input.summary?.messages_seen),
      messagesSelected: readNumber(input.summary?.messages_selected)
    },
    pageTags: input.pageTags.map((tag) => ({
      pancakeTagId: tag.pancakeTagId,
      text: tag.text,
      isDeactive: tag.isDeactive
    })),
    conversations: input.conversations.map((conversation) => {
      const openingBlock = asRecord(conversation.openingBlockJson);
      return {
        conversationId: conversation.conversationId,
        customerDisplayName: conversation.customerDisplayName ?? "",
        firstMeaningfulMessageText: conversation.firstMeaningfulMessageText ?? "",
        observedTags: readArray(conversation.observedTagsJson).map((item) => ({
          sourceTagId: readString(item, "source_tag_id") || readString(item, "sourceTagId"),
          sourceTagText: readString(item, "source_tag_text") || readString(item, "sourceTagText")
        })).filter((item) => item.sourceTagId || item.sourceTagText),
        normalizedTagSignals: flattenNormalizedTagSignals(conversation.normalizedTagSignalsJson),
        openingMessages: readArray(openingBlock.messages).map((item) => ({
          senderRole: readString(item, "sender_role") || readString(item, "senderRole"),
          messageType: readString(item, "message_type") || readString(item, "messageType"),
          redactedText: readString(item, "redacted_text") || readString(item, "redactedText")
        })).filter((item) => item.senderRole || item.messageType || item.redactedText),
        explicitSignals: readArray(openingBlock.explicit_signals).map((item) => ({
          signalRole: readString(item, "signal_role") || readString(item, "signalRole"),
          signalCode: readString(item, "signal_code") || readString(item, "signalCode"),
          rawText: readString(item, "raw_text") || readString(item, "rawText")
        })).filter((item) => item.signalRole || item.signalCode || item.rawText),
        cutReason: readString(openingBlock, "cut_reason") || readString(openingBlock, "cutReason")
      };
    })
  };
}

function mapPromptWorkspaceSamplePreview(input: RawPromptWorkspaceSamplePreview): PromptWorkspaceSampleViewModel {
  return {
    sampleWorkspaceKey: input.sampleWorkspaceKey,
    connectedPageId: input.connectedPageId,
    pageId: input.pageId,
    pageName: input.pageName,
    targetDate: input.targetDate,
    businessTimezone: input.businessTimezone,
    windowStartAt: input.windowStartAt,
    windowEndExclusiveAt: input.windowEndExclusiveAt,
    summary: {
      conversationsScanned: readNumber(input.summary?.conversations_scanned),
      threadDaysBuilt: readNumber(input.summary?.thread_days_built),
      messagesSeen: readNumber(input.summary?.messages_seen),
      messagesSelected: readNumber(input.summary?.messages_selected)
    },
    pageTags: input.pageTags.map((tag) => ({
      pancakeTagId: tag.pancakeTagId,
      text: tag.text,
      isDeactive: tag.isDeactive
    })),
    conversations: input.conversations.map((conversation) => ({
      conversationId: conversation.conversationId,
      customerDisplayName: conversation.customerDisplayName ?? "",
      firstMeaningfulMessageId: normalizeNullableString(conversation.firstMeaningfulMessageId),
      firstMeaningfulMessageText: conversation.firstMeaningfulMessageText ?? "",
      firstMeaningfulMessageSenderRole: normalizeNullableString(conversation.firstMeaningfulMessageSenderRole),
      observedTagsJson: conversation.observedTagsJson ?? [],
      normalizedTagSignalsJson: conversation.normalizedTagSignalsJson ?? {},
      openingBlockJson: conversation.openingBlockJson ?? {},
      explicitRevisitSignal: normalizeNullableString(conversation.explicitRevisitSignal),
      explicitNeedSignal: normalizeNullableString(conversation.explicitNeedSignal),
      explicitOutcomeSignal: normalizeNullableString(conversation.explicitOutcomeSignal),
      sourceThreadJsonRedacted: conversation.sourceThreadJsonRedacted ?? {},
      messageCount: typeof conversation.messageCount === "number" ? conversation.messageCount : 0,
      firstStaffResponseSeconds: typeof conversation.firstStaffResponseSeconds === "number" ? conversation.firstStaffResponseSeconds : null,
      avgStaffResponseSeconds: typeof conversation.avgStaffResponseSeconds === "number" ? conversation.avgStaffResponseSeconds : null,
      staffParticipantsJson: conversation.staffParticipantsJson ?? [],
      messages: Array.isArray(conversation.messages)
        ? conversation.messages.map((message) => ({
          messageId: typeof message.messageId === "string" ? message.messageId : "",
          insertedAt: typeof message.insertedAt === "string" ? message.insertedAt : "",
          senderRole: typeof message.senderRole === "string" ? message.senderRole : "",
          senderName: normalizeNullableString(message.senderName),
          messageType: typeof message.messageType === "string" ? message.messageType : "",
          redactedText: normalizeNullableString(message.redactedText),
          isMeaningfulHumanMessage: message.isMeaningfulHumanMessage === true,
          isOpeningBlockMessage: message.isOpeningBlockMessage === true
        })).filter((message) => message.messageId || message.insertedAt || message.senderRole || message.messageType || message.redactedText)
        : []
    }))
  };
}

function mapPromptPreviewArtifact(input: RawPromptPreviewArtifact): PromptPreviewComparisonViewModel["activeArtifact"] {
  return {
    id: input.id,
    promptVersionLabel: input.promptVersionLabel,
    promptHash: input.promptHash,
    taxonomyVersionCode: input.taxonomyVersionCode,
    sampleScopeKey: input.sampleScopeKey,
    sampleConversationId: input.sampleConversationId,
    customerDisplayName: input.customerDisplayName,
    createdAt: input.createdAt,
    runtimeMetadata: input.runtimeMetadata,
    result: input.result,
    evidenceBundle: Array.isArray(input.evidenceBundle) ? input.evidenceBundle : [],
    fieldExplanations: Array.isArray(input.fieldExplanations) ? input.fieldExplanations : [],
    supportingMessageIds: Array.isArray(input.supportingMessageIds) ? input.supportingMessageIds : []
  };
}

function flattenNormalizedTagSignals(value: unknown) {
  const source = asRecord(value);
  return Object.entries(source).flatMap(([role, entries]) => readArray(entries).map((item) => ({
    role,
    sourceTagId: readString(item, "source_tag_id") || readString(item, "sourceTagId"),
    sourceTagText: readString(item, "source_tag_text") || readString(item, "sourceTagText"),
    canonicalCode: readString(item, "canonical_code") || readString(item, "canonicalCode"),
    mappingSource: readString(item, "mapping_source") || readString(item, "mappingSource")
  }))).filter((item) => item.sourceTagId || item.sourceTagText || item.canonicalCode || item.mappingSource);
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function normalizeNullableString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function buildManualRunBody(input: ManualRunInput) {
  return {
    kind: "manual",
    connectedPageId: input.connectedPageId,
    job: {
      processingMode: input.processingMode,
      targetDate: input.targetDate,
      requestedWindowStartAt: input.requestedWindowStartAt,
      requestedWindowEndExclusiveAt: input.requestedWindowEndExclusiveAt
    }
  };
}

function mapConfigVersion(configVersion: RawConfigVersion) {
  return {
    id: configVersion.id,
    versionNo: configVersion.versionNo,
    promptText: configVersion.promptText,
    tagMappingJson: configVersion.tagMappingJson,
    openingRulesJson: configVersion.openingRulesJson,
    schedulerJson: configVersion.schedulerJson,
    notificationTargetsJson: configVersion.notificationTargetsJson,
    notes: configVersion.notes,
    analysisTaxonomyVersionId: configVersion.analysisTaxonomyVersionId,
    analysisTaxonomyVersionCode: configVersion.analysisTaxonomyVersion.versionCode,
    createdAt: configVersion.createdAt,
    promptVersionLabel: configVersion.promptVersionLabel ?? `Prompt v${String(configVersion.versionNo)}`,
    promptHash: configVersion.promptHash ?? "sha256:pending",
    evidenceBundle: Array.isArray(configVersion.evidenceBundle) ? configVersion.evidenceBundle : [],
    fieldExplanations: Array.isArray(configVersion.fieldExplanations) ? configVersion.fieldExplanations : []
  };
}

function mapConnectedPage(input: RawConnectedPageDetail): ConnectedPageDetailViewModel {
  return {
    id: input.id,
    pageName: input.pageName,
    pancakePageId: input.pancakePageId,
    businessTimezone: input.businessTimezone,
    tokenStatus: normalizeTokenStatus(input.tokenStatus),
    connectionStatus: normalizeConnectionStatus(input.connectionStatus),
    tokenPreviewMasked: typeof input.tokenPreviewMasked === "string" ? input.tokenPreviewMasked : null,
    lastValidatedAt: typeof input.lastValidatedAt === "string" ? input.lastValidatedAt : null,
    etlEnabled: input.etlEnabled,
    analysisEnabled: input.analysisEnabled,
    activeConfigVersionId: input.activeConfigVersionId,
    updatedAt: input.updatedAt,
    configVersions: input.configVersions.map(mapConfigVersion),
    activeConfigVersion: input.activeConfigVersion ? mapConfigVersion(input.activeConfigVersion) : null
  };
}

function normalizeTokenStatus(value: string | undefined) {
  return value === "missing" || value === "valid" || value === "invalid" || value === "not_checked"
    ? value
    : "not_checked";
}

function normalizeConnectionStatus(value: string | undefined) {
  return value === "connected" || value === "token_invalid" || value === "page_unavailable" || value === "not_checked"
    ? value
    : "not_checked";
}

function mapRunGroup(input: {
  run_group: {
    id: string;
    run_mode: string;
    status: string;
    publish_intent: string;
    frozen_prompt_version: string;
    frozen_compiled_prompt_hash: string;
    frozen_config_version_id: string;
    created_at: string;
    started_at: string | null;
    finished_at: string | null;
    connected_page: { page_name: string };
  };
  child_runs: RawRunSummary[];
}): RunGroupViewModel {
  return {
    id: input.run_group.id,
    pageName: input.run_group.connected_page.page_name,
    runMode: input.run_group.run_mode,
    status: input.run_group.status,
    publishIntent: input.run_group.publish_intent,
    promptVersion: input.run_group.frozen_prompt_version,
    promptHash: input.run_group.frozen_compiled_prompt_hash,
    configVersionId: input.run_group.frozen_config_version_id,
    createdAt: input.run_group.created_at,
    startedAt: input.run_group.started_at,
    finishedAt: input.run_group.finished_at,
    childRuns: input.child_runs.map(mapRunSummary)
  };
}

function mapRunSummary(input: RawRunSummary) {
  return {
    id: input.id,
    targetDate: input.target_date,
    status: describeRunStatus(input.status),
    publishState: describePublishState(input.publish_state),
    publishEligibility: input.publish_eligibility as PublishEligibility,
    windowStartAt: input.window_start_at,
    windowEndExclusiveAt: input.window_end_exclusive_at,
    supersedesRunId: input.supersedes_run_id,
    historicalOverwrite: input.historical_overwrite
      ? {
        replacedRunId: input.historical_overwrite.replaced_run_id,
        replacedSnapshotLabel: input.historical_overwrite.replaced_snapshot_label,
        previousPromptVersion: input.historical_overwrite.previous_prompt_version,
        previousConfigVersion: input.historical_overwrite.previous_config_version,
        nextPromptVersion: input.historical_overwrite.next_prompt_version,
        nextConfigVersion: input.historical_overwrite.next_config_version,
        exportImpact: input.historical_overwrite.export_impact
      }
      : null,
    publishedAt: input.published_at
  };
}

function mapRunDetail(result: RawRunDetail): RunDetailViewModel {
  return {
    run: mapRunSummary(result.run),
    threadCount: result.artifact_counts.thread_count,
    threadDayCount: result.artifact_counts.thread_day_count,
    messageCount: result.artifact_counts.message_count,
    coveredThreadIds: Array.isArray(result.artifact_counts.covered_thread_ids) ? result.artifact_counts.covered_thread_ids : [],
    analysisMetrics: result.analysis_metrics
      ? {
        analysisRunId: result.analysis_metrics.analysis_run_id,
        status: result.analysis_metrics.status,
        unitCountPlanned: result.analysis_metrics.unit_count_planned,
        unitCountSucceeded: result.analysis_metrics.unit_count_succeeded,
        unitCountUnknown: result.analysis_metrics.unit_count_unknown,
        unitCountFailed: result.analysis_metrics.unit_count_failed,
        totalCostMicros: result.analysis_metrics.total_cost_micros,
        promptHash: result.analysis_metrics.prompt_hash,
        promptVersion: result.analysis_metrics.prompt_version,
        taxonomyVersionId: result.analysis_metrics.taxonomy_version_id,
        outputSchemaVersion: result.analysis_metrics.output_schema_version,
        resumed: result.analysis_metrics.resumed,
        skippedThreadDayIds: result.analysis_metrics.skipped_thread_day_ids
      }
      : null,
    martMetrics: result.mart_metrics
      ? {
        materialized: result.mart_metrics.materialized,
        analysisRunId: result.mart_metrics.analysis_run_id,
        factThreadDayCount: result.mart_metrics.fact_thread_day_count,
        factStaffThreadDayCount: result.mart_metrics.fact_staff_thread_day_count,
        promptHash: result.mart_metrics.prompt_hash,
        promptVersion: result.mart_metrics.prompt_version,
        configVersionId: result.mart_metrics.config_version_id,
        configVersionNo: result.mart_metrics.config_version_no,
        taxonomyVersionId: result.mart_metrics.taxonomy_version_id,
        taxonomyVersionCode: result.mart_metrics.taxonomy_version_code
      }
      : null,
    publishWarning: result.publish_warning,
    errorText: result.error_text
  };
}

function describePublishState(value: string) {
  if (value === "draft") {
    return "Draft";
  }
  if (value === "published_official") {
    return "Published official";
  }
  if (value === "published_provisional") {
    return "Published provisional";
  }
  if (value === "superseded") {
    return "Đã bị supersede";
  }
  return value;
}

function describeRunStatus(value: string) {
  if (value === "queued") {
    return "Đang chờ xử lý";
  }
  if (value === "running") {
    return "Đang chạy";
  }
  if (value === "loaded") {
    return "Đã load kết quả";
  }
  if (value === "published") {
    return "Đã publish";
  }
  if (value === "failed") {
    return "Thất bại";
  }
  return value;
}
