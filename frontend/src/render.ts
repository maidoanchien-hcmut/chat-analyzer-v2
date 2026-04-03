import type { AppState, OnboardingSample, RunGroupSummary, ThreadDetail, ThreadSummary, View } from "./types.ts";
import { compactText, escapeHtml, formatDateTime, shortId } from "./utils.ts";

const TAG_SIGNAL_OPTIONS = [
  "null",
  "customer_type",
  "need",
  "branch",
  "staff_name",
  "outcome",
  "staff_label",
  "location",
  "age_group",
  "priority"
];

const OPENING_SIGNAL_OPTIONS = [
  "customer_type",
  "entry_flow",
  "need",
  "opening_block_label"
];

export function renderApp(state: AppState) {
  return `
    <div class="app-shell">
      <header class="topbar">
        <div><strong>chat-analyzer-v2</strong> <span class="muted">UI tối giản theo docs/design.md</span></div>
        <div class="row">
          ${renderViewButton(state, "onboarding", "Thêm trang")}
          ${renderViewButton(state, "dashboard", "Dashboard")}
          ${renderViewButton(state, "exploratory", "Exploratory")}
          ${renderViewButton(state, "history", "Lịch sử chat")}
          ${renderViewButton(state, "comparison", "So sánh")}
          ${renderViewButton(state, "settings", "Vận hành")}
        </div>
      </header>
      ${renderFilters(state)}
      <main class="workspace">${renderActiveView(state)}</main>
      <footer class="status ${state.error ? "error" : ""}">${escapeHtml(readStatus(state))}</footer>
    </div>
  `;
}

function renderFilters(state: AppState) {
  const pageOptions = state.pages.length === 0
    ? `<option value="">chưa có page</option>`
    : state.pages.map((page) => `<option value="${escapeHtml(page.id)}" ${page.id === state.pageId ? "selected" : ""}>${escapeHtml(page.pageName)}</option>`).join("");

  return `
    <section class="filterbar">
      <div class="grid">
        <label><span>Page</span><select id="page-id" ${state.view === "comparison" ? "disabled" : ""}>${pageOptions}</select></label>
        <label><span>Từ</span><input id="start-date" type="date" value="${escapeHtml(state.startDate)}" /></label>
        <label><span>Đến</span><input id="end-date" type="date" value="${escapeHtml(state.endDate)}" /></label>
        <label><span>Mood</span><input id="dice-mood" value="${escapeHtml(state.mood)}" /></label>
        <label><span>Need</span><input id="dice-need" value="${escapeHtml(state.need)}" /></label>
        <label><span>Customer type</span><input id="dice-type" value="${escapeHtml(state.customerType)}" /></label>
        <label><span>Risk</span><input id="dice-risk" value="${escapeHtml(state.risk)}" /></label>
      </div>
      <div class="row">
        <button data-action="preset" data-days="1">1 ngày</button>
        <button data-action="preset" data-days="7">1 tuần</button>
        <button data-action="preset" data-days="30">1 tháng</button>
        <button data-action="preset" data-days="90">1 quý</button>
        <button data-action="refresh">Áp dụng</button>
      </div>
    </section>
  `;
}

function renderActiveView(state: AppState) {
  switch (state.view) {
    case "onboarding":
      return renderOnboarding(state);
    case "dashboard":
      return renderDashboard(state);
    case "exploratory":
      return renderExploratory(state);
    case "history":
      return renderHistory(state);
    case "comparison":
      return renderComparison(state);
    case "settings":
      return renderSettings(state);
  }
}

