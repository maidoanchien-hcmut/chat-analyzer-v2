import type { StaffPerformanceViewModel } from "../../adapters/contracts.ts";
import { escapeHtml } from "../../shared/html.ts";

export function renderStaffPerformance(viewModel: StaffPerformanceViewModel) {
  return `
    <section class="feature-stack">
      ${viewModel.warning ? `<article class="banner banner-${viewModel.warning.tone}"><strong>${escapeHtml(viewModel.warning.title)}</strong><p>${escapeHtml(viewModel.warning.body)}</p></article>` : ""}
      <section class="metric-grid">
        ${viewModel.scorecards.map((metric) => `
          <article class="metric-card">
            <span class="metric-label">${escapeHtml(metric.label)}</span>
            <strong class="metric-value">${escapeHtml(metric.value)}</strong>
            <span class="metric-delta">${escapeHtml(metric.delta)}</span>
            <p class="muted-copy">${escapeHtml(metric.hint)}</p>
          </article>
        `).join("")}
      </section>
      <section class="two-column-grid">
        <article class="panel-card">
          <h2>Bảng xếp hạng nhân viên</h2>
          <table class="data-table">
            <thead><tr><th>Nhân viên</th><th>Thread</th><th>Chất lượng</th><th>Phản hồi đầu</th><th>Issue</th><th>Gợi ý</th></tr></thead>
            <tbody>
              ${viewModel.rankingRows.map((row) => `
                <tr>
                  <td>${escapeHtml(row.staff)}</td>
                  <td>${row.threads}</td>
                  <td>${escapeHtml(row.quality)}</td>
                  <td>${escapeHtml(row.responseTime)}</td>
                  <td>${escapeHtml(row.issue)}</td>
                  <td>${escapeHtml(row.suggestion)}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </article>
        <article class="panel-card">
          <h2>Issue matrix</h2>
          <table class="data-table">
            <thead><tr><th>Nhân viên</th><th>Nhu cầu</th><th>Chất lượng</th><th>Volume</th></tr></thead>
            <tbody>
              ${viewModel.issueMatrix.map((row) => `
                <tr>
                  <td>${escapeHtml(row.staff)}</td>
                  <td>${escapeHtml(row.need)}</td>
                  <td>${escapeHtml(row.quality)}</td>
                  <td>${escapeHtml(row.volume)}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </article>
      </section>
      <article class="panel-card">
        <div class="section-headline"><h2>Coaching inbox</h2></div>
        <table class="data-table">
          <thead><tr><th>Nhân viên</th><th>Thread</th><th>Issue</th><th>Improvement</th><th>Mở thread</th></tr></thead>
          <tbody>
            ${viewModel.coachingInbox.map((row) => `
              <tr>
                <td>${escapeHtml(row.staff)}</td>
                <td>${escapeHtml(row.threadLabel)}</td>
                <td>${escapeHtml(row.issue)}</td>
                <td>${escapeHtml(row.improvement)}</td>
                <td><button data-route="${escapeHtml(row.openRoute)}">Mở thread</button></td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </article>
    </section>
  `;
}
