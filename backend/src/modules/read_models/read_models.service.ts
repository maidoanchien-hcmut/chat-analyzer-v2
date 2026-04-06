import { AppError } from "../../core/errors.ts";
import { formatDateInTimezone } from "../chat_extractor/chat_extractor.planner.ts";
import { buildHealthSummary } from "./read_models.health.ts";
import { buildMartMaterialization } from "./read_models.builder.ts";
import { resolveBusinessLabel } from "./read_models.labels.ts";
import { readModelsRepository } from "./read_models.repository.ts";
import { buildThreadHistoryView, resolveActiveThreadId } from "./read_models.thread_history.ts";
import type {
  ExportWorkbookRequest,
  ExplorationQueryInput,
  ExplorationBreakdownKey,
  ExplorationCompareKey,
  ExplorationMetricKey,
  ReadModelFilterInput,
  ResolvedSnapshotRow,
  SliceResolution,
  WarningView
} from "./read_models.types.ts";

type MetricCard = {
  label: string;
  value: string;
  delta: string;
  hint: string;
};

type SimpleBreakdown = {
  label: string;
  value: string;
  share: string;
  drillFilter?: Partial<ReadModelFilterInput>;
};

type ThreadFactRow = Awaited<ReturnType<typeof readModelsRepository.listFactThreadDaysByRunIds>>[number];
type StaffFactRow = Awaited<ReturnType<typeof readModelsRepository.listFactStaffThreadDaysByRunIds>>[number];

class ReadModelsService {
  async materializeRun(pipelineRunId: string) {
    const source = await readModelsRepository.getMaterializationSource(pipelineRunId);
    if (!source) {
      throw new AppError(404, "READ_MODELS_RUN_NOT_FOUND", `Pipeline run ${pipelineRunId} không tồn tại.`);
    }
    if (source.pipelineRun.analysisRuns.length === 0) {
      throw new AppError(409, "READ_MODELS_ANALYSIS_REQUIRED", `Pipeline run ${pipelineRunId} chưa có analysis_run completed để materialize mart.`);
    }

    const materialization = buildMartMaterialization(source);
    await readModelsRepository.replaceMartForRun(materialization);

    return {
      pipelineRunId,
      analysisRunId: materialization.analysisRunId,
      factThreadDayCount: materialization.factThreadDays.length,
      factStaffThreadDayCount: materialization.factStaffThreadDays.length,
      promptHash: materialization.promptHash,
      promptVersion: materialization.promptVersion,
      configVersionId: materialization.configVersionId,
      configVersionNo: materialization.configVersionNo,
      taxonomyVersionId: materialization.taxonomyVersionId,
      taxonomyVersionCode: materialization.taxonomyVersionCode
    };
  }

  async loadCatalog() {
    const [pages, codes, staffRows] = await Promise.all([
      readModelsRepository.listConnectedPagesForCatalog(),
      readModelsRepository.listDistinctCatalogCodes(),
      readModelsRepository.listStaffCatalog()
    ]);

    return {
      pages: pages.map((page) => ({
        id: page.id,
        label: page.pageName,
        pancakePageId: page.pancakePageId,
        timezone: page.businessTimezone
      })),
      needs: buildOptions(codes.needs.map((code) => ({
        value: code,
        label: resolveBusinessLabel(null, "primary_need", code)
      })), "Tất cả nhu cầu"),
      outcomes: buildOptions(codes.outcomes.map((code) => ({
        value: code,
        label: resolveBusinessLabel(null, "closing_outcome", code)
      })), "Tất cả outcome"),
      risks: buildOptions(codes.risks.map((code) => ({
        value: code,
        label: resolveBusinessLabel(null, "process_risk_level", code)
      })), "Tất cả rủi ro"),
      staff: buildOptions(staffRows.map((row) => ({
        value: row.staffName,
        label: row.displayLabel
      })), "Tất cả nhân viên")
    };
  }

