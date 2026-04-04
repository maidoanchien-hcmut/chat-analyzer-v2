import type { PageComparisonViewModel } from "../../adapters/contracts.ts";
import { escapeHtml } from "../../shared/html.ts";

export function renderPageComparison(viewModel: PageComparisonViewModel) {
  return `
    <section class="feature-stack">
      <article class="panel-card">
        <div class="section-headline">
          <div>
            <p class="eyebrow">Multi-page only</p>
            <h2>So sánh trang</h2>
          </div>
        </div>
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
