import { Prisma } from "@prisma/client";
import { prisma } from "../../infra/prisma.ts";
import type { AnalysisUnitBundle, AnalysisUnitResult, AnalysisUnitMessage } from "./analysis.types.ts";

export type ConnectedPageSummary = {
  id: string;
  pageName: string;
  businessTimezone: string;
  activeAiProfilesJson: unknown;
};

export type PageAiProfileSummary = {
  id: string;
  connectedPageId: string;
  capabilityKey: string;
  versionNo: number;
  profileJson: unknown;
};

export type EtlRunSummary = {
  id: string;
  connectedPageId: string;
  runGroupId: string;
  targetDate: Date;
  businessTimezone: string;
  status: string;
  isPublished: boolean;
};

export type AnalysisRunSummary = {
  id: string;
  connectedPageId: string;
  runGroupId: string;
  runMode: string;
  sourceEtlRunId: string | null;
  jobStatus: string;
  runOutcome: string;
  modelName: string;
  outputSchemaVersion: string;
  attemptCount: number;
  unitCountPlanned: number;
  unitCountSucceeded: number;
  unitCountUnknown: number;
  totalCostMicros: bigint;
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
  publishedAt: Date | null;
};

export type AnalysisResultRow = {
  id: string;
  analysisRunId: string;
  conversationDayId: string | null;
  publishState: string;
  resultStatus: string;
  openingTheme: string;
  customerMood: string;
  primaryNeed: string;
  primaryTopic: string;
  contentCustomerType: string;
  closingOutcomeAsOfDay: string;
  responseQualityLabel: string;
  processRiskLevel: string;
  costMicros: bigint;
  createdAt: Date;
};

type AnalysisRunCreateInput = {
  connectedPageId: string;
  runGroupId: string;
  runMode: string;
  sourceEtlRunId: string | null;
  runOutcome: string;
  aiProfileVersionId: string;
  modelName: string;
  outputSchemaVersion: string;
  runtimeSnapshotJson: unknown;
  unitCountPlanned: number;
  createdByUserId: number | null;
  startedAt: Date;
};

export class AnalysisRepository {
  async getConnectedPageById(id: string): Promise<ConnectedPageSummary | null> {
    return prisma.connectedPage.findUnique({
      where: { id },
      select: {
        id: true,
        pageName: true,
        businessTimezone: true,
        activeAiProfilesJson: true
      }
    });
  }

  async getEtlRunById(id: string): Promise<EtlRunSummary | null> {
    return prisma.etlRun.findUnique({
      where: { id },
      select: {
        id: true,
        connectedPageId: true,
        runGroupId: true,
        targetDate: true,
        businessTimezone: true,
        status: true,
        isPublished: true
      }
    });
  }

  async findLatestPublishedEtlRun(connectedPageId: string, targetDate: string): Promise<EtlRunSummary | null> {
    const rows = await prisma.$queryRaw<EtlRunSummary[]>(Prisma.sql`
      SELECT
        id,
        connected_page_id AS "connectedPageId",
        run_group_id AS "runGroupId",
        target_date AS "targetDate",
        business_timezone AS "businessTimezone",
        status,
        is_published AS "isPublished"
      FROM etl_run
      WHERE connected_page_id = ${connectedPageId}::uuid
        AND target_date = ${targetDate}::date
        AND is_published = true
      ORDER BY snapshot_version DESC
      LIMIT 1
    `);
    return rows[0] ?? null;
  }

  async getActiveConversationAnalysisProfile(connectedPageId: string): Promise<PageAiProfileSummary | null> {
    const page = await prisma.connectedPage.findUnique({
      where: { id: connectedPageId },
      select: { activeAiProfilesJson: true }
    });
    const activeProfileId = extractActiveProfileId(page?.activeAiProfilesJson, "conversation_analysis");
    if (!activeProfileId) {
      return null;
    }
    return prisma.pageAiProfileVersion.findUnique({
      where: { id: activeProfileId },
      select: {
        id: true,
        connectedPageId: true,
        capabilityKey: true,
        versionNo: true,
        profileJson: true
      }
    });
  }

  async listAnalysisRunsForPage(connectedPageId: string, limit = 50): Promise<AnalysisRunSummary[]> {
    return prisma.analysisRun.findMany({
      where: { connectedPageId },
      orderBy: [{ createdAt: "desc" }],
      take: limit,
      select: {
        id: true,
        connectedPageId: true,
        runGroupId: true,
        runMode: true,
        sourceEtlRunId: true,
        jobStatus: true,
        runOutcome: true,
        modelName: true,
        outputSchemaVersion: true,
        attemptCount: true,
        unitCountPlanned: true,
        unitCountSucceeded: true,
        unitCountUnknown: true,
        totalCostMicros: true,
        createdAt: true,
        startedAt: true,
        finishedAt: true,
        publishedAt: true
      }
    });
  }

