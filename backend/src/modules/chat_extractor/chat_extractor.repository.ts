import { Prisma } from "@prisma/client";
import { prisma } from "../../infra/prisma.ts";
import { DEFAULT_ANALYSIS_TAXONOMY } from "./chat_extractor.artifacts.ts";
import type {
  NotificationTargetsConfig,
  OpeningRulesConfig,
  PublishAs,
  SchedulerConfig,
  TagMappingConfig
} from "./chat_extractor.types.ts";

export type ConnectedPageRecord = {
  id: string;
  pancakePageId: string;
  pageName: string;
  pancakeUserAccessToken: string;
  businessTimezone: string;
  etlEnabled: boolean;
  analysisEnabled: boolean;
  activeConfigVersionId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type AnalysisTaxonomyVersionRecord = {
  id: string;
  versionCode: string;
  taxonomyJson: unknown;
  isActive: boolean;
  createdAt: Date;
};

export type PageConfigVersionRecord = {
  id: string;
  connectedPageId: string;
  versionNo: number;
  tagMappingJson: TagMappingConfig;
  openingRulesJson: OpeningRulesConfig;
  schedulerJson: SchedulerConfig | null;
  notificationTargetsJson: NotificationTargetsConfig | null;
  promptText: string;
  analysisTaxonomyVersionId: string;
  notes: string | null;
  createdAt: Date;
  analysisTaxonomyVersion: AnalysisTaxonomyVersionRecord;
};

export type PagePromptIdentityRecord = {
  id: string;
  connectedPageId: string;
  compiledPromptHash: string;
  promptVersion: string;
  compiledPromptText: string;
  createdAt: Date;
};

export type ConnectedPageDetailRecord = {
  page: ConnectedPageRecord;
  activeConfigVersion: PageConfigVersionRecord | null;
  configVersions: PageConfigVersionRecord[];
};

export type PipelineRunGroupRecord = {
  id: string;
  runMode: string;
  requestedWindowStartAt: Date | null;
  requestedWindowEndExclusiveAt: Date | null;
  requestedTargetDate: Date | null;
  frozenConfigVersionId: string;
  frozenTaxonomyVersionId: string;
  frozenCompiledPromptHash: string;
  frozenPromptVersion: string;
  publishIntent: string;
  status: string;
  createdBy: string;
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
  connectedPage: ConnectedPageRecord;
  frozenConfigVersion: PageConfigVersionRecord;
};

export type PipelineRunRecord = {
  id: string;
  runGroupId: string;
  targetDate: Date;
  windowStartAt: Date;
  windowEndExclusiveAt: Date;
  requestedWindowStartAt: Date | null;
  requestedWindowEndExclusiveAt: Date | null;
  isFullDay: boolean;
  runMode: string;
  status: string;
  publishState: string;
  publishEligibility: string;
  supersedesRunId: string | null;
  supersededByRunId: string | null;
  requestJson: unknown;
  metricsJson: unknown;
  reuseSummaryJson: unknown;
  errorText: string | null;
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
  publishedAt: Date | null;
  runGroup: PipelineRunGroupRecord;
};

type UpsertConnectedPageInput = {
  pancakePageId: string;
  pageName: string;
  pancakeUserAccessToken: string;
  businessTimezone: string;
  etlEnabled: boolean;
  analysisEnabled: boolean;
};

type CreatePageConfigVersionInput = {
  connectedPageId: string;
  versionNo: number;
  tagMappingJson: TagMappingConfig;
  openingRulesJson: OpeningRulesConfig;
  schedulerJson: SchedulerConfig | null;
  notificationTargetsJson: NotificationTargetsConfig | null;
  promptText: string;
  analysisTaxonomyVersionId: string;
  notes: string | null;
};

type CreatePagePromptIdentityInput = {
  connectedPageId: string;
  compiledPromptHash: string;
  promptVersion: string;
  compiledPromptText: string;
};

type CreateRunGroupWithRunsInput = {
  runGroupId: string;
  runMode: string;
  requestedWindowStartAt: Date | null;
  requestedWindowEndExclusiveAt: Date | null;
  requestedTargetDate: Date | null;
  frozenConfigVersionId: string;
  frozenTaxonomyVersionId: string;
  frozenCompiledPromptHash: string;
  frozenPromptVersion: string;
  publishIntent: string;
  status: string;
  createdBy: string;
  childRuns: Array<{
    id: string;
    targetDate: string;
    windowStartAt: Date;
    windowEndExclusiveAt: Date;
    requestedWindowStartAt: Date | null;
    requestedWindowEndExclusiveAt: Date | null;
    isFullDay: boolean;
    runMode: string;
    status: string;
    publishState: string;
    publishEligibility: string;
    requestJson: Prisma.InputJsonValue;
    metricsJson: Prisma.InputJsonValue;
    reuseSummaryJson: Prisma.InputJsonValue;
  }>;
};

type PublishRunInput = {
  runId: string;
  publishAs: PublishAs;
  publishedAt: Date;
  supersedeRunIds: string[];
  expectedReplacedRunId: string | null;
};

class ChatExtractorRepository {
  async ensureDefaultTaxonomy(): Promise<AnalysisTaxonomyVersionRecord> {
    const taxonomy = await prisma.analysisTaxonomyVersion.upsert({
      where: {
        versionCode: "default.v1"
      },
      update: {
        taxonomyJson: DEFAULT_ANALYSIS_TAXONOMY,
        isActive: true
      },
      create: {
        versionCode: "default.v1",
        taxonomyJson: DEFAULT_ANALYSIS_TAXONOMY,
        isActive: true
      }
    });

    await prisma.analysisTaxonomyVersion.updateMany({
      where: {
        NOT: {
          id: taxonomy.id
        }
      },
      data: {
        isActive: false
      }
    });

    return mapAnalysisTaxonomyVersion(taxonomy);
  }

  async listConnectedPages(): Promise<ConnectedPageDetailRecord[]> {
    const rows = await prisma.connectedPage.findMany({
      orderBy: [{ pageName: "asc" }],
      include: connectedPageDetailInclude()
    });
    return rows.map(mapConnectedPageDetail);
  }

  async getConnectedPageById(id: string): Promise<ConnectedPageDetailRecord | null> {
    const row = await prisma.connectedPage.findUnique({
      where: { id },
      include: connectedPageDetailInclude()
    });
    return row ? mapConnectedPageDetail(row) : null;
  }

  async getConnectedPageByPancakePageId(pancakePageId: string): Promise<ConnectedPageDetailRecord | null> {
    const row = await prisma.connectedPage.findUnique({
      where: { pancakePageId },
      include: connectedPageDetailInclude()
    });
    return row ? mapConnectedPageDetail(row) : null;
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

  async updateConnectedPageFlags(id: string, input: { etlEnabled?: boolean; analysisEnabled?: boolean }) {
    const row = await prisma.connectedPage.update({
      where: { id },
      data: {
        etlEnabled: input.etlEnabled,
        analysisEnabled: input.analysisEnabled
      }
    });
    return mapConnectedPage(row);
  }

  async getActiveConfigVersion(connectedPageId: string): Promise<PageConfigVersionRecord | null> {
    const page = await prisma.connectedPage.findUnique({
      where: { id: connectedPageId },
      select: { activeConfigVersionId: true }
    });
    if (!page?.activeConfigVersionId) {
      return null;
    }
    return this.getPageConfigVersionById(page.activeConfigVersionId);
  }

  async getPageConfigVersionById(id: string): Promise<PageConfigVersionRecord | null> {
    const row = await prisma.pageConfigVersion.findUnique({
      where: { id },
      include: {
        analysisTaxonomyVersion: true
      }
    });
    return row ? mapPageConfigVersion(row) : null;
  }

  async listPageConfigVersions(connectedPageId: string): Promise<PageConfigVersionRecord[]> {
    const rows = await prisma.pageConfigVersion.findMany({
      where: { connectedPageId },
      orderBy: [{ versionNo: "desc" }],
      include: {
        analysisTaxonomyVersion: true
      }
    });
    return rows.map(mapPageConfigVersion);
  }

  async nextConfigVersionNo(connectedPageId: string) {
    const result = await prisma.pageConfigVersion.aggregate({
      _max: {
        versionNo: true
      },
      where: { connectedPageId }
    });
    return (result._max.versionNo ?? 0) + 1;
  }

  async createPageConfigVersion(input: CreatePageConfigVersionInput) {
    const row = await prisma.pageConfigVersion.create({
      data: {
        connectedPageId: input.connectedPageId,
        versionNo: input.versionNo,
        tagMappingJson: input.tagMappingJson as Prisma.InputJsonValue,
        openingRulesJson: input.openingRulesJson as Prisma.InputJsonValue,
        schedulerJson: input.schedulerJson === null ? Prisma.JsonNull : input.schedulerJson as Prisma.InputJsonValue,
        notificationTargetsJson: input.notificationTargetsJson === null ? Prisma.JsonNull : input.notificationTargetsJson as Prisma.InputJsonValue,
        promptText: input.promptText,
        analysisTaxonomyVersionId: input.analysisTaxonomyVersionId,
        notes: input.notes
      },
      include: {
        analysisTaxonomyVersion: true
      }
    });
    return mapPageConfigVersion(row);
  }

  async activateConfigVersion(connectedPageId: string, configVersionId: string) {
    const row = await prisma.connectedPage.update({
      where: { id: connectedPageId },
      data: {
        activeConfigVersionId: configVersionId
      }
    });
    return mapConnectedPage(row);
  }

  async getPromptIdentityByHash(connectedPageId: string, compiledPromptHash: string): Promise<PagePromptIdentityRecord | null> {
    const row = await prisma.pagePromptIdentity.findUnique({
      where: {
        connectedPageId_compiledPromptHash: {
          connectedPageId,
          compiledPromptHash
        }
      }
    });
    return row ? mapPagePromptIdentity(row) : null;
  }

  async listPromptIdentities(connectedPageId: string): Promise<PagePromptIdentityRecord[]> {
    const rows = await prisma.pagePromptIdentity.findMany({
      where: { connectedPageId },
      orderBy: [{ createdAt: "asc" }]
    });
    return rows.map(mapPagePromptIdentity);
  }

  async createPromptIdentity(input: CreatePagePromptIdentityInput) {
    try {
      const row = await prisma.pagePromptIdentity.create({
        data: {
          connectedPageId: input.connectedPageId,
          compiledPromptHash: input.compiledPromptHash,
          promptVersion: input.promptVersion,
          compiledPromptText: input.compiledPromptText
        }
      });
      return mapPagePromptIdentity(row);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError
        && error.code === "P2002"
      ) {
        const existing = await prisma.pagePromptIdentity.findUnique({
          where: {
            connectedPageId_compiledPromptHash: {
              connectedPageId: input.connectedPageId,
              compiledPromptHash: input.compiledPromptHash
            }
          }
        });
        if (existing) {
          return mapPagePromptIdentity(existing);
        }
      }
      throw error;
    }
  }

  async createRunGroupWithRuns(input: CreateRunGroupWithRunsInput) {
    await prisma.$transaction(async (tx) => {
      await tx.pipelineRunGroup.create({
        data: {
          id: input.runGroupId,
          runMode: input.runMode,
          requestedWindowStartAt: input.requestedWindowStartAt,
          requestedWindowEndExclusiveAt: input.requestedWindowEndExclusiveAt,
          requestedTargetDate: input.requestedTargetDate,
          frozenConfigVersionId: input.frozenConfigVersionId,
          frozenTaxonomyVersionId: input.frozenTaxonomyVersionId,
          frozenCompiledPromptHash: input.frozenCompiledPromptHash,
          frozenPromptVersion: input.frozenPromptVersion,
          publishIntent: input.publishIntent,
          status: input.status,
          createdBy: input.createdBy
        }
      });

      await tx.pipelineRun.createMany({
        data: input.childRuns.map((run) => ({
          id: run.id,
          runGroupId: input.runGroupId,
          targetDate: parseDateOnlyUtc(run.targetDate),
          windowStartAt: run.windowStartAt,
          windowEndExclusiveAt: run.windowEndExclusiveAt,
          requestedWindowStartAt: run.requestedWindowStartAt,
          requestedWindowEndExclusiveAt: run.requestedWindowEndExclusiveAt,
          isFullDay: run.isFullDay,
          runMode: run.runMode,
          status: run.status,
          publishState: run.publishState,
          publishEligibility: run.publishEligibility,
          requestJson: run.requestJson,
          metricsJson: run.metricsJson,
          reuseSummaryJson: run.reuseSummaryJson
        }))
      });
    });
  }

  async refreshRunGroupStatus(runGroupId: string) {
    const runs = await prisma.pipelineRun.findMany({
      where: { runGroupId },
      select: {
        status: true,
        startedAt: true,
        finishedAt: true
      }
    });
    if (runs.length === 0) {
      return;
    }

    const statuses = runs.map((run) => run.status);
    const status = statuses.includes("failed")
      ? "failed"
      : statuses.some((value) => value === "running")
        ? "running"
        : statuses.every((value) => value === "published")
          ? "published"
          : statuses.every((value) => value === "loaded" || value === "published")
            ? "loaded"
            : "queued";

    await prisma.pipelineRunGroup.update({
      where: { id: runGroupId },
      data: {
        status,
        startedAt: runs.find((run) => run.startedAt)?.startedAt ?? null,
        finishedAt: [...runs].reverse().find((run) => run.finishedAt)?.finishedAt ?? null
      }
    });
  }

  async markRunExecutionStarted(runId: string, startedAt = new Date()) {
    await prisma.pipelineRun.update({
      where: { id: runId },
      data: {
        status: "running",
        errorText: null,
        startedAt,
        finishedAt: null
      }
    });
  }

  async abortRunGroupExecution(runGroupId: string, failedRunId: string, errorText: string, finishedAt = new Date()) {
    await prisma.$transaction(async (tx) => {
      await tx.pipelineRun.updateMany({
        where: {
          runGroupId,
          OR: [
            { id: failedRunId },
            { status: "queued" }
          ]
        },
        data: {
          status: "failed",
          errorText,
          finishedAt
        }
      });
    });
  }

  async listRunGroupRuns(runGroupId: string): Promise<PipelineRunRecord[]> {
    const rows = await prisma.pipelineRun.findMany({
      where: { runGroupId },
      orderBy: [{ targetDate: "asc" }, { createdAt: "asc" }],
      include: pipelineRunInclude()
    });
    return rows.map(mapPipelineRun);
  }

  async getRunById(runId: string): Promise<PipelineRunRecord | null> {
    const row = await prisma.pipelineRun.findUnique({
      where: { id: runId },
      include: pipelineRunInclude()
    });
    return row ? mapPipelineRun(row) : null;
  }

  async getRunArtifactCounts(runId: string) {
    const [threadDayCount, messageCount] = await Promise.all([
      prisma.threadDay.count({
        where: {
          pipelineRunId: runId
        }
      }),
      prisma.message.count({
        where: {
          threadDay: {
            pipelineRunId: runId
          }
        }
      })
    ]);

    return {
      threadDayCount,
      messageCount
    };
  }

  async findPublishedRunsForDate(connectedPageId: string, targetDate: string) {
    const rows = await prisma.pipelineRun.findMany({
      where: {
        targetDate: parseDateOnlyUtc(targetDate),
        publishState: {
          in: ["published_provisional", "published_official"]
        },
        runGroup: {
          frozenConfigVersion: {
            connectedPageId
          }
        }
      },
      include: pipelineRunInclude()
    });
    return rows.map(mapPipelineRun);
  }

  async publishRun(input: PublishRunInput) {
    return prisma.$transaction(async (tx) => {
      const publishState = input.publishAs === "official" ? "published_official" : "published_provisional";

      if (input.supersedeRunIds.length > 0) {
        await tx.pipelineRun.updateMany({
          where: {
            id: {
              in: input.supersedeRunIds
            }
          },
          data: {
            publishState: "superseded",
            supersededByRunId: input.runId
          }
        });
      }

      await tx.pipelineRun.update({
        where: {
          id: input.runId
        },
        data: {
          status: "published",
          publishState,
          publishedAt: input.publishedAt,
          supersedesRunId: input.expectedReplacedRunId
        }
      });
    });
  }
}

function connectedPageDetailInclude() {
  return {
    activeConfigVersion: {
      include: {
        analysisTaxonomyVersion: true
      }
    },
    configVersions: {
      include: {
        analysisTaxonomyVersion: true
      },
      orderBy: [{ versionNo: "desc" as const }]
    }
  };
}

function pipelineRunInclude() {
  return {
    runGroup: {
      include: {
        frozenConfigVersion: {
          include: {
            analysisTaxonomyVersion: true,
            connectedPage: true
          }
        }
      }
    }
  };
}

function mapConnectedPage(row: {
  id: string;
  pancakePageId: string;
  pageName: string;
  pancakeUserAccessToken: string;
  businessTimezone: string;
  etlEnabled: boolean;
  analysisEnabled: boolean;
  activeConfigVersionId: string | null;
  createdAt: Date;
  updatedAt: Date;
}): ConnectedPageRecord {
  return {
    id: row.id,
    pancakePageId: row.pancakePageId,
    pageName: row.pageName,
    pancakeUserAccessToken: row.pancakeUserAccessToken,
    businessTimezone: row.businessTimezone,
    etlEnabled: row.etlEnabled,
    analysisEnabled: row.analysisEnabled,
    activeConfigVersionId: row.activeConfigVersionId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

function mapAnalysisTaxonomyVersion(row: {
  id: string;
  versionCode: string;
  taxonomyJson: Prisma.JsonValue;
  isActive: boolean;
  createdAt: Date;
}): AnalysisTaxonomyVersionRecord {
  return {
    id: row.id,
    versionCode: row.versionCode,
    taxonomyJson: row.taxonomyJson,
    isActive: row.isActive,
    createdAt: row.createdAt
  };
}

function mapPageConfigVersion(row: any): PageConfigVersionRecord {
  return {
    id: row.id,
    connectedPageId: row.connectedPageId,
    versionNo: row.versionNo,
    tagMappingJson: row.tagMappingJson as unknown as TagMappingConfig,
    openingRulesJson: row.openingRulesJson as unknown as OpeningRulesConfig,
    schedulerJson: row.schedulerJson as unknown as SchedulerConfig | null,
    notificationTargetsJson: row.notificationTargetsJson as unknown as NotificationTargetsConfig | null,
    promptText: row.promptText,
    analysisTaxonomyVersionId: row.analysisTaxonomyVersionId,
    notes: row.notes,
    createdAt: row.createdAt,
    analysisTaxonomyVersion: mapAnalysisTaxonomyVersion(row.analysisTaxonomyVersion)
  };
}

function mapPagePromptIdentity(row: {
  id: string;
  connectedPageId: string;
  compiledPromptHash: string;
  promptVersion: string;
  compiledPromptText: string;
  createdAt: Date;
}): PagePromptIdentityRecord {
  return {
    id: row.id,
    connectedPageId: row.connectedPageId,
    compiledPromptHash: row.compiledPromptHash,
    promptVersion: row.promptVersion,
    compiledPromptText: row.compiledPromptText,
    createdAt: row.createdAt
  };
}

function mapConnectedPageDetail(row: any): ConnectedPageDetailRecord {
  return {
    page: mapConnectedPage(row),
    activeConfigVersion: row.activeConfigVersion ? mapPageConfigVersion(row.activeConfigVersion) : null,
    configVersions: row.configVersions.map((item: any) => mapPageConfigVersion(item))
  };
}

function mapPipelineRunGroup(row: any): PipelineRunGroupRecord {
  return {
    id: row.id,
    runMode: row.runMode,
    requestedWindowStartAt: row.requestedWindowStartAt,
    requestedWindowEndExclusiveAt: row.requestedWindowEndExclusiveAt,
    requestedTargetDate: row.requestedTargetDate,
    frozenConfigVersionId: row.frozenConfigVersionId,
    frozenTaxonomyVersionId: row.frozenTaxonomyVersionId,
    frozenCompiledPromptHash: row.frozenCompiledPromptHash,
    frozenPromptVersion: row.frozenPromptVersion,
    publishIntent: row.publishIntent,
    status: row.status,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    connectedPage: mapConnectedPage(row.frozenConfigVersion.connectedPage),
    frozenConfigVersion: mapPageConfigVersion(row.frozenConfigVersion)
  };
}

function mapPipelineRun(row: any): PipelineRunRecord {
  return {
    id: row.id,
    runGroupId: row.runGroupId,
    targetDate: row.targetDate,
    windowStartAt: row.windowStartAt,
    windowEndExclusiveAt: row.windowEndExclusiveAt,
    requestedWindowStartAt: row.requestedWindowStartAt,
    requestedWindowEndExclusiveAt: row.requestedWindowEndExclusiveAt,
    isFullDay: row.isFullDay,
    runMode: row.runMode,
    status: row.status,
    publishState: row.publishState,
    publishEligibility: row.publishEligibility,
    supersedesRunId: row.supersedesRunId,
    supersededByRunId: row.supersededByRunId,
    requestJson: row.requestJson,
    metricsJson: row.metricsJson,
    reuseSummaryJson: row.reuseSummaryJson,
    errorText: row.errorText,
    createdAt: row.createdAt,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    publishedAt: row.publishedAt,
    runGroup: mapPipelineRunGroup(row.runGroup)
  };
}

function parseDateOnlyUtc(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

export const chatExtractorRepository = new ChatExtractorRepository();
