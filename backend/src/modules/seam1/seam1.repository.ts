import { Prisma } from "@prisma/client";
import { prisma } from "../../infra/prisma.ts";

export type EtlRunRow = {
  id: string;
  runGroupId: string | null;
  runMode: string;
  pageId: string;
  targetDate: Date;
  businessTimezone: string;
  requestedWindowStartAt: Date | null;
  requestedWindowEndExclusiveAt: Date | null;
  windowStartAt: Date;
  windowEndExclusiveAt: Date;
  status: string;
  snapshotVersion: number;
  isPublished: boolean;
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

class Seam1Repository {
  async nextSnapshotVersion(pageId: string, targetDate: string): Promise<number> {
    const rows = await prisma.$queryRaw<Array<{ max_version: number | null }>>(Prisma.sql`
      SELECT MAX(snapshot_version) AS max_version
      FROM etl_run
      WHERE page_id = ${pageId}
        AND target_date = ${targetDate}::date
    `);
    const maxVersion = rows[0]?.max_version ?? 0;
    return maxVersion + 1;
  }

  async listRecentRuns(limit = 50): Promise<EtlRunRow[]> {
    return prisma.$queryRaw<EtlRunRow[]>(Prisma.sql`
      SELECT
        id,
        run_group_id AS "runGroupId",
        run_mode AS "runMode",
        page_id AS "pageId",
        target_date AS "targetDate",
        business_timezone AS "businessTimezone",
        requested_window_start_at AS "requestedWindowStartAt",
        requested_window_end_exclusive_at AS "requestedWindowEndExclusiveAt",
        window_start_at AS "windowStartAt",
        window_end_exclusive_at AS "windowEndExclusiveAt",
        status,
        snapshot_version AS "snapshotVersion",
        is_published AS "isPublished",
        metrics_json AS "metricsJson",
        error_text AS "errorText",
        started_at AS "startedAt",
        finished_at AS "finishedAt"
      FROM etl_run
      ORDER BY started_at DESC
      LIMIT ${limit}
    `);
  }

  async listRunsByPageId(pageId: string, limit = 20): Promise<EtlRunRow[]> {
    return prisma.$queryRaw<EtlRunRow[]>(Prisma.sql`
      SELECT
        id,
        run_group_id AS "runGroupId",
        run_mode AS "runMode",
        page_id AS "pageId",
        target_date AS "targetDate",
        business_timezone AS "businessTimezone",
        requested_window_start_at AS "requestedWindowStartAt",
        requested_window_end_exclusive_at AS "requestedWindowEndExclusiveAt",
        window_start_at AS "windowStartAt",
        window_end_exclusive_at AS "windowEndExclusiveAt",
        status,
        snapshot_version AS "snapshotVersion",
        is_published AS "isPublished",
        metrics_json AS "metricsJson",
        error_text AS "errorText",
        started_at AS "startedAt",
        finished_at AS "finishedAt"
      FROM etl_run
      WHERE page_id = ${pageId}
      ORDER BY started_at DESC
      LIMIT ${limit}
    `);
  }

  async getRunById(runId: string): Promise<EtlRunRow | null> {
    const rows = await prisma.$queryRaw<EtlRunRow[]>(Prisma.sql`
      SELECT
        id,
        run_group_id AS "runGroupId",
        run_mode AS "runMode",
        page_id AS "pageId",
        target_date AS "targetDate",
        business_timezone AS "businessTimezone",
        requested_window_start_at AS "requestedWindowStartAt",
        requested_window_end_exclusive_at AS "requestedWindowEndExclusiveAt",
        window_start_at AS "windowStartAt",
        window_end_exclusive_at AS "windowEndExclusiveAt",
        status,
        snapshot_version AS "snapshotVersion",
        is_published AS "isPublished",
        metrics_json AS "metricsJson",
        error_text AS "errorText",
        started_at AS "startedAt",
        finished_at AS "finishedAt"
      FROM etl_run
      WHERE id = ${runId}::uuid
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
}

export const seam1Repository = new Seam1Repository();