function renderOnboarding(state: AppState) {
  const options = state.onboardingPages.length === 0
    ? `<option value="">chưa có page từ token</option>`
    : state.onboardingPages.map((page) => `<option value="${escapeHtml(page.pageId)}" ${page.pageId === state.onboardingPageId ? "selected" : ""}>${escapeHtml(page.pageName)}</option>`).join("");

  return `
    <section class="panel">
      <h2>Flow thêm trang</h2>
      <div class="grid two">
        <label><span>Token</span><input id="ob-token" type="password" value="${escapeHtml(state.onboardingToken)}" /></label>
        <label><span>Pancake page</span><select id="ob-page-id">${options}</select></label>
        <label><span>Timezone</span><input id="ob-timezone" value="${escapeHtml(state.onboardingTimezone)}" /></label>
        <label><span>Initial limit</span><input id="ob-limit" type="number" min="1" value="${escapeHtml(state.onboardingLimit)}" /></label>
        <label><span>Processing</span><select id="ob-mode"><option value="etl_only" ${state.onboardingMode === "etl_only" ? "selected" : ""}>etl_only</option><option value="etl_and_ai" ${state.onboardingMode === "etl_and_ai" ? "selected" : ""}>etl_and_ai</option></select></label>
        <div class="row"><label class="check"><input id="ob-etl" type="checkbox" ${state.onboardingEtlEnabled ? "checked" : ""} />etl_enabled</label><label class="check"><input id="ob-analysis" type="checkbox" ${state.onboardingAnalysisEnabled ? "checked" : ""} />analysis_enabled</label></div>
      </div>
      <div class="row"><button data-action="ob-list-pages">1. Tải page</button><button data-action="ob-sample">2. Sample</button><button data-action="ob-commit">3. Commit</button></div>
      ${renderOnboardingTagCandidates(state)}
      ${renderOnboardingOpeningCandidates(state)}
      <label><span>Prompt</span><textarea id="ob-prompt" class="prompt-box">${escapeHtml(state.onboardingPrompt)}</textarea></label>
      <p class="muted">Prompt này chỉ chứa quy trình vận hành và nguyên tắc đánh giá theo page. Vai trò "AI nhà phân tích hội thoại" được khóa cứng ở system prompt backend.</p>
      ${state.onboardingSample ? renderOnboardingSampleSummary(state.onboardingSample) : `<p class="muted">Chưa có sample runtime. Bấm "2. Sample" để lấy tag candidates và opening candidates từ dữ liệu thật.</p>`}
    </section>
  `;
}

function renderDashboard(state: AppState) {
  if (!state.dashboard) {
    return `<section class="panel"><h2>Dashboard</h2><p class="muted">Chưa có dữ liệu.</p></section>`;
  }
  const kpis = state.dashboard.kpis;
  return `
    <section class="panel">
      <h2>Dashboard official</h2>
      <div class="kpi-grid">
        ${renderKpi("Tổng inbox", String(kpis.totalInbox))}
        ${renderKpi("Inbox mới", String(kpis.totalInboxNew))}
        ${renderKpi("Inbox cũ", String(kpis.totalInboxOld))}
        ${renderKpi("Tái khám", String(kpis.revisitCount))}
        ${renderKpi("Mood tốt", String(kpis.goodMoodCount))}
        ${renderKpi("Rủi ro", String(kpis.riskCount))}
        ${renderKpi("Tổng msg", String(kpis.totalMessages))}
        ${renderKpi("AI cost", kpis.totalAiCostMicros)}
        ${renderKpi("Conversion", `${(kpis.conversionRate * 100).toFixed(1)}% (${kpis.conversionNumerator}/${kpis.conversionDenominator})`)}
      </div>
      <div class="split">
        <div>
          <h3>Breakdown need</h3>
          <table class="dense"><thead><tr><th>Need</th><th>Count</th></tr></thead><tbody>${state.dashboard.breakdown.map((item) => `<tr><td>${escapeHtml(item.value)}</td><td>${item.count}</td></tr>`).join("") || `<tr><td colspan="2">Không có</td></tr>`}</tbody></table>
        </div>
        <div><h3>Latest threads</h3>${renderThreadTable(state.dashboard.latestThreads)}</div>
      </div>
    </section>
  `;
}

function renderExploratory(state: AppState) {
  return `
    <section class="panel">
      <h2>Exploratory (thread grain)</h2>
      <div class="row">
        <input id="search" value="${escapeHtml(state.search)}" placeholder="search thread/customer" />
        <input id="min-messages" type="number" min="0" value="${escapeHtml(state.minMessages)}" placeholder="min messages" />
        <select id="sort-by"><option value="latest_message" ${state.sortBy === "latest_message" ? "selected" : ""}>latest_message</option><option value="target_date" ${state.sortBy === "target_date" ? "selected" : ""}>target_date</option><option value="messages" ${state.sortBy === "messages" ? "selected" : ""}>messages</option><option value="cost" ${state.sortBy === "cost" ? "selected" : ""}>cost</option></select>
        <select id="sort-order"><option value="desc" ${state.sortOrder === "desc" ? "selected" : ""}>desc</option><option value="asc" ${state.sortOrder === "asc" ? "selected" : ""}>asc</option></select>
        <button data-action="load-threads">Tải</button>
      </div>
      ${renderThreadTable(state.exploratory?.threads ?? [])}
    </section>
  `;
}