  async getOverview(filters: ReadModelFilterInput) {
    const slice = await this.resolveSlice(filters);
    const threadFacts = await this.listFilteredThreadFacts(
      slice.snapshots.map((item) => item.pipelineRunId),
      filters
    );
    const previousThreadFacts = await this.listPreviousThreadFacts(filters);
    const taxonomyJson = slice.snapshots[0]?.taxonomyJson ?? null;

    const totalThreads = sum(threadFacts.map((row) => row.threadCount));
    const newThreads = threadFacts.filter((row) => row.isNewInbox).length;
    const revisitThreads = threadFacts.filter((row) => row.officialRevisitLabel === "revisit").length;
    const bookedThreads = threadFacts.filter((row) => row.officialClosingOutcomeCode === "booked").length;
    const highRiskThreads = threadFacts.filter((row) => row.processRiskLevelCode === "high").length;
    const totalAiCostMicros = sumBigInt(threadFacts.map((row) => row.aiCostMicros));
    const medianFirstResponseSeconds = median(
      threadFacts.map((row) => row.firstStaffResponseSeconds).filter((value): value is number => typeof value === "number")
    );
    const previousTotalThreads = sum(previousThreadFacts.map((row) => row.threadCount));
    const previousNewThreads = previousThreadFacts.filter((row) => row.isNewInbox).length;
    const previousRevisitThreads = previousThreadFacts.filter((row) => row.officialRevisitLabel === "revisit").length;
    const previousBookedThreads = previousThreadFacts.filter((row) => row.officialClosingOutcomeCode === "booked").length;
    const previousHighRiskThreads = previousThreadFacts.filter((row) => row.processRiskLevelCode === "high").length;
    const previousAiCostMicros = sumBigInt(previousThreadFacts.map((row) => row.aiCostMicros));
    const previousMedianFirstResponseSeconds = median(
      previousThreadFacts.map((row) => row.firstStaffResponseSeconds).filter((value): value is number => typeof value === "number")
    );

    return {
      pageLabel: slice.pageName,
      snapshot: slice.snapshot,
      warning: slice.warning,
      metrics: [
        metricCard("Tổng inbox", totalThreads, "Số thread trong slice đã publish.", formatCountDelta(totalThreads, previousTotalThreads)),
        metricCard("Inbox mới", newThreads, "Deterministic theo thread_first_seen_at.", formatCountDelta(newThreads, previousNewThreads)),
        metricCard("Inbox tái khám", revisitThreads, "Official revisit label từ mart.", formatCountDelta(revisitThreads, previousRevisitThreads)),
        metricRateCard(
          "Tỷ lệ chốt hẹn",
          bookedThreads,
          totalThreads,
          "official_closing_outcome = booked.",
          formatRateDelta(bookedThreads, totalThreads, previousBookedThreads, previousTotalThreads)
        ),
        metricCard("Risk cao", highRiskThreads, "Thread cần ưu tiên kiểm tra.", formatCountDelta(highRiskThreads, previousHighRiskThreads)),
        metricMoneyCard("Chi phí AI", totalAiCostMicros, "Tổng AI cost từ fact_thread_day.", formatMoneyDelta(totalAiCostMicros, previousAiCostMicros)),
        metricDurationCard(
          "Phản hồi đầu tiên",
          medianFirstResponseSeconds,
          "Median first_staff_response_seconds.",
          formatDurationDelta(medianFirstResponseSeconds, previousMedianFirstResponseSeconds)
        )
      ],
      openingNew: buildBreakdown(
        groupCounts(threadFacts.filter((row) => row.isNewInbox), (row) => row.openingThemeCode),
        totalBy(threadFacts, (row) => row.isNewInbox),
        taxonomyJson,
        "opening_theme"
      ),
      openingRevisit: buildBreakdown(
        groupCounts(threadFacts.filter((row) => row.officialRevisitLabel === "revisit"), (row) => row.openingThemeCode),
        revisitThreads,
        taxonomyJson,
        "opening_theme"
      ),
      needs: buildBreakdown(
        groupCounts(threadFacts, (row) => row.primaryNeedCode),
        totalThreads,
        taxonomyJson,
        "primary_need"
      ),
      outcomes: buildBreakdown(
        groupCounts(threadFacts, (row) => row.officialClosingOutcomeCode),
        totalThreads,
        taxonomyJson,
        "closing_outcome"
      ),
      sources: buildSources(threadFacts, taxonomyJson),
      priorities: buildPriorities(threadFacts, taxonomyJson)
    };
  }

  async getExploration(filters: ReadModelFilterInput, input: ExplorationQueryInput) {
    const slice = await this.resolveSlice(filters);
    const threadFacts = await this.listFilteredThreadFacts(
      slice.snapshots.map((item) => item.pipelineRunId),
      filters
    );
    const taxonomyJson = slice.snapshots[0]?.taxonomyJson ?? null;
    const rows = buildExplorationRows(threadFacts, taxonomyJson, input);

    return {
      builder: {
        metricOptions: buildExplorationMetricOptions(),
        breakdownOptions: buildExplorationBreakdownOptions(),
        compareOptions: buildExplorationCompareOptions(),
        selectedMetric: input.metric,
        selectedBreakdownBy: input.breakdownBy,
        selectedCompareBy: input.compareBy
      },
      metric: resolveExplorationMetricLabel(input.metric),
      breakdownBy: resolveExplorationBreakdownLabel(input.breakdownBy),
      compareBy: resolveExplorationCompareLabel(input.compareBy),
      chartSummary: rows[0]
        ? `Nhóm ${rows[0].dimension.toLowerCase()} đang nổi bật nhất theo ${resolveExplorationMetricLabel(input.metric).toLowerCase()} trong slice đã chọn.`
        : "Chưa có row mart nào khớp slice đã chọn.",
      rows,
      warning: slice.warning
    };
  }

