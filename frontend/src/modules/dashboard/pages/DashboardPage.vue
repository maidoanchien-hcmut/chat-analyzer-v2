<template>
  <div class="dashboard-page">
    <div class="dashboard-page__top">
      <div class="dashboard-page__title">
        <h1>Dashboard</h1>
      </div>

      <div class="dashboard-page__controls">
        <DashboardDateRangePicker v-model="selectedDateRange" :today="today" />
        <VSelect
          v-model="selectedSourceId"
          :items="sourceOptions"
          item-title="label"
          item-value="id"
          label="Trang nguồn dữ liệu"
          hide-details
          class="dashboard-page__source-select"
        />
      </div>
    </div>

    <div class="dashboard-page__kpis">
      <DashboardKpiCard
        v-for="metric in kpiMetrics"
        :key="metric.label"
        :icon="metric.icon"
        :label="metric.label"
        :value="metric.value"
        :helper="metric.helper"
        :tone="metric.tone"
      />
    </div>

    <DashboardFilterPanel
      v-model:search-query="searchQuery"
      v-model:expanded="isFilterExpanded"
      :result-count="visibleConversations.length"
      :selected-filter-labels="activeFilterLabels"
      :groups="filterGroups"
      @set-group="handleSetDraftFilterGroup"
      @reset-draft="resetDraftFilters"
      @apply-filters="applyFilters"
    />

    <div class="dashboard-page__content">
      <DashboardConversationList
        :conversations="visibleConversations"
        :visible-count="visibleConversations.length"
        :total-count="scopedConversations.length"
      />

      <DashboardDistributionCard
        v-model:selected-dimension="selectedDistributionDimension"
        :dimension-options="availableDistributionDimensions"
        :current-dimension-label="currentDistributionLabel"
        :segments="distributionSegments"
        :total-count="visibleConversations.length"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import DashboardConversationList from "@/modules/dashboard/components/DashboardConversationList.vue";
import DashboardDateRangePicker from "@/modules/dashboard/components/DashboardDateRangePicker.vue";
import DashboardDistributionCard from "@/modules/dashboard/components/DashboardDistributionCard.vue";
import DashboardFilterPanel from "@/modules/dashboard/components/DashboardFilterPanel.vue";
import DashboardKpiCard from "@/modules/dashboard/components/DashboardKpiCard.vue";
import { dashboardConversations } from "@/modules/dashboard/mock-data";
import { useDashboardUiState } from "@/modules/dashboard/state";
import type {
  ClosingOutcome,
  DashboardConversation,
  DistributionDimension,
  InboxStatus,
  NeedCategory,
  RevisitStatus,
  RiskLevel,
  SentimentLabel
} from "@/modules/dashboard/types";
import {
  compareConversationsByOccurredAt,
  formatClosingOutcomeLabel,
  formatCurrency,
  formatDistributionDimensionLabel,
  formatDistributionValueLabel,
  formatInboxStatusLabel,
  formatMetricNumber,
  formatRevisitStatusLabel,
  formatRiskLevelLabel,
  formatSentimentLabel,
  getRiskLevel,
  isConversationInDateRange
} from "@/modules/dashboard/utils";

type FilterState = {
  inboxStatus: InboxStatus | null;
  revisitStatus: RevisitStatus | null;
  need: NeedCategory | null;
  sentiment: SentimentLabel | null;
  closingOutcome: ClosingOutcome | null;
  riskLevel: RiskLevel | null;
};

const { selectedDateRange, selectedSourceId, sourceOptions, today } = useDashboardUiState();

const searchQuery = ref("");
const isFilterExpanded = ref(false);
const selectedDistributionDimension = ref<DistributionDimension>("need");
const distributionColors = ["#0f766e", "#155e75", "#f59e0b", "#c2410c", "#64748b", "#94a3b8"];

const filters = reactive(createEmptyFilterState());
const draftFilters = reactive(createEmptyFilterState());

