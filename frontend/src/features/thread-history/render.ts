import type { ThreadHistoryViewModel } from "../../adapters/contracts.ts";
import { escapeHtml } from "../../shared/html.ts";

export function renderThreadHistory(viewModel: ThreadHistoryViewModel) {
  return `
    <section class="history-layout">
      <aside class="panel-card">
        <h2>Danh sách thread</h2>
        <div class="thread-list">
          ${viewModel.threads.map((thread) => `
            <button class="thread-row ${thread.id === viewModel.activeThreadId ? "thread-row-active" : ""}" data-route="?view=thread-history&thread=${escapeHtml(thread.id)}&threadDay=">
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
            <button data-route="${buildThreadRoute(viewModel, "conversation")}" class="${viewModel.activeTab === "conversation" ? "tab-active" : ""}">Hội thoại</button>
            <button data-route="${buildThreadRoute(viewModel, "analysis-history")}" class="${viewModel.activeTab === "analysis-history" ? "tab-active" : ""}">Lịch sử phân tích</button>
            <button data-route="${buildThreadRoute(viewModel, "ai-audit")}" class="${viewModel.activeTab === "ai-audit" ? "tab-active" : ""}">Audit AI</button>
            <button data-route="${buildThreadRoute(viewModel, "crm-link")}" class="${viewModel.activeTab === "crm-link" ? "tab-active" : ""}">Liên kết CRM</button>
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
        <thead><tr><th>Ngày</th><th>Opening</th><th>Nhu cầu</th><th>Outcome</th><th>Mood</th><th>Risk</th><th>Quality</th><th>AI cost</th><th>Audit</th></tr></thead>
        <tbody>
          ${viewModel.analysisHistory.map((row) => `
            <tr class="${row.active ? "table-row-active" : ""}">
              <td><button data-route="?view=thread-history&thread=${escapeHtml(viewModel.activeThreadId)}&threadDay=${escapeHtml(row.threadDayId)}&threadTab=analysis-history">${escapeHtml(row.date)}</button></td>
              <td>${escapeHtml(row.openingTheme)}</td>
              <td>${escapeHtml(row.need)}</td>
              <td>${escapeHtml(row.outcome)}</td>
              <td>${escapeHtml(row.mood)}</td>
              <td>${escapeHtml(row.risk)}</td>
              <td>${escapeHtml(row.quality)}</td>
              <td>${escapeHtml(row.aiCost)}</td>
              <td><button data-route="?view=thread-history&thread=${escapeHtml(viewModel.activeThreadId)}&threadDay=${escapeHtml(row.threadDayId)}&threadTab=ai-audit">Mở audit</button></td>
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
        <div class="two-column-grid">
          <article class="sub-panel">
            <h3>Structured output</h3>
            ${viewModel.audit.structuredOutput.length > 0
              ? `<ul>${viewModel.audit.structuredOutput.map((item) => `
                  <li>
                    <strong>${escapeHtml(item.field)}</strong>: ${escapeHtml(item.label)} (${escapeHtml(item.code)})
                    ${item.reason ? `<div class="muted-copy">${escapeHtml(item.reason)}</div>` : ""}
                  </li>
                `).join("")}</ul>`
              : "<p class='muted-copy'>Chưa có structured output cho lần phân tích này.</p>"}
          </article>
          <article class="sub-panel">
            <h3>Supporting messages</h3>
            ${viewModel.audit.supportingMessageIds.length > 0
              ? `<ul>${viewModel.audit.supportingMessageIds.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
              : "<p class='muted-copy'>Chưa có supporting message id.</p>"}
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
    <div class="feature-stack">
      <section class="two-column-grid">
        <article class="sub-panel">
          <h3>Opening block</h3>
          ${viewModel.workspace.openingBlockMessages.length > 0
            ? `<ul>${viewModel.workspace.openingBlockMessages.map((item) => `
                <li>
                  <strong>${escapeHtml(item.senderRole)}</strong> / ${escapeHtml(item.messageType)}
                  ${item.messageId ? ` / ${escapeHtml(item.messageId)}` : ""}: ${escapeHtml(item.text)}
                </li>
              `).join("")}</ul>`
            : "<p class='muted-copy'>Chưa có opening block messages.</p>"}
        </article>
        <article class="sub-panel">
          <h3>Explicit signals</h3>
          ${viewModel.workspace.explicitSignals.length > 0
            ? `<ul>${viewModel.workspace.explicitSignals.map((item) => `<li>${escapeHtml(item.signalRole)} / ${escapeHtml(item.signalCode)}: ${escapeHtml(item.rawText)}</li>`).join("")}</ul>`
            : "<p class='muted-copy'>Chưa có explicit signals.</p>"}
          <div class="meta-list">
            <span>Explicit revisit: ${escapeHtml(viewModel.workspace.sourceSignals.explicitRevisit ?? "unknown")}</span>
            <span>Explicit need: ${escapeHtml(viewModel.workspace.sourceSignals.explicitNeed ?? "unknown")}</span>
            <span>Explicit outcome: ${escapeHtml(viewModel.workspace.sourceSignals.explicitOutcome ?? "unknown")}</span>
          </div>
        </article>
      </section>
      <section class="two-column-grid">
        <article class="sub-panel">
          <h3>Normalized tag signals</h3>
          ${viewModel.workspace.normalizedTagSignals.length > 0
            ? `<ul>${viewModel.workspace.normalizedTagSignals.map((item) => `
                <li>${escapeHtml(item.role)} / ${escapeHtml(item.sourceTagText || item.sourceTagId)} -> ${escapeHtml(item.canonicalCode || "noise")} (${escapeHtml(item.mappingSource || "unknown")})</li>
              `).join("")}</ul>`
            : "<p class='muted-copy'>Chưa có normalized tag signals.</p>"}
        </article>
        <article class="sub-panel">
          <h3>Source thread</h3>
          <pre class="code-block">${escapeHtml(JSON.stringify(viewModel.workspace.sourceThreadJsonRedacted, null, 2))}</pre>
        </article>
      </section>
      <section class="two-column-grid">
        <article class="sub-panel">
          <h3>Structured output</h3>
          ${viewModel.workspace.structuredOutput.length > 0
            ? `<ul>${viewModel.workspace.structuredOutput.map((item) => `
                <li>
                  <strong>${escapeHtml(item.field)}</strong>: ${escapeHtml(item.label)} (${escapeHtml(item.code)})
                  ${item.reason ? `<div class="muted-copy">${escapeHtml(item.reason)}</div>` : ""}
                </li>
              `).join("")}</ul>`
            : "<p class='muted-copy'>Chưa có structured output.</p>"}
        </article>
      </section>
      <div class="conversation-list">
      ${viewModel.transcript.map((message) => `
        <article class="conversation-item ${message.emphasized ? "conversation-emphasis" : ""}">
          <div class="conversation-meta"><strong>${escapeHtml(message.author)}</strong><span>${escapeHtml(message.at)}</span></div>
          <div class="badge-row">
            ${message.isFirstMeaningful ? '<span class="inline-badge">Opening</span>' : ""}
            ${message.isStaffFirstResponse ? '<span class="inline-badge">Phản hồi đầu</span>' : ""}
            ${message.isSupportingEvidence ? '<span class="inline-badge">Evidence</span>' : ""}
          </div>
          <p>${escapeHtml(message.text)}</p>
        </article>
      `).join("")}
      </div>
    </div>
  `;
}

function buildThreadRoute(
  viewModel: ThreadHistoryViewModel,
  tab: ThreadHistoryViewModel["activeTab"]
) {
  const params = new URLSearchParams({
    view: "thread-history",
    thread: viewModel.activeThreadId,
    threadTab: tab
  });
  if (viewModel.activeThreadDayId) {
    params.set("threadDay", viewModel.activeThreadDayId);
  }
  return `?${params.toString()}`;
}