  async getStaffPerformance(filters: ReadModelFilterInput) {
    const slice = await this.resolveSlice(filters);
    const staffFacts = await readModelsRepository.listFactStaffThreadDaysByRunIds(
      slice.snapshots.map((item) => item.pipelineRunId),
      filters
    );
    const taxonomyJson = slice.snapshots[0]?.taxonomyJson ?? null;

    const grouped = groupBy(staffFacts, (row) => row.staff.staffName);
    const rankingRows = Object.entries(grouped)
      .map(([staffName, rows]) => ({
        staff: rows[0]?.staff.displayLabel ?? staffName,
        threads: uniqueValues(rows.map((row) => row.threadId)).length,
        quality: resolveBusinessLabel(null, "response_quality", dominantCode(rows.map((row) => row.responseQualityCode))),
        responseTime: formatDuration(median(rows.map((row) => row.staffFirstResponseSecondsIfOwner).filter((value): value is number => typeof value === "number"))),
        issue: firstMeaningful(rows.map((row) => row.responseQualityIssueText)) ?? "Khong co issue noi bat",
        suggestion: firstMeaningful(rows.map((row) => row.responseQualityImprovementText)) ?? "Tiep tuc giu nhip phan hoi hien tai"
      }))
      .sort((left, right) => right.threads - left.threads);

    const issueMatrix = Object.entries(groupBy(staffFacts, (row) => `${row.staff.displayLabel}::${row.primaryNeedCode}`))
      .map(([key, rows]) => {
        const [staff, needCode] = key.split("::");
        return {
          staff,
          need: resolveBusinessLabel(taxonomyJson, "primary_need", needCode ?? "unknown"),
          quality: resolveBusinessLabel(null, "response_quality", dominantCode(rows.map((row) => row.responseQualityCode))),
          volume: String(rows.length)
        };
      })
      .sort((left, right) => Number(right.volume) - Number(left.volume))
      .slice(0, 8);

    const coachingInbox = staffFacts
      .filter((row) => row.responseQualityCode !== "strong" || row.processRiskLevelCode === "high")
      .slice(0, 8)
      .map((row) => ({
        staff: row.staff.displayLabel,
        threadLabel: `Thread ${row.threadId.slice(0, 8)}`,
        issue: row.responseQualityIssueText ?? "Can xem lai cach xu ly thread",
        improvement: row.responseQualityImprovementText ?? "Can lam ro next step trong cung nhip hoi thoai",
        openRoute: `?view=thread-history&thread=${encodeURIComponent(row.threadId)}`
      }));

    return {
      warning: slice.warning,
      scorecards: [
        metricCard("Staff active", uniqueValues(staffFacts.map((row) => row.staff.staffName)).length, "Co tham gia fact_staff_thread_day trong slice."),
        metricRateCard("Chat luong tot", staffFacts.filter((row) => row.responseQualityCode === "strong").length, Math.max(staffFacts.length, 1), "Response quality = strong."),
        metricCard("Issue can xem", staffFacts.filter((row) => row.responseQualityCode !== "strong").length, "Can cai thien tu fact_staff_thread_day."),
        metricDurationCard("Median phan hoi dau", median(staffFacts.map((row) => row.staffFirstResponseSecondsIfOwner).filter((value): value is number => typeof value === "number")), "Theo fact_staff_thread_day da resolve.")
      ],
      rankingRows,
      issueMatrix,
      coachingInbox
    };
  }

  async getThreadHistory(
    filters: ReadModelFilterInput,
    requestedThreadId: string | null,
    requestedThreadDayId: string | null,
    activeTab: "conversation" | "analysis-history" | "ai-audit" | "crm-link"
  ) {
    const slice = await this.resolveSlice(filters);
    const pipelineRunIds = slice.snapshots.map((item) => item.pipelineRunId);
    const threadFacts = await this.listFilteredThreadFacts(pipelineRunIds, filters);
    const threadIds = uniqueValues(threadFacts.map((row) => row.threadId));
    const threadSummaries = await readModelsRepository.listThreadSummaries(threadIds, pipelineRunIds);
    const activeThreadId = resolveActiveThreadId(threadFacts, threadSummaries, requestedThreadId);
    const workspace = activeThreadId
      ? await readModelsRepository.getThreadWorkspace(activeThreadId, pipelineRunIds)
      : null;

    return buildThreadHistoryView({
      warning: slice.warning,
      businessTimezone: slice.businessTimezone,
      taxonomyJson: slice.snapshots[0]?.taxonomyJson ?? null,
      requestedThreadId,
      requestedThreadDayId,
      activeTab,
      threadFacts,
      threadSummaries,
      workspace
    });
  }

  async getHealthSummary() {
    return buildHealthSummary();
  }

  async getPageComparison(filters: ReadModelFilterInput, comparePageIds: string[]) {
    const compareFilters = sanitizePageComparisonFilters(filters);
    const catalog = await readModelsRepository.listConnectedPagesForCatalog();
    const targetPageIds = comparePageIds.length > 0 ? comparePageIds : catalog.map((page) => page.id);
    const slices = await Promise.all(targetPageIds.map((pageId) => this.resolveSlice({ ...compareFilters, pageId })));
    const factsByPage = await Promise.all(
      slices.map((slice) => this.listFilteredThreadFacts(
        slice.snapshots.map((item) => item.pipelineRunId),
        { ...compareFilters, pageId: slice.pageId }
      ))
    );

    const dates = uniqueValues(factsByPage.flatMap((rows) => rows.map((row) => row.date.fullDate.toISOString().slice(0, 10)))).sort();
    const trendRows = dates.map((date) => ({
      date,
      values: slices.map((slice, index) => {
        const rows = factsByPage[index]?.filter((row) => row.date.fullDate.toISOString().slice(0, 10) === date) ?? [];
        const total = sum(rows.map((row) => row.threadCount));
        const booked = rows.filter((row) => row.officialClosingOutcomeCode === "booked").length;
        return {
          page: slice.pageName,
          volume: String(total),
          conversion: formatPercent(booked, total),
          aiCost: formatMoney(sumBigInt(rows.map((row) => row.aiCostMicros)))
        };
      })
    }));

    const anyWarning = slices.find((slice) => slice.warning)?.warning ?? null;
    return {
      warning: anyWarning,
      comparedPages: slices.map((slice) => slice.pageName),
      trendRows,
      mixCards: slices.map((slice, index) => {
        const rows = factsByPage[index] ?? [];
        const topNeed = dominantCode(rows.map((row) => row.primaryNeedCode));
        const revisitRate = formatPercent(rows.filter((row) => row.officialRevisitLabel === "revisit").length, Math.max(rows.length, 1));
        return {
          title: slice.pageName,
          summary: `Need top: ${resolveBusinessLabel(slice.snapshots[0]?.taxonomyJson ?? null, "primary_need", topNeed)}. Ty le tai kham: ${revisitRate}.`
        };
      })
    };
  }