const selectedSource = computed(() => {
  return sourceOptions.find((source) => source.id === selectedSourceId.value) ?? sourceOptions[0];
});

const scopedConversations = computed(() => {
  return dashboardConversations
    .filter((conversation) => conversation.sourceId === selectedSourceId.value)
    .filter((conversation) => isConversationInDateRange(conversation, selectedDateRange.value))
    .sort(compareConversationsByOccurredAt);
});

const visibleConversations = computed(() => {
  const keyword = searchQuery.value.trim().toLowerCase();

  return scopedConversations.value.filter((conversation) => {
    const matchedKeyword =
      keyword.length === 0 ||
      conversation.customerName.toLowerCase().includes(keyword) ||
      conversation.staffName.toLowerCase().includes(keyword);

    if (!matchedKeyword) {
      return false;
    }

    if (filters.inboxStatus && filters.inboxStatus !== conversation.inboxStatus) {
      return false;
    }

    if (filters.revisitStatus && filters.revisitStatus !== conversation.revisitStatus) {
      return false;
    }

    if (filters.need && filters.need !== conversation.primaryNeed) {
      return false;
    }

    if (filters.sentiment && filters.sentiment !== conversation.sentiment) {
      return false;
    }

    if (filters.closingOutcome && filters.closingOutcome !== conversation.closingOutcome) {
      return false;
    }

    if (filters.riskLevel && filters.riskLevel !== getRiskLevel(conversation)) {
      return false;
    }

    return true;
  });
});

const kpiMetrics = computed(() => {
  const totalInbox = scopedConversations.value.length;
  const newInbox = scopedConversations.value.filter((item) => item.inboxStatus === "new").length;
  const existingInbox = scopedConversations.value.filter(
    (item) => item.inboxStatus === "existing"
  ).length;
  const warningCount = scopedConversations.value.reduce((sum, item) => sum + item.warningCount, 0);
  const aiCost = scopedConversations.value.reduce((sum, item) => sum + item.aiCost, 0);

  return [
    {
      icon: "mdi-email-multiple-outline",
      label: "Tổng số inbox",
      value: formatMetricNumber(totalInbox),
      helper: selectedSource.value.label,
      tone: "primary" as const
    },
    {
      icon: "mdi-account-plus-outline",
      label: "Inbox mới",
      value: formatMetricNumber(newInbox),
      helper: "Thread xuất hiện lần đầu trong khoảng đang xem",
      tone: "accent" as const
    },
    {
      icon: "mdi-account-convert-outline",
      label: "Inbox cũ",
      value: formatMetricNumber(existingInbox),
      helper: "Thread đã tồn tại trước khoảng đang xem",
      tone: "neutral" as const
    },
    {
      icon: "mdi-alert-outline",
      label: "Số lượng cảnh báo",
      value: formatMetricNumber(warningCount),
      helper: "Tổng risk flag của tập hội thoại trong kỳ",
      tone: "accent" as const
    },
    {
      icon: "mdi-robot-outline",
      label: "Chi phí AI",
      value: formatCurrency(aiCost),
      helper: "Tổng chi phí AI trong khoảng đang xem",
      tone: "neutral" as const
    }
  ];
});

