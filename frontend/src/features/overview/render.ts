import type { OverviewViewModel } from "../../adapters/contracts.ts";
import { escapeHtml } from "../../shared/html.ts";

export function renderOverview(viewModel: OverviewViewModel) {
  return `
    <section class="feature-stack">
      ${viewModel.warning ? `<article class="banner banner-${viewModel.warning.tone}"><strong>${escapeHtml(viewModel.warning.title)}</strong><p>${escapeHtml(viewModel.warning.body)}</p></article>` : ""}
      <section class="panel-card">
        <div class="section-headline">
          <div>
            <p class="eyebrow">Snapshot ${escapeHtml(viewModel.snapshot.label)}</p>
            <h2>${escapeHtml(viewModel.pageLabel)}</h2>
          </div>
          <div class="meta-chip-group">
            <span class="meta-chip">${escapeHtml(viewModel.snapshot.coverage)}</span>
            <span class="meta-chip">${escapeHtml(viewModel.snapshot.promptVersion)}</span>
            <span class="meta-chip">${escapeHtml(viewModel.snapshot.configVersion)}</span>
          </div>
        </div>
        <div class="metric-grid">
          ${viewModel.metrics.map((metric) => `
            <article class="metric-card">
              <span class="metric-label">${escapeHtml(metric.label)}</span>
              <strong class="metric-value">${escapeHtml(metric.value)}</strong>
              <span class="metric-delta">${escapeHtml(metric.delta)}</span>
              <p class="muted-copy">${escapeHtml(metric.hint)}</p>
            </article>
          `).join("")}
        </div>
      </section>
      <section class="two-column-grid">
        <article class="panel-card">
          <h3>Opening overview</h3>
          <div class="list-grid">
            <div>
              <h4>Inbox mới</h4>
              ${renderBreakdowns(viewModel.openingNew)}
            </div>
            <div>
              <h4>Tái khám</h4>
              ${renderBreakdowns(viewModel.openingRevisit)}
            </div>
          </div>
        </article>
        <article class="panel-card">
          <h3>Nhu cầu và outcome</h3>
          <div class="list-grid">
            <div>
              <h4>Nhu cầu chính</h4>
              ${renderBreakdowns(viewModel.needs)}
            </div>
            <div>
              <h4>Kết quả chốt</h4>
              ${renderBreakdowns(viewModel.outcomes)}
            </div>
          </div>
        </article>
      </section>
      <section class="two-column-grid">
        <article class="panel-card">
          <h3>Nguồn khách hiệu quả</h3>
          <table class="data-table">
            <thead><tr><th>Nguồn</th><th>Thread</th><th>Tái khám</th><th>Nhu cầu top</th><th>Outcome top</th></tr></thead>
            <tbody>
              ${viewModel.sources.map((row) => `
                <tr>
                  <td>${escapeHtml(row.source)}</td>
                  <td>${row.threads}</td>
                  <td>${escapeHtml(row.revisitRate)}</td>
                  <td>${escapeHtml(row.topNeed)}</td>
                  <td>${escapeHtml(row.topOutcome)}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </article>
        <article class="panel-card">
          <h3>Workflow liên quan</h3>
          <p class="muted-copy">Export .xlsx được mở từ utility bar của app shell để chọn lại page và khoảng ngày tường minh.</p>
        </article>
      </section>
      <article class="panel-card">
        <h3>Ưu tiên cải tiến</h3>
        <table class="data-table">
          <thead><tr><th>Cluster</th><th>Thread</th><th>Outcome</th><th>Risk</th><th>Nhận xét</th><th>Drill</th></tr></thead>
          <tbody>
            ${viewModel.priorities.map((row) => `
              <tr>
                <td>${escapeHtml(row.cluster)}</td>
                <td>${row.threadCount}</td>
                <td>${escapeHtml(row.outcome)}</td>
                <td>${escapeHtml(row.risk)}</td>
                <td>${escapeHtml(row.summary)}</td>
                <td><button data-route="${escapeHtml(row.drillRoute)}">${escapeHtml(row.drillLabel)}</button></td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </article>
    </section>
  `;
}

function renderBreakdowns(rows: OverviewViewModel["needs"]) {
  return `
    <div class="breakdown-list">
      ${rows.map((row) => `
        <div class="breakdown-row">
          <span>${escapeHtml(row.label)}</span>
          <strong>${escapeHtml(row.value)}</strong>
          <span class="muted-copy">${escapeHtml(row.share)}</span>
        </div>
      `).join("")}
    </div>
  `;
}
