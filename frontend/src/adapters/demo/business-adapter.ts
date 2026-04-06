import type {
  BusinessAdapter,
  BusinessCatalog,
  ExportRequestInput,
  ExportWorkbookRow,
  ExplorationViewModel,
  OverviewViewModel,
  PageComparisonViewModel,
  StaffPerformanceViewModel,
  ThreadHistoryViewModel
} from "../contracts.ts";
import type { BusinessFilters } from "../../core/types.ts";

const catalog: BusinessCatalog = {
  pages: [
    { id: "page-a", label: "Page Da Liễu Quận 1", pancakePageId: "pk_101", timezone: "Asia/Ho_Chi_Minh" },
    { id: "page-b", label: "Page Nha Khoa Thủ Đức", pancakePageId: "pk_202", timezone: "Asia/Ho_Chi_Minh" }
  ],
  needs: [
    { value: "all", label: "Tất cả nhu cầu" },
    { value: "dat_lich", label: "Đặt lịch" },
    { value: "hoi_gia", label: "Hỏi giá" },
    { value: "tu_van", label: "Tư vấn chuyên sâu" }
  ],
  outcomes: [
    { value: "all", label: "Tất cả outcome" },
    { value: "booked", label: "Đã chốt hẹn" },
    { value: "pending", label: "Đang theo dõi" },
    { value: "lost", label: "Mất cơ hội" }
  ],
  risks: [
    { value: "all", label: "Tất cả rủi ro" },
    { value: "low", label: "Thấp" },
    { value: "medium", label: "Trung bình" },
    { value: "high", label: "Cao" }
  ],
  staff: [
    { value: "all", label: "Tất cả nhân viên" },
    { value: "linh", label: "Linh" },
    { value: "mai", label: "Mai" },
    { value: "khanh", label: "Khánh" }
  ]
};

export function createBusinessAdapter(): BusinessAdapter {
  return {
    async loadCatalog() {
      return catalog;
    },
    async getOverview(filters) {
      return buildOverview(filters);
    },
    async getExploration(filters) {
      return buildExploration(filters);
    },
    async getStaffPerformance(filters) {
      return buildStaff(filters);
    },
    async getThreadHistory(filters, threadId, threadDayId, tab) {
      return buildThreadHistory(filters, threadId, threadDayId, tab);
    },
    async getPageComparison(filters, comparePageIds) {
      return buildComparison(filters, comparePageIds);
    },
    async getExportWorkbook(input) {
      return buildExportWorkbook(input);
    }
  };
}

