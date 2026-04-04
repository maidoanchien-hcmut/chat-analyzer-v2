import type { AppState, ConnectedPageDetail, PageConfigVersion } from "./types.ts";
import { escapeHtml, formatDateTime, listTimezones, prettyJson, toDatetimeLocalValue } from "./utils.ts";

export function renderApp(state: AppState) {
  return `
    <div class="app-shell">
      <header class="topbar">
        <div>
          <strong>chat-analyzer-v2</strong>
          <span class="muted">frontend vận hành theo extraction seam mới</span>
        </div>
        <label class="inline-field">
          <span>Backend</span>
          <input id="api-base-url" value="${escapeHtml(state.apiBaseUrl)}" />
        </label>
      </header>
      <main class="workspace">
        <section class="panel stack">
          ${renderRegisterPanel(state)}
          ${renderPagesPanel(state)}
          ${renderConfigPanel(state)}
        </section>
        <section class="panel stack">
          ${renderJobsPanel(state)}
          ${renderInspectPanel(state)}
          ${renderPublishPanel(state)}
        </section>
      </main>
      <footer class="status ${state.error ? "error" : ""}">${escapeHtml(readStatus(state))}</footer>
    </div>
  `;
}

function renderRegisterPanel(state: AppState) {
  const options = state.tokenPages.length === 0
    ? `<option value="">chưa có page từ token</option>`
    : state.tokenPages
      .map((page) => `<option value="${escapeHtml(page.pageId)}" ${page.pageId === state.registerSelectedPancakePageId ? "selected" : ""}>${escapeHtml(`${page.pageName} (${page.pageId})`)}</option>`)
      .join("");

  return `
    <div class="section">
      <div class="section-head">
        <h2>Register Page</h2>
        <div class="row">
          <button data-action="token-pages">Tải page từ token</button>
          <button data-action="register-page">Register page</button>
        </div>
      </div>
      <div class="grid two">
        <label>
          <span>User access token</span>
          <input id="register-token" type="password" value="${escapeHtml(state.registerToken)}" />
        </label>
        <label>
          <span>Pancake page</span>
          <select id="register-page-id">${options}</select>
        </label>
        <label>
          <span>Business timezone</span>
          ${renderTimezoneSelect("register-timezone", state.registerTimezone)}
        </label>
        <div class="row checks">
          <label class="check"><input id="register-etl-enabled" type="checkbox" ${state.registerEtlEnabled ? "checked" : ""} />etl_enabled</label>
          <label class="check"><input id="register-analysis-enabled" type="checkbox" ${state.registerAnalysisEnabled ? "checked" : ""} />analysis_enabled</label>
        </div>
      </div>
    </div>
  `;
}

function renderPagesPanel(state: AppState) {
  const options = state.pages.length === 0
    ? `<option value="">chưa có connected page</option>`
    : state.pages
      .map((page) => `<option value="${escapeHtml(page.id)}" ${page.id === state.selectedPageId ? "selected" : ""}>${escapeHtml(`${page.pageName} (${page.pancakePageId})`)}</option>`)
      .join("");

  return `
    <div class="section">
      <div class="section-head">
        <h2>Connected Page</h2>
        <div class="row">
          <button data-action="refresh-pages">Refresh</button>
          <button data-action="load-page">Tải chi tiết</button>
        </div>
      </div>
      <div class="grid two">
        <label>
          <span>Connected page</span>
          <select id="connected-page-id">${options}</select>
        </label>
        <div class="summary-card">
          ${state.selectedPage ? renderPageSummary(state.selectedPage) : `<span class="muted">Chưa có page nào được register.</span>`}
        </div>
      </div>
    </div>
  `;
}

