import type { ConfigurationState } from "../../app/screen-state.ts";
import { escapeHtml } from "../../shared/html.ts";
import { buildTimezoneOptions } from "./timezones.ts";

export function renderConfiguration(configuration: ConfigurationState) {
  const draft = configuration.workspace;
  const compareLeft = configuration.pageDetail?.configVersions.find((item) => item.id === draft.promptCompareLeftVersionId) ?? null;
  const compareRight = configuration.pageDetail?.configVersions.find((item) => item.id === draft.promptCompareRightVersionId) ?? null;
  const selectedPromptSampleConversation = configuration.promptWorkspaceSamplePreview?.conversations.find(
    (item) => item.conversationId === draft.selectedPromptSampleConversationId
  ) ?? configuration.promptWorkspaceSamplePreview?.conversations[0] ?? null;
  const timezoneOptions = buildTimezoneOptions([
    "Asia/Ho_Chi_Minh",
    "Asia/Bangkok",
    "UTC",
    draft.businessTimezone,
    draft.scheduler.timezone,
    ...configuration.connectedPages.map((page) => page.businessTimezone),
    configuration.pageDetail?.businessTimezone ?? null
  ]);

  return `
    <section class="feature-stack">
      <article class="panel-card">
        <div class="section-headline">
          <div>
            <p class="eyebrow">HTTP-first control-plane</p>
            <h2>Cấu hình</h2>
            <p class="muted-copy">Frontend giữ draft/view state. Backend giữ connected page status và payload config version.</p>
          </div>
          <div class="button-row">
            <button data-action="refresh-control-pages">Tải page kết nối</button>
            <button data-action="use-active-config" ${configuration.pageDetail?.activeConfigVersion ? "" : "disabled"}>Nạp active config</button>
          </div>
        </div>
        <div class="tab-row">
          ${renderTabButton("page-info", "Thông tin page", configuration.activeTab)}
          ${renderTabButton("taxonomy", "Tag taxonomy", configuration.activeTab)}
          ${renderTabButton("opening-rules", "Opening rules", configuration.activeTab)}
          ${renderTabButton("prompt-profile", "Prompt profile", configuration.activeTab)}
          ${renderTabButton("scheduler", "Scheduler và thông báo", configuration.activeTab)}
        </div>
      </article>
      <section class="configuration-shell">
        <aside class="configuration-sidebar">
          <article class="panel-card panel-tight">
            <h3>Page đang vận hành</h3>
            <form data-form="configuration-load-page">
              <label>
                <span>Connected page</span>
                <select name="selectedPageId">
                  <option value="">Chọn page</option>
                  ${configuration.connectedPages.map((page) => `
                    <option value="${escapeHtml(page.id)}" ${page.id === draft.selectedPageId ? "selected" : ""}>
                      ${escapeHtml(page.pageName)}
                    </option>
                  `).join("")}
                </select>
              </label>
              <button type="submit">Tải cấu hình page đã chọn</button>
            </form>
            ${renderPageSummary(configuration.pageDetail)}
          </article>
          <article class="panel-card panel-tight">
            <h3>Lane hiện tại</h3>
            <p class="muted-copy">${describeActiveTab(configuration.activeTab)}</p>
            <div class="meta-row">
              <span class="meta-chip">Prompt: ${draft.promptText.trim() ? "đã có draft" : "trống"}</span>
              <span class="meta-chip">Tag rows: ${draft.tagMappings.length}</span>
              <span class="meta-chip">Opening rows: ${draft.openingRules.length}</span>
            </div>
          </article>
          ${configuration.activeTab === "page-info" && configuration.onboardingSamplePreview
            ? `
              <article class="panel-card panel-tight">
                <h3>Sample onboarding</h3>
                <div class="meta-row">
                  <span class="meta-chip">Page: ${escapeHtml(configuration.onboardingSamplePreview.pageName)}</span>
                  <span class="meta-chip">Ngày: ${escapeHtml(configuration.onboardingSamplePreview.targetDate)}</span>
                </div>
                <div class="meta-row">
                  ${renderSummarySpans(configuration.onboardingSamplePreview)}
                </div>
              </article>
            `
            : ""}
        </aside>
        <div class="configuration-main-stack">
          ${renderActivePanel(configuration, timezoneOptions, compareLeft, compareRight, selectedPromptSampleConversation)}
        </div>
      </section>
    </section>
  `;
}

