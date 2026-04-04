import type { BusinessPage } from "../../core/types.ts";
import type { ExportWorkflowState } from "../../app/export-workflow.ts";
import { escapeHtml } from "../../shared/html.ts";

export function renderExportWorkflow(
  state: ExportWorkflowState,
  pages: BusinessPage[],
  closeRoute: string
) {
  const workbook = state.workbook;

  return `
    <section class="panel-card utility-panel">
      <div class="section-headline">
        <div>
          <p class="eyebrow">Workflow riêng</p>
          <h3>Export .xlsx</h3>
          <p class="muted-copy">Export không kế thừa current view hoặc business filters. User chọn tường minh page và khoảng ngày.</p>
        </div>
        <button data-route="${escapeHtml(closeRoute)}">Đóng</button>
      </div>
      <form data-form="export-workflow">
        <label>
          <span>Page</span>
          <select name="pageId">
            <option value="">Chọn page</option>
            ${pages.map((page) => `<option value="${escapeHtml(page.id)}" ${page.id === state.selectedPageId ? "selected" : ""}>${escapeHtml(page.label)}</option>`).join("")}
          </select>
        </label>
        <label><span>Từ ngày</span><input type="date" name="startDate" value="${escapeHtml(state.startDate)}" /></label>
        <label><span>Đến ngày</span><input type="date" name="endDate" value="${escapeHtml(state.endDate)}" /></label>
        <div class="button-row">
          <button type="submit">Xem dữ liệu export</button>
          <button type="button" data-action="download-export-workbook" ${workbook?.allowed ? "" : "disabled"}>Tải .xlsx</button>
        </div>
      </form>
      ${workbook ? renderWorkbookPreview(workbook) : "<p class='muted-copy'>Preview export sẽ hiện sau khi chọn page và khoảng ngày.</p>"}
    </section>
  `;
}

function renderWorkbookPreview(workbook: NonNullable<ExportWorkflowState["workbook"]>) {
  return `
    <div class="feature-stack">
      <div class="banner ${workbook.allowed ? "banner-info" : "banner-warning"}">
        <strong>${workbook.allowed ? "Có thể export" : "Chưa thể export"}</strong>
        <p>${escapeHtml(workbook.reason)}</p>
      </div>
      <div class="meta-list">
        <span>Page: ${escapeHtml(workbook.pageLabel)}</span>
        <span>Khoảng ngày: ${escapeHtml(workbook.startDate)} -> ${escapeHtml(workbook.endDate)}</span>
        <span>Generated at: ${escapeHtml(workbook.generatedAt)}</span>
        <span>Prompt version: ${escapeHtml(workbook.promptVersion)}</span>
        <span>Config version: ${escapeHtml(workbook.configVersion)}</span>
        <span>Taxonomy version: ${escapeHtml(workbook.taxonomyVersion)}</span>
      </div>
      <table class="data-table">
        <thead><tr><th>Ngày</th><th>Tổng inbox</th><th>Inbox mới</th><th>Tái khám</th><th>Tỷ lệ chốt hẹn</th><th>Risk cao</th><th>Chi phí AI</th></tr></thead>
        <tbody>
          ${workbook.rows.map((row) => `
            <tr>
              <td>${escapeHtml(row.date)}</td>
              <td>${row.totalInbox}</td>
              <td>${row.inboxNew}</td>
              <td>${row.revisit}</td>
              <td>${escapeHtml(row.bookedRate)}</td>
              <td>${row.highRisk}</td>
              <td>${escapeHtml(row.aiCost)}</td>
            </tr>
          `).join("") || "<tr><td colspan='7'>Không có ngày official trong khoảng chọn.</td></tr>"}
        </tbody>
      </table>
    </div>
  `;
}
