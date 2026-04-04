import type { OperationsState } from "../../app/screen-state.ts";
import { escapeHtml } from "../../shared/html.ts";
import { prettyJson } from "../../shared/format.ts";
import { derivePublishAction, describePublishEligibility } from "./state.ts";

export function renderOperations(state: OperationsState) {
  const childRuns = state.runGroup?.childRuns ?? [];
  const selectedRun = childRuns.find((run) => run.id === state.publishRunId) ?? (state.runDetail?.run.id === state.publishRunId ? state.runDetail.run : null);
  const publishAction = selectedRun ? derivePublishAction(selectedRun.publishEligibility) : null;
  return `
    <section class="feature-stack">
      <article class="panel-card">
        <div class="section-headline">
          <div>
            <p class="eyebrow">HTTP-first</p>
            <h2>Vận hành</h2>
          </div>
          <button data-action="refresh-control-pages">Tải page kết nối</button>
        </div>
        <div class="tab-row">
          <button data-route="?view=operations&ops=manual-run" class="${state.activePanel === "manual-run" ? "tab-active" : ""}">Manual run</button>
          <button data-route="?view=operations&ops=run-monitor" class="${state.activePanel === "run-monitor" ? "tab-active" : ""}">Run monitor</button>
          <button data-route="?view=operations&ops=run-detail" class="${state.activePanel === "run-detail" ? "tab-active" : ""}">Run detail</button>
        </div>
      </article>
      <article class="panel-card">
        <h3>Health summary</h3>
        <div class="metric-grid compact">
          <article class="metric-card"><span class="metric-label">backend</span><strong class="metric-value">ready</strong></article>
          <article class="metric-card"><span class="metric-label">go-worker</span><strong class="metric-value">ready</strong></article>
          <article class="metric-card"><span class="metric-label">AI service</span><strong class="metric-value">pending</strong></article>
          <article class="metric-card"><span class="metric-label">queue</span><strong class="metric-value">ready</strong></article>
        </div>
      </article>
      <section class="two-column-grid">
        <article class="panel-card ${state.activePanel === "manual-run" ? "panel-focus" : ""}">
          <div class="section-headline">
            <div>
              <h3>Manual run form</h3>
              <p class="muted-copy">Flow pinned: preview -> execute -> get run detail -> publish. Manual run luôn phải preview split trước khi execute.</p>
            </div>
          </div>
          <form data-form="operations-preview">
            ${renderConnectedPageSelect(state.connectedPages, state.selectedPageId, "connectedPageId")}
            <label><span>Processing mode</span><select name="processingMode"><option value="etl_only" ${state.processingMode === "etl_only" ? "selected" : ""}>etl_only</option><option value="etl_and_ai" ${state.processingMode === "etl_and_ai" ? "selected" : ""}>etl_and_ai</option></select></label>
            <label><span>Target date</span><input type="date" name="targetDate" value="${escapeHtml(state.targetDate)}" /></label>
            <label><span>Window start</span><input type="datetime-local" name="requestedWindowStartAt" value="${escapeHtml(state.requestedWindowStartAt)}" /></label>
            <label><span>Window end</span><input type="datetime-local" name="requestedWindowEndExclusiveAt" value="${escapeHtml(state.requestedWindowEndExclusiveAt)}" /></label>
            <div class="button-row">
              <button type="submit">Preview</button>
              <button type="button" data-action="execute-manual-run">Execute</button>
            </div>
          </form>
          ${state.previewResult ? `
            <div class="preview-stack">
              <div class="meta-list">
                <span>Page: ${escapeHtml(state.previewResult.pageName)}</span>
                <span>Window: ${escapeHtml(state.previewResult.requestedWindow)}</span>
                <span>Prompt: ${escapeHtml(state.previewResult.promptVersion)}</span>
                <span>Config: ${escapeHtml(state.previewResult.configVersion)}</span>
              </div>
              <table class="data-table">
                <thead><tr><th>Ngày</th><th>Window</th><th>Eligibility</th><th>Action hiển thị</th><th>Overwrite?</th></tr></thead>
                <tbody>
                  ${state.previewResult.children.map((child) => `
                    <tr>
                      <td>${escapeHtml(child.targetDate)}</td>
                      <td>${escapeHtml(child.windowStartAt)} -> ${escapeHtml(child.windowEndExclusiveAt)}</td>
                      <td>${escapeHtml(describePublishEligibility(child.publishEligibility))}</td>
                      <td>${escapeHtml(derivePublishAction(child.publishEligibility).label)}</td>
                      <td>${child.historicalOverwriteRequired ? "Có" : "Không"}</td>
                    </tr>
                  `).join("")}
                </tbody>
              </table>
            </div>
          ` : "<p class='muted-copy'>Preview split theo ngày sẽ hiện ở đây.</p>"}
        </article>
        <article class="panel-card ${state.activePanel === "run-monitor" ? "panel-focus" : ""}">
          <h3>Run monitor / publish</h3>
          ${state.runGroup ? `
            <div class="meta-list">
              <span>Run group: ${escapeHtml(state.runGroup.id)}</span>
              <span>Status: ${escapeHtml(state.runGroup.status)}</span>
              <span>Page: ${escapeHtml(state.runGroup.pageName)}</span>
              <span>Prompt: ${escapeHtml(state.runGroup.promptVersion)}</span>
              <span>Config: ${escapeHtml(state.runGroup.configVersionId)}</span>
            </div>
            <table class="data-table">
              <thead><tr><th>Run</th><th>Ngày</th><th>Status</th><th>Publish state</th><th>Eligibility</th><th>Window</th></tr></thead>
              <tbody>
                ${childRuns.map((run) => `
                  <tr>
                    <td>${escapeHtml(run.id)}</td>
                    <td>${escapeHtml(run.targetDate)}</td>
                    <td>${escapeHtml(run.status)}</td>
                    <td>${escapeHtml(run.publishState)}</td>
                    <td>${escapeHtml(describePublishEligibility(run.publishEligibility))}</td>
                    <td>${escapeHtml(run.windowStartAt)} -> ${escapeHtml(run.windowEndExclusiveAt)}</td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          ` : "<p class='muted-copy'>Sau khi execute hoặc load run group, monitor sẽ hiện child run theo đúng grain run/day.</p>"}
          <form data-form="operations-inspect">
            <label><span>Run group id</span><input name="inspectRunGroupId" value="${escapeHtml(state.inspectRunGroupId)}" /></label>
            <label><span>Run id</span><input name="inspectRunId" value="${escapeHtml(state.inspectRunId)}" /></label>
            <div class="button-row">
              <button type="button" data-action="load-run-group">Tải run group</button>
              <button type="button" data-action="load-run-detail">Tải run detail</button>
            </div>
          </form>
          <form data-form="operations-publish">
            <label><span>Run id để publish</span><input name="publishRunId" value="${escapeHtml(state.publishRunId)}" /></label>
            <label><span>Expected replaced run id</span><input name="expectedReplacedRunId" value="${escapeHtml(state.expectedReplacedRunId)}" /></label>
            <label class="inline-check"><input type="checkbox" name="confirmHistoricalOverwrite" ${state.confirmHistoricalOverwrite ? "checked" : ""} /> xác nhận overwrite lịch sử</label>
            <div class="banner banner-warning">
              <strong>Luật publish</strong>
              <p>Partial current day chỉ được publish tạm thời. Partial old day chỉ xem kết quả run. Full-day mới được publish chính thức và historical overwrite cần xác nhận rõ snapshot cũ/mới.</p>
            </div>
            ${publishAction ? `
              <div class="meta-list">
                <span>Eligibility: ${escapeHtml(describePublishEligibility(selectedRun?.publishEligibility ?? "not_publishable_old_partial"))}</span>
                <span>CTA hợp lệ: ${escapeHtml(publishAction.label)}</span>
              </div>
              <p class="muted-copy">${escapeHtml(publishAction.helperText)}</p>
            ` : "<p class='muted-copy'>Tải run group hoặc run detail trước khi publish để UI xác định eligibility.</p>"}
            ${selectedRun?.historicalOverwrite
              ? `
                <div class="banner banner-warning">
                  <strong>Historical overwrite</strong>
                  <p>${escapeHtml(selectedRun.historicalOverwrite.replacedSnapshotLabel)} sẽ ghi đè run ${escapeHtml(selectedRun.historicalOverwrite.replacedRunId)}.</p>
                  <div class="meta-list">
                    <span>Prompt cũ: ${escapeHtml(selectedRun.historicalOverwrite.previousPromptVersion)}</span>
                    <span>Prompt mới: ${escapeHtml(selectedRun.historicalOverwrite.nextPromptVersion)}</span>
                    <span>Config cũ: ${escapeHtml(selectedRun.historicalOverwrite.previousConfigVersion)}</span>
                    <span>Config mới: ${escapeHtml(selectedRun.historicalOverwrite.nextConfigVersion)}</span>
                  </div>
                  <p>${escapeHtml(selectedRun.historicalOverwrite.exportImpact)}</p>
                </div>
              `
              : selectedRun?.supersedesRunId
                ? `<div class="banner banner-warning"><strong>Historical overwrite</strong><p>Snapshot official của ngày ${escapeHtml(selectedRun.targetDate)} sẽ ghi đè run ${escapeHtml(selectedRun.supersedesRunId)}. Cần tải metadata overwrite đầy đủ trước khi operator confirm publish lịch sử.</p></div>`
                : ""}
            <button type="button" data-action="publish-run" ${publishAction?.canPublish ? "" : "disabled"}>${escapeHtml(publishAction?.label ?? "Publish")}</button>
          </form>
        </article>
      </section>
      <article class="panel-card ${state.activePanel === "run-detail" ? "panel-focus" : ""}">
        <h3>Run detail và mapping queue</h3>
        ${state.runDetail ? `
          <div class="meta-list">
            <span>Run: ${escapeHtml(state.runDetail.run.id)}</span>
            <span>Ngày: ${escapeHtml(state.runDetail.run.targetDate)}</span>
            <span>Thread: ${state.runDetail.threadDayCount}</span>
            <span>Tin nhắn: ${state.runDetail.messageCount}</span>
          </div>
          ${state.runDetail.publishWarning ? `<div class="banner banner-warning"><strong>Cảnh báo publish</strong><p>${escapeHtml(state.runDetail.publishWarning)}</p></div>` : ""}
          <pre class="code-block">${escapeHtml(prettyJson(state.runDetail))}</pre>
        ` : "<p class='muted-copy'>Run detail sẽ hiện thread counts, message counts, publish state và warning nếu run không được publish.</p>"}
        <table class="data-table">
          <thead><tr><th>Thread</th><th>Candidate</th><th>Confidence</th><th>Evidence</th><th>Trạng thái</th><th>Action</th></tr></thead>
          <tbody>
            ${state.mappingQueue.map((item) => `
              <tr>
                <td>${escapeHtml(item.threadLabel)}</td>
                <td>${escapeHtml(item.candidateCustomer)}</td>
                <td>${escapeHtml(item.confidence)}</td>
                <td>${escapeHtml(item.evidence)}</td>
                <td>${escapeHtml(renderMappingStatus(item.status))}</td>
                <td>
                  <div class="button-row">
                    <button type="button" data-action="approve-mapping" data-mapping-id="${escapeHtml(item.id)}">Approve</button>
                    <button type="button" data-action="reject-mapping" data-mapping-id="${escapeHtml(item.id)}">Reject</button>
                    <button type="button" data-action="remap-mapping" data-mapping-id="${escapeHtml(item.id)}">Remap</button>
                  </div>
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </article>
    </section>
  `;
}

function renderMappingStatus(status: OperationsState["mappingQueue"][number]["status"]) {
  switch (status) {
    case "approved":
      return "Đã approve";
    case "rejected":
      return "Đã reject";
    case "remapped":
      return "Đã remap";
    default:
      return "Chờ review";
  }
}

function renderConnectedPageSelect(
  connectedPages: OperationsState["connectedPages"],
  selectedPageId: string,
  name: string
) {
  return `
    <label>
      <span>Connected page</span>
      <select name="${name}">
        <option value="">Chọn page</option>
        ${connectedPages.map((page) => `<option value="${escapeHtml(page.id)}" ${page.id === selectedPageId ? "selected" : ""}>${escapeHtml(page.pageName)}</option>`).join("")}
      </select>
    </label>
  `;
}
