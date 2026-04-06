import type { Prisma } from "@prisma/client";
import { prisma } from "../../infra/prisma.ts";
import { cloneJson } from "../analysis/analysis.artifacts.ts";
import type {
  MartMaterialization,
  MartMaterializationSource,
  ReadModelFilterInput,
  ResolvedSnapshotRow
} from "./read_models.types.ts";

class ReadModelsRepository {
  async getMaterializationSource(pipelineRunId: string): Promise<MartMaterializationSource | null> {
    const row = await prisma.pipelineRun.findUnique({
      where: { id: pipelineRunId },
      select: {
        id: true,
        targetDate: true,
        windowStartAt: true,
        windowEndExclusiveAt: true,
        isFullDay: true,
        publishEligibility: true,
        runGroup: {
          select: {
            id: true,
            frozenConfigVersionId: true,
            frozenTaxonomyVersionId: true,
            frozenCompiledPromptHash: true,
            frozenPromptVersion: true,
            frozenConfigVersion: {
              select: {
                id: true,
                versionNo: true,
                promptText: true,
                connectedPage: {
                  select: {
                    id: true,
                    pageName: true,
                    pancakePageId: true,
                    businessTimezone: true
                  }
                },
                analysisTaxonomyVersion: {
                  select: {
                    id: true,
                    versionCode: true,
                    taxonomyJson: true
                  }
                }
              }
            }
          }
        },
        analysisRuns: {
          where: { status: "completed" },
          orderBy: [{ createdAt: "desc" }],
          take: 1,
          select: {
            id: true,
            status: true,
            modelName: true,
            promptHash: true,
            promptVersion: true,
            outputSchemaVersion: true,
            createdAt: true,
            analysisResults: {
              where: {
                resultStatus: {
                  in: ["succeeded", "unknown"]
                }
              },
              select: {
                threadDayId: true,
                promptHash: true,
                resultStatus: true,
                openingThemeCode: true,
                openingThemeReason: true,
                customerMoodCode: true,
                primaryNeedCode: true,
                primaryTopicCode: true,
                journeyCode: true,
                closingOutcomeInferenceCode: true,
                processRiskLevelCode: true,
                processRiskReasonText: true,
                staffAssessmentsJson: true,
                fieldExplanationsJson: true,
                costMicros: true
              }
            }
          }
        },
        threadDays: {
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          select: {
            id: true,
            threadId: true,
            isNewInbox: true,
            entrySourceType: true,
            entryPostId: true,
            entryAdId: true,
            messageCount: true,
            firstStaffResponseSeconds: true,
            avgStaffResponseSeconds: true,
            staffParticipantsJson: true,
            staffMessageStatsJson: true,
            explicitRevisitSignal: true,
            firstMeaningfulMessageTextRedacted: true
          }
        }
      }
    });

    return row ? { pipelineRun: row } : null;
  }