function renderActivePanel(
  configuration: ConfigurationState,
  timezoneOptions: Array<{ value: string; label: string }>,
  compareLeft: NonNullable<ConfigurationState["pageDetail"]>["configVersions"][number] | null,
  compareRight: NonNullable<ConfigurationState["pageDetail"]>["configVersions"][number] | null,
  selectedPromptSampleConversation: NonNullable<ConfigurationState["promptWorkspaceSamplePreview"]>["conversations"][number] | null
) {
  const draft = configuration.workspace;
  switch (configuration.activeTab) {
    case "page-info":
      return `
        ${renderPageInfoPanel(configuration, timezoneOptions)}
        ${configuration.onboardingSamplePreview
          ? `
            <article class="panel-card">
              <h3>Sample dữ liệu thật</h3>
              <div class="meta-row">
                <span class="meta-chip">Page: ${escapeHtml(configuration.onboardingSamplePreview.pageName)}</span>
                <span class="meta-chip">Timezone: ${escapeHtml(configuration.onboardingSamplePreview.businessTimezone)}</span>
                <span class="meta-chip">Window: ${escapeHtml(configuration.onboardingSamplePreview.windowStartAt)} -> ${escapeHtml(configuration.onboardingSamplePreview.windowEndExclusiveAt)}</span>
              </div>
              ${configuration.onboardingSampleSeedSummary
                ? `
                  <div class="banner banner-warning">
                    <strong>Seed từ sample</strong>
                    <p>
                      Tag áp dụng: ${configuration.onboardingSampleSeedSummary.tagSuggestionsApplied}.
                      Opening áp dụng: ${configuration.onboardingSampleSeedSummary.openingSuggestionsApplied}.
                      Override giữ nguyên: ${configuration.onboardingSampleSeedSummary.tagOverridesPreserved + configuration.onboardingSampleSeedSummary.openingOverridesPreserved}.
                    </p>
                  </div>
                `
                : ""}
              <div class="two-column-grid configuration-panel-grid">
                <article class="sub-panel">
                  <h4>Tag thô từ page</h4>
                  ${configuration.onboardingSamplePreview.pageTags.length > 0
                    ? `<ul>${configuration.onboardingSamplePreview.pageTags.map((item) => `<li>${escapeHtml(item.text)}${item.isDeactive ? " (đã tắt)" : ""}</li>`).join("")}</ul>`
                    : "<p class='muted-copy'>Sample chưa thấy tag nào từ page.</p>"}
                </article>
                <article class="sub-panel">
                  <h4>Tóm tắt sample</h4>
                  <div class="meta-row">
                    ${renderSummarySpans(configuration.onboardingSamplePreview)}
                  </div>
                </article>
              </div>
              ${renderSampleConversations(configuration.onboardingSamplePreview.conversations)}
            </article>
          `
          : ""}
      `;
    case "taxonomy":
      return renderConfigVersionForm(configuration, renderTaxonomyPanel(draft));
    case "opening-rules":
      return renderConfigVersionForm(configuration, renderOpeningRulesPanel(draft));
    case "prompt-profile":
      return renderConfigVersionForm(
        configuration,
        renderPromptProfilePanel(configuration, compareLeft, compareRight, selectedPromptSampleConversation)
      );
    case "scheduler":
      return renderConfigVersionForm(configuration, renderSchedulerPanel(draft, timezoneOptions));
  }
}

function renderTabButton(tab: ConfigurationState["activeTab"], label: string, activeTab: ConfigurationState["activeTab"]) {
  return `<button data-route="?view=configuration&configTab=${tab}" class="${activeTab === tab ? "tab-active" : ""}">${label}</button>`;
}

function describeActiveTab(tab: ConfigurationState["activeTab"]) {
  switch (tab) {
    case "page-info":
      return "Kết nối token, chọn page, kiểm tra page-info và sample onboarding thật.";
    case "taxonomy":
      return "Map tag thô sang canonical signal và giữ nguyên source tag identity.";
    case "opening-rules":
      return "Cấu hình opening-rules như optional extractor, không ép flow activate.";
    case "prompt-profile":
      return "Chỉnh prompt, chạy preview workspace và so sánh artifact active vs draft.";
    case "scheduler":
      return "Quản lý scheduler, recipient và notes của configuration draft.";
  }
}

function renderPageSummary(pageDetail: ConfigurationState["pageDetail"]) {
  if (!pageDetail) {
    return "<p class='muted-copy'>Chọn connected page để xem status control-plane và config version.</p>";
  }

  return `
    <div class="meta-row">
      <span class="meta-chip">Page: ${escapeHtml(pageDetail.pageName)}</span>
      <span class="meta-chip">Pancake page id: ${escapeHtml(pageDetail.pancakePageId)}</span>
      <span class="meta-chip">Timezone: ${escapeHtml(pageDetail.businessTimezone)}</span>
    </div>
    <div class="meta-row">
      <span class="meta-chip">Token status: ${escapeHtml(renderTokenStatus(pageDetail.tokenStatus))}</span>
      <span class="meta-chip">Connection: ${escapeHtml(renderConnectionStatus(pageDetail.connectionStatus))}</span>
      <span class="meta-chip">Validated: ${escapeHtml(pageDetail.lastValidatedAt ?? "Chưa kiểm tra")}</span>
    </div>
    <div class="meta-row">
      <span class="meta-chip">Token preview: ${escapeHtml(pageDetail.tokenPreviewMasked ?? "Không có")}</span>
      <span class="meta-chip">ETL: ${pageDetail.etlEnabled ? "bật" : "tắt"}</span>
      <span class="meta-chip">AI: ${pageDetail.analysisEnabled ? "bật" : "tắt"}</span>
    </div>
    <div class="meta-row">
      <span class="meta-chip">Active config: ${escapeHtml(pageDetail.activeConfigVersionId ?? "Chưa activate")}</span>
      <span class="meta-chip">Số version: ${pageDetail.configVersions.length}</span>
    </div>
  `;
}