function renderHistory(state: AppState) {
  return `
    <section class="panel history-layout">
      <div class="history-left">
        <h2>Threads</h2>
        <div class="row"><input id="history-search" value="${escapeHtml(state.search)}" /><button data-action="load-history-threads">Tải</button></div>
        ${renderThreadTable(state.historyThreads)}
      </div>
      <div class="history-right">
        <h2>Chi tiết</h2>
        ${state.historyDetail ? renderHistoryDetail(state.historyDetail) : `<p class="muted">Chọn thread.</p>`}
      </div>
    </section>
  `;
}

function renderComparison(state: AppState) {
  if (!state.comparison) {
    return `<section class="panel"><h2>So sánh trang</h2><p class="muted">Chưa có dữ liệu.</p></section>`;
  }
  return `
    <section class="panel">
      <h2>So sánh trang</h2>
      <table class="dense">
        <thead><tr><th>Page</th><th>Inbox</th><th>Inbox mới</th><th>Tái khám</th><th>Mood tốt</th><th>Rủi ro</th><th>Messages</th><th>Cost</th></tr></thead>
        <tbody>${state.comparison.pages.map((item) => `<tr><td>${escapeHtml(item.pageName)}</td><td>${item.kpis.totalInbox}</td><td>${item.kpis.totalInboxNew}</td><td>${item.kpis.revisitCount}</td><td>${item.kpis.goodMoodCount}</td><td>${item.kpis.riskCount}</td><td>${item.kpis.totalMessages}</td><td>${escapeHtml(item.kpis.totalAiCostMicros)}</td></tr>`).join("")}</tbody>
      </table>
    </section>
  `;
}