  async getExportWorkbook(input: ExportWorkbookRequest) {
    const snapshots = await readModelsRepository.listSnapshotsForPageRange(input);
    const officialSnapshots = snapshots
      .filter((row) => row.publishChannel === "official")
      .sort((left, right) => left.targetDate.localeCompare(right.targetDate));
    const pageName = officialSnapshots[0]?.pageName
      ?? (await this.resolvePageName(input.pageId));

    if (officialSnapshots.length === 0) {
      return {
        allowed: false,
        reason: "Khoảng ngày đã chọn không có ngày nào có published_official để export.",
        fileName: `export-${input.pageId}-${input.startDate}-${input.endDate}.xlsx`,
        pageId: input.pageId,
        pageLabel: pageName,
        startDate: input.startDate,
        endDate: input.endDate,
        generatedAt: new Date().toISOString(),
        promptVersion: "Khong co du lieu official",
        configVersion: "Khong co du lieu official",
        taxonomyVersion: "Khong co du lieu official",
        rows: []
      };
    }

    const threadFacts = await readModelsRepository.listFactThreadDaysByRunIds(
      officialSnapshots.map((item) => item.pipelineRunId),
      {
        pageId: input.pageId,
        startDate: input.startDate,
        endDate: input.endDate,
        publishSnapshot: "official",
        inboxBucket: "all",
        revisit: "all",
        need: "all",
        outcome: "all",
        risk: "all",
        staff: "all"
      }
    );
    const groupedByDate = groupBy(threadFacts, (row) => row.date.fullDate.toISOString().slice(0, 10));
    const rows = officialSnapshots.map((snapshot) => {
      const facts = groupedByDate[snapshot.targetDate] ?? [];
      const totalInbox = sum(facts.map((row) => row.threadCount));
      const booked = facts.filter((row) => row.officialClosingOutcomeCode === "booked").length;
      return {
        date: snapshot.targetDate,
        totalInbox,
        inboxNew: facts.filter((row) => row.isNewInbox).length,
        revisit: facts.filter((row) => row.officialRevisitLabel === "revisit").length,
        bookedRate: formatPercent(booked, totalInbox),
        highRisk: facts.filter((row) => row.processRiskLevelCode === "high").length,
        aiCost: formatMoney(sumBigInt(facts.map((row) => row.aiCostMicros))),
        promptVersion: snapshot.promptVersion,
        configVersion: `v${String(snapshot.configVersionNo)}`,
        taxonomyVersion: snapshot.taxonomyVersionCode
      };
    }).filter((row) => row.totalInbox > 0);

    return {
      allowed: rows.length > 0,
      reason: rows.length > 0
        ? "Da tim thay ngay co published_official trong khoang chon."
        : "Khoang ngay da chon khong co ngay nao co published_official de export.",
      fileName: `export-${input.pageId}-${input.startDate}-${input.endDate}.xlsx`,
      pageId: input.pageId,
      pageLabel: pageName,
      startDate: input.startDate,
      endDate: input.endDate,
      generatedAt: new Date().toISOString(),
      promptVersion: summarizeStrings(rows.map((row) => row.promptVersion)),
      configVersion: summarizeStrings(rows.map((row) => row.configVersion)),
      taxonomyVersion: summarizeStrings(rows.map((row) => row.taxonomyVersion)),
      rows
    };
  }

  async getRunPreview(runId: string) {
    const summary = await readModelsRepository.getRunDraftSummary(runId);
    if (!summary) {
      throw new AppError(404, "READ_MODELS_RUN_NOT_FOUND", `Run ${runId} không tồn tại.`);
    }

    return {
      runId: summary.run.id,
      pageId: summary.run.runGroup.frozenConfigVersion.connectedPage.id,
      pageName: summary.run.runGroup.frozenConfigVersion.connectedPage.pageName,
      targetDate: summary.run.targetDate.toISOString().slice(0, 10),
      windowStartAt: summary.run.windowStartAt,
      windowEndExclusiveAt: summary.run.windowEndExclusiveAt,
      isFullDay: summary.run.isFullDay,
      status: summary.run.status,
      publishState: summary.run.publishState,
      publishEligibility: summary.run.publishEligibility,
      threadFactCount: summary.threadFactCount,
      staffFactCount: summary.staffFactCount,
      promptVersion: summary.run.runGroup.frozenPromptVersion,
      promptHash: summary.run.runGroup.frozenCompiledPromptHash,
      configVersion: `v${String(summary.run.runGroup.frozenConfigVersion.versionNo)}`,
      taxonomyVersion: summary.run.runGroup.frozenConfigVersion.analysisTaxonomyVersion.versionCode,
      warning: summary.run.publishEligibility === "not_publishable_old_partial"
        ? {
          title: "Run partial ngay cu",
          body: "Run nay chi duoc xem qua preview theo run_id, khong duoc di vao dashboard publish.",
          tone: "warning"
        }
        : null
    };
  }