function buildOverview(filters: BusinessFilters): OverviewViewModel {
  const provisional = filters.publishSnapshot === "provisional";
  return {
    pageLabel: resolvePage(filters.pageId),
    snapshot: {
      kind: provisional ? "published_provisional" : "published_official",
      label: provisional ? "Tạm thời" : "Chính thức",
      coverage: provisional ? "00:00-10:30" : `${filters.startDate} -> ${filters.endDate}`,
      promptVersion: provisional ? "Prompt A12" : "Prompt A10",
      configVersion: provisional ? "v18" : "v17",
      taxonomyVersion: "tax-2026-04"
    },
    warning: provisional
      ? {
        title: "Snapshot đang là tạm thời",
        body: "Dashboard này đang đọc published_provisional. Export official bị chặn cho tới khi có full-day publish.",
        tone: "warning"
      }
      : null,
    metrics: [
      { label: "Tổng inbox", value: "412", delta: "+6.2%", hint: "Số thread trong slice đã chọn" },
      { label: "Inbox mới", value: "268", delta: "+4.4%", hint: "Deterministic theo thread_first_seen_at" },
      { label: "Inbox tái khám", value: "96", delta: "+9.1%", hint: "Official revisit label" },
      { label: "Tỷ lệ chốt hẹn", value: "37.8%", delta: "-1.1đ", hint: "Official closing outcome = booked" },
      { label: "Risk cao", value: "34", delta: "+5", hint: "Thread cần ưu tiên kiểm tra" },
      { label: "Chi phí AI", value: "182.000 đ", delta: "+12.000 đ", hint: "Tổng cost cho slice hiện tại" }
    ],
    openingNew: [
      { label: "Hỏi về điều trị mụn", value: "94", share: "35.1%" },
      { label: "Xin bảng giá dịch vụ", value: "61", share: "22.8%" },
      { label: "Muốn đặt lịch trong tuần", value: "54", share: "20.1%" }
    ],
    openingRevisit: [
      { label: "Nhắc lại lịch hẹn cũ", value: "38", share: "39.6%" },
      { label: "Hỏi lại toa điều trị", value: "31", share: "32.3%" },
      { label: "Báo tiến độ sau liệu trình", value: "18", share: "18.7%" }
    ],
    needs: [
      { label: "Đặt lịch", value: "164", share: "39.8%" },
      { label: "Hỏi giá", value: "101", share: "24.5%" },
      { label: "Tư vấn chuyên sâu", value: "84", share: "20.4%" }
    ],
    outcomes: [
      { label: "Đã chốt hẹn", value: "156", share: "37.8%" },
      { label: "Đang theo dõi", value: "171", share: "41.5%" },
      { label: "Mất cơ hội", value: "53", share: "12.9%" }
    ],
    sources: [
      { source: "Ads Retargeting 04", threads: 88, revisitRate: "31%", topNeed: "Đặt lịch", topOutcome: "Đã chốt hẹn" },
      { source: "Bài post skincare 12", threads: 63, revisitRate: "18%", topNeed: "Tư vấn chuyên sâu", topOutcome: "Đang theo dõi" }
    ],
    priorities: [
      {
        cluster: "Inbox mới / hỏi giá / risk cao",
        threadCount: 28,
        outcome: "Mất cơ hội",
        risk: "Cao",
        summary: "Khách rơi ở bước báo giá vì staff thiếu CTA chốt lịch.",
        drillLabel: "Mở khám phá dữ liệu",
        drillRoute: "?view=exploration"
      },
      {
        cluster: "Tái khám / nhắc lịch cũ / response quality thấp",
        threadCount: 17,
        outcome: "Đang theo dõi",
        risk: "Trung bình",
        summary: "Nhiều thread bị trễ xác nhận lại khung giờ và bác sĩ phụ trách.",
        drillLabel: "Mở lịch sử hội thoại",
        drillRoute: "?view=thread-history"
      }
    ]
  };
}

function buildExploration(filters: BusinessFilters): ExplorationViewModel {
  const provisional = filters.publishSnapshot === "provisional";
  return {
    metric: "Số thread",
    breakdownBy: "Opening theme",
    compareBy: "Inbox mới/cũ",
    chartSummary: "Stacked bar cho thấy nhóm hỏi giá tăng mạnh trong 3 ngày gần nhất, chủ yếu đến từ inbox mới.",
    rows: [
      { dimension: "Hỏi giá dịch vụ", metricValue: "101", share: "24.5%", drillRoute: "?view=thread-history&thread=t-1001" },
      { dimension: "Đặt lịch gấp", metricValue: "88", share: "21.3%", drillRoute: "?view=thread-history&thread=t-1002" },
      { dimension: "Tái khám sau liệu trình", metricValue: "73", share: "17.7%", drillRoute: "?view=thread-history&thread=t-1003" }
    ],
    warning: provisional
      ? {
        title: "Phân phối đang dùng snapshot tạm thời",
        body: "Có thể còn thiếu coverage cuối ngày. Không dùng để export chính thức.",
        tone: "warning"
      }
      : null
  };
}

