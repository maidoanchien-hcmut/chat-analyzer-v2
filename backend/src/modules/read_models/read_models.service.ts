import type {
  ComparisonQuery,
  DashboardQuery,
  MappingReviewQuery,
  PageThreadsQuery,
  RunGroupThreadsQuery,
  ThreadDetailQuery
} from "./read_models.types.ts";
import {
  readModelsRepository,
  type PublishedSliceRow,
  type RunGroupSliceRow
} from "./read_models.repository.ts";
import { AppError } from "../../core/errors.ts";

type ThreadAggregate = {
  threadId: string;
  customerDisplayName: string | null;
  dayCount: number;
  totalMessages: number;
  totalCostMicros: bigint;
  latestTargetDate: string;
  latestMessageAt: string | null;
  latestPrimaryNeed: string;
  latestCustomerMood: string;
  latestCustomerType: string;
  latestRiskLevel: string;
  latestClosingOutcome: string;
  latestOpeningTheme: string;
  latestResponseQualityLabel: string;
  latestProcessRiskReasonText: string | null;
  rows: PublishedSliceRow[];
};

type DashboardKpis = {
  totalInbox: number;
  totalInboxNew: number;
  totalInboxOld: number;
  revisitCount: number;
  goodMoodCount: number;
  riskCount: number;
  totalMessages: number;
  totalAiCostMicros: string;
  conversionRate: number;
  conversionNumerator: number;
  conversionDenominator: number;
};

export class ReadModelsService {
  constructor(private readonly repository = readModelsRepository) {}

  async listPagesLite() {
    const pages = await this.repository.listConnectedPagesLite();
    return {
      pages
    };
  }

  async getDashboard(query: DashboardQuery) {
    const slice = resolveSlice(query.start_date, query.end_date);
    const rows = await this.repository.listPublishedSliceRows({
      connectedPageId: query.connected_page_id,
      startDate: slice.startDate,
      endDate: slice.endDate
    });
    const threads = buildThreadAggregates(rows, {
      mood: query.mood,
      primaryNeed: query.primary_need,
      customerType: query.customer_type,
      riskLevel: query.risk_level
    });
    const kpis = buildDashboardKpis(threads);
    const breakdown = buildPrimaryNeedBreakdown(threads);
    const latestThreads = threads
      .sort((left, right) => compareIsoDesc(left.latestMessageAt, right.latestMessageAt))
      .slice(0, clampLimit(query.limit_latest_threads, 12, 200));

    return {
      slice,
      filters: {
        connectedPageId: query.connected_page_id,
        mood: query.mood,
        primaryNeed: query.primary_need,
        customerType: query.customer_type,
        riskLevel: query.risk_level
      },
      kpis,
      breakdown,
      latestThreads: latestThreads.map(toThreadSummary)
    };
  }

  async getComparison(query: ComparisonQuery) {
    const slice = resolveSlice(query.start_date, query.end_date);
    const rows = await this.repository.listPublishedSliceRows({
      connectedPageId: null,
      startDate: slice.startDate,
      endDate: slice.endDate
    });

    const grouped = new Map<string, PublishedSliceRow[]>();
    for (const row of rows) {
      const bucket = grouped.get(row.connectedPageId) ?? [];
      bucket.push(row);
      grouped.set(row.connectedPageId, bucket);
    }

    const pages = [...grouped.entries()]
      .map(([connectedPageId, pageRows]) => {
        const threadAggregates = buildThreadAggregates(pageRows, {});
        const first = pageRows[0];
        return {
          connectedPageId,
          pageName: first?.pageName ?? "unknown",
          kpis: buildDashboardKpis(threadAggregates)
        };
      })
      .sort((left, right) => left.pageName.localeCompare(right.pageName, "vi"));

    return {
      slice,
      pages
    };
  }