  private async resolveSlice(filters: ReadModelFilterInput): Promise<SliceResolution> {
    const [snapshots, pageName, businessTimezone] = await Promise.all([
      readModelsRepository.listSnapshotsForPageRange({
        pageId: filters.pageId,
        startDate: filters.startDate,
        endDate: filters.endDate
      }),
      this.resolvePageName(filters.pageId),
      this.resolveBusinessTimezone(filters.pageId)
    ]);

    const today = formatDateInTimezone(new Date(), businessTimezone);
    const selected = resolveSnapshotsForRange(snapshots, filters.publishSnapshot, today);
    const provisionalSnapshots = selected.filter((item) => item.publishChannel === "provisional");
    const promptVersions = uniqueValues(selected.map((item) => item.promptVersion));
    const configVersions = uniqueValues(selected.map((item) => `v${String(item.configVersionNo)}`));
    const taxonomyVersions = uniqueValues(selected.map((item) => item.taxonomyVersionCode));
    const mixedVersion = promptVersions.length > 1 || configVersions.length > 1 || taxonomyVersions.length > 1;

    return {
      pageId: filters.pageId,
      pageName,
      businessTimezone,
      snapshots: selected,
      snapshot: {
        kind: provisionalSnapshots.length > 0 ? "published_provisional" : "published_official",
        label: provisionalSnapshots.length > 0 ? "Tam thoi" : "Chinh thuc",
        coverage: provisionalSnapshots.length > 0
          ? formatCoverage(provisionalSnapshots[0]!, businessTimezone)
          : `${filters.startDate} -> ${filters.endDate}`,
        promptVersion: summarizeStrings(promptVersions),
        configVersion: summarizeStrings(configVersions),
        taxonomyVersion: summarizeStrings(taxonomyVersions)
      },
      warning: buildSliceWarning(selected, provisionalSnapshots.length > 0, mixedVersion),
      mixedVersion
    };
  }

  private async resolvePageName(pageId: string) {
    const pages = await readModelsRepository.listConnectedPagesForCatalog();
    return pages.find((page) => page.id === pageId)?.pageName ?? pageId;
  }

  private async resolveBusinessTimezone(pageId: string) {
    const pages = await readModelsRepository.listConnectedPagesForCatalog();
    return pages.find((page) => page.id === pageId)?.businessTimezone ?? "Asia/Saigon";
  }

  private async listFilteredThreadFacts(pipelineRunIds: string[], filters: ReadModelFilterInput) {
    if (filters.staff === "all") {
      return readModelsRepository.listFactThreadDaysByRunIds(pipelineRunIds, filters);
    }

    const [threadFacts, staffFacts] = await Promise.all([
      readModelsRepository.listFactThreadDaysByRunIds(pipelineRunIds, filters),
      readModelsRepository.listFactStaffThreadDaysByRunIds(pipelineRunIds, filters)
    ]);
    const allowedThreadDayIds = new Set(staffFacts.map((row) => row.threadDayId));
    return threadFacts.filter((row) => allowedThreadDayIds.has(row.threadDayId));
  }

  private async listPreviousThreadFacts(filters: ReadModelFilterInput) {
    const previousRange = shiftRangeBack(filters.startDate, filters.endDate);
    const previousSlice = await this.resolveSlice({
      ...filters,
      startDate: previousRange.startDate,
      endDate: previousRange.endDate
    });
    return this.listFilteredThreadFacts(
      previousSlice.snapshots.map((item) => item.pipelineRunId),
      {
        ...filters,
        startDate: previousRange.startDate,
        endDate: previousRange.endDate
      }
    );
  }
}

function sanitizePageComparisonFilters(filters: ReadModelFilterInput): ReadModelFilterInput {
  return {
    ...filters,
    inboxBucket: "all",
    revisit: "all",
    need: "all",
    outcome: "all",
    risk: "all",
    staff: "all"
  };
}

function buildOptions(items: Array<{ value: string; label: string }>, allLabel: string) {
  const deduped = new Map<string, string>();
  for (const item of items) {
    const value = item.value.trim();
    if (!value || value === "unknown" || deduped.has(value)) {
      continue;
    }
    deduped.set(value, item.label);
  }
  return [
    { value: "all", label: allLabel },
    ...[...deduped.entries()].map(([value, label]) => ({ value, label }))
  ];
}

function metricCard(label: string, value: number, hint: string, delta = "0"): MetricCard {
  return {
    label,
    value: String(value),
    delta,
    hint
  };
}

function metricRateCard(label: string, numerator: number, denominator: number, hint: string, delta = "0"): MetricCard {
  return {
    label,
    value: formatPercent(numerator, denominator),
    delta,
    hint
  };
}

function metricMoneyCard(label: string, micros: bigint, hint: string, delta = "0"): MetricCard {
  return {
    label,
    value: formatMoney(micros),
    delta,
    hint
  };
}

function metricDurationCard(label: string, seconds: number | null, hint: string, delta = "0"): MetricCard {
  return {
    label,
    value: formatDuration(seconds),
    delta,
    hint
  };
}