  async getAnalysisRunById(id: string): Promise<AnalysisRunSummary | null> {
    return prisma.analysisRun.findUnique({
      where: { id },
      select: {
        id: true,
        connectedPageId: true,
        runGroupId: true,
        runMode: true,
        sourceEtlRunId: true,
        jobStatus: true,
        runOutcome: true,
        modelName: true,
        outputSchemaVersion: true,
        attemptCount: true,
        unitCountPlanned: true,
        unitCountSucceeded: true,
        unitCountUnknown: true,
        totalCostMicros: true,
        createdAt: true,
        startedAt: true,
        finishedAt: true,
        publishedAt: true
      }
    });
  }

  async listAnalysisResults(analysisRunId: string): Promise<AnalysisResultRow[]> {
    return prisma.analysisResult.findMany({
      where: { analysisRunId },
      orderBy: [{ createdAt: "asc" }],
      select: {
        id: true,
        analysisRunId: true,
        conversationDayId: true,
        publishState: true,
        resultStatus: true,
        openingTheme: true,
        customerMood: true,
        primaryNeed: true,
        primaryTopic: true,
        contentCustomerType: true,
        closingOutcomeAsOfDay: true,
        responseQualityLabel: true,
        processRiskLevel: true,
        costMicros: true,
        createdAt: true
      }
    });
  }

  async listAnalysisUnitBundles(etlRunId: string): Promise<AnalysisUnitBundle[]> {
    const rows = await prisma.$queryRaw<Array<{
      conversationDayId: string;
      conversationId: string;
      connectedPageId: string;
      etlRunId: string;
      runGroupId: string;
      targetDate: Date;
      businessTimezone: string;
      customerDisplayName: string | null;
      normalizedTagSignalsJson: unknown;
      observedTagsJson: unknown;
      openingBlocksJson: unknown;
      firstMeaningfulHumanMessageId: string | null;
      firstMeaningfulHumanSenderRole: string | null;
      sourceConversationJsonRedacted: unknown;
    }>>(Prisma.sql`
      SELECT
        conversation_day.id AS "conversationDayId",
        conversation_day.conversation_id AS "conversationId",
        etl_run.connected_page_id AS "connectedPageId",
        etl_run.id AS "etlRunId",
        etl_run.run_group_id AS "runGroupId",
        etl_run.target_date AS "targetDate",
        etl_run.business_timezone AS "businessTimezone",
        conversation_day.customer_display_name AS "customerDisplayName",
        conversation_day.normalized_tag_signals_json AS "normalizedTagSignalsJson",
        conversation_day.observed_tags_json AS "observedTagsJson",
        conversation_day.opening_blocks_json AS "openingBlocksJson",
        conversation_day.first_meaningful_human_message_id AS "firstMeaningfulHumanMessageId",
        conversation_day.first_meaningful_human_sender_role AS "firstMeaningfulHumanSenderRole",
        conversation_day.source_conversation_json_redacted AS "sourceConversationJsonRedacted"
      FROM conversation_day
      INNER JOIN etl_run ON etl_run.id = conversation_day.etl_run_id
      WHERE conversation_day.etl_run_id = ${etlRunId}::uuid
      ORDER BY conversation_day.conversation_id ASC
    `);

    const messageRows = await prisma.message.findMany({
      where: {
        conversationDay: {
          etlRunId
        }
      },
      orderBy: [{ insertedAt: "asc" }],
      select: {
        conversationDayId: true,
        messageId: true,
        insertedAt: true,
        senderRole: true,
        senderName: true,
        messageType: true,
        redactedText: true,
        isMeaningfulHumanMessage: true,
        isOpeningBlockMessage: true
      }
    });

    const messagesByConversationDayId = new Map<string, AnalysisUnitMessage[]>();
    for (const row of messageRows) {
      const bucket = messagesByConversationDayId.get(row.conversationDayId) ?? [];
      bucket.push({
        id: row.messageId,
        insertedAt: row.insertedAt,
        senderRole: row.senderRole,
        senderName: row.senderName,
        messageType: row.messageType,
        redactedText: row.redactedText,
        isMeaningfulHumanMessage: row.isMeaningfulHumanMessage,
        isOpeningBlockMessage: row.isOpeningBlockMessage
      });
      messagesByConversationDayId.set(row.conversationDayId, bucket);
    }

    return rows.map((row) => ({
      conversationDayId: row.conversationDayId,
      conversationId: row.conversationId,
      connectedPageId: row.connectedPageId,
      etlRunId: row.etlRunId,
      runGroupId: row.runGroupId,
      targetDate: row.targetDate.toISOString().slice(0, 10),
      businessTimezone: row.businessTimezone,
      customerDisplayName: row.customerDisplayName,
      normalizedTagSignalsJson: row.normalizedTagSignalsJson,
      observedTagsJson: row.observedTagsJson,
      openingBlocksJson: row.openingBlocksJson,
      firstMeaningfulHumanMessageId: row.firstMeaningfulHumanMessageId,
      firstMeaningfulHumanSenderRole: row.firstMeaningfulHumanSenderRole,
      sourceConversationJsonRedacted: row.sourceConversationJsonRedacted,
      messages: messagesByConversationDayId.get(row.conversationDayId) ?? []
    }));
  }