  async replaceMartForRun(materialization: MartMaterialization): Promise<void> {
    await prisma.$transaction(async (tx) => {
      await tx.dimDate.upsert({
        where: { dateKey: materialization.dimDate.dateKey },
        update: {
          fullDate: materialization.dimDate.fullDate,
          dayOfWeek: materialization.dimDate.dayOfWeek,
          monthNo: materialization.dimDate.monthNo,
          yearNo: materialization.dimDate.yearNo
        },
        create: {
          dateKey: materialization.dimDate.dateKey,
          fullDate: materialization.dimDate.fullDate,
          dayOfWeek: materialization.dimDate.dayOfWeek,
          monthNo: materialization.dimDate.monthNo,
          yearNo: materialization.dimDate.yearNo
        }
      });

      const page = await tx.dimPage.upsert({
        where: {
          connectedPageId: materialization.dimPage.connectedPageId
        },
        update: {
          pageName: materialization.dimPage.pageName,
          pancakePageId: materialization.dimPage.pancakePageId,
          businessTimezone: materialization.dimPage.businessTimezone
        },
        create: {
          connectedPageId: materialization.dimPage.connectedPageId,
          pageName: materialization.dimPage.pageName,
          pancakePageId: materialization.dimPage.pancakePageId,
          businessTimezone: materialization.dimPage.businessTimezone
        }
      });

      const staffKeyByName = new Map<string, string>();
      for (const staff of materialization.dimStaff) {
        const row = await tx.dimStaff.upsert({
          where: {
            connectedPageId_staffName: {
              connectedPageId: staff.connectedPageId,
              staffName: staff.staffName
            }
          },
          update: {
            displayLabel: staff.displayLabel
          },
          create: {
            connectedPageId: staff.connectedPageId,
            staffName: staff.staffName,
            displayLabel: staff.displayLabel
          }
        });
        staffKeyByName.set(staff.staffName, row.id);
      }

      await tx.factStaffThreadDay.deleteMany({
        where: { pipelineRunId: materialization.pipelineRunId }
      });
      await tx.factThreadDay.deleteMany({
        where: { pipelineRunId: materialization.pipelineRunId }
      });

      if (materialization.factThreadDays.length > 0) {
        await tx.factThreadDay.createMany({
          data: materialization.factThreadDays.map((row) => ({
            pipelineRunId: row.pipelineRunId,
            analysisRunId: row.analysisRunId,
            configVersionId: row.configVersionId,
            taxonomyVersionId: row.taxonomyVersionId,
            dateKey: row.dateKey,
            pageKey: page.id,
            threadDayId: row.threadDayId,
            threadId: row.threadId,
            isNewInbox: row.isNewInbox,
            officialRevisitLabel: row.officialRevisitLabel,
            openingThemeCode: row.openingThemeCode,
            primaryNeedCode: row.primaryNeedCode,
            primaryTopicCode: row.primaryTopicCode,
            officialClosingOutcomeCode: row.officialClosingOutcomeCode,
            customerMoodCode: row.customerMoodCode,
            processRiskLevelCode: row.processRiskLevelCode,
            entrySourceType: row.entrySourceType,
            entryPostId: row.entryPostId,
            entryAdId: row.entryAdId,
            threadCount: row.threadCount,
            messageCount: row.messageCount,
            firstStaffResponseSeconds: row.firstStaffResponseSeconds,
            avgStaffResponseSeconds: row.avgStaffResponseSeconds,
            aiCostMicros: row.aiCostMicros,
            promptHash: row.promptHash,
            promptVersion: row.promptVersion,
            modelName: row.modelName,
            outputSchemaVersion: row.outputSchemaVersion,
            taxonomyVersionCode: row.taxonomyVersionCode,
            analysisExplanationJson: row.analysisExplanationJson as Prisma.InputJsonValue,
            firstMeaningfulMessageTextRedacted: row.firstMeaningfulMessageTextRedacted
          }))
        });
      }

      if (materialization.factStaffThreadDays.length > 0) {
        await tx.factStaffThreadDay.createMany({
          data: materialization.factStaffThreadDays
            .map((row) => {
              const staffKey = staffKeyByName.get(row.staffName);
              if (!staffKey) {
                return null;
              }
              return {
                pipelineRunId: row.pipelineRunId,
                analysisRunId: row.analysisRunId,
                configVersionId: row.configVersionId,
                taxonomyVersionId: row.taxonomyVersionId,
                dateKey: row.dateKey,
                pageKey: page.id,
                staffKey,
                threadDayId: row.threadDayId,
                threadId: row.threadId,
                primaryNeedCode: row.primaryNeedCode,
                processRiskLevelCode: row.processRiskLevelCode,
                responseQualityCode: row.responseQualityCode,
                staffMessageCount: row.staffMessageCount,
                staffFirstResponseSecondsIfOwner: row.staffFirstResponseSecondsIfOwner,
                aiCostAllocatedMicros: row.aiCostAllocatedMicros,
                responseQualityIssueText: row.responseQualityIssueText,
                responseQualityImprovementText: row.responseQualityImprovementText,
                promptHash: row.promptHash,
                promptVersion: row.promptVersion,
                modelName: row.modelName,
                outputSchemaVersion: row.outputSchemaVersion,
                taxonomyVersionCode: row.taxonomyVersionCode
              };
            })
            .filter((row): row is NonNullable<typeof row> => row !== null)
        });
      }

      const run = await tx.pipelineRun.findUniqueOrThrow({
        where: { id: materialization.pipelineRunId },
        select: { metricsJson: true }
      });
      const metrics = isRecord(run.metricsJson) ? cloneJson(run.metricsJson) : {};
      await tx.pipelineRun.update({
        where: { id: materialization.pipelineRunId },
        data: {
          metricsJson: {
            ...metrics,
            semantic_mart: {
              materialized: true,
              analysis_run_id: materialization.analysisRunId,
              fact_thread_day_count: materialization.factThreadDays.length,
              fact_staff_thread_day_count: materialization.factStaffThreadDays.length,
              prompt_hash: materialization.promptHash,
              prompt_version: materialization.promptVersion,
              config_version_id: materialization.configVersionId,
              config_version_no: materialization.configVersionNo,
              taxonomy_version_id: materialization.taxonomyVersionId,
              taxonomy_version_code: materialization.taxonomyVersionCode
            }
          } as Prisma.InputJsonValue
        }
      });
    });
  }