function renderConfigPanel(state: AppState) {
  const configOptions = state.selectedPage?.configVersions.length
    ? state.selectedPage.configVersions
      .map((configVersion) => `<option value="${escapeHtml(configVersion.id)}" ${configVersion.id === state.selectedConfigVersionId ? "selected" : ""}>${escapeHtml(`v${String(configVersion.versionNo)} | ${configVersion.id}`)}</option>`)
      .join("")
    : `<option value="">chưa có config version</option>`;

  return `
    <div class="section">
      <div class="section-head">
        <h2>Config Version</h2>
        <div class="row">
          <button data-action="use-active-config">Nạp active config</button>
          <button data-action="create-config">Tạo config version</button>
          <button data-action="activate-config">Activate config đang chọn</button>
        </div>
      </div>
      <div class="grid two">
        <label>
          <span>Config version</span>
          <select id="config-version-id">${configOptions}</select>
        </label>
        <div class="row checks">
          <label class="check"><input id="config-activate" type="checkbox" ${state.configActivate ? "checked" : ""} />activate sau khi tạo</label>
          <label class="check"><input id="config-etl-enabled" type="checkbox" ${state.configEtlEnabled ? "checked" : ""} />etl_enabled</label>
          <label class="check"><input id="config-analysis-enabled" type="checkbox" ${state.configAnalysisEnabled ? "checked" : ""} />analysis_enabled</label>
        </div>
      </div>
      <label>
        <span>Prompt text</span>
        <textarea id="config-prompt-text" class="prompt-box">${escapeHtml(state.configPromptText)}</textarea>
      </label>
      <div class="grid two">
        <label>
          <span>tagMappingJson</span>
          <textarea id="config-tag-mapping" class="json-box">${escapeHtml(state.configTagMappingText)}</textarea>
        </label>
        <label>
          <span>openingRulesJson</span>
          <textarea id="config-opening-rules" class="json-box">${escapeHtml(state.configOpeningRulesText)}</textarea>
        </label>
        <label>
          <span>schedulerJson (để trống nếu muốn null)</span>
          <textarea id="config-scheduler" class="json-box">${escapeHtml(state.configSchedulerText)}</textarea>
        </label>
        <label>
          <span>notificationTargetsJson (để trống nếu muốn null)</span>
          <textarea id="config-notification-targets" class="json-box">${escapeHtml(state.configNotificationTargetsText)}</textarea>
        </label>
      </div>
      <label>
        <span>Notes</span>
        <textarea id="config-notes" class="notes-box">${escapeHtml(state.configNotes)}</textarea>
      </label>
    </div>
  `;
}

function renderJobsPanel(state: AppState) {
  return `
    <div class="section">
      <div class="section-head">
        <h2>Preview / Execute</h2>
        <div class="row">
          <button data-action="preview-job">Preview</button>
          <button data-action="execute-job">Execute</button>
        </div>
      </div>
      <div class="grid two">
        <label>
          <span>processing_mode</span>
          <select id="job-processing-mode">
            <option value="etl_only" ${state.jobProcessingMode === "etl_only" ? "selected" : ""}>etl_only</option>
            <option value="etl_and_ai" ${state.jobProcessingMode === "etl_and_ai" ? "selected" : ""}>etl_and_ai</option>
          </select>
        </label>
        <label>
          <span>target_date</span>
          <input id="job-target-date" type="date" value="${escapeHtml(state.jobTargetDate)}" />
        </label>
        <label>
          <span>requested_window_start_at</span>
          <input id="job-window-start" type="datetime-local" value="${escapeHtml(toDatetimeLocalValue(state.jobRequestedWindowStartAt))}" />
        </label>
        <label>
          <span>requested_window_end_exclusive_at</span>
          <input id="job-window-end" type="datetime-local" value="${escapeHtml(toDatetimeLocalValue(state.jobRequestedWindowEndExclusiveAt))}" />
        </label>
      </div>
      <div class="grid two">
        <div>
          <h3>Preview result</h3>
          <pre class="mono">${escapeHtml(prettyJson(state.previewResult ?? {}))}</pre>
        </div>
        <div>
          <h3>Execute result</h3>
          <pre class="mono">${escapeHtml(prettyJson(state.executeResult ?? {}))}</pre>
        </div>
      </div>
    </div>
  `;
}

