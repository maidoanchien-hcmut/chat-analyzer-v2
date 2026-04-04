import type { ExplorationViewModel } from "../../adapters/contracts.ts";
import { escapeHtml } from "../../shared/html.ts";

export function renderExploration(viewModel: ExplorationViewModel) {
  return `
    <section class="feature-stack">
      ${viewModel.warning ? `<article class="banner banner-${viewModel.warning.tone}"><strong>${escapeHtml(viewModel.warning.title)}</strong><p>${escapeHtml(viewModel.warning.body)}</p></article>` : ""}
      <section class="two-column-grid">
        <article class="panel-card">
          <h2>Builder</h2>
          <div class="meta-list">
            <span>Metric: ${escapeHtml(viewModel.metric)}</span>
            <span>Breakdown: ${escapeHtml(viewModel.breakdownBy)}</span>
            <span>Compare: ${escapeHtml(viewModel.compareBy)}</span>
          </div>
        </article>
        <article class="panel-card">
          <h2>Visualization</h2>
          <p>${escapeHtml(viewModel.chartSummary)}</p>
        </article>
      </section>
      <article class="panel-card">
        <div class="section-headline"><h2>Detail table</h2></div>
        <table class="data-table">
          <thead><tr><th>Dimension</th><th>Metric</th><th>Tỷ lệ</th><th>Drill</th></tr></thead>
          <tbody>
            ${viewModel.rows.map((row) => `
              <tr>
                <td>${escapeHtml(row.dimension)}</td>
                <td>${escapeHtml(row.metricValue)}</td>
                <td>${escapeHtml(row.share)}</td>
                <td><button data-route="${escapeHtml(row.drillRoute)}">Drill xuống thread</button></td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </article>
    </section>
  `;
}