function buildStaff(filters: BusinessFilters): StaffPerformanceViewModel {
  const provisional = filters.publishSnapshot === "provisional";
  return {
    warning: provisional
      ? {
        title: "Coaching inbox đang ở snapshot tạm thời",
        body: "Có thể còn thêm thread staff_thread_day khi official run hoàn tất.",
        tone: "warning"
      }
      : null,
    scorecards: [
      { label: "Staff active", value: "12", delta: "+1", hint: "Có tham gia thread trong slice" },
      { label: "Thread phản hồi tốt", value: "63.2%", delta: "+2.7đ", hint: "Response quality tốt trở lên" },
      { label: "Issue cần xem ngay", value: "31", delta: "+6", hint: "Risk cao hoặc issue lặp lại" },
      { label: "Median phản hồi đầu", value: "12 phút", delta: "-3 phút", hint: "Theo staff owner" }
    ],
    rankingRows: [
      { staff: "Linh", threads: 74, quality: "Tốt", responseTime: "9 phút", issue: "Thiếu xác nhận lịch vào buổi tối", suggestion: "Bổ sung CTA xác nhận slot" },
      { staff: "Mai", threads: 63, quality: "Cần cải thiện", responseTime: "17 phút", issue: "Báo giá nhưng chưa chốt bước kế tiếp", suggestion: "Dùng script chuyển sang đặt lịch" }
    ],
    issueMatrix: [
      { staff: "Mai", need: "Hỏi giá", quality: "Cần cải thiện", volume: "18" },
      { staff: "Khánh", need: "Tái khám", quality: "Trung bình", volume: "11" }
    ],
    coachingInbox: [
      { staff: "Mai", threadLabel: "Khách hỏi giá combo trị mụn", issue: "Báo giá dài nhưng không chốt lịch", improvement: "Sau báo giá cần đề xuất 2 khung giờ cụ thể", openRoute: "?view=thread-history&thread=t-1002" },
      { staff: "Khánh", threadLabel: "Khách tái khám nhắc toa cũ", issue: "Trễ xác nhận bác sĩ phụ trách", improvement: "Xác nhận trách nhiệm trong 1 nhịp đầu", openRoute: "?view=thread-history&thread=t-1004" }
    ]
  };
}

function buildThreadHistory(
  filters: BusinessFilters,
  threadId: string | null,
  threadDayId: string | null,
  tab: ThreadHistoryViewModel["activeTab"]
): ThreadHistoryViewModel {
  const scopedThreads = threadFixtures.filter((thread) => matchesThreadFilters(thread, filters));
  const activeThread = scopedThreads.find((thread) => thread.id === threadId) ?? scopedThreads[0] ?? threadFixtures[0];
  const activeThreadId = activeThread?.id ?? "";
  const activeThreadDayId = activeThread?.analysisHistory.find((row) => row.threadDayId === threadDayId)?.threadDayId
    ?? activeThread?.analysisHistory[0]?.threadDayId
    ?? null;

  return {
    warning: null,
    threads: scopedThreads.map((thread) => ({
      id: thread.id,
      customer: thread.customer,
      snippet: thread.snippet,
      updatedAt: thread.updatedAt,
      badges: thread.badges
    })),
    activeThreadId,
    activeThreadDayId,
    activeTab: tab,
    workspace: activeThread?.workspace ?? createThreadWorkspace(),
    transcript: activeThread?.transcript ?? [],
    analysisHistory: (activeThread?.analysisHistory ?? []).map((row) => ({
      ...row,
      active: row.threadDayId === activeThreadDayId
    })),
    audit: activeThread?.audit ?? {
      model: "gpt-5.4-mini",
      promptVersion: "Prompt A12",
      promptHash: "sha256:prompt-a12",
      taxonomyVersion: "tax-2026-04",
      evidence: [],
      explanations: [],
      supportingMessageIds: [],
      structuredOutput: []
    },
    crmLink: activeThread?.crmLink ?? {
      customer: "Chưa có thread trong scope filter",
      method: "deterministic",
      confidence: "0.00",
      history: ["Điều chỉnh filter để xem thread phù hợp."]
    }
  };
}

function buildComparison(filters: BusinessFilters, comparePageIds: string[]): PageComparisonViewModel {
  const comparedPages = comparePageIds.length > 0 ? comparePageIds.map(resolvePage) : catalog.pages.map((page) => page.label);
  return {
    warning: null,
    comparedPages,
    trendRows: [
      {
        date: filters.endDate,
        values: [
          { page: resolvePage("page-a"), volume: "184", conversion: "38.1%", aiCost: "81.000 đ" },
          { page: resolvePage("page-b"), volume: "137", conversion: "29.4%", aiCost: "63.000 đ" }
        ]
      }
    ],
    mixCards: [
      { title: "Need mix", summary: "Page Da Liễu có tỷ trọng đặt lịch cao hơn, Page Nha Khoa nhiều thread hỏi giá hơn." },
      { title: "Risk / quality mix", summary: "Page Nha Khoa có nhiều thread risk cao gắn với phản hồi chậm cuối ca." }
    ]
  };
}