function renderSettings(state: AppState) {
  return `
    <section class="panel settings-layout">
      <div class="section">
        <h2>Config page</h2>
        <div class="grid two">
          <label><span>Timezone</span><input id="setting-timezone" value="${escapeHtml(state.settingTimezone)}" /></label>
          <div class="row"><label class="check"><input id="setting-etl" type="checkbox" ${state.settingEtlEnabled ? "checked" : ""} />etl_enabled</label><label class="check"><input id="setting-analysis" type="checkbox" ${state.settingAnalysisEnabled ? "checked" : ""} />analysis_enabled</label></div>
        </div>
        <div class="grid two">
          <label><span>Tag classification (mỗi dòng: raw_tag => signal)</span><textarea id="setting-tag-rules" class="json-box">${escapeHtml(state.settingTagRulesText)}</textarea></label>
          <label><span>Opening rules (mỗi dòng: signal | decision | raw_text)</span><textarea id="setting-opening-rules" class="json-box">${escapeHtml(state.settingOpeningRulesText)}</textarea></label>
        </div>
        <label><span>Prompt</span><textarea id="setting-prompt" class="prompt-box">${escapeHtml(state.settingPrompt)}</textarea></label>
        <p class="muted">Phần này chỉ chỉnh quy trình vận hành và nguyên tắc đánh giá. Vai trò hệ thống của AI được cố định trong backend.</p>
        <div class="row"><button data-action="load-setting">Tải</button><button data-action="save-setting">Lưu config</button><button data-action="save-prompt">Lưu prompt mới</button></div>
      </div>
      <div class="section">
        <h2>Custom run</h2>
        <div class="grid two">
          <label><span>processing_mode</span><select id="run-processing"><option value="etl_only" ${state.runProcessingMode === "etl_only" ? "selected" : ""}>etl_only</option><option value="etl_and_ai" ${state.runProcessingMode === "etl_and_ai" ? "selected" : ""}>etl_and_ai</option></select></label>
          <label><span>run mode</span><select id="run-mode"><option value="full_day" ${state.runMode === "full_day" ? "selected" : ""}>full_day</option><option value="custom_range" ${state.runMode === "custom_range" ? "selected" : ""}>custom_range</option></select></label>
          ${state.runMode === "full_day"
            ? `<label><span>target_date</span><input id="run-target-date" type="date" value="${escapeHtml(state.runTargetDate)}" /></label>`
            : `<label><span>window_start</span><input id="run-window-start" type="datetime-local" value="${escapeHtml(state.runWindowStart)}" /></label><label><span>window_end</span><input id="run-window-end" type="datetime-local" value="${escapeHtml(state.runWindowEnd)}" /></label>`}
          <label><span>max_conversations</span><input id="run-max-conversations" type="number" min="0" value="${escapeHtml(state.runMaxConversations)}" /></label>
          <label><span>max_message_pages</span><input id="run-max-message-pages" type="number" min="0" value="${escapeHtml(state.runMaxMessagePages)}" /></label>
        </div>
        <button data-action="execute-run">Chạy manual run</button>
      </div>
      <div class="section">
        <h2>Run groups</h2>
        <div class="row"><select id="run-group-id">${renderRunGroupOptions(state.runGroups, state.selectedRunGroupId)}</select><button data-action="load-run-groups">Tải run groups</button><button data-action="load-run-group-threads">Tải threads</button></div>
        <table class="dense"><thead><tr><th>Run group</th><th>Status</th><th>Mode</th><th>Child</th><th>Published</th><th>Range</th></tr></thead><tbody>${state.runGroups.map((run) => renderRunGroupRow(run)).join("") || `<tr><td colspan="6">Không có</td></tr>`}</tbody></table>
        <h3>Threads theo run_group_id</h3>
        <table class="dense"><thead><tr><th>Thread</th><th>Khách</th><th>Days</th><th>Msgs</th><th>Cost</th><th>Need</th><th>Mood</th><th>Risk</th><th></th></tr></thead><tbody>${state.runGroupThreads.map((thread) => `<tr><td>${escapeHtml(thread.threadId)}</td><td>${escapeHtml(thread.customerDisplayName ?? "-")}</td><td>${thread.dayCount}</td><td>${thread.totalMessages}</td><td>${escapeHtml(thread.totalCostMicros)}</td><td>${escapeHtml(thread.latestPrimaryNeed)}</td><td>${escapeHtml(thread.latestCustomerMood)}</td><td>${escapeHtml(thread.latestRiskLevel)}</td><td><button data-action="open-thread" data-thread-id="${escapeHtml(thread.threadId)}">Mở</button></td></tr>`).join("") || `<tr><td colspan="9">Không có</td></tr>`}</tbody></table>
      </div>
      <div class="section">
        <h2>Mapping review queue</h2>
        <div class="row"><button data-action="load-mapping-review">Tải queue</button></div>
        <table class="dense"><thead><tr><th>Created</th><th>Run group</th><th>Thread</th><th>Status</th><th>Confidence</th><th>Customer</th></tr></thead><tbody>${state.mappingReview.map((item) => `<tr><td>${escapeHtml(formatDateTime(item.createdAt))}</td><td>${escapeHtml(shortId(item.runGroupId))}</td><td>${escapeHtml(item.threadId)}</td><td>${escapeHtml(item.decisionStatus)}</td><td>${item.confidenceScore === null ? "-" : item.confidenceScore.toFixed(4)}</td><td>${escapeHtml(item.selectedCustomerId ?? "-")}</td></tr>`).join("") || `<tr><td colspan="6">Không có</td></tr>`}</tbody></table>
      </div>
      <div class="section">
        <h2>Health</h2>
        ${state.health ? `<div class="kpi-grid">${renderKpi("running", String(state.health.totals.running))}${renderKpi("loaded", String(state.health.totals.loaded))}${renderKpi("published", String(state.health.totals.published))}${renderKpi("failed", String(state.health.totals.failed))}</div>` : `<p class="muted">Chưa tải.</p>`}
        <button data-action="load-health">Tải health</button>
      </div>
    </section>
  `;
}

function renderRunGroupOptions(runs: RunGroupSummary[], selected: string) {
  if (runs.length === 0) {
    return `<option value="">chưa có run group</option>`;
  }
  return runs.map((run) => `<option value="${escapeHtml(run.runGroupId)}" ${run.runGroupId === selected ? "selected" : ""}>${escapeHtml(`${run.targetDateStart ?? "-"}..${run.targetDateEnd ?? "-"} | ${shortId(run.runGroupId)} | ${run.status}`)}</option>`).join("");
}