  async listConnectedPagesForCatalog() {
    return prisma.connectedPage.findMany({
      orderBy: [{ pageName: "asc" }],
      select: {
        id: true,
        pageName: true,
        pancakePageId: true,
        businessTimezone: true
      }
    });
  }

  async listDistinctCatalogCodes() {
    const [needs, outcomes, risks] = await Promise.all([
      prisma.factThreadDay.findMany({
        distinct: ["primaryNeedCode"],
        select: { primaryNeedCode: true },
        orderBy: [{ primaryNeedCode: "asc" }]
      }),
      prisma.factThreadDay.findMany({
        distinct: ["officialClosingOutcomeCode"],
        select: { officialClosingOutcomeCode: true },
        orderBy: [{ officialClosingOutcomeCode: "asc" }]
      }),
      prisma.factThreadDay.findMany({
        distinct: ["processRiskLevelCode"],
        select: { processRiskLevelCode: true },
        orderBy: [{ processRiskLevelCode: "asc" }]
      })
    ]);

    return {
      needs: needs.map((row) => row.primaryNeedCode),
      outcomes: outcomes.map((row) => row.officialClosingOutcomeCode),
      risks: risks.map((row) => row.processRiskLevelCode)
    };
  }

  async listStaffCatalog() {
    return prisma.dimStaff.findMany({
      orderBy: [{ displayLabel: "asc" }],
      select: {
        staffName: true,
        displayLabel: true
      }
    });
  }

  async listSnapshotsForPageRange(input: { pageId: string; startDate: string; endDate: string }) {
    return prisma.activePublishSnapshot.findMany({
      where: {
        connectedPageId: input.pageId,
        targetDate: {
          is: {
            fullDate: {
              gte: parseDateOnlyUtc(input.startDate),
              lte: parseDateOnlyUtc(input.endDate)
            }
          }
        }
      },
      orderBy: [{ targetDateKey: "asc" }, { publishedAt: "desc" }],
      select: {
        pipelineRunId: true,
        connectedPageId: true,
        publishChannel: true,
        promptHash: true,
        promptVersion: true,
        configVersionId: true,
        taxonomyVersionId: true,
        taxonomyVersionCode: true,
        windowStartAt: true,
        windowEndExclusiveAt: true,
        isFullDay: true,
        publishedAt: true,
        page: {
          select: {
            pageName: true,
            pancakePageId: true,
            businessTimezone: true
          }
        },
        targetDate: {
          select: {
            fullDate: true
          }
        },
        configVersion: {
          select: {
            versionNo: true
          }
        },
        taxonomyVersion: {
          select: {
            taxonomyJson: true
          }
        }
      }
    }).then((rows) => rows.map(mapResolvedSnapshot));
  }