  async getPageThreads(connectedPageId: string, query: PageThreadsQuery) {
    await this.requirePage(connectedPageId);
    const slice = resolveSlice(query.start_date, query.end_date);
    const rows = await this.repository.listPublishedSliceRows({
      connectedPageId,
      startDate: slice.startDate,
      endDate: slice.endDate
    });
    const threads = buildThreadAggregates(rows, {
      mood: query.mood,
      primaryNeed: query.primary_need,
      customerType: query.customer_type,
      riskLevel: query.risk_level,
      search: query.q,
      minMessages: query.min_messages ?? null
    });

    const sortBy = normalizeSortBy(query.sort_by);
    const sortOrder = normalizeSortOrder(query.sort_order);
    const sorted = sortThreads(threads, sortBy, sortOrder);
    const offset = Math.max(0, query.offset ?? 0);
    const limit = clampLimit(query.limit, 50, 500);
    const pageItems = sorted.slice(offset, offset + limit).map(toThreadSummary);

    return {
      slice,
      paging: {
        total: sorted.length,
        offset,
        limit
      },
      sort: {
        by: sortBy,
        order: sortOrder
      },
      filters: {
        mood: query.mood,
        primaryNeed: query.primary_need,
        customerType: query.customer_type,
        riskLevel: query.risk_level,
        q: query.q,
        minMessages: query.min_messages ?? null
      },
      threads: pageItems
    };
  }

  async getThreadDetail(connectedPageId: string, threadId: string, query: ThreadDetailQuery) {
    await this.requirePage(connectedPageId);
    const rows = await this.repository.listThreadHistoryRows({
      connectedPageId,
      threadId,
      startDate: query.start_date,
      endDate: query.end_date,
      runGroupId: query.run_group_id
    });
    if (rows.length === 0) {
      throw new AppError(404, "READ_MODEL_THREAD_NOT_FOUND", `Thread ${threadId} was not found for page ${connectedPageId}.`);
    }

    const conversationDayIds = rows.map((item) => item.conversationDayId);
    const messages = await this.repository.listMessagesForConversationDays(conversationDayIds);
    const summary = buildThreadSummaryFromRows(rows);

    return {
      thread: toThreadSummary(summary),
      days: rows.map((row) => ({
        conversationDayId: row.conversationDayId,
        runGroupId: row.runGroupId,
        etlRunId: row.etlRunId,
        targetDate: toDateToken(row.targetDate),
        messageCount: row.messageCount,
        costMicros: row.costMicros.toString(),
        primaryNeed: row.primaryNeed,
        customerMood: row.customerMood,
        contentCustomerType: row.contentCustomerType,
        processRiskLevel: row.processRiskLevel,
        openingTheme: row.openingTheme,
        closingOutcomeAsOfDay: row.closingOutcomeAsOfDay,
        responseQualityLabel: row.responseQualityLabel,
        processRiskReasonText: row.processRiskReasonText
      })),
      messages: messages.map((message) => ({
        ...message,
        targetDate: toDateToken(message.targetDate)
      }))
    };
  }

  async getRunGroupThreads(runGroupId: string, query: RunGroupThreadsQuery) {
    const rows = await this.repository.listRunGroupSliceRows(runGroupId);
    if (rows.length === 0) {
      throw new AppError(404, "READ_MODEL_RUN_GROUP_NOT_FOUND", `Run group ${runGroupId} was not found.`);
    }

    const threadMap = new Map<string, {
      threadId: string;
      customerDisplayName: string | null;
      dayCount: number;
      totalMessages: number;
      totalCostMicros: bigint;
      latestTargetDate: string;
      latestMessageAt: string | null;
      latestPrimaryNeed: string;
      latestCustomerMood: string;
      latestCustomerType: string;
      latestRiskLevel: string;
    }>();

    for (const row of rows) {
      const targetDate = toDateToken(row.targetDate);
      const latestMessageAt = row.latestMessageAt?.toISOString() ?? null;
      const existing = threadMap.get(row.threadId);
      if (!existing) {
        threadMap.set(row.threadId, {
          threadId: row.threadId,
          customerDisplayName: row.customerDisplayName,
          dayCount: 1,
          totalMessages: row.messageCount,
          totalCostMicros: row.costMicros,
          latestTargetDate: targetDate,
          latestMessageAt,
          latestPrimaryNeed: row.primaryNeed ?? "unknown",
          latestCustomerMood: row.customerMood ?? "unknown",
          latestCustomerType: row.contentCustomerType ?? "unknown",
          latestRiskLevel: row.processRiskLevel ?? "unknown"
        });
        continue;
      }

      existing.dayCount += 1;
      existing.totalMessages += row.messageCount;
      existing.totalCostMicros += row.costMicros;
      if (targetDate > existing.latestTargetDate || compareIsoDesc(latestMessageAt, existing.latestMessageAt) < 0) {
        existing.latestTargetDate = targetDate;
        existing.latestMessageAt = latestMessageAt;
        existing.latestPrimaryNeed = row.primaryNeed ?? "unknown";
        existing.latestCustomerMood = row.customerMood ?? "unknown";
        existing.latestCustomerType = row.contentCustomerType ?? "unknown";
        existing.latestRiskLevel = row.processRiskLevel ?? "unknown";
      }
    }

    let threads = [...threadMap.values()];
    if (query.q) {
      const token = query.q.toLowerCase();
      threads = threads.filter((item) => item.threadId.toLowerCase().includes(token) || (item.customerDisplayName ?? "").toLowerCase().includes(token));
    }
    threads.sort((left, right) => compareIsoDesc(left.latestMessageAt, right.latestMessageAt));
    const offset = Math.max(0, query.offset ?? 0);
    const limit = clampLimit(query.limit, 50, 500);

    return {
      runGroupId,
      paging: {
        total: threads.length,
        offset,
        limit
      },
      threads: threads.slice(offset, offset + limit).map((item) => ({
        ...item,
        totalCostMicros: item.totalCostMicros.toString()
      }))
    };
  }