function renderRunGroupRow(run: RunGroupSummary) {
  return `<tr><td>${escapeHtml(shortId(run.runGroupId))}</td><td>${escapeHtml(run.status)}</td><td>${escapeHtml(run.runMode)}</td><td>${run.childRunCount}</td><td>${run.publishedChildCount}</td><td>${escapeHtml(`${run.targetDateStart ?? "-"} -> ${run.targetDateEnd ?? "-"}`)}</td></tr>`;
}

function renderThreadTable(rows: ThreadSummary[]) {
  return `
    <table class="dense">
      <thead><tr><th>Thread</th><th>Khách</th><th>Days</th><th>Msgs</th><th>Cost</th><th>Need</th><th>Mood</th><th>Risk</th><th>Latest</th><th></th></tr></thead>
      <tbody>${rows.map((row) => `<tr><td>${escapeHtml(row.threadId)}</td><td>${escapeHtml(row.customerDisplayName ?? "-")}</td><td>${row.dayCount}</td><td>${row.totalMessages}</td><td>${escapeHtml(row.totalCostMicros)}</td><td>${escapeHtml(row.latestPrimaryNeed)}</td><td>${escapeHtml(row.latestCustomerMood)}</td><td>${escapeHtml(row.latestRiskLevel)}</td><td>${escapeHtml(row.latestMessageAt ? formatDateTime(row.latestMessageAt) : "-")}</td><td><button data-action="open-thread" data-thread-id="${escapeHtml(row.threadId)}">Mở</button></td></tr>`).join("") || `<tr><td colspan="10">Không có dữ liệu</td></tr>`}</tbody>
    </table>
  `;
}

function renderHistoryDetail(detail: ThreadDetail) {
  return `
    <div class="section">
      <div class="kpi-grid">
        ${renderKpi("Thread", detail.thread.threadId)}
        ${renderKpi("Khách", detail.thread.customerDisplayName ?? "-")}
        ${renderKpi("Days", String(detail.thread.dayCount))}
        ${renderKpi("Msgs", String(detail.thread.totalMessages))}
        ${renderKpi("Cost", detail.thread.totalCostMicros)}
      </div>
      <h3>Theo ngày</h3>
      <table class="dense"><thead><tr><th>Ngày</th><th>Run group</th><th>Msg</th><th>Cost</th><th>Need</th><th>Mood</th><th>Type</th><th>Risk</th></tr></thead><tbody>${detail.days.map((day) => `<tr><td>${escapeHtml(day.targetDate)}</td><td>${escapeHtml(shortId(day.runGroupId))}</td><td>${day.messageCount}</td><td>${escapeHtml(day.costMicros)}</td><td>${escapeHtml(day.primaryNeed)}</td><td>${escapeHtml(day.customerMood)}</td><td>${escapeHtml(day.contentCustomerType)}</td><td>${escapeHtml(day.processRiskLevel)}</td></tr>`).join("")}</tbody></table>
      <h3>Tin nhắn</h3>
      <table class="dense"><thead><tr><th>Time</th><th>Ngày</th><th>Role</th><th>Tên</th><th>Loại</th><th>Nội dung</th></tr></thead><tbody>${detail.messages.map((message) => `<tr><td>${escapeHtml(formatDateTime(message.insertedAt))}</td><td>${escapeHtml(message.targetDate)}</td><td>${escapeHtml(message.senderRole)}</td><td>${escapeHtml(message.senderName ?? "-")}</td><td>${escapeHtml(message.messageType)}</td><td>${escapeHtml(compactText(message.redactedText ?? "-", 160))}</td></tr>`).join("")}</tbody></table>
    </div>
  `;
}

function renderKpi(label: string, value: string) {
  return `<article class="kpi"><span class="muted">${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></article>`;
}

