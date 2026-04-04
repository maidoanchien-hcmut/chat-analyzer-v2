import type { PageComparisonViewModel } from "../../adapters/contracts.ts";
import type { BusinessPage, PublishSnapshot, SlicePreset } from "../../core/types.ts";
import { escapeHtml } from "../../shared/html.ts";

type PageComparisonFilterState = {
  pages: BusinessPage[];
  comparePageIds: string[];
  slicePreset: SlicePreset;
  startDate: string;
  endDate: string;
  publishSnapshot: PublishSnapshot;
};

export function renderPageComparison(viewModel: PageComparisonViewModel, filterState: PageComparisonFilterState) {
  const selectedCompareIds = filterState.comparePageIds.length > 0
    ? filterState.comparePageIds
    : filterState.pages.map((page) => page.id);

  return `
    <section class="feature-stack">
      <article class="panel-card">
        <div class="section-headline">
          <div>
            <p class="eyebrow">Multi-page only</p>
            <h2>So sánh trang</h2>
          </div>
        </div>
        <form data-form="page-comparison-filters" class="feature-stack">
          <div class="section-headline">
            <div>
              <h3>Page đưa vào so sánh</h3>
              <p class="muted-copy">View này là ngoại lệ của filter Page một-page. User chọn trực tiếp nhiều page trong runtime path thay vì sửa query string thủ công.</p>
            </div>
          </div>
          <div class="button-row">
            ${filterState.pages.map((page) => `
              <label class="inline-check">
                <input type="checkbox" name="comparePageIds" value="${escapeHtml(page.id)}" ${selectedCompareIds.includes(page.id) ? "checked" : ""} />
                ${escapeHtml(page.label)}
              </label>
            `).join("")}
          </div>
          <div class="two-column-grid">
            <label>
              <span>Slice</span>
              <select name="slicePreset">
                <option value="yesterday" ${filterState.slicePreset === "yesterday" ? "selected" : ""}>Hôm qua</option>
                <option value="7d" ${filterState.slicePreset === "7d" ? "selected" : ""}>7 ngày</option>
                <option value="30d" ${filterState.slicePreset === "30d" ? "selected" : ""}>30 ngày</option>
                <option value="quarter" ${filterState.slicePreset === "quarter" ? "selected" : ""}>Quý này đến hôm qua</option>
                <option value="custom" ${filterState.slicePreset === "custom" ? "selected" : ""}>Tùy chọn</option>
              </select>
            </label>
            <label>
              <span>Publish snapshot</span>
              <select name="publishSnapshot">
                <option value="official" ${filterState.publishSnapshot === "official" ? "selected" : ""}>Official</option>
                <option value="provisional" ${filterState.publishSnapshot === "provisional" ? "selected" : ""}>Provisional</option>
              </select>
            </label>
          </div>
          ${filterState.slicePreset === "custom"
            ? `<div class="two-column-grid">
                <label><span>Từ ngày</span><input type="date" name="startDate" value="${escapeHtml(filterState.startDate)}" /></label>
                <label><span>Đến ngày</span><input type="date" name="endDate" value="${escapeHtml(filterState.endDate)}" /></label>
              </div>`
            : ""}
        </form>
        <p>${escapeHtml(viewModel.comparedPages.join(" / "))}</p>
      </article>
      <article class="panel-card">
        <h3>Trend line theo ngày</h3>
        <table class="data-table">
          <thead><tr><th>Ngày</th><th>Page</th><th>Volume</th><th>Conversion</th><th>AI cost</th></tr></thead>
          <tbody>
            ${viewModel.trendRows.map((row) => row.values.map((value) => `
              <tr>
                <td>${escapeHtml(row.date)}</td>
                <td>${escapeHtml(value.page)}</td>
                <td>${escapeHtml(value.volume)}</td>
                <td>${escapeHtml(value.conversion)}</td>
                <td>${escapeHtml(value.aiCost)}</td>
              </tr>
            `).join("")).join("")}
          </tbody>
        </table>
      </article>
      <section class="two-column-grid">
        ${viewModel.mixCards.map((card) => `
          <article class="panel-card">
            <h3>${escapeHtml(card.title)}</h3>
            <p>${escapeHtml(card.summary)}</p>
          </article>
        `).join("")}
      </section>
    </section>
  `;
}