function buildExportWorkbook(input: ExportRequestInput) {
  const pageLabel = resolvePage(input.pageId);
  const rows = officialRowsByPage[input.pageId] ?? [];
  const selectedRows = rows.filter((row) => row.date >= input.startDate && row.date <= input.endDate);
  const promptVersions = uniqueValues(selectedRows.map((row) => row.promptVersion));
  const configVersions = uniqueValues(selectedRows.map((row) => row.configVersion));
  const taxonomyVersions = uniqueValues(selectedRows.map((row) => row.taxonomyVersion));

  if (selectedRows.length === 0) {
    return {
      allowed: false,
      reason: "Khoảng ngày đã chọn không có ngày nào có published_official để export.",
      fileName: `export-${input.pageId}-${input.startDate}-${input.endDate}.xlsx`,
      pageId: input.pageId,
      pageLabel,
      startDate: input.startDate,
      endDate: input.endDate,
      generatedAt: "2026-04-04T09:30:00+07:00",
      promptVersion: "Không có dữ liệu official",
      configVersion: "Không có dữ liệu official",
      taxonomyVersion: "Không có dữ liệu official",
      rows: []
    };
  }

  return {
    allowed: true,
    reason: "Đã tìm thấy ngày có published_official trong khoảng chọn.",
    fileName: `export-${input.pageId}-${input.startDate}-${input.endDate}.xlsx`,
    pageId: input.pageId,
    pageLabel,
    startDate: input.startDate,
    endDate: input.endDate,
    generatedAt: "2026-04-04T09:30:00+07:00",
    promptVersion: summarizeVersions(promptVersions),
    configVersion: summarizeVersions(configVersions),
    taxonomyVersion: summarizeVersions(taxonomyVersions),
    rows: selectedRows
  };
}

function resolvePage(pageId: string) {
  return catalog.pages.find((page) => page.id === pageId)?.label ?? catalog.pages[0].label;
}

const officialRowsByPage: Record<string, ExportWorkbookRow[]> = {
  "page-a": [
    {
      date: "2026-04-01",
      totalInbox: 184,
      inboxNew: 112,
      revisit: 41,
      bookedRate: "38.1%",
      highRisk: 14,
      aiCost: "81.000 đ",
      promptVersion: "Prompt A10",
      configVersion: "v17",
      taxonomyVersion: "tax-2026-04"
    },
    {
      date: "2026-04-03",
      totalInbox: 191,
      inboxNew: 118,
      revisit: 44,
      bookedRate: "39.4%",
      highRisk: 16,
      aiCost: "84.000 đ",
      promptVersion: "Prompt A10",
      configVersion: "v17",
      taxonomyVersion: "tax-2026-04"
    }
  ],
  "page-b": [
    {
      date: "2026-04-02",
      totalInbox: 137,
      inboxNew: 88,
      revisit: 23,
      bookedRate: "29.4%",
      highRisk: 11,
      aiCost: "63.000 đ",
      promptVersion: "Prompt B05",
      configVersion: "v11",
      taxonomyVersion: "tax-2026-04"
    },
    {
      date: "2026-04-03",
      totalInbox: 142,
      inboxNew: 90,
      revisit: 24,
      bookedRate: "31.0%",
      highRisk: 10,
      aiCost: "64.000 đ",
      promptVersion: "Prompt B05",
      configVersion: "v11",
      taxonomyVersion: "tax-2026-04"
    },
    {
      date: "2026-04-04",
      totalInbox: 145,
      inboxNew: 92,
      revisit: 25,
      bookedRate: "31.7%",
      highRisk: 9,
      aiCost: "65.000 đ",
      promptVersion: "Prompt B05",
      configVersion: "v11",
      taxonomyVersion: "tax-2026-04"
    }
  ]
};

function uniqueValues(values: string[]) {
  return [...new Set(values)];
}

function summarizeVersions(values: string[]) {
  if (values.length === 1) {
    return values[0] ?? "";
  }
  return values.join(", ");
}

type ThreadFixture = {
  id: string;
  pageId: string;
  customer: string;
  snippet: string;
  updatedAt: string;
  inboxBucket: "new" | "old";
  revisit: boolean;
  need: string;
  outcome: string;
  risk: string;
  staff: string;
  badges: string[];
  workspace: ThreadHistoryViewModel["workspace"];
  transcript: ThreadHistoryViewModel["transcript"];
  analysisHistory: ThreadHistoryViewModel["analysisHistory"];
  audit: ThreadHistoryViewModel["audit"];
  crmLink: ThreadHistoryViewModel["crmLink"];
};