  async createAnalysisRun(input: AnalysisRunCreateInput): Promise<AnalysisRunSummary> {
    return prisma.analysisRun.create({
      data: {
        connectedPageId: input.connectedPageId,
        runGroupId: input.runGroupId,
        runMode: input.runMode,
        sourceEtlRunId: input.sourceEtlRunId,
        jobStatus: "running",
        runOutcome: input.runOutcome,
        aiProfileVersionId: input.aiProfileVersionId,
        modelName: input.modelName,
        outputSchemaVersion: input.outputSchemaVersion,
        runtimeSnapshotJson: input.runtimeSnapshotJson as Prisma.InputJsonValue,
        attemptCount: 1,
        unitCountPlanned: input.unitCountPlanned,
        totalCostMicros: 0,
        totalUsageJson: {},
        createdByUserId: input.createdByUserId,
        startedAt: input.startedAt
      },
      select: {
        id: true,
        connectedPageId: true,
        runGroupId: true,
        runMode: true,
        sourceEtlRunId: true,
        jobStatus: true,
        runOutcome: true,
        modelName: true,
        outputSchemaVersion: true,
        attemptCount: true,
        unitCountPlanned: true,
        unitCountSucceeded: true,
        unitCountUnknown: true,
        totalCostMicros: true,
        createdAt: true,
        startedAt: true,
        finishedAt: true,
        publishedAt: true
      }
    });
  }

  async markPublishedResultsSuperseded(conversationDayIds: string[]) {
    if (conversationDayIds.length === 0) {
      return;
    }
    await prisma.analysisResult.updateMany({
      where: {
        conversationDayId: { in: conversationDayIds },
        publishState: "published"
      },
      data: {
        publishState: "superseded"
      }
    });
  }

  async createAnalysisResults(analysisRunId: string, publishState: string, publishedAt: Date | null, results: AnalysisUnitResult[]) {
    for (const result of results) {
      await prisma.analysisResult.create({
        data: {
          analysisRunId,
          conversationDayId: result.conversationDayId,
          publishState,
          resultStatus: result.resultStatus,
          promptHash: result.promptHash,
          openingTheme: result.openingTheme,
          customerMood: result.customerMood,
          primaryNeed: result.primaryNeed,
          primaryTopic: result.primaryTopic,
          contentCustomerType: result.contentCustomerType,
          closingOutcomeAsOfDay: result.closingOutcomeAsOfDay,
          responseQualityLabel: result.responseQualityLabel,
          processRiskLevel: result.processRiskLevel,
          responseQualityIssueText: result.responseQualityIssueText,
          responseQualityImprovementText: result.responseQualityImprovementText,
          processRiskReasonText: result.processRiskReasonText,
          usageJson: result.usageJson as Prisma.InputJsonValue,
          costMicros: result.costMicros,
          failureInfoJson: result.failureInfoJson as Prisma.InputJsonValue | undefined,
          publishedAt
        }
      });
    }
  }

  async completeAnalysisRun(input: {
    analysisRunId: string;
    jobStatus: string;
    runOutcome: string;
    unitCountSucceeded: number;
    unitCountUnknown: number;
    totalUsageJson: Record<string, unknown>;
    totalCostMicros: bigint;
    finishedAt: Date;
    publishedAt: Date | null;
  }) {
    await prisma.analysisRun.update({
      where: { id: input.analysisRunId },
      data: {
        jobStatus: input.jobStatus,
        runOutcome: input.runOutcome,
        unitCountSucceeded: input.unitCountSucceeded,
        unitCountUnknown: input.unitCountUnknown,
        totalUsageJson: input.totalUsageJson as Prisma.InputJsonValue,
        totalCostMicros: input.totalCostMicros,
        finishedAt: input.finishedAt,
        publishedAt: input.publishedAt
      }
    });
  }

  async failAnalysisRun(analysisRunId: string, finishedAt: Date, failureInfo: Record<string, unknown>) {
    await prisma.analysisRun.update({
      where: { id: analysisRunId },
      data: {
        jobStatus: "failed",
        runOutcome: "unpublished_failed",
        finishedAt,
        runtimeSnapshotJson: {
          failure_info: failureInfo
        } as Prisma.InputJsonValue
      }
    });
  }
}

function extractActiveProfileId(value: unknown, capabilityKey: string): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const profileId = (value as Record<string, unknown>)[capabilityKey];
  return typeof profileId === "string" && profileId.length > 0 ? profileId : null;
}

export const analysisRepository = new AnalysisRepository();
