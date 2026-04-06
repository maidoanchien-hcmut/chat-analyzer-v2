import { Prisma } from "@prisma/client";
import { AppError } from "../../core/errors.ts";
import { prisma } from "../../infra/prisma.ts";
import {
  DEFAULT_ANALYSIS_TAXONOMY,
  nextPromptVersion
} from "./chat_extractor.artifacts.ts";
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

export type PromptPreviewArtifactRecord = {
  id: string;
  connectedPageId: string;
  analysisTaxonomyVersionId: string;
  analysisTaxonomyVersion: AnalysisTaxonomyVersionRecord;
  compiledPromptHash: string;
  promptVersion: string;
  sampleScopeHash: string;
  sampleTargetDate: Date;
  sampleWindowStartAt: Date;
  sampleWindowEndExclusiveAt: Date;
  sampleConversationId: string;
  customerDisplayName: string | null;
  runtimeMetadataJson: unknown;
  previewResultJson: unknown;
  evidenceBundleJson: unknown;
  fieldExplanationsJson: unknown;
  supportingMessageIdsJson: unknown;
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
  compiledPromptText: string;
};

type CreatePromptPreviewArtifactInput = {
  connectedPageId: string;
  analysisTaxonomyVersionId: string;
  compiledPromptHash: string;
  promptVersion: string;
  sampleScopeHash: string;
  sampleTargetDate: Date;
  sampleWindowStartAt: Date;
  sampleWindowEndExclusiveAt: Date;
  sampleConversationId: string;
  customerDisplayName: string | null;
  runtimeMetadataJson: Prisma.InputJsonValue;
  previewResultJson: Prisma.InputJsonValue;
  evidenceBundleJson: Prisma.InputJsonValue;
  fieldExplanationsJson: Prisma.InputJsonValue;
  supportingMessageIdsJson: Prisma.InputJsonValue;
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
    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id"
        FROM "connected_page"
        WHERE "id" = CAST(${input.connectedPageId} AS uuid)
        FOR UPDATE
      `;

      const existing = await tx.pagePromptIdentity.findUnique({
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

      const versions = await tx.pagePromptIdentity.findMany({
        where: {
          connectedPageId: input.connectedPageId
        },
        select: {
          promptVersion: true
        },
        orderBy: [{ createdAt: "asc" }]
      });
      const promptVersion = nextPromptVersion(versions.map((item) => item.promptVersion));

      try {
        const row = await tx.pagePromptIdentity.create({
          data: {
            connectedPageId: input.connectedPageId,
            compiledPromptHash: input.compiledPromptHash,
            promptVersion,
            compiledPromptText: input.compiledPromptText
          }
        });
        return mapPagePromptIdentity(row);
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError
          && error.code === "P2002"
        ) {
          const concurrent = await tx.pagePromptIdentity.findUnique({
            where: {
              connectedPageId_compiledPromptHash: {
                connectedPageId: input.connectedPageId,
                compiledPromptHash: input.compiledPromptHash
              }
            }
          });
          if (concurrent) {
            return mapPagePromptIdentity(concurrent);
          }
        }
        throw error;
      }
    });
  }

  async getPromptPreviewArtifactById(id: string): Promise<PromptPreviewArtifactRecord | null> {
    const row = await prisma.promptPreviewArtifact.findUnique({
      where: { id },
      include: {
        analysisTaxonomyVersion: true
      }
    });
    return row ? mapPromptPreviewArtifact(row) : null;
  }

  async getPromptPreviewArtifactByIdentity(input: {
    connectedPageId: string;
    analysisTaxonomyVersionId: string;
    compiledPromptHash: string;
    sampleScopeHash: string;
    sampleConversationId: string;
  }): Promise<PromptPreviewArtifactRecord | null> {
    const row = await prisma.promptPreviewArtifact.findUnique({
      where: {
        connectedPageId_analysisTaxonomyVersionId_compiledPromptHash_sampleScopeHash_sampleConversationId: {
          connectedPageId: input.connectedPageId,
          analysisTaxonomyVersionId: input.analysisTaxonomyVersionId,
          compiledPromptHash: input.compiledPromptHash,
          sampleScopeHash: input.sampleScopeHash,
          sampleConversationId: input.sampleConversationId
        }
      },
      include: {
        analysisTaxonomyVersion: true
      }
    });
    return row ? mapPromptPreviewArtifact(row) : null;
  }

  async createPromptPreviewArtifact(input: CreatePromptPreviewArtifactInput) {
    try {
      const row = await prisma.promptPreviewArtifact.create({
        data: {
          connectedPageId: input.connectedPageId,
          analysisTaxonomyVersionId: input.analysisTaxonomyVersionId,
          compiledPromptHash: input.compiledPromptHash,
          promptVersion: input.promptVersion,
          sampleScopeHash: input.sampleScopeHash,
          sampleTargetDate: input.sampleTargetDate,
          sampleWindowStartAt: input.sampleWindowStartAt,
          sampleWindowEndExclusiveAt: input.sampleWindowEndExclusiveAt,
          sampleConversationId: input.sampleConversationId,
          customerDisplayName: input.customerDisplayName,
          runtimeMetadataJson: input.runtimeMetadataJson,
          previewResultJson: input.previewResultJson,
          evidenceBundleJson: input.evidenceBundleJson,
          fieldExplanationsJson: input.fieldExplanationsJson,
          supportingMessageIdsJson: input.supportingMessageIdsJson
        },
        include: {
          analysisTaxonomyVersion: true
        }
      });
      return mapPromptPreviewArtifact(row);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError
        && error.code === "P2002"
      ) {
        const concurrent = await prisma.promptPreviewArtifact.findUnique({
          where: {
            connectedPageId_analysisTaxonomyVersionId_compiledPromptHash_sampleScopeHash_sampleConversationId: {
              connectedPageId: input.connectedPageId,
              analysisTaxonomyVersionId: input.analysisTaxonomyVersionId,
              compiledPromptHash: input.compiledPromptHash,
              sampleScopeHash: input.sampleScopeHash,
              sampleConversationId: input.sampleConversationId
            }
          },
          include: {
            analysisTaxonomyVersion: true
          }
        });
        if (concurrent) {
          return mapPromptPreviewArtifact(concurrent);
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
        startedAt: minDefinedDate(runs.map((run) => run.startedAt)),
        finishedAt: maxDefinedDate(runs.map((run) => run.finishedAt))
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
    const [threadDayCount, messageCount, threadRows] = await Promise.all([
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
      }),
      prisma.threadDay.findMany({
        where: {
          pipelineRunId: runId
        },
        distinct: ["threadId"],
        orderBy: [{ threadId: "asc" }],
        select: {
          threadId: true
        }
      })
    ]);

    return {
      threadCount: threadRows.length,
      threadDayCount,
      messageCount,
      coveredThreadIds: threadRows.map((row) => row.threadId)
    };
  }

  async findPublishedRunsForDate(connectedPageId: string, targetDate: string) {
    const targetDateKey = Number(targetDate.replace(/-/g, ""));
    const rows = await prisma.activePublishSnapshot.findMany({
      where: {
        connectedPageId,
        targetDateKey
      },
      include: {
        pipelineRun: {
          include: pipelineRunInclude()
        }
      }
    });
    return rows.map((row) => mapPipelineRun(row.pipelineRun));
  }

  async publishRun(input: PublishRunInput) {
    return prisma.$transaction(async (tx) => {
      const publishState = input.publishAs === "official" ? "published_official" : "published_provisional";
      const run = await tx.pipelineRun.findUnique({
        where: { id: input.runId },
        select: {
          id: true,
          targetDate: true,
          windowStartAt: true,
          windowEndExclusiveAt: true,
          isFullDay: true,
          runGroup: {
            select: {
              frozenConfigVersionId: true,
              frozenTaxonomyVersionId: true,
              frozenCompiledPromptHash: true,
              frozenPromptVersion: true,
              frozenConfigVersion: {
                select: {
                  versionNo: true,
                  connectedPage: {
                    select: {
                      id: true
                    }
                  },
                  analysisTaxonomyVersion: {
                    select: {
                      versionCode: true
                    }
                  }
                }
              }
            }
          }
        }
      });
      if (!run) {
        throw new AppError(404, "CHAT_EXTRACTOR_RUN_NOT_FOUND", `Run ${input.runId} không tồn tại.`);
      }

      const [factThreadDayCount, pageDimension] = await Promise.all([
        tx.factThreadDay.count({
          where: { pipelineRunId: input.runId }
        }),
        tx.dimPage.findUnique({
          where: {
            connectedPageId: run.runGroup.frozenConfigVersion.connectedPage.id
          },
          select: {
            id: true
          }
        })
      ]);
      if (factThreadDayCount === 0 || !pageDimension) {
        throw new AppError(409, "CHAT_EXTRACTOR_MART_NOT_READY", "Run chưa có semantic mart materialized nên không được publish.");
      }

      const targetDateKey = Number(run.targetDate.toISOString().slice(0, 10).replace(/-/g, ""));

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
        await tx.activePublishSnapshot.deleteMany({
          where: {
            pipelineRunId: {
              in: input.supersedeRunIds
            }
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

      await tx.activePublishSnapshot.upsert({
        where: {
          connectedPageId_targetDateKey_publishChannel: {
            connectedPageId: run.runGroup.frozenConfigVersion.connectedPage.id,
            targetDateKey,
            publishChannel: input.publishAs
          }
        },
        update: {
          pageKey: pageDimension.id,
          pipelineRunId: input.runId,
          configVersionId: run.runGroup.frozenConfigVersionId,
          taxonomyVersionId: run.runGroup.frozenTaxonomyVersionId,
          promptHash: run.runGroup.frozenCompiledPromptHash,
          promptVersion: run.runGroup.frozenPromptVersion,
          taxonomyVersionCode: run.runGroup.frozenConfigVersion.analysisTaxonomyVersion.versionCode,
          windowStartAt: run.windowStartAt,
          windowEndExclusiveAt: run.windowEndExclusiveAt,
          isFullDay: run.isFullDay,
          publishedAt: input.publishedAt
        },
        create: {
          connectedPageId: run.runGroup.frozenConfigVersion.connectedPage.id,
          pageKey: pageDimension.id,
          targetDateKey,
          publishChannel: input.publishAs,
          pipelineRunId: input.runId,
          configVersionId: run.runGroup.frozenConfigVersionId,
          taxonomyVersionId: run.runGroup.frozenTaxonomyVersionId,
          promptHash: run.runGroup.frozenCompiledPromptHash,
          promptVersion: run.runGroup.frozenPromptVersion,
          taxonomyVersionCode: run.runGroup.frozenConfigVersion.analysisTaxonomyVersion.versionCode,
          windowStartAt: run.windowStartAt,
          windowEndExclusiveAt: run.windowEndExclusiveAt,
          isFullDay: run.isFullDay,
          publishedAt: input.publishedAt
        }
      });

      await tx.publishHistory.create({
        data: {
          connectedPageId: run.runGroup.frozenConfigVersion.connectedPage.id,
          pageKey: pageDimension.id,
          targetDateKey,
          publishChannel: input.publishAs,
          pipelineRunId: input.runId,
          configVersionId: run.runGroup.frozenConfigVersionId,
          taxonomyVersionId: run.runGroup.frozenTaxonomyVersionId,
          promptHash: run.runGroup.frozenCompiledPromptHash,
          promptVersion: run.runGroup.frozenPromptVersion,
          taxonomyVersionCode: run.runGroup.frozenConfigVersion.analysisTaxonomyVersion.versionCode,
          windowStartAt: run.windowStartAt,
          windowEndExclusiveAt: run.windowEndExclusiveAt,
          isFullDay: run.isFullDay,
          publishedAt: input.publishedAt,
          replacedRunIdsJson: input.supersedeRunIds as Prisma.InputJsonValue
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

function mapPromptPreviewArtifact(row: {
  id: string;
  connectedPageId: string;
  analysisTaxonomyVersionId: string;
  analysisTaxonomyVersion: {
    id: string;
    versionCode: string;
    taxonomyJson: Prisma.JsonValue;
    isActive: boolean;
    createdAt: Date;
  };
  compiledPromptHash: string;
  promptVersion: string;
  sampleScopeHash: string;
  sampleTargetDate: Date;
  sampleWindowStartAt: Date;
  sampleWindowEndExclusiveAt: Date;
  sampleConversationId: string;
  customerDisplayName: string | null;
  runtimeMetadataJson: Prisma.JsonValue;
  previewResultJson: Prisma.JsonValue;
  evidenceBundleJson: Prisma.JsonValue;
  fieldExplanationsJson: Prisma.JsonValue;
  supportingMessageIdsJson: Prisma.JsonValue;
  createdAt: Date;
}): PromptPreviewArtifactRecord {
  return {
    id: row.id,
    connectedPageId: row.connectedPageId,
    analysisTaxonomyVersionId: row.analysisTaxonomyVersionId,
    analysisTaxonomyVersion: mapAnalysisTaxonomyVersion(row.analysisTaxonomyVersion),
    compiledPromptHash: row.compiledPromptHash,
    promptVersion: row.promptVersion,
    sampleScopeHash: row.sampleScopeHash,
    sampleTargetDate: row.sampleTargetDate,
    sampleWindowStartAt: row.sampleWindowStartAt,
    sampleWindowEndExclusiveAt: row.sampleWindowEndExclusiveAt,
    sampleConversationId: row.sampleConversationId,
    customerDisplayName: row.customerDisplayName,
    runtimeMetadataJson: row.runtimeMetadataJson,
    previewResultJson: row.previewResultJson,
    evidenceBundleJson: row.evidenceBundleJson,
    fieldExplanationsJson: row.fieldExplanationsJson,
    supportingMessageIdsJson: row.supportingMessageIdsJson,
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

function minDefinedDate(values: Array<Date | null>) {
  let result: Date | null = null;
  for (const value of values) {
    if (!value) {
      continue;
    }
    if (result === null || value < result) {
      result = value;
    }
  }
  return result;
}

function maxDefinedDate(values: Array<Date | null>) {
  let result: Date | null = null;
  for (const value of values) {
    if (!value) {
      continue;
    }
    if (result === null || value > result) {
      result = value;
    }
  }
  return result;
}

export const chatExtractorRepository = new ChatExtractorRepository();
