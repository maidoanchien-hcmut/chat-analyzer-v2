import { Prisma } from "@prisma/client";
import { prisma } from "../../infra/prisma.ts";

export type ConnectedPageLiteRow = {
  id: string;
  pageName: string;
  businessTimezone: string;
  etlEnabled: boolean;
  analysisEnabled: boolean;
  activeTagMappingJson: unknown;
  activeOpeningRulesJson: unknown;
};

export type PublishedSliceRow = {
  connectedPageId: string;
  pageName: string;
  runGroupId: string;
  etlRunId: string;
  conversationDayId: string;
  threadId: string;
  customerDisplayName: string | null;
  targetDate: Date;
  businessTimezone: string;
  threadFirstSeenAt: Date | null;
  messageCount: number;
  costMicros: bigint;
  primaryNeed: string;
  customerMood: string;
  contentCustomerType: string;
  processRiskLevel: string;
  openingTheme: string;
  closingOutcomeAsOfDay: string;
  responseQualityLabel: string;
  processRiskReasonText: string | null;
  normalizedTagSignalsJson: unknown;
  observedTagsJson: unknown;
  latestMessageAt: Date | null;
};

export type RunGroupSliceRow = {
  runGroupId: string;
  etlRunId: string;
  targetDate: Date;
  status: string;
  threadId: string;
  conversationDayId: string;
  customerDisplayName: string | null;
  messageCount: number;
  latestMessageAt: Date | null;
  costMicros: bigint;
  primaryNeed: string | null;
  customerMood: string | null;
  contentCustomerType: string | null;
  processRiskLevel: string | null;
};

export type ThreadMessageRow = {
  messageId: string;
  insertedAt: Date;
  senderRole: string;
  senderName: string | null;
  messageType: string;
  redactedText: string | null;
  isMeaningfulHumanMessage: boolean;
  isOpeningBlockMessage: boolean;
  targetDate: Date;
};

export type MappingReviewRow = {
  id: string;
  runGroupId: string;
  threadId: string;
  decisionStatus: string;
  promotionState: string;
  confidenceScore: Prisma.Decimal | null;
  selectedCustomerId: string | null;
  modelName: string;
  outputSchemaVersion: string;
  createdAt: Date;
};

export class ReadModelsRepository {
  async listConnectedPagesLite(): Promise<ConnectedPageLiteRow[]> {
    return prisma.connectedPage.findMany({
      orderBy: [{ pageName: "asc" }],
      select: {
        id: true,
        pageName: true,
        businessTimezone: true,
        etlEnabled: true,
        analysisEnabled: true,
        activeTagMappingJson: true,
        activeOpeningRulesJson: true
      }
    });
  }

  async getConnectedPageLite(id: string): Promise<ConnectedPageLiteRow | null> {
    return prisma.connectedPage.findUnique({
      where: { id },
      select: {
        id: true,
        pageName: true,
        businessTimezone: true,
        etlEnabled: true,
        analysisEnabled: true,
        activeTagMappingJson: true,
        activeOpeningRulesJson: true
      }
    });
  }