function renderPageInfoPanel(
  configuration: ConfigurationState,
  timezoneOptions: Array<{ value: string; label: string }>
) {
  const draft = configuration.workspace;
  return `
    <article class="panel-card">
      <div class="section-headline">
        <div>
          <h3>Thông tin page</h3>
          <p class="muted-copy">Flow tối thiểu vẫn là nhập token, chọn page, activate. Sample chỉ là lane nâng cao để kiểm tra signal extractor.</p>
        </div>
      </div>
      <section class="two-column-grid configuration-panel-grid">
        <form data-form="onboarding-token" class="sub-panel">
          <h4>Kết nối token</h4>
          <label>
            <span>User access token</span>
            <textarea name="token" rows="4" spellcheck="false" autocomplete="off" placeholder="Dán user access token Pancake ở đây.">${escapeHtml(draft.token)}</textarea>
          </label>
          <label>
            <span>Business timezone</span>
            <select name="businessTimezone">${renderLabeledOptions(timezoneOptions, draft.businessTimezone)}</select>
          </label>
          <div class="inline-check-row">
            <label class="inline-check"><input type="checkbox" name="etlEnabled" ${draft.etlEnabled ? "checked" : ""} /> bật ETL</label>
            <label class="inline-check"><input type="checkbox" name="analysisEnabled" ${draft.analysisEnabled ? "checked" : ""} /> bật AI</label>
          </div>
          <button type="submit">Tải page từ token</button>
        </form>
        <form data-form="onboarding-register" class="sub-panel">
          <h4>Register page</h4>
          <label>
            <span>Pancake page</span>
            <select name="pancakePageId">
              <option value="">Chọn page</option>
              ${draft.tokenPages.map((page) => `
                <option value="${escapeHtml(page.pageId)}" ${page.pageId === draft.selectedPancakePageId ? "selected" : ""}>
                  ${escapeHtml(page.pageName)}
                </option>
              `).join("")}
            </select>
          </label>
          <div class="two-column-grid">
            <label><span>Số hội thoại sample</span><input name="sampleConversationLimit" type="number" min="1" max="100" step="1" value="${draft.sampleConversationLimit}" /></label>
            <label><span>Số trang tin nhắn / thread</span><input name="sampleMessagePageLimit" type="number" min="1" max="20" step="1" value="${draft.sampleMessagePageLimit}" /></label>
          </div>
          <div class="button-row">
            <button type="button" data-action="load-onboarding-sample">Lấy sample dữ liệu thật</button>
            <button type="submit">Register và activate mặc định</button>
          </div>
        </form>
      </section>
    </article>
  `;
}

function renderConfigVersionForm(configuration: ConfigurationState, activePanelHtml: string) {
  const draft = configuration.workspace;
  return `
    <form data-form="configuration-create" class="feature-stack">
      <article class="panel-card">
        <div class="section-headline">
          <div>
            <h3>Configuration draft</h3>
            <p class="muted-copy">Chỉ panel hiện tại được render, tránh whole-form rerender khi operator đang gõ draft nhạy cảm.</p>
          </div>
          <div class="button-row">
            <button type="button" data-action="activate-config-version" ${draft.selectedConfigVersionId ? "" : "disabled"}>Activate config đang chọn</button>
            <button type="submit">Tạo config version</button>
          </div>
        </div>
        <div class="two-column-grid configuration-panel-grid">
          <label>
            <span>Config version</span>
            <select name="selectedConfigVersionId">
              <option value="">Chọn config version</option>
              ${configuration.pageDetail?.configVersions.map((configVersion) => `
                <option value="${escapeHtml(configVersion.id)}" ${configVersion.id === draft.selectedConfigVersionId ? "selected" : ""}>
                  v${configVersion.versionNo}
                </option>
              `).join("") ?? ""}
            </select>
          </label>
          <article class="sub-panel">
            <h4>Metadata</h4>
            <div class="meta-row">
              <span class="meta-chip">Connected page: ${escapeHtml(configuration.pageDetail?.pageName ?? "Chưa chọn")}</span>
              <span class="meta-chip">Timezone: ${escapeHtml(configuration.pageDetail?.businessTimezone ?? draft.businessTimezone)}</span>
              <span class="meta-chip">Active config: ${escapeHtml(configuration.pageDetail?.activeConfigVersionId ?? "Chưa activate")}</span>
            </div>
          </article>
        </div>
      </article>
      ${activePanelHtml}
    </form>
  `;
}