  async getMappingReview(connectedPageId: string, query: MappingReviewQuery) {
    await this.requirePage(connectedPageId);
    const rows = await this.repository.listMappingReviewRows(connectedPageId, clampLimit(query.limit, 100, 500));
    return {
      connectedPageId,
      items: rows.map((item) => ({
        id: item.id,
        runGroupId: item.runGroupId,
        threadId: item.threadId,
        decisionStatus: item.decisionStatus,
        promotionState: item.promotionState,
        confidenceScore: item.confidenceScore ? Number(item.confidenceScore) : null,
        selectedCustomerId: item.selectedCustomerId,
        modelName: item.modelName,
        outputSchemaVersion: item.outputSchemaVersion,
        createdAt: item.createdAt.toISOString()
      }))
    };
  }

  private async requirePage(connectedPageId: string) {
    const page = await this.repository.getConnectedPageLite(connectedPageId);
    if (!page) {
      throw new AppError(404, "READ_MODEL_CONNECTED_PAGE_NOT_FOUND", `Connected page ${connectedPageId} was not found.`);
    }
    return page;
  }
}

function buildThreadAggregates(rows: PublishedSliceRow[], filters: {
  mood?: string | null;
  primaryNeed?: string | null;
  customerType?: string | null;
  riskLevel?: string | null;
  search?: string | null;
  minMessages?: number | null;
}): ThreadAggregate[] {
  const grouped = new Map<string, ThreadAggregate>();
  for (const row of rows) {
    const key = row.threadId;
    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, {
        threadId: key,
        customerDisplayName: row.customerDisplayName,
        dayCount: 1,
        totalMessages: row.messageCount,
        totalCostMicros: row.costMicros,
        latestTargetDate: toDateToken(row.targetDate),
        latestMessageAt: row.latestMessageAt?.toISOString() ?? null,
        latestPrimaryNeed: row.primaryNeed,
        latestCustomerMood: row.customerMood,
        latestCustomerType: row.contentCustomerType,
        latestRiskLevel: row.processRiskLevel,
        latestClosingOutcome: row.closingOutcomeAsOfDay,
        latestOpeningTheme: row.openingTheme,
        latestResponseQualityLabel: row.responseQualityLabel,
        latestProcessRiskReasonText: row.processRiskReasonText,
        rows: [row]
      });
      continue;
    }

    existing.dayCount += 1;
    existing.totalMessages += row.messageCount;
    existing.totalCostMicros += row.costMicros;
    existing.rows.push(row);
    const rowDate = toDateToken(row.targetDate);
    const rowMessageAt = row.latestMessageAt?.toISOString() ?? null;
    if (rowDate > existing.latestTargetDate || compareIsoDesc(rowMessageAt, existing.latestMessageAt) < 0) {
      existing.latestTargetDate = rowDate;
      existing.latestMessageAt = rowMessageAt;
      existing.latestPrimaryNeed = row.primaryNeed;
      existing.latestCustomerMood = row.customerMood;
      existing.latestCustomerType = row.contentCustomerType;
      existing.latestRiskLevel = row.processRiskLevel;
      existing.latestClosingOutcome = row.closingOutcomeAsOfDay;
      existing.latestOpeningTheme = row.openingTheme;
      existing.latestResponseQualityLabel = row.responseQualityLabel;
      existing.latestProcessRiskReasonText = row.processRiskReasonText;
    }
  }

  return [...grouped.values()].filter((thread) => {
    if (filters.mood && thread.latestCustomerMood !== filters.mood) {
      return false;
    }
    if (filters.primaryNeed && thread.latestPrimaryNeed !== filters.primaryNeed) {
      return false;
    }
    if (filters.customerType && thread.latestCustomerType !== filters.customerType) {
      return false;
    }
    if (filters.riskLevel && thread.latestRiskLevel !== filters.riskLevel) {
      return false;
    }
    if (filters.search) {
      const token = filters.search.toLowerCase();
      const hay = `${thread.threadId} ${thread.customerDisplayName ?? ""}`.toLowerCase();
      if (!hay.includes(token)) {
        return false;
      }
    }
    if ((filters.minMessages ?? 0) > thread.totalMessages) {
      return false;
    }
    return true;
  });
}

