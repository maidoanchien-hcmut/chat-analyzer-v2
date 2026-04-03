import { Prisma } from "@prisma/client";
import { prisma } from "../../infra/prisma.ts";

export type ConnectedPageRecord = {
  id: string;
  pancakePageId: string;
  pageName: string;
  pancakeUserAccessToken: string;
  businessTimezone: string;
  etlEnabled: boolean;
  analysisEnabled: boolean;
  activeAiProfilesJson: unknown;
  activeTagMappingJson: unknown;
  activeOpeningRulesJson: unknown;
  notificationTargetsJson: unknown;
  onboardingStateJson: unknown;
  createdAt: Date;
  updatedAt: Date;
};

export type UpsertConnectedPageInput = {
  pancakePageId: string;
  pageName: string;
  pancakeUserAccessToken: string;
  businessTimezone: string;
  etlEnabled: boolean;
  analysisEnabled: boolean;
};

export type UpdateConnectedPageInput = {
  businessTimezone?: string;
  etlEnabled?: boolean;
  analysisEnabled?: boolean;
  activeAiProfilesJson?: unknown;
  activeTagMappingJson?: unknown;
  activeOpeningRulesJson?: unknown;
  notificationTargetsJson?: unknown;
  onboardingStateJson?: unknown;
};

export type PageAiProfileVersionRecord = {
  id: string;
  connectedPageId: string;
  capabilityKey: string;
  versionNo: number;
  profileJson: unknown;
  notes: string | null;
  createdAt: Date;
};

export type CreatePageAiProfileVersionInput = {
  connectedPageId: string;
  capabilityKey: string;
  versionNo: number;
  profileJson: unknown;
  notes: string | null;
};

export type EtlRunRow = {
  id: string;
  connectedPageId: string;
  runGroupId: string;
  runMode: string;
  pancakePageId: string | null;
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
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
};

export type RunCounts = {
  conversationDayCount: number;
  messageCount: number;
};

export type ConversationArtifactRow = {
  conversationId: string;
  observedTagsJson: unknown;
  openingBlocksJson: unknown;
};

type ConnectedPageModel = {
  id: string;
  pancakePageId: string;
  pageName: string;
  pancakeUserAccessToken: string;
  businessTimezone: string;
  etlEnabled: boolean;
  analysisEnabled: boolean;
  activeAiProfilesJson: Prisma.JsonValue;
  activeTagMappingJson: Prisma.JsonValue;
  activeOpeningRulesJson: Prisma.JsonValue;
  notificationTargetsJson: Prisma.JsonValue;
  onboardingStateJson: Prisma.JsonValue;
  createdAt: Date;
  updatedAt: Date;
};