const filterGroups = computed(() => {
  return [
    {
      key: "inboxStatus",
      label: "Loại inbox",
      selected: draftFilters.inboxStatus,
      options: [
        { value: "new", label: "Inbox mới" },
        { value: "existing", label: "Inbox cũ" }
      ]
    },
    {
      key: "revisitStatus",
      label: "Nhãn tái khám",
      selected: draftFilters.revisitStatus,
      options: [
        { value: "revisit", label: "Tái khám" },
        { value: "first_visit", label: "Không tái khám" }
      ]
    },
    {
      key: "need",
      label: "Nhu cầu chính",
      selected: draftFilters.need,
      options: [
        { value: "Đặt lịch", label: "Đặt lịch" },
        { value: "Báo giá", label: "Báo giá" },
        { value: "Tư vấn dịch vụ", label: "Tư vấn dịch vụ" },
        { value: "Tái khám", label: "Tái khám" },
        { value: "Khiếu nại", label: "Khiếu nại" }
      ]
    },
    {
      key: "sentiment",
      label: "Cảm xúc",
      selected: draftFilters.sentiment,
      options: [
        { value: "positive", label: "Tích cực" },
        { value: "neutral", label: "Trung tính" },
        { value: "negative", label: "Tiêu cực" }
      ]
    },
    {
      key: "closingOutcome",
      label: "Kết quả chốt",
      selected: draftFilters.closingOutcome,
      options: [
        { value: "won", label: "Đã chốt" },
        { value: "open", label: "Đang theo dõi" },
        { value: "lost", label: "Đã mất" }
      ]
    },
    {
      key: "riskLevel",
      label: "Cảnh báo",
      selected: draftFilters.riskLevel,
      options: [
        { value: "flagged", label: "Có cảnh báo" },
        { value: "clear", label: "Không cảnh báo" }
      ]
    }
  ];
});

const activeFilterLabels = computed(() => {
  return [
    filters.inboxStatus ? formatInboxStatusLabel(filters.inboxStatus) : null,
    filters.revisitStatus ? formatRevisitStatusLabel(filters.revisitStatus) : null,
    filters.need,
    filters.sentiment ? formatSentimentLabel(filters.sentiment) : null,
    filters.closingOutcome ? formatClosingOutcomeLabel(filters.closingOutcome) : null,
    filters.riskLevel ? formatRiskLevelLabel(filters.riskLevel) : null
  ].filter((value): value is string => Boolean(value));
});

const availableDistributionDimensions = computed(() => {
  const options = [
    { value: "inboxStatus", label: "Loại inbox" },
    { value: "revisitStatus", label: "Nhãn tái khám" },
    { value: "need", label: "Nhu cầu" },
    { value: "sentiment", label: "Cảm xúc" },
    { value: "closingOutcome", label: "Kết quả chốt" },
    { value: "riskLevel", label: "Cảnh báo" }
  ].filter((option) => !isDimensionFiltered(option.value as DistributionDimension));

  return options.length > 0 ? options : [{ value: "need", label: "Nhu cầu" }];
});

const currentDistributionLabel = computed(() => {
  return formatDistributionDimensionLabel(selectedDistributionDimension.value);
});

const distributionSegments = computed(() => {
  const groups = new Map<string, number>();

  for (const conversation of visibleConversations.value) {
    const key = getDistributionValue(conversation, selectedDistributionDimension.value);
    groups.set(key, (groups.get(key) ?? 0) + 1);
  }

  return Array.from(groups.entries())
    .sort((left, right) => right[1] - left[1])
    .map(([label, count], index) => ({
      label: formatDistributionValueLabel(selectedDistributionDimension.value, label),
      count,
      share:
        visibleConversations.value.length === 0
          ? "0%"
          : `${Math.round((count / visibleConversations.value.length) * 100)}%`,
      color: distributionColors[index % distributionColors.length]
    }));
});

watch(availableDistributionDimensions, (options) => {
  const hasSelectedValue = options.some(
    (option) => option.value === selectedDistributionDimension.value
  );

  if (!hasSelectedValue) {
    selectedDistributionDimension.value = options[0]?.value as DistributionDimension;
  }
});

watch(isFilterExpanded, (value) => {
  if (value) {
    syncDraftFilters();
  }
});

function createEmptyFilterState(): FilterState {
  return {
    inboxStatus: null,
    revisitStatus: null,
    need: null,
    sentiment: null,
    closingOutcome: null,
    riskLevel: null
  };
}