function buildDashboardKpis(threads: ThreadAggregate[]): DashboardKpis {
  let totalInbox = 0;
  let totalInboxNew = 0;
  let totalInboxOld = 0;
  let revisitCount = 0;
  let goodMoodCount = 0;
  let riskCount = 0;
  let totalMessages = 0;
  let totalAiCostMicros = 0n;
  let conversionNumerator = 0;
  let conversionDenominator = 0;

  for (const thread of threads) {
    for (const row of thread.rows) {
      totalInbox += 1;
      if (isInboxNew(row)) {
        totalInboxNew += 1;
      } else {
        totalInboxOld += 1;
      }
      if (isRevisit(row)) {
        revisitCount += 1;
      }
      if (isGoodMood(row.customerMood)) {
        goodMoodCount += 1;
      }
      if (isRisk(row.processRiskLevel)) {
        riskCount += 1;
      }
      totalMessages += row.messageCount;
      totalAiCostMicros += row.costMicros;
      if (isBookingNeed(row.primaryNeed)) {
        conversionDenominator += 1;
        if (isBookingSuccess(row.closingOutcomeAsOfDay)) {
          conversionNumerator += 1;
        }
      }
    }
  }

  const conversionRate = conversionDenominator > 0 ? conversionNumerator / conversionDenominator : 0;

  return {
    totalInbox,
    totalInboxNew,
    totalInboxOld,
    revisitCount,
    goodMoodCount,
    riskCount,
    totalMessages,
    totalAiCostMicros: totalAiCostMicros.toString(),
    conversionRate,
    conversionNumerator,
    conversionDenominator
  };
}