type AiProfileVersionModel = {
  id: string;
  connectedPageId: string;
  capabilityKey: string;
  versionNo: number;
  profileJson: Prisma.JsonValue;
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
        connected_page.pancake_page_id AS "pancakePageId",
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
        etl_run.finished_at AS "finishedAt",
        etl_run.created_at AS "createdAt"
      FROM etl_run
      INNER JOIN connected_page ON connected_page.id = etl_run.connected_page_id
      ORDER BY etl_run.created_at DESC
      LIMIT ${limit}
    `);
  }

  async listRunsForConnectedPage(connectedPageId: string, limit = 100): Promise<EtlRunRow[]> {
    return prisma.$queryRaw<EtlRunRow[]>(Prisma.sql`
      SELECT
        etl_run.id,
        etl_run.connected_page_id AS "connectedPageId",
        etl_run.run_group_id AS "runGroupId",
        etl_run.run_mode AS "runMode",
        connected_page.pancake_page_id AS "pancakePageId",
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
        etl_run.finished_at AS "finishedAt",
        etl_run.created_at AS "createdAt"
      FROM etl_run
      INNER JOIN connected_page ON connected_page.id = etl_run.connected_page_id
      WHERE etl_run.connected_page_id = ${connectedPageId}::uuid
      ORDER BY etl_run.created_at DESC
      LIMIT ${limit}
    `);
  }

  async listRunsByRunGroupId(runGroupId: string): Promise<EtlRunRow[]> {
    return prisma.$queryRaw<EtlRunRow[]>(Prisma.sql`
      SELECT
        etl_run.id,
        etl_run.connected_page_id AS "connectedPageId",
        etl_run.run_group_id AS "runGroupId",
        etl_run.run_mode AS "runMode",
        connected_page.pancake_page_id AS "pancakePageId",
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
        etl_run.finished_at AS "finishedAt",
        etl_run.created_at AS "createdAt"
      FROM etl_run
      INNER JOIN connected_page ON connected_page.id = etl_run.connected_page_id
      WHERE etl_run.run_group_id = ${runGroupId}::uuid
      ORDER BY etl_run.target_date ASC, etl_run.created_at ASC
    `);
  }

  async getRunById(runId: string): Promise<EtlRunRow | null> {
    const rows = await prisma.$queryRaw<EtlRunRow[]>(Prisma.sql`
      SELECT
        etl_run.id,
        etl_run.connected_page_id AS "connectedPageId",
        etl_run.run_group_id AS "runGroupId",
        etl_run.run_mode AS "runMode",
        connected_page.pancake_page_id AS "pancakePageId",
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
        etl_run.finished_at AS "finishedAt",
        etl_run.created_at AS "createdAt"
      FROM etl_run
      INNER JOIN connected_page ON connected_page.id = etl_run.connected_page_id
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
        INNER JOIN conversation_day ON conversation_day.id = message.conversation_day_id
        WHERE conversation_day.etl_run_id = ${runId}::uuid
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
        observed_tags_json AS "observedTagsJson",
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
        etlEnabled: input.etlEnabled,
        analysisEnabled: input.analysisEnabled
      },
      create: {
        pancakePageId: input.pancakePageId,
        pageName: input.pageName,
        pancakeUserAccessToken: input.pancakeUserAccessToken,
        businessTimezone: input.businessTimezone,
        etlEnabled: input.etlEnabled,
        analysisEnabled: input.analysisEnabled
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
        etlEnabled: patch.etlEnabled,
        analysisEnabled: patch.analysisEnabled,
        activeAiProfilesJson: patch.activeAiProfilesJson as Prisma.InputJsonValue | undefined,
        activeTagMappingJson: patch.activeTagMappingJson as Prisma.InputJsonValue | undefined,
        activeOpeningRulesJson: patch.activeOpeningRulesJson as Prisma.InputJsonValue | undefined,
        notificationTargetsJson: patch.notificationTargetsJson as Prisma.InputJsonValue | undefined,
        onboardingStateJson: patch.onboardingStateJson as Prisma.InputJsonValue | undefined
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
        etlEnabled: true
      },
      orderBy: [{ pageName: "asc" }]
    });
    return rows.map(mapConnectedPage);
  }

  async listPageAiProfileVersions(connectedPageId: string, capabilityKey?: string): Promise<PageAiProfileVersionRecord[]> {
    const rows = await prisma.pageAiProfileVersion.findMany({
      where: {
        connectedPageId,
        capabilityKey
      },
      orderBy: [{ capabilityKey: "asc" }, { versionNo: "desc" }]
    });
    return rows.map(mapAiProfileVersion);
  }

  async nextAiProfileVersionNo(connectedPageId: string, capabilityKey: string): Promise<number> {
    const result = await prisma.pageAiProfileVersion.aggregate({
      _max: {
        versionNo: true
      },
      where: {
        connectedPageId,
        capabilityKey
      }
    });
    return (result._max.versionNo ?? 0) + 1;
  }

  async createPageAiProfileVersion(input: CreatePageAiProfileVersionInput): Promise<PageAiProfileVersionRecord> {
    const row = await prisma.pageAiProfileVersion.create({
      data: {
        connectedPageId: input.connectedPageId,
        capabilityKey: input.capabilityKey,
        versionNo: input.versionNo,
        profileJson: input.profileJson as Prisma.InputJsonValue,
        notes: input.notes
      }
    });
    return mapAiProfileVersion(row);
  }

  async getPageAiProfileVersionById(id: string): Promise<PageAiProfileVersionRecord | null> {
    const row = await prisma.pageAiProfileVersion.findUnique({
      where: {
        id
      }
    });
    return row ? mapAiProfileVersion(row) : null;
  }

  async getActiveAiProfile(connectedPageId: string, capabilityKey: string): Promise<PageAiProfileVersionRecord | null> {
    const page = await prisma.connectedPage.findUnique({
      where: { id: connectedPageId },
      select: { activeAiProfilesJson: true }
    });
    const activeProfileId = extractActiveProfileId(page?.activeAiProfilesJson, capabilityKey);
    if (!activeProfileId) {
      return null;
    }
    const row = await prisma.pageAiProfileVersion.findUnique({
      where: {
        id: activeProfileId
      }
    });
    return row ? mapAiProfileVersion(row) : null;
  }

  async activatePageAiProfileVersion(connectedPageId: string, capabilityKey: string, profileVersionId: string): Promise<ConnectedPageRecord> {
    const currentPage = await prisma.connectedPage.findUniqueOrThrow({
      where: { id: connectedPageId }
    });
    const activeProfiles = asJsonObject(currentPage.activeAiProfilesJson);
    activeProfiles[capabilityKey] = profileVersionId;

    const row = await prisma.connectedPage.update({
      where: { id: connectedPageId },
      data: {
        activeAiProfilesJson: activeProfiles as Prisma.InputJsonValue
      }
    });
    return mapConnectedPage(row);
  }
}

function extractActiveProfileId(value: Prisma.JsonValue | null | undefined, capabilityKey: string): string | null {
  const map = asJsonObject(value ?? {});
  const profileId = map[capabilityKey];
  return typeof profileId === "string" && profileId.length > 0 ? profileId : null;
}

function asJsonObject(value: Prisma.JsonValue): Record<string, Prisma.JsonValue> {
  return value && typeof value === "object" && !Array.isArray(value) ? { ...(value as Record<string, Prisma.JsonValue>) } : {};
}

function mapConnectedPage(row: ConnectedPageModel): ConnectedPageRecord {
  return {
    id: row.id,
    pancakePageId: row.pancakePageId,
    pageName: row.pageName,
    pancakeUserAccessToken: row.pancakeUserAccessToken,
    businessTimezone: row.businessTimezone,
    etlEnabled: row.etlEnabled,
    analysisEnabled: row.analysisEnabled,
    activeAiProfilesJson: row.activeAiProfilesJson,
    activeTagMappingJson: row.activeTagMappingJson,
    activeOpeningRulesJson: row.activeOpeningRulesJson,
    notificationTargetsJson: row.notificationTargetsJson,
    onboardingStateJson: row.onboardingStateJson,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

function mapAiProfileVersion(row: AiProfileVersionModel): PageAiProfileVersionRecord {
  return {
    id: row.id,
    connectedPageId: row.connectedPageId,
    capabilityKey: row.capabilityKey,
    versionNo: row.versionNo,
    profileJson: row.profileJson,
    notes: row.notes,
    createdAt: row.createdAt
  };
}

export const chatExtractorRepository = new ChatExtractorRepository();