function renderTaxonomyPanel(draft: ConfigurationState["workspace"]) {
  return `
    <article class="panel-card">
      <div class="section-headline">
        <div>
          <h3>Tag taxonomy</h3>
          <p class="muted-copy">Giữ pancake tag identity khi source có thật, fallback deterministic chỉ dành cho tag nhập tay.</p>
        </div>
        <button type="button" data-action="add-tag-mapping-row">Thêm dòng tag</button>
      </div>
      <table class="data-table">
        <thead><tr><th>Tag thô</th><th>Loại signal</th><th>Giá trị canonical</th><th>Trạng thái</th></tr></thead>
        <tbody>
          ${draft.tagMappings.map((entry) => `
            <tr>
              <td>
                <div class="field-stack">
                  <input name="tagRawTag" value="${escapeHtml(entry.rawTag)}" />
                  <small class="muted-copy">source id: ${escapeHtml(entry.sourceTagId || "manual")}</small>
                </div>
              </td>
              <td><select name="tagRole">${renderOptions(["noise", "customer_journey", "need", "outcome", "branch", "staff"], entry.role)}</select></td>
              <td><input name="tagCanonicalValue" value="${escapeHtml(entry.canonicalValue)}" /></td>
              <td><select name="tagSource">${renderOptions(["system_default", "operator_override"], entry.source)}</select></td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </article>
  `;
}

function renderOpeningRulesPanel(draft: ConfigurationState["workspace"]) {
  return `
    <article class="panel-card">
      <div class="section-headline">
        <div>
          <h3>Opening rules</h3>
          <p class="muted-copy">Opening rules là optional extractor; không match thì pipeline vẫn chạy theo fallback first meaningful message.</p>
        </div>
        <button type="button" data-action="add-opening-rule-row">Thêm rule</button>
      </div>
      <table class="data-table">
        <thead><tr><th>Button title</th><th>Signal type</th><th>Giá trị canonical</th></tr></thead>
        <tbody>
          ${draft.openingRules.map((entry) => `
            <tr>
              <td><input name="openingButtonTitle" value="${escapeHtml(entry.buttonTitle)}" /></td>
              <td><select name="openingSignalType">${renderOptions(["customer_journey", "need", "outcome"], entry.signalType)}</select></td>
              <td><input name="openingCanonicalValue" value="${escapeHtml(entry.canonicalValue)}" /></td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </article>
  `;
}

function renderPromptProfilePanel(
  configuration: ConfigurationState,
  compareLeft: NonNullable<ConfigurationState["pageDetail"]>["configVersions"][number] | null,
  compareRight: NonNullable<ConfigurationState["pageDetail"]>["configVersions"][number] | null,
  selectedPromptSampleConversation: NonNullable<ConfigurationState["promptWorkspaceSamplePreview"]>["conversations"][number] | null
) {
  const draft = configuration.workspace;
  return `
    <article class="panel-card">
      <div class="section-headline">
        <div>
          <h3>Prompt profile</h3>
          <p class="muted-copy">Prompt profile là plain text business-facing. Preview runtime của sample workspace được tách khỏi so sánh version đã lưu.</p>
        </div>
      </div>
      <div class="two-column-grid configuration-panel-grid">
        <label>
          <span>Clone từ version cũ</span>
          <select name="promptCloneSourceVersionId">
            <option value="">Chọn version</option>
            ${configuration.pageDetail?.configVersions.map((configVersion) => `
              <option value="${escapeHtml(configVersion.id)}" ${configVersion.id === draft.promptCloneSourceVersionId ? "selected" : ""}>
                v${configVersion.versionNo}
              </option>
            `).join("") ?? ""}
          </select>
        </label>
        <div class="button-row align-end"><button type="button" data-action="clone-prompt-from-version">Clone từ version cũ</button></div>
        <label>
          <span>Clone từ page khác</span>
          <select name="promptCloneSourcePageId">
            <option value="">Chọn page</option>
            ${configuration.connectedPages.map((page) => `
              <option value="${escapeHtml(page.id)}" ${page.id === draft.promptCloneSourcePageId ? "selected" : ""}>
                ${escapeHtml(page.pageName)}
              </option>
            `).join("")}
          </select>
        </label>
        <div class="button-row align-end"><button type="button" data-action="clone-prompt-from-page">Clone từ page khác</button></div>
      </div>
      <label>
        <span>Prompt text</span>
        <textarea name="promptText" rows="9" placeholder="Prompt sẽ lấy từ active config của backend sau khi tải page.">${escapeHtml(draft.promptText)}</textarea>
      </label>
      <article class="sub-panel">
        <div class="section-headline">
          <div>
            <h4>Preview workspace runtime thật</h4>
            <p class="muted-copy">Lane này chạy AI preview trên sample conversation của page đang chọn, không đụng publish pointer hay active config.</p>
          </div>
          <div class="button-row">
            <button type="button" data-action="load-prompt-workspace-sample">Tải sample prompt</button>
            <button type="button" data-action="run-prompt-preview">Chạy thử prompt</button>
          </div>
        </div>
        ${configuration.promptWorkspaceSampleStaleReason
          ? `
            <div class="banner banner-warning">
              <strong>Sample workspace đã cũ</strong>
              <p>${escapeHtml(configuration.promptWorkspaceSampleStaleReason)}</p>
            </div>
          `
          : ""}
        ${configuration.promptWorkspaceSamplePreview
          ? `
            <div class="meta-row">
              <span class="meta-chip">Page: ${escapeHtml(configuration.promptWorkspaceSamplePreview.pageName)}</span>
              <span class="meta-chip">Ngày sample: ${escapeHtml(configuration.promptWorkspaceSamplePreview.targetDate)}</span>
              <span class="meta-chip">Scope: ${escapeHtml(configuration.promptWorkspaceSamplePreview.sampleWorkspaceKey)}</span>
            </div>
            <div class="two-column-grid configuration-panel-grid">
              <label>
                <span>Chọn hội thoại sample</span>
                <select name="selectedPromptSampleConversationId">
                  ${configuration.promptWorkspaceSamplePreview.conversations.map((conversation) => `
                    <option value="${escapeHtml(conversation.conversationId)}" ${conversation.conversationId === (selectedPromptSampleConversation?.conversationId ?? "") ? "selected" : ""}>
                      ${escapeHtml(conversation.customerDisplayName || conversation.conversationId)}
                    </option>
                  `).join("")}
                </select>
              </label>
              <article class="sub-panel">
                <h5>Scope đang dùng</h5>
                <div class="meta-row">
                  ${renderSummarySpans(configuration.promptWorkspaceSamplePreview)}
                </div>
              </article>
            </div>
            ${selectedPromptSampleConversation
              ? renderPromptWorkspaceConversation(selectedPromptSampleConversation)
              : "<p class='muted-copy'>Chưa có hội thoại sample để preview.</p>"}
          `
          : "<p class='muted-copy'>Tải sample prompt từ connected page để chọn một hội thoại và chạy AI preview trên cùng runtime thật.</p>"}
      </article>
      ${configuration.promptPreviewComparison
        ? `
          <article class="sub-panel">
            <div class="section-headline">
              <div>
                <h4>So sánh active vs draft trên cùng sample</h4>
                <p class="muted-copy">Hai artifact bên dưới dùng cùng sample scope <code>${escapeHtml(configuration.promptPreviewComparison.sampleScope.sampleScopeKey)}</code>.</p>
              </div>
            </div>
            <div class="two-column-grid configuration-panel-grid">
              <article class="sub-panel">
                ${renderPromptPreviewArtifactCard(configuration.promptPreviewComparison.activeArtifact, "Prompt active")}
              </article>
              <article class="sub-panel">
                ${renderPromptPreviewArtifactCard(configuration.promptPreviewComparison.draftArtifact, "Prompt draft")}
              </article>
            </div>
          </article>
        `
        : configuration.promptPreviewComparisonStaleReason
          ? `
            <div class="banner banner-warning">
              <strong>Preview compare cần chạy lại</strong>
              <p>${escapeHtml(configuration.promptPreviewComparisonStaleReason)}</p>
            </div>
          `
          : "<p class='muted-copy'>Kết quả preview active vs draft sẽ hiện ở đây sau khi chọn sample và bấm chạy thử prompt.</p>"}
      <div class="banner banner-warning">
        <strong>Version prompt đã lưu</strong>
        <p>Khối bên dưới chỉ so sánh version/config đã lưu trong control-plane. Đây không phải runtime preview artifact của sample workspace.</p>
      </div>
      <div class="two-column-grid configuration-panel-grid">
        <label>
          <span>So sánh 2 prompt version: bản trái</span>
          <select name="promptCompareLeftVersionId">
            <option value="">Chọn version</option>
            ${configuration.pageDetail?.configVersions.map((configVersion) => `
              <option value="${escapeHtml(configVersion.id)}" ${configVersion.id === draft.promptCompareLeftVersionId ? "selected" : ""}>
                v${configVersion.versionNo}
              </option>
            `).join("") ?? ""}
          </select>
        </label>
        <label>
          <span>So sánh 2 prompt version: bản phải</span>
          <select name="promptCompareRightVersionId">
            <option value="">Chọn version</option>
            ${configuration.pageDetail?.configVersions.map((configVersion) => `
              <option value="${escapeHtml(configVersion.id)}" ${configVersion.id === draft.promptCompareRightVersionId ? "selected" : ""}>
                v${configVersion.versionNo}
              </option>
            `).join("") ?? ""}
          </select>
        </label>
      </div>
      ${compareLeft || compareRight
        ? `
          <div class="two-column-grid configuration-panel-grid">
            <article class="sub-panel">
              ${compareLeft ? renderPromptAuditCard(compareLeft, `Config v${compareLeft.versionNo}`) : "<h4>Chưa chọn bản trái</h4><p class='muted-copy'>Chọn version bên trái để xem nội dung prompt.</p>"}
            </article>
            <article class="sub-panel">
              ${compareRight ? renderPromptAuditCard(compareRight, `Config v${compareRight.versionNo}`) : "<h4>Chưa chọn bản phải</h4><p class='muted-copy'>Chọn version bên phải để so sánh.</p>"}
            </article>
          </div>
        `
        : "<p class='muted-copy'>So sánh 2 prompt version sẽ hiện ở đây.</p>"}
    </article>
  `;
}

function renderSchedulerPanel(
  draft: ConfigurationState["workspace"],
  timezoneOptions: Array<{ value: string; label: string }>
) {
  return `
    <article class="panel-card">
      <div class="section-headline">
        <div>
          <h3>Scheduler và thông báo</h3>
          <p class="muted-copy">Scheduler default toàn hệ thống là 00:00 với lookback 2 giờ. Có thể override ở mức page khi cần.</p>
        </div>
        <button type="button" data-action="add-notification-target-row">Thêm recipient</button>
      </div>
      <div class="inline-check-row">
        <label class="inline-check"><input type="checkbox" name="schedulerUseSystemDefaults" ${draft.scheduler.useSystemDefaults ? "checked" : ""} /> dùng mặc định hệ thống</label>
        <label class="inline-check"><input type="checkbox" name="activateAfterCreate" ${draft.activateAfterCreate ? "checked" : ""} /> activate sau khi tạo</label>
        <label class="inline-check"><input type="checkbox" name="etlEnabled" ${draft.etlEnabled ? "checked" : ""} /> bật ETL</label>
        <label class="inline-check"><input type="checkbox" name="analysisEnabled" ${draft.analysisEnabled ? "checked" : ""} /> bật AI</label>
      </div>
      <div class="two-column-grid configuration-panel-grid">
        <label>
          <span>Scheduler timezone</span>
          <select name="schedulerTimezone">${renderLabeledOptions(timezoneOptions, draft.scheduler.timezone)}</select>
        </label>
        <label><span>Giờ chạy official daily</span><input type="time" name="schedulerOfficialDailyTime" value="${escapeHtml(draft.scheduler.officialDailyTime)}" /></label>
        <label><span>Lookback hours</span><input type="number" name="schedulerLookbackHours" min="0" value="${draft.scheduler.lookbackHours}" /></label>
        <article class="sub-panel">
          <h4>Rhythm</h4>
          <p class="muted-copy">Dùng panel riêng để notes và recipients không bị kéo thành một form hẹp một cột.</p>
        </article>
      </div>
      <table class="data-table">
        <thead><tr><th>Kênh</th><th>Recipient</th></tr></thead>
        <tbody>
          ${draft.notificationTargets.map((entry) => `
            <tr>
              <td><select name="notificationChannel">${renderOptions(["telegram", "email"], entry.channel)}</select></td>
              <td><input name="notificationValue" value="${escapeHtml(entry.value)}" /></td>
            </tr>
          `).join("")}
        </tbody>
      </table>
      <label>
        <span>Notes</span>
        <textarea name="notes" rows="5">${escapeHtml(draft.notes)}</textarea>
      </label>
    </article>
  `;
}

function renderOptions(values: string[], selectedValue: string) {
  return values.map((value) => `<option value="${escapeHtml(value)}" ${value === selectedValue ? "selected" : ""}>${escapeHtml(value)}</option>`).join("");
}

function renderLabeledOptions(values: Array<{ value: string; label: string }>, selectedValue: string) {
  return values.map((entry) => `
    <option value="${escapeHtml(entry.value)}" ${entry.value === selectedValue ? "selected" : ""}>
      ${escapeHtml(entry.label)}
    </option>
  `).join("");
}

function renderPromptAuditCard(
  configVersion: NonNullable<ConfigurationState["pageDetail"]>["configVersions"][number],
  configLabel: string
) {
  return `
    <h4>${escapeHtml(configVersion.promptVersionLabel)}</h4>
    <div class="meta-row">
      <span class="meta-chip">${escapeHtml(configLabel)}</span>
      <span class="meta-chip">Prompt hash: ${escapeHtml(configVersion.promptHash)}</span>
      <span class="meta-chip">Taxonomy: ${escapeHtml(configVersion.analysisTaxonomyVersionCode)}</span>
      <span class="meta-chip">Tạo lúc: ${escapeHtml(configVersion.createdAt)}</span>
    </div>
    <pre class="code-block">${escapeHtml(configVersion.promptText)}</pre>
    <div class="two-column-grid configuration-panel-grid">
      <article class="sub-panel">
        <h5>Evidence bundle</h5>
        ${configVersion.evidenceBundle.length > 0
          ? `<ul>${configVersion.evidenceBundle.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
          : "<p class='muted-copy'>Version này chưa có evidence bundle từ adapter.</p>"}
      </article>
      <article class="sub-panel">
        <h5>Field explanations</h5>
        ${configVersion.fieldExplanations.length > 0
          ? `<ul>${configVersion.fieldExplanations.map((item) => `<li><strong>${escapeHtml(item.field)}</strong>: ${escapeHtml(item.explanation)}</li>`).join("")}</ul>`
          : "<p class='muted-copy'>Version này chưa có field explanations từ adapter.</p>"}
      </article>
    </div>
  `;
}

function renderPromptWorkspaceConversation(
  conversation: NonNullable<ConfigurationState["promptWorkspaceSamplePreview"]>["conversations"][number]
) {
  const openingSignals = readPromptSignalList(conversation.openingBlockJson);
  const normalizedSignals = readPromptNormalizedSignals(conversation.normalizedTagSignalsJson);

  return `
    <article class="sub-panel">
      <div class="section-headline">
        <div>
          <h5>${escapeHtml(conversation.customerDisplayName || conversation.conversationId)}</h5>
          <p class="muted-copy">First meaningful message: ${escapeHtml(conversation.firstMeaningfulMessageText || "Chưa có")}</p>
        </div>
        <div class="meta-row">
          <span class="meta-chip">Message count: ${conversation.messageCount}</span>
          <span class="meta-chip">Explicit revisit: ${escapeHtml(conversation.explicitRevisitSignal ?? "unknown")}</span>
          <span class="meta-chip">Explicit need: ${escapeHtml(conversation.explicitNeedSignal ?? "unknown")}</span>
        </div>
      </div>
      <div class="two-column-grid configuration-panel-grid">
        <article class="sub-panel">
          <h5>Opening signals</h5>
          ${openingSignals.length > 0
            ? `<ul>${openingSignals.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
            : "<p class='muted-copy'>Không có explicit opening signal trong sample đã chọn.</p>"}
        </article>
        <article class="sub-panel">
          <h5>Normalized tag signals</h5>
          ${normalizedSignals.length > 0
            ? `<ul>${normalizedSignals.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
            : "<p class='muted-copy'>Không có normalized tag signal cho sample này.</p>"}
        </article>
      </div>
      <article class="sub-panel">
        <h5>Transcript sample</h5>
        ${conversation.messages.length > 0
          ? `<ul>${conversation.messages.map((message) => `<li><strong>${escapeHtml(message.senderRole)}</strong>${message.senderName ? ` / ${escapeHtml(message.senderName)}` : ""}: ${escapeHtml(message.redactedText ?? "(không có text)")}</li>`).join("")}</ul>`
          : "<p class='muted-copy'>Sample này chưa trả transcript message.</p>"}
      </article>
    </article>
  `;
}

function renderPromptPreviewArtifactCard(
  artifact: NonNullable<ConfigurationState["promptPreviewComparison"]>["activeArtifact"],
  label: string
) {
  const resultEntries = Object.entries(artifact.result);
  const runtimeEntries = Object.entries(artifact.runtimeMetadata);

  return `
    <h4>${escapeHtml(label)}</h4>
    <div class="meta-row">
      <span class="meta-chip">Prompt version: ${escapeHtml(artifact.promptVersionLabel)}</span>
      <span class="meta-chip">Prompt hash: ${escapeHtml(artifact.promptHash)}</span>
      <span class="meta-chip">Taxonomy: ${escapeHtml(artifact.taxonomyVersionCode)}</span>
      <span class="meta-chip">Tạo lúc: ${escapeHtml(artifact.createdAt)}</span>
    </div>
    <div class="two-column-grid configuration-panel-grid">
      <article class="sub-panel">
        <h5>Structured output</h5>
        ${resultEntries.length > 0
          ? `<ul>${resultEntries.map(([key, value]) => `<li><strong>${escapeHtml(key)}</strong>: ${escapeHtml(renderJsonValue(value))}</li>`).join("")}</ul>`
          : "<p class='muted-copy'>Artifact này chưa có structured output.</p>"}
      </article>
      <article class="sub-panel">
        <h5>Runtime metadata</h5>
        ${runtimeEntries.length > 0
          ? `<ul>${runtimeEntries.map(([key, value]) => `<li><strong>${escapeHtml(key)}</strong>: ${escapeHtml(renderJsonValue(value))}</li>`).join("")}</ul>`
          : "<p class='muted-copy'>Artifact này chưa có runtime metadata.</p>"}
      </article>
    </div>
    <div class="two-column-grid configuration-panel-grid">
      <article class="sub-panel">
        <h5>Evidence bundle</h5>
        ${artifact.evidenceBundle.length > 0
          ? `<ul>${artifact.evidenceBundle.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
          : "<p class='muted-copy'>Artifact này chưa có evidence bundle.</p>"}
      </article>
      <article class="sub-panel">
        <h5>Field explanations</h5>
        ${artifact.fieldExplanations.length > 0
          ? `<ul>${artifact.fieldExplanations.map((item) => `<li><strong>${escapeHtml(item.field)}</strong>: ${escapeHtml(item.explanation)}</li>`).join("")}</ul>`
          : "<p class='muted-copy'>Artifact này chưa có field explanations.</p>"}
        <p class="muted-copy">Supporting messages: ${artifact.supportingMessageIds.length > 0 ? escapeHtml(artifact.supportingMessageIds.join(", ")) : "Chưa có"}</p>
      </article>
    </div>
  `;
}

function renderSummarySpans(
  preview: NonNullable<ConfigurationState["onboardingSamplePreview"]> | NonNullable<ConfigurationState["promptWorkspaceSamplePreview"]>
) {
  return [
    renderSummarySpan("Hội thoại quét", preview.summary.conversationsScanned),
    renderSummarySpan("Thread day tạo được", preview.summary.threadDaysBuilt),
    renderSummarySpan("Tin nhắn đọc", preview.summary.messagesSeen),
    renderSummarySpan("Tin nhắn chọn", preview.summary.messagesSelected)
  ].filter(Boolean).join("");
}

function renderSummarySpan(label: string, value: unknown) {
  if (typeof value !== "number" && typeof value !== "string") {
    return "";
  }
  return `<span class="meta-chip">${escapeHtml(label)}: ${escapeHtml(String(value))}</span>`;
}

function renderSampleConversations(
  conversations: NonNullable<ConfigurationState["onboardingSamplePreview"]>["conversations"]
) {
  if (conversations.length === 0) {
    return "<p class='muted-copy'>Chưa có hội thoại sample nào khớp window hiện tại.</p>";
  }

  return conversations.map((conversation) => `
    <article class="conversation-item">
      <div class="section-headline">
        <strong>Conversation ${escapeHtml(conversation.conversationId)}</strong>
        <span class="meta-chip">${escapeHtml(conversation.customerDisplayName || "Không rõ khách")}</span>
      </div>
      ${conversation.firstMeaningfulMessageText
        ? `<p class="muted-copy">First meaningful message: ${escapeHtml(conversation.firstMeaningfulMessageText)}</p>`
        : ""}
      <div class="two-column-grid configuration-panel-grid">
        <div>
          <h5>Observed tags</h5>
          ${conversation.observedTags.length > 0
            ? `<ul>${conversation.observedTags.map((item) => `<li>${escapeHtml(item.sourceTagText || item.sourceTagId)}</li>`).join("")}</ul>`
            : "<p class='muted-copy'>Không thấy tag quan sát được trong sample này.</p>"}
        </div>
        <div>
          <h5>Opening messages</h5>
          ${conversation.openingMessages.length > 0
            ? `<ul>${conversation.openingMessages.map((item) => `<li><strong>${escapeHtml(item.senderRole)}</strong> / ${escapeHtml(item.messageType)}: ${escapeHtml(item.redactedText)}</li>`).join("")}</ul>`
            : "<p class='muted-copy'>Opening block chưa có message candidate.</p>"}
        </div>
      </div>
      <div class="two-column-grid configuration-panel-grid">
        <div>
          <h5>Normalized tag signals</h5>
          ${conversation.normalizedTagSignals.length > 0
            ? `<ul>${conversation.normalizedTagSignals.map((item) => `<li>${escapeHtml(item.role)} / ${escapeHtml(item.sourceTagText)} -> ${escapeHtml(item.canonicalCode || "noise")} (${escapeHtml(item.mappingSource || "unknown")})</li>`).join("")}</ul>`
            : "<p class='muted-copy'>Chưa có signal canonical nào từ tag mapping hiện tại.</p>"}
        </div>
        <div>
          <h5>Explicit opening signals</h5>
          ${conversation.explicitSignals.length > 0
            ? `<ul>${conversation.explicitSignals.map((item) => `<li>${escapeHtml(item.signalRole)} / ${escapeHtml(item.signalCode)}: ${escapeHtml(item.rawText)}</li>`).join("")}</ul>`
            : "<p class='muted-copy'>Chưa detect explicit signal từ opening rules hiện tại.</p>"}
          <p class="muted-copy">Cut reason: ${escapeHtml(conversation.cutReason || "unknown")}</p>
        </div>
      </div>
    </article>
  `).join("");
}

function readPromptSignalList(value: unknown) {
  if (!value || typeof value !== "object") {
    return [];
  }
  const explicitSignals = (value as Record<string, unknown>).explicit_signals;
  if (!Array.isArray(explicitSignals)) {
    return [];
  }
  return explicitSignals.flatMap((item) => {
    if (!item || typeof item !== "object") {
      return [];
    }
    const signalRole = typeof (item as Record<string, unknown>).signal_role === "string" ? String((item as Record<string, unknown>).signal_role) : "";
    const signalCode = typeof (item as Record<string, unknown>).signal_code === "string" ? String((item as Record<string, unknown>).signal_code) : "";
    const rawText = typeof (item as Record<string, unknown>).raw_text === "string" ? String((item as Record<string, unknown>).raw_text) : "";
    return signalRole || signalCode || rawText ? [`${signalRole} / ${signalCode}: ${rawText}`] : [];
  });
}

function readPromptNormalizedSignals(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [];
  }
  return Object.entries(value as Record<string, unknown>).flatMap(([role, entries]) => {
    if (!Array.isArray(entries)) {
      return [];
    }
    return entries.flatMap((item) => {
      if (!item || typeof item !== "object") {
        return [];
      }
      const sourceTagText = typeof (item as Record<string, unknown>).source_tag_text === "string"
        ? String((item as Record<string, unknown>).source_tag_text)
        : typeof (item as Record<string, unknown>).sourceTagText === "string"
          ? String((item as Record<string, unknown>).sourceTagText)
          : "";
      const canonicalCode = typeof (item as Record<string, unknown>).canonical_code === "string"
        ? String((item as Record<string, unknown>).canonical_code)
        : typeof (item as Record<string, unknown>).canonicalCode === "string"
          ? String((item as Record<string, unknown>).canonicalCode)
          : "";
      return sourceTagText || canonicalCode ? [`${role}: ${sourceTagText} -> ${canonicalCode || "noise"}`] : [];
    });
  });
}

function renderJsonValue(value: unknown) {
  if (typeof value === "string") {
    return value;
  }
  if (value === null || value === undefined) {
    return "null";
  }
  return JSON.stringify(value);
}

function renderTokenStatus(value: string | undefined) {
  switch (value) {
    case "valid":
      return "valid";
    case "invalid":
      return "invalid";
    case "missing":
      return "missing";
    case "not_checked":
    default:
      return "chưa kiểm tra";
  }
}

function renderConnectionStatus(value: string | undefined) {
  switch (value) {
    case "connected":
      return "connected";
    case "page_unavailable":
      return "page unavailable";
    case "token_invalid":
      return "token invalid";
    case "not_checked":
    default:
      return "chưa kiểm tra";
  }
}