function renderOnboardingSampleSummary(sample: OnboardingSample) {
  const targetDate = sample.targetDate || "-";
  const windowStart = sample.windowStartAt || "-";
  const windowEnd = sample.windowEndExclusiveAt || "-";
  const tagCandidates = sample.tagCandidates.length;
  const openingCandidates = sample.openingCandidates.topOpeningCandidateWindows.length;
  const matchedCount = sample.openingCandidates.matchedOpeningSelections?.length ?? 0;
  return `
    <div class="section">
      <h3>Sample runtime</h3>
      <div class="kpi-grid">
        ${renderKpi("target_date", targetDate)}
        ${renderKpi("window_start", windowStart)}
        ${renderKpi("window_end", windowEnd)}
        ${renderKpi("tag candidates", String(tagCandidates))}
        ${renderKpi("opening candidates", String(openingCandidates))}
        ${renderKpi("matched selections", String(matchedCount))}
      </div>
      <table class="dense">
        <thead><tr><th>Opening window tiêu biểu</th><th>Số lần</th></tr></thead>
        <tbody>${sample.openingCandidates.topOpeningCandidateWindows.map((item) => `<tr><td>${escapeHtml(item.signature.join(" -> "))}</td><td>${item.count}</td></tr>`).join("") || `<tr><td colspan="2">Không có</td></tr>`}</tbody>
      </table>
    </div>
  `;
}

function renderOnboardingTagCandidates(state: AppState) {
  return `
    <div class="section">
      <h3>Tag classification từ sample</h3>
      <table class="dense">
        <thead><tr><th>Tag gốc</th><th>Số lần</th><th>Signal</th></tr></thead>
        <tbody>${state.onboardingTagCandidates.map((item, index) => `<tr><td>${escapeHtml(item.rawLabel)}</td><td>${item.count}</td><td>${renderSignalSelect(`ob-tag-signal-${index}`, TAG_SIGNAL_OPTIONS, item.signal, true)}</td></tr>`).join("") || `<tr><td colspan="3">Chưa có candidate. Bấm "2. Sample".</td></tr>`}</tbody>
      </table>
    </div>
  `;
}

function renderOnboardingOpeningCandidates(state: AppState) {
  return `
    <div class="section">
      <h3>Opening candidates từ sample</h3>
      <div class="grid two">
        <label><span>Boundary max_messages</span><input id="ob-opening-max" type="number" min="1" value="${escapeHtml(state.onboardingOpeningMaxMessages)}" /></label>
      </div>
      <table class="dense">
        <thead><tr><th>Raw text trong opening</th><th>Số lần</th><th>Signal</th><th>Decision</th></tr></thead>
        <tbody>${state.onboardingOpeningCandidates.map((item, index) => `<tr><td>${escapeHtml(item.rawText)}</td><td>${item.count}</td><td>${renderSignalSelect(`ob-opening-signal-${index}`, OPENING_SIGNAL_OPTIONS, item.signal, false)}</td><td><input id="ob-opening-decision-${index}" value="${escapeHtml(item.decision)}" placeholder="vd: revisit, first_time, book_appointment" /></td></tr>`).join("") || `<tr><td colspan="4">Chưa có candidate. Bấm "2. Sample".</td></tr>`}</tbody>
      </table>
    </div>
  `;
}

function renderSignalSelect(id: string, options: string[], selected: string, includeNull: boolean) {
  const selectedTrimmed = selected.trim();
  const available = includeNull ? options : options.filter((item) => item !== "null");
  const merged = selectedTrimmed && !available.includes(selectedTrimmed)
    ? [selectedTrimmed, ...available]
    : available;
  const rows = includeNull ? [`<option value="" ${selectedTrimmed ? "" : "selected"}>(bỏ qua)</option>`] : [`<option value="" ${selectedTrimmed ? "" : "selected"}>(không map)</option>`];
  for (const option of merged) {
    rows.push(`<option value="${escapeHtml(option)}" ${option === selectedTrimmed ? "selected" : ""}>${escapeHtml(option)}</option>`);
  }
  return `<select id="${id}">${rows.join("")}</select>`;
}

function renderViewButton(state: AppState, view: View, label: string) {
  return `<button data-action="switch-view" data-view="${view}" class="${state.view === view ? "active" : ""}">${label}</button>`;
}

function readStatus(state: AppState) {
  if (state.error) {
    return `Lỗi: ${state.error}`;
  }
  if (state.loading) {
    return `Đang xử lý: ${state.loading}`;
  }
  if (state.info) {
    return state.info;
  }
  return "Sẵn sàng.";
}
