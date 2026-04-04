import type { ThreadHistoryViewModel } from "../../adapters/contracts.ts";
import { escapeHtml } from "../../shared/html.ts";

export function renderThreadHistory(viewModel: ThreadHistoryViewModel) {
  return `
    <section class="history-layout">
      <aside class="panel-card">
        <h2>Danh sách thread</h2>
        <div class="thread-list">
          ${viewModel.threads.map((thread) => `
            <button class="thread-row ${thread.id === viewModel.activeThreadId ? "thread-row-active" : ""}" data-route="?view=thread-history&thread=${escapeHtml(thread.id)}">
              <strong>${escapeHtml(thread.customer)}</strong>
              <span>${escapeHtml(thread.snippet)}</span>
              <span class="muted-copy">${escapeHtml(thread.updatedAt)}</span>
              <span class="badge-row">${thread.badges.map((badge) => `<span class="inline-badge">${escapeHtml(badge)}</span>`).join("")}</span>
            </button>
          `).join("")}
        </div>
      </aside>
      <div class="feature-stack">
        <article class="panel-card">
          <div class="tab-row">
            <button data-route="?view=thread-history&thread=${escapeHtml(viewModel.activeThreadId)}&threadTab=conversation" class="${viewModel.activeTab === "conversation" ? "tab-active" : ""}">Hội thoại</button>
            <button data-route="?view=thread-history&thread=${escapeHtml(viewModel.activeThreadId)}&threadTab=analysis-history" class="${viewModel.activeTab === "analysis-history" ? "tab-active" : ""}">Lịch sử phân tích</button>
            <button data-route="?view=thread-history&thread=${escapeHtml(viewModel.activeThreadId)}&threadTab=ai-audit" class="${viewModel.activeTab === "ai-audit" ? "tab-active" : ""}">Audit AI</button>
            <button data-route="?view=thread-history&thread=${escapeHtml(viewModel.activeThreadId)}&threadTab=crm-link" class="${viewModel.activeTab === "crm-link" ? "tab-active" : ""}">Liên kết CRM</button>
          </div>
          ${renderActiveTab(viewModel)}
        </article>
      </div>
    </section>
  `;
}

function renderActiveTab(viewModel: ThreadHistoryViewModel) {
  if (viewModel.activeTab === "analysis-history") {
    return `
      <table class="data-table">
        <thead><tr><th>Ngày</th><th>Opening</th><th>Nhu cầu</th><th>Outcome</th><th>Mood</th><th>Risk</th><th>Quality</th><th>AI cost</th></tr></thead>
        <tbody>
          ${viewModel.analysisHistory.map((row) => `
            <tr>
              <td>${escapeHtml(row.date)}</td>
              <td>${escapeHtml(row.openingTheme)}</td>
              <td>${escapeHtml(row.need)}</td>
              <td>${escapeHtml(row.outcome)}</td>
              <td>${escapeHtml(row.mood)}</td>
              <td>${escapeHtml(row.risk)}</td>
              <td>${escapeHtml(row.quality)}</td>
              <td>${escapeHtml(row.aiCost)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
  }

  if (viewModel.activeTab === "ai-audit") {
    return `
      <div class="audit-grid">
        <div class="meta-list">
          <span>Model: ${escapeHtml(viewModel.audit.model)}</span>
          <span>Prompt version: ${escapeHtml(viewModel.audit.promptVersion)}</span>
          <span>Prompt hash: ${escapeHtml(viewModel.audit.promptHash)}</span>
          <span>Taxonomy: ${escapeHtml(viewModel.audit.taxonomyVersion)}</span>
        </div>
        <div class="two-column-grid">
          <article class="sub-panel">
            <h3>Evidence</h3>
            <ul>${viewModel.audit.evidence.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
          </article>
          <article class="sub-panel">
            <h3>Field explanations</h3>
            <ul>${viewModel.audit.explanations.map((item) => `<li><strong>${escapeHtml(item.field)}</strong>: ${escapeHtml(item.explanation)}</li>`).join("")}</ul>
          </article>
        </div>
      </div>
    `;
  }

  if (viewModel.activeTab === "crm-link") {
    return `
      <div class="meta-list">
        <span>Khách hàng: ${escapeHtml(viewModel.crmLink.customer)}</span>
        <span>Phương thức: ${escapeHtml(viewModel.crmLink.method)}</span>
        <span>Confidence: ${escapeHtml(viewModel.crmLink.confidence)}</span>
      </div>
      <ul>${viewModel.crmLink.history.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
    `;
  }

  return `
    <div class="conversation-list">
      ${viewModel.transcript.map((message) => `
        <article class="conversation-item ${message.emphasized ? "conversation-emphasis" : ""}">
          <div class="conversation-meta"><strong>${escapeHtml(message.author)}</strong><span>${escapeHtml(message.at)}</span></div>
          <p>${escapeHtml(message.text)}</p>
        </article>
      `).join("")}
    </div>
  `;
}