function buildBreakdown(
  grouped: Array<{ code: string; count: number }>,
  total: number,
  taxonomyJson: unknown,
  categoryKey: string
): SimpleBreakdown[] {
  return grouped
    .sort((left, right) => right.count - left.count)
    .slice(0, 5)
    .map((row) => ({
      label: resolveBusinessLabel(taxonomyJson, categoryKey, row.code),
      value: String(row.count),
      share: formatPercent(row.count, total || 1)
    }));
}

function buildSources(threadFacts: ThreadFactRow[], taxonomyJson: unknown) {
  return Object.entries(groupBy(threadFacts, (row) => buildSourceKey(row)))
    .map(([source, rows]) => ({
      source,
      threads: rows.length,
      revisitRate: formatPercent(rows.filter((row) => row.officialRevisitLabel === "revisit").length, rows.length || 1),
      topNeed: resolveBusinessLabel(taxonomyJson, "primary_need", dominantCode(rows.map((row) => row.primaryNeedCode))),
      topOutcome: resolveBusinessLabel(taxonomyJson, "closing_outcome", dominantCode(rows.map((row) => row.officialClosingOutcomeCode)))
    }))
    .sort((left, right) => right.threads - left.threads)
    .slice(0, 6);
}

function buildPriorities(threadFacts: ThreadFactRow[], taxonomyJson: unknown) {
  return Object.entries(groupBy(threadFacts, (row) => `${row.openingThemeCode}::${row.primaryNeedCode}::${row.processRiskLevelCode}`))
    .map(([key, rows]) => {
      const [openingThemeCode, primaryNeedCode, riskCode] = key.split("::");
      return {
        cluster: `${resolveBusinessLabel(taxonomyJson, "opening_theme", openingThemeCode ?? "unknown")} / ${resolveBusinessLabel(taxonomyJson, "primary_need", primaryNeedCode ?? "unknown")}`,
        threadCount: rows.length,
        outcome: resolveBusinessLabel(taxonomyJson, "closing_outcome", dominantCode(rows.map((row) => row.officialClosingOutcomeCode))),
        risk: resolveBusinessLabel(taxonomyJson, "process_risk_level", riskCode ?? "unknown"),
        summary: `Cum nay co ${rows.length} thread va dang can uu tien xu ly do risk ${resolveBusinessLabel(taxonomyJson, "process_risk_level", riskCode ?? "unknown").toLowerCase()}.`,
        drillLabel: "Mo lich su hoi thoai",
        drillRoute: "?view=thread-history"
      };
    })
    .sort((left, right) => right.threadCount - left.threadCount)
    .slice(0, 6);
}

function buildExplorationRows(
  threadFacts: ThreadFactRow[],
  taxonomyJson: unknown,
  input: ExplorationQueryInput
) {
  const grouped = groupBy(threadFacts, (row) => buildExplorationGroupKey(row, taxonomyJson, input.breakdownBy, input.compareBy));
  const total = Math.max(sum(threadFacts.map((row) => row.threadCount)), 1);

  return Object.entries(grouped)
    .map(([dimension, rows]) => ({
      dimension,
      metricValue: formatExplorationMetricValue(rows, input.metric),
      metricNumber: toExplorationMetricNumber(rows, input.metric),
      share: formatPercent(sum(rows.map((row) => row.threadCount)), total),
      drillRoute: buildExplorationDrillRoute(rows)
    }))
    .sort((left, right) => right.metricNumber - left.metricNumber || left.dimension.localeCompare(right.dimension))
    .slice(0, 12)
    .map(({ metricNumber: _metricNumber, ...row }) => row);
}

function buildExplorationGroupKey(
  row: ThreadFactRow,
  taxonomyJson: unknown,
  breakdownBy: ExplorationBreakdownKey,
  compareBy: ExplorationCompareKey
) {
  const breakdownLabel = resolveExplorationBreakdownValue(row, taxonomyJson, breakdownBy);
  const compareLabel = resolveExplorationCompareValue(row, compareBy);
  return compareLabel ? `${breakdownLabel} / ${compareLabel}` : breakdownLabel;
}

function resolveExplorationBreakdownValue(
  row: ThreadFactRow,
  taxonomyJson: unknown,
  breakdownBy: ExplorationBreakdownKey
) {
  switch (breakdownBy) {
    case "day":
      return row.date.fullDate.toISOString().slice(0, 10);
    case "primary_need":
      return resolveBusinessLabel(taxonomyJson, "primary_need", row.primaryNeedCode);
    case "primary_topic":
      return resolveBusinessLabel(taxonomyJson, "primary_topic", row.primaryTopicCode);
    case "closing_outcome":
      return resolveBusinessLabel(taxonomyJson, "closing_outcome", row.officialClosingOutcomeCode);
    case "customer_mood":
      return resolveBusinessLabel(null, "customer_mood", row.customerMoodCode);
    case "process_risk_level":
      return resolveBusinessLabel(null, "process_risk_level", row.processRiskLevelCode);
    case "source":
      return buildSourceKey(row);
    case "opening_theme":
    default:
      return resolveBusinessLabel(taxonomyJson, "opening_theme", row.openingThemeCode);
  }
}