function renderInspectPanel(state: AppState) {
  return `
    <div class="section">
      <div class="section-head">
        <h2>Inspect Run Group / Run</h2>
        <div class="row">
          <button data-action="load-run-group">Tải run group</button>
          <button data-action="load-run">Tải run</button>
        </div>
      </div>
      <div class="grid two">
        <label>
          <span>run_group_id</span>
          <input id="inspect-run-group-id" value="${escapeHtml(state.inspectRunGroupId)}" />
        </label>
        <label>
          <span>run_id</span>
          <input id="inspect-run-id" value="${escapeHtml(state.inspectRunId)}" />
        </label>
      </div>
      <div class="grid two">
        <div>
          <h3>Run group</h3>
          <pre class="mono">${escapeHtml(prettyJson(state.runGroupResult ?? {}))}</pre>
        </div>
        <div>
          <h3>Run detail</h3>
          <pre class="mono">${escapeHtml(prettyJson(state.runDetailResult ?? {}))}</pre>
        </div>
      </div>
    </div>
  `;
}

function renderPublishPanel(state: AppState) {
  return `
    <div class="section">
      <div class="section-head">
        <h2>Publish</h2>
        <button data-action="publish-run">Publish run</button>
      </div>
      <div class="grid two">
        <label>
          <span>run_id</span>
          <input id="publish-run-id" value="${escapeHtml(state.publishRunId)}" />
        </label>
        <label>
          <span>publish_as</span>
          <select id="publish-as">
            <option value="provisional" ${state.publishAs === "provisional" ? "selected" : ""}>provisional</option>
            <option value="official" ${state.publishAs === "official" ? "selected" : ""}>official</option>
          </select>
        </label>
        <label>
          <span>expected_replaced_run_id</span>
          <input id="publish-expected-replaced-run-id" value="${escapeHtml(state.expectedReplacedRunId)}" />
        </label>
        <div class="row checks">
          <label class="check"><input id="publish-confirm-historical-overwrite" type="checkbox" ${state.confirmHistoricalOverwrite ? "checked" : ""} />confirm_historical_overwrite</label>
        </div>
      </div>
      <pre class="mono">${escapeHtml(prettyJson(state.publishResult ?? {}))}</pre>
    </div>
  `;
}

function renderPageSummary(page: ConnectedPageDetail) {
  const activeConfig = page.activeConfigVersion;
  return `
    <dl class="summary-list">
      <div><dt>connected_page_id</dt><dd>${escapeHtml(page.id)}</dd></div>
      <div><dt>pancake_page_id</dt><dd>${escapeHtml(page.pancakePageId)}</dd></div>
      <div><dt>timezone</dt><dd>${escapeHtml(page.businessTimezone)}</dd></div>
      <div><dt>etl</dt><dd>${page.etlEnabled ? "enabled" : "disabled"}</dd></div>
      <div><dt>analysis</dt><dd>${page.analysisEnabled ? "enabled" : "disabled"}</dd></div>
      <div><dt>active config</dt><dd>${activeConfig ? `v${String(activeConfig.versionNo)}` : "-"}</dd></div>
      <div><dt>prompt version count</dt><dd>${page.configVersions.length}</dd></div>
      <div><dt>updated_at</dt><dd>${escapeHtml(formatDateTime(page.updatedAt))}</dd></div>
    </dl>
    ${activeConfig ? renderActiveConfigSnapshot(activeConfig) : `<span class="muted">Chưa có active config version.</span>`}
  `;
}

function renderActiveConfigSnapshot(configVersion: PageConfigVersion) {
  return `
    <div class="snapshot-grid">
      <article class="snapshot-card">
        <span class="muted">tagMappingJson</span>
        <pre class="mini-json">${escapeHtml(prettyJson(configVersion.tagMappingJson))}</pre>
      </article>
      <article class="snapshot-card">
        <span class="muted">openingRulesJson</span>
        <pre class="mini-json">${escapeHtml(prettyJson(configVersion.openingRulesJson))}</pre>
      </article>
    </div>
  `;
}

function renderTimezoneSelect(id: string, selected: string) {
  const options = listTimezones();
  const merged = selected && !options.includes(selected) ? [selected, ...options] : options;
  return `
    <select id="${id}">
      ${merged.map((timezone) => `<option value="${escapeHtml(timezone)}" ${timezone === selected ? "selected" : ""}>${escapeHtml(timezone)}</option>`).join("")}
    </select>
  `;
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