  async listFactThreadDaysByRunIds(pipelineRunIds: string[], filters: ReadModelFilterInput) {
    if (pipelineRunIds.length === 0) {
      return [];
    }
    return prisma.factThreadDay.findMany({
      where: {
        pipelineRunId: { in: pipelineRunIds },
        ...(filters.inboxBucket === "new" ? { isNewInbox: true } : {}),
        ...(filters.inboxBucket === "old" ? { isNewInbox: false } : {}),
        ...(filters.revisit === "revisit" ? { officialRevisitLabel: "revisit" } : {}),
        ...(filters.revisit === "not_revisit" ? { officialRevisitLabel: "not_revisit" } : {}),
        ...(filters.need !== "all" ? { primaryNeedCode: filters.need } : {}),
        ...(filters.outcome !== "all" ? { officialClosingOutcomeCode: filters.outcome } : {}),
        ...(filters.risk !== "all" ? { processRiskLevelCode: filters.risk } : {})
      },
      orderBy: [{ dateKey: "asc" }, { createdAt: "asc" }],
      select: {
        pipelineRunId: true,
        threadDayId: true,
        threadId: true,
        isNewInbox: true,
        officialRevisitLabel: true,
        openingThemeCode: true,
        primaryNeedCode: true,
        primaryTopicCode: true,
        officialClosingOutcomeCode: true,
        customerMoodCode: true,
        processRiskLevelCode: true,
        entrySourceType: true,
        entryPostId: true,
        entryAdId: true,
        threadCount: true,
        messageCount: true,
        firstStaffResponseSeconds: true,
        avgStaffResponseSeconds: true,
        aiCostMicros: true,
        taxonomyVersionCode: true,
        firstMeaningfulMessageTextRedacted: true,
        date: {
          select: {
            fullDate: true
          }
        },
        page: {
          select: {
            connectedPageId: true,
            pageName: true
          }
        }
      }
    });
  }

  async listFactStaffThreadDaysByRunIds(pipelineRunIds: string[], filters: ReadModelFilterInput) {
    if (pipelineRunIds.length === 0) {
      return [];
    }
    return prisma.factStaffThreadDay.findMany({
      where: {
        pipelineRunId: { in: pipelineRunIds },
        ...(filters.need !== "all" ? { primaryNeedCode: filters.need } : {}),
        ...(filters.risk !== "all" ? { processRiskLevelCode: filters.risk } : {}),
        ...(filters.staff !== "all" ? { staff: { is: { staffName: filters.staff } } } : {})
      },
      orderBy: [{ dateKey: "asc" }, { createdAt: "asc" }],
      select: {
        pipelineRunId: true,
        threadDayId: true,
        threadId: true,
        primaryNeedCode: true,
        processRiskLevelCode: true,
        responseQualityCode: true,
        staffMessageCount: true,
        staffFirstResponseSecondsIfOwner: true,
        aiCostAllocatedMicros: true,
        responseQualityIssueText: true,
        responseQualityImprovementText: true,
        taxonomyVersionCode: true,
        date: {
          select: {
            fullDate: true
          }
        },
        page: {
          select: {
            connectedPageId: true,
            pageName: true
          }
        },
        staff: {
          select: {
            staffName: true,
            displayLabel: true
          }
        }
      }
    });
  }

