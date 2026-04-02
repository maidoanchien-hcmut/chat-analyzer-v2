import { ref } from "vue";
import { dashboardMockToday, dashboardSourceOptions } from "@/modules/dashboard/mock-data";
import type { DashboardDateRange, DashboardSourceId } from "@/modules/dashboard/types";

const selectedSourceId = ref<DashboardSourceId>("page-a");
const selectedDateRange = ref<DashboardDateRange>({
  start: dashboardMockToday,
  end: dashboardMockToday
});

export function useDashboardUiState() {
  return {
    selectedSourceId,
    selectedDateRange,
    sourceOptions: dashboardSourceOptions,
    today: dashboardMockToday
  };
}