function resolveExplorationCompareValue(row: ThreadFactRow, compareBy: ExplorationCompareKey) {
  switch (compareBy) {
    case "page":
      return row.page.pageName;
    case "inbox_bucket":
      return row.isNewInbox ? "Inbox mới" : "Inbox cũ";
    case "revisit":
      return row.officialRevisitLabel === "revisit" ? "Tái khám" : "Không tái khám";
    case "none":
    default:
      return "";
  }
}

function formatExplorationMetricValue(rows: ThreadFactRow[], metric: ExplorationMetricKey) {
  switch (metric) {
    case "new_inbox_count":
      return String(rows.filter((row) => row.isNewInbox).length);
    case "revisit_count":
      return String(rows.filter((row) => row.officialRevisitLabel === "revisit").length);
    case "booked_rate":
      return formatPercent(rows.filter((row) => row.officialClosingOutcomeCode === "booked").length, Math.max(rows.length, 1));
    case "ai_cost":
      return formatMoney(sumBigInt(rows.map((row) => row.aiCostMicros)));
    case "first_response_seconds":
      return formatDuration(median(rows.map((row) => row.firstStaffResponseSeconds).filter((value): value is number => typeof value === "number")));
    case "thread_count":
    default:
      return String(sum(rows.map((row) => row.threadCount)));
  }
}

function toExplorationMetricNumber(rows: ThreadFactRow[], metric: ExplorationMetricKey) {
  switch (metric) {
    case "new_inbox_count":
      return rows.filter((row) => row.isNewInbox).length;
    case "revisit_count":
      return rows.filter((row) => row.officialRevisitLabel === "revisit").length;
    case "booked_rate":
      return rows.length > 0 ? (rows.filter((row) => row.officialClosingOutcomeCode === "booked").length / rows.length) * 100 : 0;
    case "ai_cost":
      return Number(sumBigInt(rows.map((row) => row.aiCostMicros)));
    case "first_response_seconds":
      return median(rows.map((row) => row.firstStaffResponseSeconds).filter((value): value is number => typeof value === "number")) ?? 0;
    case "thread_count":
    default:
      return sum(rows.map((row) => row.threadCount));
  }
}

function buildExplorationDrillRoute(rows: ThreadFactRow[]) {
  const representativeThreadId = rows[0]?.threadId;
  return representativeThreadId
    ? `?view=thread-history&thread=${encodeURIComponent(representativeThreadId)}`
    : "?view=thread-history";
}

function buildExplorationMetricOptions() {
  return [
    { value: "thread_count", label: "Số thread" },
    { value: "new_inbox_count", label: "Số inbox mới" },
    { value: "revisit_count", label: "Số tái khám" },
    { value: "booked_rate", label: "Tỷ lệ chốt hẹn" },
    { value: "ai_cost", label: "Chi phí AI" },
    { value: "first_response_seconds", label: "Phản hồi đầu tiên" }
  ];
}

function buildExplorationBreakdownOptions() {
  return [
    { value: "day", label: "Ngày" },
    { value: "opening_theme", label: "Opening theme" },
    { value: "primary_need", label: "Nhu cầu" },
    { value: "primary_topic", label: "Chủ đề" },
    { value: "closing_outcome", label: "Outcome" },
    { value: "customer_mood", label: "Mood" },
    { value: "process_risk_level", label: "Risk" },
    { value: "source", label: "Nguồn khách" }
  ];
}

function buildExplorationCompareOptions() {
  return [
    { value: "none", label: "Không so sánh" },
    { value: "page", label: "Page" },
    { value: "inbox_bucket", label: "Inbox mới/cũ" },
    { value: "revisit", label: "Tái khám" }
  ];
}

function resolveExplorationMetricLabel(metric: ExplorationMetricKey) {
  return buildExplorationMetricOptions().find((item) => item.value === metric)?.label ?? "Số thread";
}

function resolveExplorationBreakdownLabel(breakdownBy: ExplorationBreakdownKey) {
  return buildExplorationBreakdownOptions().find((item) => item.value === breakdownBy)?.label ?? "Opening theme";
}

function resolveExplorationCompareLabel(compareBy: ExplorationCompareKey) {
  return buildExplorationCompareOptions().find((item) => item.value === compareBy)?.label ?? "Không so sánh";
}

function shiftRangeBack(startDate: string, endDate: string) {
  const start = parseDateOnlyUtc(startDate);
  const end = parseDateOnlyUtc(endDate);
  const dayCount = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1);
  const previousEnd = new Date(start.getTime() - 86_400_000);
  const previousStart = new Date(previousEnd.getTime() - (dayCount - 1) * 86_400_000);
  return {
    startDate: previousStart.toISOString().slice(0, 10),
    endDate: previousEnd.toISOString().slice(0, 10)
  };
}

function formatCountDelta(current: number, previous: number) {
  return formatSignedDelta(current - previous);
}

function formatRateDelta(currentNumerator: number, currentDenominator: number, previousNumerator: number, previousDenominator: number) {
  const currentRate = currentDenominator > 0 ? (currentNumerator / currentDenominator) * 100 : 0;
  const previousRate = previousDenominator > 0 ? (previousNumerator / previousDenominator) * 100 : 0;
  const delta = currentRate - previousRate;
  const signed = delta > 0 ? "+" : delta < 0 ? "-" : "";
  return `${signed}${Math.abs(delta).toFixed(1)}đ`;
}