  async getRunDraftSummary(runId: string) {
    const [run, threadFactCount, staffFactCount] = await Promise.all([
      prisma.pipelineRun.findUnique({
        where: { id: runId },
        select: {
          id: true,
          targetDate: true,
          windowStartAt: true,
          windowEndExclusiveAt: true,
          isFullDay: true,
          publishState: true,
          publishEligibility: true,
          status: true,
          runGroup: {
            select: {
              frozenPromptVersion: true,
              frozenCompiledPromptHash: true,
              frozenConfigVersion: {
                select: {
                  versionNo: true,
                  connectedPage: {
                    select: {
                      id: true,
                      pageName: true,
                      businessTimezone: true
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
      }),
      prisma.factThreadDay.count({ where: { pipelineRunId: runId } }),
      prisma.factStaffThreadDay.count({ where: { pipelineRunId: runId } })
    ]);

    if (!run) {
      return null;
    }

    return {
      run,
      threadFactCount,
      staffFactCount
    };
  }

  async listThreadSummaries(threadIds: string[], pipelineRunIds: string[]) {
    if (threadIds.length === 0 || pipelineRunIds.length === 0) {
      return [];
    }
    return prisma.threadDay.findMany({
      where: {
        pipelineRunId: { in: pipelineRunIds },
        threadId: { in: threadIds }
      },
      orderBy: [{ createdAt: "desc" }],
      select: {
        threadId: true,
        firstMeaningfulMessageTextRedacted: true,
        pipelineRun: {
          select: {
            targetDate: true
          }
        },
        thread: {
          select: {
            customerDisplayName: true
          }
        }
      }
    });
  }

  async getThreadWorkspace(threadId: string, pipelineRunIds: string[]) {
    return prisma.thread.findUnique({
      where: { id: threadId },
      select: {
        id: true,
        customerDisplayName: true,
        customerLink: {
          select: {
            customerId: true,
            mappingMethod: true,
            mappingConfidenceScore: true
          }
        },
        linkDecisions: {
          orderBy: [{ createdAt: "desc" }],
          take: 10,
          select: {
            decisionSource: true,
            decisionStatus: true,
            selectedCustomerId: true,
            createdAt: true
          }
        },
        threadDays: {
          where: {
            pipelineRunId: { in: pipelineRunIds }
          },
          orderBy: [{ createdAt: "desc" }],
          select: {
            id: true,
            firstMeaningfulMessageId: true,
            firstMeaningfulMessageTextRedacted: true,
            normalizedTagSignalsJson: true,
            openingBlockJson: true,
            explicitRevisitSignal: true,
            explicitNeedSignal: true,
            explicitOutcomeSignal: true,
            sourceThreadJsonRedacted: true,
            pipelineRun: {
              select: {
                targetDate: true
              }
            },
            messages: {
              orderBy: [{ insertedAt: "asc" }, { id: "asc" }],
              select: {
                id: true,
                insertedAt: true,
                senderRole: true,
                senderName: true,
                redactedText: true
              }
            },
            analysisResults: {
              where: {
                analysisRun: {
                  pipelineRunId: { in: pipelineRunIds }
                }
              },
              orderBy: [{ createdAt: "desc" }],
              take: 1,
              select: {
                openingThemeCode: true,
                primaryNeedCode: true,
                primaryTopicCode: true,
                journeyCode: true,
                openingThemeReason: true,
                closingOutcomeInferenceCode: true,
                customerMoodCode: true,
                processRiskLevelCode: true,
                processRiskReasonText: true,
                staffAssessmentsJson: true,
                evidenceUsedJson: true,
                fieldExplanationsJson: true,
                supportingMessageIdsJson: true,
                costMicros: true,
                analysisRun: {
                  select: {
                    modelName: true,
                    promptVersion: true,
                    promptHash: true,
                    taxonomyVersion: {
                      select: {
                        versionCode: true
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    });
  }
}

function parseDateOnlyUtc(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function isRecord(value: Prisma.JsonValue | null | undefined): value is Prisma.JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function mapResolvedSnapshot(row: {
  pipelineRunId: string;
  connectedPageId: string;
  publishChannel: string;
  promptHash: string;
  promptVersion: string;
  configVersionId: string;
  taxonomyVersionId: string;
  taxonomyVersionCode: string;
  windowStartAt: Date;
  windowEndExclusiveAt: Date;
  isFullDay: boolean;
  publishedAt: Date;
  page: {
    pageName: string;
    pancakePageId: string;
    businessTimezone: string;
  };
  targetDate: {
    fullDate: Date;
  };
  configVersion: {
    versionNo: number;
  };
  taxonomyVersion: {
    taxonomyJson: Prisma.JsonValue;
  };
}): ResolvedSnapshotRow {
  return {
    pipelineRunId: row.pipelineRunId,
    connectedPageId: row.connectedPageId,
    pageName: row.page.pageName,
    pancakePageId: row.page.pancakePageId,
    businessTimezone: row.page.businessTimezone,
    targetDate: row.targetDate.fullDate.toISOString().slice(0, 10),
    publishChannel: row.publishChannel as ResolvedSnapshotRow["publishChannel"],
    promptHash: row.promptHash,
    promptVersion: row.promptVersion,
    configVersionId: row.configVersionId,
    configVersionNo: row.configVersion.versionNo,
    taxonomyVersionId: row.taxonomyVersionId,
    taxonomyVersionCode: row.taxonomyVersionCode,
    taxonomyJson: row.taxonomyVersion.taxonomyJson,
    windowStartAt: row.windowStartAt,
    windowEndExclusiveAt: row.windowEndExclusiveAt,
    isFullDay: row.isFullDay,
    publishedAt: row.publishedAt
  };
}

export const readModelsRepository = new ReadModelsRepository();