function syncDraftFilters() {
  draftFilters.inboxStatus = filters.inboxStatus;
  draftFilters.revisitStatus = filters.revisitStatus;
  draftFilters.need = filters.need;
  draftFilters.sentiment = filters.sentiment;
  draftFilters.closingOutcome = filters.closingOutcome;
  draftFilters.riskLevel = filters.riskLevel;
}

function handleSetDraftFilterGroup(payload: { groupKey: string; value: string | null }) {
  switch (payload.groupKey) {
    case "inboxStatus":
      draftFilters.inboxStatus = payload.value as InboxStatus | null;
      return;
    case "revisitStatus":
      draftFilters.revisitStatus = payload.value as RevisitStatus | null;
      return;
    case "need":
      draftFilters.need = payload.value as NeedCategory | null;
      return;
    case "sentiment":
      draftFilters.sentiment = payload.value as SentimentLabel | null;
      return;
    case "closingOutcome":
      draftFilters.closingOutcome = payload.value as ClosingOutcome | null;
      return;
    case "riskLevel":
      draftFilters.riskLevel = payload.value as RiskLevel | null;
      return;
    default:
      return;
  }
}

function resetDraftFilters() {
  draftFilters.inboxStatus = null;
  draftFilters.revisitStatus = null;
  draftFilters.need = null;
  draftFilters.sentiment = null;
  draftFilters.closingOutcome = null;
  draftFilters.riskLevel = null;
}

function applyFilters() {
  filters.inboxStatus = draftFilters.inboxStatus;
  filters.revisitStatus = draftFilters.revisitStatus;
  filters.need = draftFilters.need;
  filters.sentiment = draftFilters.sentiment;
  filters.closingOutcome = draftFilters.closingOutcome;
  filters.riskLevel = draftFilters.riskLevel;
  isFilterExpanded.value = false;
}

function isDimensionFiltered(dimension: DistributionDimension) {
  if (dimension === "inboxStatus") {
    return Boolean(filters.inboxStatus);
  }

  if (dimension === "revisitStatus") {
    return Boolean(filters.revisitStatus);
  }

  if (dimension === "need") {
    return Boolean(filters.need);
  }

  if (dimension === "sentiment") {
    return Boolean(filters.sentiment);
  }

  if (dimension === "closingOutcome") {
    return Boolean(filters.closingOutcome);
  }

  return Boolean(filters.riskLevel);
}

function getDistributionValue(
  conversation: DashboardConversation,
  dimension: DistributionDimension
) {
  if (dimension === "inboxStatus") {
    return conversation.inboxStatus;
  }

  if (dimension === "revisitStatus") {
    return conversation.revisitStatus;
  }

  if (dimension === "need") {
    return conversation.primaryNeed;
  }

  if (dimension === "sentiment") {
    return conversation.sentiment;
  }

  if (dimension === "closingOutcome") {
    return conversation.closingOutcome;
  }

  return getRiskLevel(conversation);
}
</script>

<style scoped>
.dashboard-page {
  display: grid;
  gap: 18px;
}

.dashboard-page__top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.dashboard-page__title h1 {
  margin: 0;
  font-size: clamp(1.9rem, 2.8vw, 2.6rem);
  line-height: 1;
}

.dashboard-page__controls {
  display: grid;
  grid-template-columns: minmax(280px, 1fr) minmax(240px, 300px);
  gap: 12px;
  width: min(100%, 640px);
}

.dashboard-page__source-select {
  min-width: 0;
}

.dashboard-page__kpis {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 14px;
}

.dashboard-page__content {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(300px, 360px);
  gap: 18px;
  align-items: start;
}

@media (max-width: 1240px) {
  .dashboard-page__kpis {
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  }
}

@media (max-width: 1100px) {
  .dashboard-page__content {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 900px) {
  .dashboard-page__top {
    display: grid;
  }

  .dashboard-page__controls {
    grid-template-columns: 1fr;
    width: 100%;
  }
}
</style>