function createThreadWorkspace(
  overrides: Partial<ThreadHistoryViewModel["workspace"]> = {}
): ThreadHistoryViewModel["workspace"] {
  return {
    openingBlockMessages: [],
    explicitSignals: [],
    normalizedTagSignals: [],
    sourceSignals: {
      explicitRevisit: null,
      explicitNeed: null,
      explicitOutcome: null
    },
    structuredOutput: [],
    sourceThreadJsonRedacted: {},
    ...overrides
  };
}

const threadFixtures: ThreadFixture[] = [
  {
    id: "t-1001",
    pageId: "page-a",
    customer: "Lan Anh",
    snippet: "Em muốn đặt lịch treatment mụn tuần này",
    updatedAt: "2026-04-03T10:20:00+07:00",
    inboxBucket: "new",
    revisit: false,
    need: "dat_lich",
    outcome: "booked",
    risk: "low",
    staff: "mai",
    badges: ["Inbox mới", "Risk thấp"],
    workspace: createThreadWorkspace({
      openingBlockMessages: [
        { messageId: "m-001", senderRole: "customer", messageType: "text", text: "Em muốn đặt lịch treatment mụn tuần này" }
      ],
      structuredOutput: [
        { field: "closing_outcome", code: "booked", label: "Đã chốt hẹn", reason: "Staff đề xuất slot cụ thể." }
      ]
    }),
    transcript: [
      { id: "m-001", at: "10:03", author: "Lan Anh", role: "customer", text: "Em muốn đặt lịch treatment mụn tuần này", emphasized: true, isFirstMeaningful: true, isSupportingEvidence: true },
      { id: "m-002", at: "10:08", author: "Mai", role: "staff", text: "Chiều thứ 5 còn 16:00, em xác nhận giúp chị nhé.", isStaffFirstResponse: true, isSupportingEvidence: true }
    ],
    analysisHistory: [
      { threadDayId: "td-1001-2026-04-03", date: "2026-04-03", openingTheme: "Đặt lịch treatment", need: "Đặt lịch", outcome: "Đã chốt hẹn", mood: "Tích cực", risk: "Thấp", quality: "Tốt", aiCost: "4.100 đ", active: true }
    ],
    audit: {
      model: "gpt-5.4-mini",
      promptVersion: "Prompt A12",
      promptHash: "sha256:prompt-a12",
      taxonomyVersion: "tax-2026-04",
      evidence: [
        "Khách yêu cầu slot trong tuần",
        "Staff đề xuất slot cụ thể"
      ],
      explanations: [
        { field: "outcome", explanation: "Có xác nhận slot cụ thể trong cùng nhịp trao đổi." }
      ],
      supportingMessageIds: ["m-001", "m-002"],
      structuredOutput: [
        { field: "closing_outcome", code: "booked", label: "Đã chốt hẹn", reason: "Staff đề xuất slot cụ thể." }
      ]
    },
    crmLink: {
      customer: "CRM #KH-7712 / Lan Anh",
      method: "deterministic",
      confidence: "0.97",
      history: ["Matched qua số điện thoại gần nhất"]
    }
  },
  {
    id: "t-1002",
    pageId: "page-a",
    customer: "Phương Thảo",
    snippet: "Cho em hỏi giá liệu trình 6 buổi",
    updatedAt: "2026-04-03T09:40:00+07:00",
    inboxBucket: "new",
    revisit: false,
    need: "hoi_gia",
    outcome: "pending",
    risk: "high",
    staff: "mai",
    badges: ["Inbox mới", "Risk cao"],
    workspace: createThreadWorkspace({
      openingBlockMessages: [
        { messageId: "m-010", senderRole: "customer", messageType: "text", text: "Cho em hỏi giá liệu trình 6 buổi" }
      ],
      structuredOutput: [
        { field: "process_risk_level", code: "high", label: "Cao", reason: "Chưa có CTA chốt bước kế tiếp." }
      ]
    }),
    transcript: [
      { id: "m-010", at: "09:12", author: "Phương Thảo", role: "customer", text: "Cho em hỏi giá liệu trình 6 buổi", emphasized: true, isFirstMeaningful: true, isSupportingEvidence: true },
      { id: "m-011", at: "09:26", author: "Mai", role: "staff", text: "Combo hiện tại là 5.900.000 đ, chị gửi em chi tiết liệu trình nhé.", isStaffFirstResponse: true, isSupportingEvidence: true }
    ],
    analysisHistory: [
      { threadDayId: "td-1002-2026-04-03", date: "2026-04-03", openingTheme: "Hỏi giá dịch vụ", need: "Hỏi giá", outcome: "Đang theo dõi", mood: "Trung tính", risk: "Cao", quality: "Cần cải thiện", aiCost: "5.900 đ", active: true }
    ],
    audit: {
      model: "gpt-5.4-mini",
      promptVersion: "Prompt A12",
      promptHash: "sha256:prompt-a12",
      taxonomyVersion: "tax-2026-04",
      evidence: [
        "Khách hỏi giá gói 6 buổi",
        "Staff chưa đưa CTA chốt lịch"
      ],
      explanations: [
        { field: "risk_level", explanation: "Khách có ý định rõ nhưng chưa được chốt bước kế tiếp." }
      ],
      supportingMessageIds: ["m-010", "m-011"],
      structuredOutput: [
        { field: "process_risk_level", code: "high", label: "Cao", reason: "Chưa có CTA chốt bước kế tiếp." }
      ]
    },
    crmLink: {
      customer: "CRM #KH-9910 / Phương Thảo",
      method: "deterministic",
      confidence: "0.92",
      history: ["Matched qua lịch sử hỏi giá gần nhất"]
    }
  },
  {
    id: "t-1004",
    pageId: "page-b",
    customer: "Bảo Trâm",
    snippet: "Em tái khám và cần dời lịch",
    updatedAt: "2026-04-03T08:10:00+07:00",
    inboxBucket: "old",
    revisit: true,
    need: "dat_lich",
    outcome: "pending",
    risk: "medium",
    staff: "linh",
    badges: ["Tái khám", "Risk trung bình"],
    workspace: createThreadWorkspace({
      openingBlockMessages: [
        { messageId: "m-100", senderRole: "system", messageType: "postback", text: "Khách chọn nút Khách hàng tái khám" },
        { messageId: "m-101", senderRole: "customer", messageType: "text", text: "Em muốn dời lịch tái khám sang chiều mai" }
      ],
      explicitSignals: [
        { signalRole: "journey", signalCode: "revisit", rawText: "Khách hàng tái khám" }
      ],
      sourceSignals: {
        explicitRevisit: "revisit",
        explicitNeed: "dat_lich",
        explicitOutcome: null
      },
      structuredOutput: [
        { field: "journey", code: "revisit", label: "Tái khám", reason: "Opening selection xác nhận journey." }
      ]
    }),
    transcript: [
      { id: "m-100", at: "08:02", author: "Bot", role: "system", text: "Khách chọn nút Khách hàng tái khám", emphasized: true, isSupportingEvidence: true },
      { id: "m-101", at: "08:03", author: "Bảo Trâm", role: "customer", text: "Em muốn dời lịch tái khám sang chiều mai", emphasized: true, isFirstMeaningful: true, isSupportingEvidence: true },
      { id: "m-102", at: "08:17", author: "Linh", role: "staff", text: "Chị giúp em kiểm tra slot chiều mai, em chờ chị chút nhé", emphasized: true, isStaffFirstResponse: true, isSupportingEvidence: true },
      { id: "m-103", at: "08:32", author: "Linh", role: "staff", text: "Chiều mai còn 15:00 và 16:30, em chọn giúp chị nhé" }
    ],
    analysisHistory: [
      { threadDayId: "td-1004-2026-04-03", date: "2026-04-03", openingTheme: "Dời lịch tái khám", need: "Đặt lịch", outcome: "Đang theo dõi", mood: "Trung tính", risk: "Trung bình", quality: "Cần cải thiện", aiCost: "6.400 đ", active: true },
      { threadDayId: "td-1004-2026-04-01", date: "2026-04-01", openingTheme: "Báo tiến độ điều trị", need: "Tư vấn chuyên sâu", outcome: "Đang theo dõi", mood: "Tích cực", risk: "Thấp", quality: "Tốt", aiCost: "5.800 đ", active: false }
    ],
    audit: {
      model: "gpt-5.4-mini",
      promptVersion: "Prompt A12",
      promptHash: "sha256:prompt-a12",
      taxonomyVersion: "tax-2026-04",
      evidence: [
        "Opening selection = Khách hàng tái khám",
        "Khách yêu cầu dời lịch sang chiều mai",
        "Staff phản hồi sau 14 phút"
      ],
      explanations: [
        { field: "journey", explanation: "Explicit opening selection xác nhận đây là tái khám." },
        { field: "response_quality", explanation: "Staff có xử lý nhưng chậm xác nhận slot cụ thể." }
      ],
      supportingMessageIds: ["m-100", "m-101", "m-102"],
      structuredOutput: [
        { field: "journey", code: "revisit", label: "Tái khám", reason: "Opening selection xác nhận journey." }
      ]
    },
    crmLink: {
      customer: "CRM #KH-8821 / Bảo Trâm",
      method: "deterministic",
      confidence: "0.98",
      history: [
        "Matched qua recent_phone_numbers 09xx",
        "Không có quyết định manual override"
      ]
    }
  },
  {
    id: "t-1005",
    pageId: "page-b",
    customer: "Minh Châu",
    snippet: "Bác sĩ còn nhận tư vấn răng sứ cuối tuần không ạ",
    updatedAt: "2026-04-02T16:45:00+07:00",
    inboxBucket: "new",
    revisit: false,
    need: "tu_van",
    outcome: "lost",
    risk: "high",
    staff: "khanh",
    badges: ["Inbox mới", "Risk cao"],
    workspace: createThreadWorkspace({
      openingBlockMessages: [
        { messageId: "m-201", senderRole: "customer", messageType: "text", text: "Bác sĩ còn nhận tư vấn răng sứ cuối tuần không ạ" }
      ],
      structuredOutput: [
        { field: "closing_outcome", code: "lost", label: "Mất cơ hội", reason: "Không có next step thay thế." }
      ]
    }),
    transcript: [
      { id: "m-201", at: "16:12", author: "Minh Châu", role: "customer", text: "Bác sĩ còn nhận tư vấn răng sứ cuối tuần không ạ", emphasized: true, isFirstMeaningful: true, isSupportingEvidence: true },
      { id: "m-202", at: "16:41", author: "Khánh", role: "staff", text: "Dạ cuối tuần kín lịch rồi chị, em xin phép báo lại khi có slot trống.", isStaffFirstResponse: true, isSupportingEvidence: true }
    ],
    analysisHistory: [
      { threadDayId: "td-1005-2026-04-02", date: "2026-04-02", openingTheme: "Tư vấn răng sứ", need: "Tư vấn chuyên sâu", outcome: "Mất cơ hội", mood: "Trung tính", risk: "Cao", quality: "Cần cải thiện", aiCost: "4.900 đ", active: true }
    ],
    audit: {
      model: "gpt-5.4-mini",
      promptVersion: "Prompt B05",
      promptHash: "sha256:prompt-b05",
      taxonomyVersion: "tax-2026-04",
      evidence: [
        "Khách hỏi tư vấn cuối tuần",
        "Staff chưa đề xuất slot thay thế"
      ],
      explanations: [
        { field: "outcome", explanation: "Không có next step thay thế nên opportunity bị mất." }
      ],
      supportingMessageIds: ["m-201", "m-202"],
      structuredOutput: [
        { field: "closing_outcome", code: "lost", label: "Mất cơ hội", reason: "Không có next step thay thế." }
      ]
    },
    crmLink: {
      customer: "CRM #KH-7718 / Minh Châu",
      method: "deterministic",
      confidence: "0.83",
      history: ["Matched qua lịch sử tư vấn nha khoa"]
    }
  }
];

function matchesThreadFilters(thread: ThreadFixture, filters: BusinessFilters) {
  const threadDate = thread.updatedAt.slice(0, 10);

  if (thread.pageId !== filters.pageId) {
    return false;
  }
  if (threadDate < filters.startDate || threadDate > filters.endDate) {
    return false;
  }
  if (filters.inboxBucket !== "all" && thread.inboxBucket !== filters.inboxBucket) {
    return false;
  }
  if (filters.revisit === "revisit" && !thread.revisit) {
    return false;
  }
  if (filters.revisit === "not_revisit" && thread.revisit) {
    return false;
  }
  if (filters.need !== "all" && thread.need !== filters.need) {
    return false;
  }
  if (filters.outcome !== "all" && thread.outcome !== filters.outcome) {
    return false;
  }
  if (filters.risk !== "all" && thread.risk !== filters.risk) {
    return false;
  }
  if (filters.staff !== "all" && thread.staff !== filters.staff) {
    return false;
  }

  return true;
}
