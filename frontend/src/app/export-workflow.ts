import type { ExportRequestInput, ExportWorkbookViewModel } from "../adapters/contracts.ts";
import type { BusinessPage } from "../core/types.ts";
import { defaultDateRange } from "../shared/dates.ts";

export type ExportWorkflowState = {
  selectedPageId: string;
  startDate: string;
  endDate: string;
  workbook: ExportWorkbookViewModel | null;
};

export function createDefaultExportWorkflowState(): ExportWorkflowState {
  const range = defaultDateRange("7d");
  return {
    selectedPageId: "",
    startDate: range.startDate,
    endDate: range.endDate,
    workbook: null
  };
}

export function ensureExportWorkflowPage(state: ExportWorkflowState, pages: BusinessPage[]) {
  if (pages.length === 0) {
    return state;
  }
  if (state.selectedPageId && pages.some((page) => page.id === state.selectedPageId)) {
    return state;
  }
  return {
    ...state,
    selectedPageId: pages[0]?.id ?? ""
  };
}

export function readExportRequest(data: FormData, fallback: ExportWorkflowState): ExportRequestInput {
  const pageId = String(data.get("pageId") ?? fallback.selectedPageId).trim();
  const startDate = String(data.get("startDate") ?? fallback.startDate).trim();
  const endDate = String(data.get("endDate") ?? fallback.endDate).trim();

  if (!pageId) {
    throw new Error("Cần chọn page để export.");
  }
  if (!startDate || !endDate) {
    throw new Error("Cần chọn khoảng ngày để export.");
  }
  if (startDate > endDate) {
    throw new Error("Khoảng ngày export không hợp lệ.");
  }

  return { pageId, startDate, endDate };
}