function formatMoneyDelta(current: bigint, previous: bigint) {
  const delta = current - previous;
  return formatSignedMoneyDelta(delta);
}

function formatDurationDelta(current: number | null, previous: number | null) {
  if (current == null || previous == null) {
    return "-";
  }
  const delta = current - previous;
  const signed = delta > 0 ? "+" : delta < 0 ? "-" : "";
  return `${signed}${formatDuration(Math.abs(delta))}`;
}

function formatSignedDelta(value: number) {
  if (value === 0) {
    return "0";
  }
  return `${value > 0 ? "+" : ""}${value}`;
}

function formatSignedMoneyDelta(value: bigint) {
  if (value === 0n) {
    return "0 đ";
  }
  return `${value > 0n ? "+" : "-"}${formatMoney(value > 0n ? value : -value)}`;
}

function resolveSnapshotsForRange(snapshots: ResolvedSnapshotRow[], requested: ReadModelFilterInput["publishSnapshot"], today: string) {
  const grouped = groupBy(snapshots, (row) => row.targetDate);
  return Object.keys(grouped)
    .sort()
    .map((targetDate) => {
      const rows = grouped[targetDate] ?? [];
      const official = rows.find((row) => row.publishChannel === "official") ?? null;
      const provisional = rows.find((row) => row.publishChannel === "provisional") ?? null;
      if (requested === "official") {
        return official;
      }
      if (targetDate === today && provisional) {
        return provisional;
      }
      return official;
    })
    .filter((row): row is ResolvedSnapshotRow => row !== null);
}

function buildSliceWarning(snapshots: ResolvedSnapshotRow[], hasProvisional: boolean, mixedVersion: boolean): WarningView | null {
  if (snapshots.length === 0) {
    return {
      title: "Chua co publish snapshot",
      body: "Slice da chon chua co published_official hoac provisional hop le de render dashboard.",
      tone: "danger"
    };
  }
  if (hasProvisional && mixedVersion) {
    return {
      title: "Slice dang tron snapshot tam thoi va lich su",
      body: "Ngay hien tai dang doc published_provisional, cac ngay con lai doc official. UI phai coi day la mixed-version slice.",
      tone: "warning"
    };
  }
  if (hasProvisional) {
    return {
      title: "Snapshot dang la tam thoi",
      body: "Slice nay dang doc published_provisional cho ngay hien tai. Export official khong duoc suy tu snapshot tam thoi.",
      tone: "warning"
    };
  }
  if (mixedVersion) {
    return {
      title: "Slice co nhieu version",
      body: "Khoang ngay nay dang gop nhieu prompt/config/taxonomy version khac nhau. Can hien thi metadata version ro rang.",
      tone: "info"
    };
  }
  return null;
}

function buildSourceKey(row: ThreadFactRow) {
  if (row.entryAdId) {
    return `Ad ${row.entryAdId}`;
  }
  if (row.entryPostId) {
    return `Post ${row.entryPostId}`;
  }
  if (row.entrySourceType) {
    return row.entrySourceType;
  }
  return "Khong ro";
}

function formatCoverage(snapshot: ResolvedSnapshotRow, businessTimezone: string) {
  return `${formatClock(snapshot.windowStartAt, businessTimezone)}-${formatClock(snapshot.windowEndExclusiveAt, businessTimezone)}`;
}

function parseDateOnlyUtc(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function formatClock(value: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(value);
}

function formatPercent(numerator: number, denominator: number) {
  if (denominator <= 0) {
    return "0.0%";
  }
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

function formatMoney(value: bigint) {
  return `${Math.round(Number(value) / 1000).toLocaleString("vi-VN")} đ`;
}

function formatDuration(seconds: number | null) {
  if (seconds == null || Number.isNaN(seconds)) {
    return "Chua ro";
  }
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.round(seconds / 60);
  return `${minutes} phut`;
}

function summarizeStrings(values: string[]) {
  const unique = uniqueValues(values.filter(Boolean));
  if (unique.length === 0) {
    return "Chua ro";
  }
  if (unique.length === 1) {
    return unique[0]!;
  }
  return "Nhieu phien ban";
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function sumBigInt(values: bigint[]) {
  return values.reduce((total, value) => total + value, 0n);
}

function median(values: number[]) {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[middle] ?? null;
  }
  return Math.round(((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2);
}

function groupCounts<T>(items: T[], pickCode: (item: T) => string) {
  return Object.entries(groupBy(items, (item) => pickCode(item)))
    .map(([code, rows]) => ({
      code,
      count: rows.length
    }));
}

function totalBy<T>(items: T[], predicate: (item: T) => boolean) {
  return items.filter(predicate).length;
}

function groupBy<T>(items: T[], keyOf: (item: T) => string) {
  return items.reduce<Record<string, T[]>>((groups, item) => {
    const key = keyOf(item);
    groups[key] = groups[key] ?? [];
    groups[key].push(item);
    return groups;
  }, {});
}

function dominantCode(values: string[]) {
  const grouped = groupCounts(values, (item) => item);
  return grouped.sort((left, right) => right.count - left.count)[0]?.code ?? "unknown";
}

function uniqueValues(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function firstMeaningful(values: Array<string | null>) {
  return values.find((value) => value && value.trim().length > 0) ?? null;
}

export const readModelsService = new ReadModelsService();
