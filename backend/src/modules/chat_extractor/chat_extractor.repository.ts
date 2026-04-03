import { Prisma } from "@prisma/client";
import { prisma } from "../../infra/prisma.ts";

export type ConnectedPageRecord = {
  id: string;
  pancakePageId: string;
  pageName: string;
  pancakeUserAccessToken: string;
  businessTimezone: string;
  autoScraperEnabled: boolean;
  autoAiAnalysisEnabled: boolean;
  activePromptVersionId: string | null;
  activeTagMappingJson: unknown;
  activeOpeningRulesJson: unknown;
  onboardingStateJson: unknown;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type UpsertConnectedPageInput = {
  pancakePageId: string;
  pageName: string;
  pancakeUserAccessToken: string;
  businessTimezone: string;
  autoScraperEnabled: boolean;
  autoAiAnalysisEnabled: boolean;
};

export type UpdateConnectedPageInput = {
  businessTimezone?: string;
  autoScraperEnabled?: boolean;
  autoAiAnalysisEnabled?: boolean;
  activeTagMappingJson?: unknown;
  activeOpeningRulesJson?: unknown;
  isActive?: boolean;
};

export type PagePromptVersionRecord = {
  id: string;
  connectedPageId: string;
  versionNo: number;
  promptText: string;
  notes: string | null;
  createdAt: Date;
};

export type CreatePagePromptVersionInput = {
  connectedPageId: string;
  versionNo: number;
  promptText: string;
  notes: string | null;
};

export type EtlRunRow = {
  id: string;
  connectedPageId: string | null;
  runGroupId: string | null;
  runMode: string;
  pageId: string;
  pageName: string | null;
  targetDate: Date;
  processingMode: string;
  businessTimezone: string;
  requestedWindowStartAt: Date | null;
  requestedWindowEndExclusiveAt: Date | null;
  windowStartAt: Date;
  windowEndExclusiveAt: Date;
  status: string;
  snapshotVersion: number;
  isPublished: boolean;
  runParamsJson: unknown;
  metricsJson: unknown;
  errorText: string | null;
  startedAt: Date;
  finishedAt: Date | null;
};

export type RunCounts = {
  conversationDayCount: number;
  messageCount: number;
};

export type ConversationArtifactRow = {
  conversationId: string;
  currentTagsJson: unknown;
  openingBlocksJson: unknown;
};

type ConnectedPageModel = {
  id: string;
  pancakePageId: string;
  pageName: string;
  pancakeUserAccessToken: string;
  businessTimezone: string;
  autoScraperEnabled: boolean;
  autoAiAnalysisEnabled: boolean;
  activePromptVersionId: string | null;
  activeTagMappingJson: Prisma.JsonValue;
  activeOpeningRulesJson: Prisma.JsonValue;
  onboardingStateJson: Prisma.JsonValue;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type PromptVersionModel = {
  id: string;
  connectedPageId: string;
  versionNo: number;
  promptText: string;
  notes: string | null;
  createdAt: Date;
};

class ChatExtractorRepository {
  async nextSnapshotVersion(connectedPageId: string, targetDate: string): Promise<number> {
    const rows = await prisma.$queryRaw<Array<{ max_version: number | null }>>(Prisma.sql`
      SELECT MAX(snapshot_version) AS max_version
      FROM etl_run
      WHERE connected_page_id = ${connectedPageId}::uuid
        AND target_date = ${targetDate}::date
    `);
    const maxVersion = rows[0]?.max_version ?? 0;
    return maxVersion + 1;
  }

  async listRecentRuns(limit = 50): Promise<EtlRunRow[]> {
    return prisma.$queryRaw<EtlRunRow[]>(Prisma.sql`
      SELECT
        etl_run.id,
        etl_run.connected_page_id AS "connectedPageId",
        etl_run.run_group_id AS "runGroupId",
        etl_run.run_mode AS "runMode",
        etl_run.page_id AS "pageId",
        connected_page.page_name AS "pageName",
        etl_run.target_date AS "targetDate",
        etl_run.processing_mode AS "processingMode",
        etl_run.business_timezone AS "businessTimezone",
        etl_run.requested_window_start_at AS "requestedWindowStartAt",
        etl_run.requested_window_end_exclusive_at AS "requestedWindowEndExclusiveAt",
        etl_run.window_start_at AS "windowStartAt",
        etl_run.window_end_exclusive_at AS "windowEndExclusiveAt",
        etl_run.status,
        etl_run.snapshot_version AS "snapshotVersion",
        etl_run.is_published AS "isPublished",
        etl_run.run_params_json AS "runParamsJson",
        etl_run.metrics_json AS "metricsJson",
        etl_run.error_text AS "errorText",
        etl_run.started_at AS "startedAt",
        etl_run.finished_at AS "finishedAt"
      FROM etl_run
      LEFT JOIN connected_page ON connected_page.id = etl_run.connected_page_id
      ORDER BY etl_run.started_at DESC
      LIMIT ${limit}
    `);
  }

  async listRunsForConnectedPage(connectedPageId: string, limit = 30): Promise<EtlRunRow[]> {
    return prisma.$queryRaw<EtlRunRow[]>(Prisma.sql`
      SELECT
        etl_run.id,
        etl_run.connected_page_id AS "connectedPageId",
        etl_run.run_group_id AS "runGroupId",
        etl_run.run_mode AS "runMode",
        etl_run.page_id AS "pageId",
        connected_page.page_name AS "pageName",
        etl_run.target_date AS "targetDate",
        etl_run.processing_mode AS "processingMode",
        etl_run.business_timezone AS "businessTimezone",
        etl_run.requested_window_start_at AS "requestedWindowStartAt",
        etl_run.requested_window_end_exclusive_at AS "requestedWindowEndExclusiveAt",
        etl_run.window_start_at AS "windowStartAt",
        etl_run.window_end_exclusive_at AS "windowEndExclusiveAt",
        etl_run.status,
        etl_run.snapshot_version AS "snapshotVersion",
        etl_run.is_published AS "isPublished",
        etl_run.run_params_json AS "runParamsJson",
        etl_run.metrics_json AS "metricsJson",
        etl_run.error_text AS "errorText",
        etl_run.started_at AS "startedAt",
        etl_run.finished_at AS "finishedAt"
      FROM etl_run
      LEFT JOIN connected_page ON connected_page.id = etl_run.connected_page_id
      WHERE etl_run.connected_page_id = ${connectedPageId}::uuid
      ORDER BY etl_run.started_at DESC
      LIMIT ${limit}
    `);
  }

  async getRunById(runId: string): Promise<EtlRunRow | null> {
    const rows = await prisma.$queryRaw<EtlRunRow[]>(Prisma.sql`
      SELECT
        etl_run.id,
        etl_run.connected_page_id AS "connectedPageId",
        etl_run.run_group_id AS "runGroupId",
        etl_run.run_mode AS "runMode",
        etl_run.page_id AS "pageId",
        connected_page.page_name AS "pageName",
        etl_run.target_date AS "targetDate",
        etl_run.processing_mode AS "processingMode",
        etl_run.business_timezone AS "businessTimezone",
        etl_run.requested_window_start_at AS "requestedWindowStartAt",
        etl_run.requested_window_end_exclusive_at AS "requestedWindowEndExclusiveAt",
        etl_run.window_start_at AS "windowStartAt",
        etl_run.window_end_exclusive_at AS "windowEndExclusiveAt",
        etl_run.status,
        etl_run.snapshot_version AS "snapshotVersion",
        etl_run.is_published AS "isPublished",
        etl_run.run_params_json AS "runParamsJson",
        etl_run.metrics_json AS "metricsJson",
        etl_run.error_text AS "errorText",
        etl_run.started_at AS "startedAt",
        etl_run.finished_at AS "finishedAt"
      FROM etl_run
      LEFT JOIN connected_page ON connected_page.id = etl_run.connected_page_id
      WHERE etl_run.id = ${runId}::uuid
      LIMIT 1
    `);
    return rows[0] ?? null;
  }

  async getRunCounts(runId: string): Promise<RunCounts> {
    const [conversationRows, messageRows] = await Promise.all([
      prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
        SELECT COUNT(*) AS count
        FROM conversation_day
        WHERE etl_run_id = ${runId}::uuid
      `),
      prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
        SELECT COUNT(*) AS count
        FROM message
        WHERE etl_run_id = ${runId}::uuid
      `)
    ]);

    return {
      conversationDayCount: Number(conversationRows[0]?.count ?? 0n),
      messageCount: Number(messageRows[0]?.count ?? 0n)
    };
  }

  async listConversationArtifacts(runId: string): Promise<ConversationArtifactRow[]> {
    return prisma.$queryRaw<ConversationArtifactRow[]>(Prisma.sql`
      SELECT
        conversation_id AS "conversationId",
        current_tags_json AS "currentTagsJson",
        opening_blocks_json AS "openingBlocksJson"
      FROM conversation_day
      WHERE etl_run_id = ${runId}::uuid
      ORDER BY conversation_id ASC
    `);
  }

  async listConnectedPages(): Promise<ConnectedPageRecord[]> {
    const rows = await prisma.connectedPage.findMany({
      orderBy: [{ createdAt: "desc" }]
    });
    return rows.map(mapConnectedPage);
  }

  async getConnectedPageById(id: string): Promise<ConnectedPageRecord | null> {
    const row = await prisma.connectedPage.findUnique({
      where: {
        id
      }
    });
    return row ? mapConnectedPage(row) : null;
  }

  async upsertConnectedPage(input: UpsertConnectedPageInput): Promise<ConnectedPageRecord> {
    const row = await prisma.connectedPage.upsert({
      where: {
        pancakePageId: input.pancakePageId
      },
      update: {
        pageName: input.pageName,
        pancakeUserAccessToken: input.pancakeUserAccessToken,
        businessTimezone: input.businessTimezone,
        autoScraperEnabled: input.autoScraperEnabled,
        autoAiAnalysisEnabled: input.autoAiAnalysisEnabled
      },
      create: {
        pancakePageId: input.pancakePageId,
        pageName: input.pageName,
        pancakeUserAccessToken: input.pancakeUserAccessToken,
        businessTimezone: input.businessTimezone,
        autoScraperEnabled: input.autoScraperEnabled,
        autoAiAnalysisEnabled: input.autoAiAnalysisEnabled
      }
    });
    return mapConnectedPage(row);
  }

  async updateConnectedPage(id: string, patch: UpdateConnectedPageInput): Promise<ConnectedPageRecord> {
    const row = await prisma.connectedPage.update({
      where: {
        id
      },
      data: {
        businessTimezone: patch.businessTimezone,
        autoScraperEnabled: patch.autoScraperEnabled,
        autoAiAnalysisEnabled: patch.autoAiAnalysisEnabled,
        activeTagMappingJson: patch.activeTagMappingJson as Prisma.InputJsonValue | undefined,
        activeOpeningRulesJson: patch.activeOpeningRulesJson as Prisma.InputJsonValue | undefined,
        isActive: patch.isActive
      }
    });
    return mapConnectedPage(row);
  }

  async updateConnectedPageOnboardingState(id: string, onboardingStateJson: unknown): Promise<ConnectedPageRecord> {
    const row = await prisma.connectedPage.update({
      where: {
        id
      },
      data: {
        onboardingStateJson: onboardingStateJson as Prisma.InputJsonValue
      }
    });
    return mapConnectedPage(row);
  }

  async listSchedulerPages(): Promise<ConnectedPageRecord[]> {
    const rows = await prisma.connectedPage.findMany({
      where: {
        isActive: true,
        autoScraperEnabled: true
      },
      orderBy: [{ pageName: "asc" }]
    });
    return rows.map(mapConnectedPage);
  }

  async listPagePromptVersions(connectedPageId: string): Promise<PagePromptVersionRecord[]> {
    const rows = await prisma.pagePromptVersion.findMany({
      where: {
        connectedPageId
      },
      orderBy: [{ versionNo: "desc" }]
    });
    return rows.map(mapPagePromptVersion);
  }

  async nextPromptVersionNo(connectedPageId: string): Promise<number> {
    const result = await prisma.pagePromptVersion.aggregate({
      _max: {
        versionNo: true
      },
      where: {
        connectedPageId
      }
    });
    return (result._max.versionNo ?? 0) + 1;
  }

  async createPagePromptVersion(input: CreatePagePromptVersionInput): Promise<PagePromptVersionRecord> {
    const row = await prisma.pagePromptVersion.create({
      data: {
        connectedPageId: input.connectedPageId,
        versionNo: input.versionNo,
        promptText: input.promptText,
        notes: input.notes
      }
    });
    return mapPagePromptVersion(row);
  }

  async getPagePromptVersionById(id: string): Promise<PagePromptVersionRecord | null> {
    const row = await prisma.pagePromptVersion.findUnique({
      where: {
        id
      }
    });
    return row ? mapPagePromptVersion(row) : null;
  }

  async getActivePromptVersion(connectedPageId: string): Promise<PagePromptVersionRecord | null> {
    const row = await prisma.connectedPage.findUnique({
      where: {
        id: connectedPageId
      },
      select: {
        activePromptVersion: true
      }
    });
    return row?.activePromptVersion ? mapPagePromptVersion(row.activePromptVersion) : null;
  }

  async activatePagePromptVersion(connectedPageId: string, promptVersionId: string): Promise<ConnectedPageRecord> {
    const row = await prisma.connectedPage.update({
      where: {
        id: connectedPageId
      },
      data: {
        activePromptVersionId: promptVersionId
      }
    });
    return mapConnectedPage(row);
  }
}

function mapConnectedPage(row: ConnectedPageModel): ConnectedPageRecord {
  return {
    id: row.id,
    pancakePageId: row.pancakePageId,
    pageName: row.pageName,
    pancakeUserAccessToken: row.pancakeUserAccessToken,
    businessTimezone: row.businessTimezone,
    autoScraperEnabled: row.autoScraperEnabled,
    autoAiAnalysisEnabled: row.autoAiAnalysisEnabled,
    activePromptVersionId: row.activePromptVersionId,
    activeTagMappingJson: row.activeTagMappingJson,
    activeOpeningRulesJson: row.activeOpeningRulesJson,
    onboardingStateJson: row.onboardingStateJson,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

function mapPagePromptVersion(row: PromptVersionModel): PagePromptVersionRecord {
  return {
    id: row.id,
    connectedPageId: row.connectedPageId,
    versionNo: row.versionNo,
    promptText: row.promptText,
    notes: row.notes,
    createdAt: row.createdAt
  };
}

export const chatExtractorRepository = new ChatExtractorRepository();