  async listPublishedSliceRows(input: {
    connectedPageId: string | null;
    startDate: string;
    endDate: string;
  }): Promise<PublishedSliceRow[]> {
    return prisma.$queryRaw<PublishedSliceRow[]>(Prisma.sql`
      SELECT
        er.connected_page_id AS "connectedPageId",
        cp.page_name AS "pageName",
        er.run_group_id AS "runGroupId",
        er.id AS "etlRunId",
        cd.id AS "conversationDayId",
        cd.conversation_id AS "threadId",
        cd.customer_display_name AS "customerDisplayName",
        er.target_date AS "targetDate",
        er.business_timezone AS "businessTimezone",
        cd.thread_first_seen_at AS "threadFirstSeenAt",
        cd.message_count_persisted AS "messageCount",
        ar.cost_micros AS "costMicros",
        ar.primary_need AS "primaryNeed",
        ar.customer_mood AS "customerMood",
        ar.content_customer_type AS "contentCustomerType",
        ar.process_risk_level AS "processRiskLevel",
        ar.opening_theme AS "openingTheme",
        ar.closing_outcome_as_of_day AS "closingOutcomeAsOfDay",
        ar.response_quality_label AS "responseQualityLabel",
        ar.process_risk_reason_text AS "processRiskReasonText",
        cd.normalized_tag_signals_json AS "normalizedTagSignalsJson",
        cd.observed_tags_json AS "observedTagsJson",
        (
          SELECT MAX(m.inserted_at)
          FROM message m
          WHERE m.conversation_day_id = cd.id
        ) AS "latestMessageAt"
      FROM conversation_day cd
      INNER JOIN etl_run er ON er.id = cd.etl_run_id
      INNER JOIN connected_page cp ON cp.id = er.connected_page_id
      INNER JOIN analysis_result ar ON ar.conversation_day_id = cd.id AND ar.publish_state = 'published'
      WHERE (${input.connectedPageId}::uuid IS NULL OR er.connected_page_id = ${input.connectedPageId}::uuid)
        AND er.is_published = true
        AND er.target_date >= ${input.startDate}::date
        AND er.target_date <= ${input.endDate}::date
      ORDER BY er.target_date DESC, cd.conversation_id ASC
    `);
  }

  async listRunGroupSliceRows(runGroupId: string): Promise<RunGroupSliceRow[]> {
    return prisma.$queryRaw<RunGroupSliceRow[]>(Prisma.sql`
      SELECT
        er.run_group_id AS "runGroupId",
        er.id AS "etlRunId",
        er.target_date AS "targetDate",
        er.status,
        cd.conversation_id AS "threadId",
        cd.id AS "conversationDayId",
        cd.customer_display_name AS "customerDisplayName",
        cd.message_count_persisted AS "messageCount",
        (
          SELECT MAX(m.inserted_at)
          FROM message m
          WHERE m.conversation_day_id = cd.id
        ) AS "latestMessageAt",
        ar.cost_micros AS "costMicros",
        ar.primary_need AS "primaryNeed",
        ar.customer_mood AS "customerMood",
        ar.content_customer_type AS "contentCustomerType",
        ar.process_risk_level AS "processRiskLevel"
      FROM etl_run er
      INNER JOIN conversation_day cd ON cd.etl_run_id = er.id
      LEFT JOIN LATERAL (
        SELECT
          analysis_result.cost_micros,
          analysis_result.primary_need,
          analysis_result.customer_mood,
          analysis_result.content_customer_type,
          analysis_result.process_risk_level
        FROM analysis_result
        INNER JOIN analysis_run ON analysis_run.id = analysis_result.analysis_run_id
        WHERE analysis_result.conversation_day_id = cd.id
          AND analysis_run.run_group_id = er.run_group_id
        ORDER BY analysis_result.created_at DESC
        LIMIT 1
      ) ar ON TRUE
      WHERE er.run_group_id = ${runGroupId}::uuid
      ORDER BY er.target_date DESC, cd.conversation_id ASC
    `);
  }

