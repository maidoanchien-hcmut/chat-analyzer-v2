import * as XLSX from "xlsx";
import type { ExportWorkbookViewModel } from "../adapters/contracts.ts";

export function exportBusinessWorkbook(workbookModel: ExportWorkbookViewModel) {
  if (!workbookModel.allowed) {
    throw new Error(workbookModel.reason);
  }

  const workbook = XLSX.utils.book_new();
  const sheetData: Array<Array<string | number>> = [
    ["Báo cáo xuất dữ liệu business-facing"],
    ["Page", workbookModel.pageLabel],
    ["Khoảng ngày", `${workbookModel.startDate} -> ${workbookModel.endDate}`],
    ["Generated at", workbookModel.generatedAt],
    ["Prompt version", workbookModel.promptVersion],
    ["Config version", workbookModel.configVersion],
    ["Taxonomy version", workbookModel.taxonomyVersion],
    [],
    ["Ngày", "Tổng inbox", "Inbox mới", "Tái khám", "Tỷ lệ chốt hẹn", "Risk cao", "Chi phí AI"]
  ];

  for (const row of workbookModel.rows) {
    sheetData.push([
      row.date,
      row.totalInbox,
      row.inboxNew,
      row.revisit,
      row.bookedRate,
      row.highRisk,
      row.aiCost
    ]);
  }

  const sheet = XLSX.utils.aoa_to_sheet(sheetData);
  XLSX.utils.book_append_sheet(workbook, sheet, "Thong ke");
  XLSX.writeFileXLSX(workbook, workbookModel.fileName);
}