function buildPrimaryNeedBreakdown(threads: ThreadAggregate[]) {
  const counts = new Map<string, number>();
  for (const thread of threads) {
    const key = thread.latestPrimaryNeed || "unknown";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((left, right) => right.count - left.count || left.value.localeCompare(right.value, "vi"))
    .slice(0, 12);
}

function normalizeSortBy(value: string | null | undefined) {
  if (value === "cost" || value === "messages" || value === "target_date") {
    return value;
  }
  return "latest_message";
}

function normalizeSortOrder(value: string | null | undefined) {
  return value === "asc" ? "asc" : "desc";
}

function sortThreads(threads: ThreadAggregate[], sortBy: string, sortOrder: "asc" | "desc") {
  const factor = sortOrder === "asc" ? 1 : -1;
  const sorted = [...threads].sort((left, right) => {
    if (sortBy === "cost") {
      const delta = left.totalCostMicros === right.totalCostMicros ? 0 : left.totalCostMicros > right.totalCostMicros ? 1 : -1;
      if (delta !== 0) {
        return delta * factor;
      }
    } else if (sortBy === "messages") {
      const delta = left.totalMessages - right.totalMessages;
      if (delta !== 0) {
        return (delta > 0 ? 1 : -1) * factor;
      }
    } else if (sortBy === "target_date") {
      const delta = left.latestTargetDate.localeCompare(right.latestTargetDate);
      if (delta !== 0) {
        return delta * factor;
      }
    } else {
      const delta = compareIsoDesc(left.latestMessageAt, right.latestMessageAt);
      if (delta !== 0) {
        return delta * factor;
      }
    }
    return left.threadId.localeCompare(right.threadId, "vi");
  });
  return sorted;
}

function toThreadSummary(thread: ThreadAggregate) {
  return {
    threadId: thread.threadId,
    customerDisplayName: thread.customerDisplayName,
    dayCount: thread.dayCount,
    totalMessages: thread.totalMessages,
    totalCostMicros: thread.totalCostMicros.toString(),
    latestTargetDate: thread.latestTargetDate,
    latestMessageAt: thread.latestMessageAt,
    latestPrimaryNeed: thread.latestPrimaryNeed,
    latestCustomerMood: thread.latestCustomerMood,
    latestCustomerType: thread.latestCustomerType,
    latestRiskLevel: thread.latestRiskLevel,
    latestClosingOutcome: thread.latestClosingOutcome,
    latestOpeningTheme: thread.latestOpeningTheme,
    latestResponseQualityLabel: thread.latestResponseQualityLabel,
    latestProcessRiskReasonText: thread.latestProcessRiskReasonText
  };
}

function buildThreadSummaryFromRows(rows: PublishedSliceRow[]): ThreadAggregate {
  const [first] = buildThreadAggregates(rows, {});
  if (!first) {
    throw new Error("Thread aggregate is missing.");
  }
  return first;
}

function resolveSlice(startDate: string | null, endDate: string | null) {
  const today = new Date();
  const yesterday = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - 1));
  const fallback = toDateToken(yesterday);
  const start = startDate ?? fallback;
  const end = endDate ?? start;
  if (start > end) {
    return {
      startDate: end,
      endDate: start
    };
  }
  return {
    startDate: start,
    endDate: end
  };
}

function isInboxNew(row: PublishedSliceRow) {
  if (!row.threadFirstSeenAt) {
    return false;
  }
  const firstSeen = toDateToken(row.threadFirstSeenAt);
  const targetDate = toDateToken(row.targetDate);
  return firstSeen === targetDate;
}

function isGoodMood(value: string) {
  const token = value.toLowerCase();
  return token.includes("good")
    || token.includes("positive")
    || token.includes("tot")
    || token.includes("vui")
    || token.includes("tich_cuc");
}

function isRisk(value: string) {
  const token = value.toLowerCase();
  if (token.includes("unknown") || token.includes("none") || token.includes("low") || token.includes("thap")) {
    return false;
  }
  return true;
}

function isBookingNeed(value: string) {
  const token = value.toLowerCase();
  return token.includes("book")
    || token.includes("appointment")
    || token.includes("đặt")
    || token.includes("dat_lich")
    || token.includes("hen");
}

function isBookingSuccess(value: string) {
  const token = value.toLowerCase();
  return token.includes("success")
    || token.includes("done")
    || token.includes("confirmed")
    || token.includes("thanh_cong")
    || token.includes("đặt hẹn")
    || token.includes("da_hen");
}

function isRevisit(row: PublishedSliceRow) {
  const contentType = row.contentCustomerType.toLowerCase();
  if (contentType.includes("tai_kham") || contentType.includes("revisit")) {
    return true;
  }
  const normalizedSignals = JSON.stringify(row.normalizedTagSignalsJson ?? {}).toLowerCase();
  if (normalizedSignals.includes("tai_kham") || normalizedSignals.includes("revisit")) {
    return true;
  }
  const observedTags = JSON.stringify(row.observedTagsJson ?? []).toLowerCase();
  return observedTags.includes("tái khám") || observedTags.includes("tai kham");
}

function compareIsoDesc(left: string | null, right: string | null) {
  if (left === right) {
    return 0;
  }
  if (!left) {
    return 1;
  }
  if (!right) {
    return -1;
  }
  return right.localeCompare(left);
}

function clampLimit(value: number | null | undefined, fallback: number, cap: number) {
  if (!value || value <= 0) {
    return fallback;
  }
  return Math.min(value, cap);
}

function toDateToken(date: Date) {
  return date.toISOString().slice(0, 10);
}

export const readModelsService = new ReadModelsService();