  async listThreadHistoryRows(input: {
    connectedPageId: string;
    threadId: string;
    startDate: string | null;
    endDate: string | null;
    runGroupId: string | null;
  }): Promise<PublishedSliceRow[]> {
    return prisma.$queryRaw<PublishedSliceRow[]>(Prisma.sql`
      SELECT
        er.connected_page_id AS "connectedPageId",
        cp.page_name AS "pageName",
        er.run_group_id AS "runGroupId",
        er.id AS "etlRunId",
        cd.id AS "conversationDayId",
        cd.conversation_id AS "threadId",
        cd.customer_display_name AS "customerDisplayName",
        er.target_date AS "targetDate",
        er.business_timezone AS "businessTimezone",
        cd.thread_first_seen_at AS "threadFirstSeenAt",
        cd.message_count_persisted AS "messageCount",
        COALESCE(ar.cost_micros, 0) AS "costMicros",
        COALESCE(ar.primary_need, 'unknown') AS "primaryNeed",
        COALESCE(ar.customer_mood, 'unknown') AS "customerMood",
        COALESCE(ar.content_customer_type, 'unknown') AS "contentCustomerType",
        COALESCE(ar.process_risk_level, 'unknown') AS "processRiskLevel",
        COALESCE(ar.opening_theme, 'unknown') AS "openingTheme",
        COALESCE(ar.closing_outcome_as_of_day, 'unknown') AS "closingOutcomeAsOfDay",
        COALESCE(ar.response_quality_label, 'unknown') AS "responseQualityLabel",
        ar.process_risk_reason_text AS "processRiskReasonText",
        cd.normalized_tag_signals_json AS "normalizedTagSignalsJson",
        cd.observed_tags_json AS "observedTagsJson",
        (
          SELECT MAX(m.inserted_at)
          FROM message m
          WHERE m.conversation_day_id = cd.id
        ) AS "latestMessageAt"
      FROM conversation_day cd
      INNER JOIN etl_run er ON er.id = cd.etl_run_id
      INNER JOIN connected_page cp ON cp.id = er.connected_page_id
      LEFT JOIN analysis_result ar ON ar.conversation_day_id = cd.id AND ar.publish_state = 'published'
      WHERE er.connected_page_id = ${input.connectedPageId}::uuid
        AND cd.conversation_id = ${input.threadId}
        AND er.is_published = true
        AND (${input.startDate}::date IS NULL OR er.target_date >= ${input.startDate}::date)
        AND (${input.endDate}::date IS NULL OR er.target_date <= ${input.endDate}::date)
        AND (${input.runGroupId}::uuid IS NULL OR er.run_group_id = ${input.runGroupId}::uuid)
      ORDER BY er.target_date DESC, cd.created_at DESC
    `);
  }

  async listMessagesForConversationDays(conversationDayIds: string[]): Promise<ThreadMessageRow[]> {
    if (conversationDayIds.length === 0) {
      return [];
    }
    return prisma.$queryRaw<ThreadMessageRow[]>(Prisma.sql`
      SELECT
        message.message_id AS "messageId",
        message.inserted_at AS "insertedAt",
        message.sender_role AS "senderRole",
        message.sender_name AS "senderName",
        message.message_type AS "messageType",
        message.redacted_text AS "redactedText",
        message.is_meaningful_human_message AS "isMeaningfulHumanMessage",
        message.is_opening_block_message AS "isOpeningBlockMessage",
        etl_run.target_date AS "targetDate"
      FROM message
      INNER JOIN conversation_day ON conversation_day.id = message.conversation_day_id
      INNER JOIN etl_run ON etl_run.id = conversation_day.etl_run_id
      WHERE message.conversation_day_id IN (${Prisma.join(conversationDayIds.map((id) => Prisma.sql`${id}::uuid`))})
      ORDER BY message.inserted_at ASC, message.created_at ASC
    `);
  }

  async listMappingReviewRows(connectedPageId: string, limit: number): Promise<MappingReviewRow[]> {
    return prisma.$queryRaw<MappingReviewRow[]>(Prisma.sql`
      SELECT
        id,
        run_group_id AS "runGroupId",
        thread_id AS "threadId",
        decision_status AS "decisionStatus",
        promotion_state AS "promotionState",
        confidence_score AS "confidenceScore",
        selected_customer_id AS "selectedCustomerId",
        model_name AS "modelName",
        output_schema_version AS "outputSchemaVersion",
        created_at AS "createdAt"
      FROM thread_customer_mapping_decision
      WHERE connected_page_id = ${connectedPageId}::uuid
        AND decision_status = 'manual_review_required'
        AND promotion_state = 'not_applied'
      ORDER BY created_at DESC
      LIMIT ${limit}
    `);
  }
}

export const readModelsRepository = new ReadModelsRepository();
