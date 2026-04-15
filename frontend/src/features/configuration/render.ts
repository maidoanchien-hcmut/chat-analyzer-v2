import type { ConfigurationState } from "../../app/screen-state.ts";
import { escapeHtml } from "../../shared/html.ts";
import { buildConfigurationDraftFingerprint } from "./state.ts";
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
  const workspaceSummary = deriveWorkspaceSummary(configuration);

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
            <button data-action="use-selected-config-version" ${configuration.pageDetail && draft.selectedConfigVersionId ? "" : "disabled"}>Nạp version đã chọn</button>
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
          ${renderWorkspaceSnapshot(configuration, workspaceSummary)}
          ${renderOnboardingRail(configuration, timezoneOptions)}
          ${renderConnectedPageRail(configuration)}
          <article class="panel-card panel-tight">
            <h3>Lane hiện tại</h3>
            <p class="muted-copy">${describeActiveTab(configuration.activeTab)}</p>
            <div class="meta-row">
              <span class="meta-chip">Prompt: ${draft.promptText.trim() ? "đã có draft" : "trống"}</span>
              <span class="meta-chip">Tag rows: ${draft.tagMappings.length}</span>
              <span class="meta-chip">Opening rows: ${draft.openingRules.length}</span>
            </div>
          </article>
        </aside>
        <div class="configuration-main-stack">
          ${renderActivePanel(configuration, timezoneOptions, compareLeft, compareRight, selectedPromptSampleConversation, workspaceSummary)}
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
  selectedPromptSampleConversation: NonNullable<ConfigurationState["promptWorkspaceSamplePreview"]>["conversations"][number] | null,
  workspaceSummary: ReturnType<typeof deriveWorkspaceSummary>
) {
  const draft = configuration.workspace;
  switch (configuration.activeTab) {
    case "page-info":
      return `
        ${renderPageInfoPanel(configuration, workspaceSummary)}
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
      return renderConfigVersionForm(configuration, workspaceSummary, renderTaxonomyPanel(configuration));
    case "opening-rules":
      return renderConfigVersionForm(configuration, workspaceSummary, renderOpeningRulesPanel(draft));
    case "prompt-profile":
      return renderConfigVersionForm(
        configuration,
        workspaceSummary,
        renderPromptProfilePanel(configuration, compareLeft, compareRight, selectedPromptSampleConversation)
      );
    case "scheduler":
      return renderConfigVersionForm(configuration, workspaceSummary, renderSchedulerPanel(draft, timezoneOptions));
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

function renderWorkspaceSnapshot(
  configuration: ConfigurationState,
  workspaceSummary: ReturnType<typeof deriveWorkspaceSummary>
) {
  return `
    <article class="panel-card panel-tight">
      <h3>Workspace hiện tại</h3>
      <div class="meta-list">
        <span class="meta-chip">Chế độ: ${escapeHtml(workspaceSummary.modeLabel)}</span>
        <span class="meta-chip">Binding: ${escapeHtml(workspaceSummary.bindingLabel)}</span>
        <span class="meta-chip">Draft: ${escapeHtml(workspaceSummary.draftStatus)}</span>
        <span class="meta-chip">Nguồn draft: ${escapeHtml(workspaceSummary.sourceLabel)}</span>
        <span class="meta-chip">Sample scope: ${escapeHtml(workspaceSummary.sampleScopeLabel)}</span>
      </div>
      ${configuration.onboardingSamplePreview
        ? `
          <div class="meta-row">
            <span class="meta-chip">Sample onboarding: ${escapeHtml(configuration.onboardingSamplePreview.pageName)}</span>
            <span class="meta-chip">Ngày: ${escapeHtml(configuration.onboardingSamplePreview.targetDate)}</span>
          </div>
        `
        : ""}
    </article>
  `;
}

function renderOnboardingRail(
  configuration: ConfigurationState,
  timezoneOptions: Array<{ value: string; label: string }>
) {
  const draft = configuration.workspace;
  return `
    <article class="panel-card panel-tight">
      <h3>Lane 1: Onboarding page mới</h3>
      <p class="muted-copy">Token -> tải page -> sample (tuỳ chọn) -> register. Mọi chỉnh sửa vẫn đổ vào cùng một workspace draft.</p>
      <form data-form="onboarding-token">
        <label>
          <span>User access token</span>
          <textarea name="token" rows="4" spellcheck="false" autocomplete="off" placeholder="Dán user access token Pancake ở đây.">${escapeHtml(draft.token)}</textarea>
        </label>
        ${renderTimezoneSelect("businessTimezone", draft.businessTimezone, timezoneOptions)}
        <div class="inline-check-row">
          <label class="inline-check"><input type="checkbox" name="etlEnabled" ${draft.etlEnabled ? "checked" : ""} /> bật ETL</label>
          <label class="inline-check"><input type="checkbox" name="analysisEnabled" ${draft.analysisEnabled ? "checked" : ""} /> bật AI</label>
        </div>
        <button type="submit">Tải page từ token</button>
      </form>
      <form data-form="onboarding-register">
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
        <div class="two-column-grid compact-grid">
          <label><span>Số hội thoại sample</span><input name="sampleConversationLimit" type="number" min="1" max="100" step="1" value="${draft.sampleConversationLimit}" /></label>
          <article class="sub-panel">
            <h4>Phạm vi tin nhắn</h4>
            <p class="muted-copy">Sample sẽ lấy toàn bộ tin nhắn trong ngày hiện tại từ 0h00 đến thời điểm hiện tại cho số hội thoại đã chọn.</p>
          </article>
        </div>
        <div class="button-row">
          <button type="button" data-action="load-onboarding-sample" ${draft.selectedPancakePageId ? "" : "disabled"}>Lấy sample dữ liệu thật</button>
          <button type="submit" ${draft.selectedPancakePageId ? "" : "disabled"}>Register và activate mặc định</button>
        </div>
      </form>
    </article>
  `;
}

function renderConnectedPageRail(configuration: ConfigurationState) {
  const draft = configuration.workspace;
  return `
    <article class="panel-card panel-tight">
      <h3>Lane 2: Page đang vận hành</h3>
      <p class="muted-copy">Nạp page đã connect để tiếp tục chỉnh version, clone prompt, lấy sample prompt workspace hoặc activate version đã lưu.</p>
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
        <button type="submit" ${draft.selectedPageId ? "" : "disabled"}>Tải cấu hình page đã chọn</button>
      </form>
      ${renderPageSummary(configuration.pageDetail)}
    </article>
  `;
}

function renderWorkspaceModeBanner(
  configuration: ConfigurationState,
  workspaceSummary: ReturnType<typeof deriveWorkspaceSummary>
) {
  if (configuration.onboardingSampleSeedSummary) {
    return `
      <div class="banner banner-warning">
        <strong>Draft đã được seed từ sample onboarding</strong>
        <p>
          Tag áp dụng: ${configuration.onboardingSampleSeedSummary.tagSuggestionsApplied}.
          Opening áp dụng: ${configuration.onboardingSampleSeedSummary.openingSuggestionsApplied}.
          Override giữ nguyên: ${configuration.onboardingSampleSeedSummary.tagOverridesPreserved + configuration.onboardingSampleSeedSummary.openingOverridesPreserved}.
          Trạng thái hiện tại: ${escapeHtml(workspaceSummary.draftStatus)}.
        </p>
      </div>
    `;
  }

  return `
    <div class="banner status-info">
      <strong>${escapeHtml(workspaceSummary.modeLabel)}</strong>
      <p>${escapeHtml(workspaceSummary.sourceLabel)}. ${escapeHtml(workspaceSummary.draftStatus)}.</p>
    </div>
  `;
}

function deriveWorkspaceSummary(configuration: ConfigurationState) {
  const draft = configuration.workspace;
  const currentFingerprint = buildConfigurationDraftFingerprint({
    promptText: draft.promptText,
    tagMappings: draft.tagMappings,
    openingRules: draft.openingRules,
    scheduler: draft.scheduler,
    notificationTargets: draft.notificationTargets,
    notes: draft.notes,
    activate: draft.activateAfterCreate,
    etlEnabled: draft.etlEnabled,
    analysisEnabled: draft.analysisEnabled
  });
  const dirty = configuration.draftBaselineFingerprint !== null
    && configuration.draftBaselineFingerprint !== currentFingerprint;
  const hasBoundPage = draft.selectedPageId.trim().length > 0;
  const pageLabel = configuration.pageDetail?.pageName
    ?? configuration.connectedPages.find((page) => page.id === draft.selectedPageId)?.pageName
    ?? configuration.onboardingSamplePreview?.pageName
    ?? draft.tokenPages.find((page) => page.pageId === draft.selectedPancakePageId)?.pageName
    ?? "Chưa chọn page";

  return {
    modeLabel: hasBoundPage ? "Chỉnh page đang có binding" : "Onboarding / draft chưa bind",
    bindingLabel: hasBoundPage ? pageLabel : (draft.selectedPancakePageId ? `${pageLabel} (chưa register)` : "Chưa gắn page"),
    sourceLabel: renderDraftSource(configuration.draftSource),
    draftStatus: renderDraftStatus(configuration, dirty),
    sampleScopeLabel: `${draft.sampleConversationLimit} hội thoại / toàn bộ tin nhắn trong ngày`
  };
}

function renderDraftSource(source: ConfigurationState["draftSource"]) {
  switch (source) {
    case "onboarding_sample":
      return "Draft đang mang seed từ sample onboarding";
    case "connected_page_active_config":
      return "Draft được nạp từ active config";
    case "connected_page_saved_version":
      return "Draft được nạp từ một config version đã lưu";
    case "blank":
    default:
      return "Draft mới, chưa có source persisted";
  }
}

function renderDraftStatus(configuration: ConfigurationState, dirty: boolean) {
  const draft = configuration.workspace;
  if (!draft.selectedPageId) {
    if (configuration.onboardingSamplePreview) {
      return "Draft onboarding đã có sample nhưng chưa lưu thành config version";
    }
    if (draft.selectedPancakePageId) {
      return "Đã chọn page Pancake nhưng chưa register";
    }
    return "Draft trống, chờ chọn page hoặc tải config";
  }

  if (dirty) {
    return "Có thay đổi chưa lưu so với baseline đã nạp";
  }

  if (configuration.draftSource === "connected_page_active_config") {
    return "Draft đang khớp active config";
  }

  if (configuration.draftSource === "connected_page_saved_version") {
    return "Draft đang khớp config version đã lưu";
  }

  return "Draft đã bind page nhưng chưa có baseline persisted";
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
  workspaceSummary: ReturnType<typeof deriveWorkspaceSummary>
) {
  return `
    <article class="panel-card">
      <div class="section-headline">
        <div>
          <h3>Thông tin page</h3>
          <p class="muted-copy">Một workspace draft phục vụ cả onboarding page mới lẫn chỉnh page đang vận hành. Rail bên trái là nơi chọn lane; panel này chỉ giải thích trạng thái hiện tại.</p>
        </div>
      </div>
      ${renderWorkspaceModeBanner(configuration, workspaceSummary)}
      <section class="status-grid">
        <article class="sub-panel">
          <h4>Lazy operator</h4>
          <p class="muted-copy">Dùng rail Lane 1, tải page từ token rồi register ngay. Draft sẽ dùng default an toàn và không cần sample.</p>
        </article>
        <article class="sub-panel">
          <h4>Non-lazy operator</h4>
          <p class="muted-copy">Tải sample trước, seed tag/opening/prompt/scheduler vào cùng draft, rồi chuyển tab để chỉnh tiếp trước khi lưu version.</p>
        </article>
        <article class="sub-panel">
          <h4>Page đang vận hành</h4>
          <p class="muted-copy">Dùng rail Lane 2 để nạp page hiện hữu, sau đó có thể nạp active config hoặc một version đã lưu vào cùng workspace draft.</p>
        </article>
        <article class="sub-panel">
          <h4>Trạng thái workspace</h4>
          <div class="meta-list">
            <span class="meta-chip">Binding: ${escapeHtml(workspaceSummary.bindingLabel)}</span>
            <span class="meta-chip">Draft: ${escapeHtml(workspaceSummary.draftStatus)}</span>
            <span class="meta-chip">Sample scope: ${escapeHtml(workspaceSummary.sampleScopeLabel)}</span>
          </div>
        </article>
      </section>
    </article>
  `;
}

function renderConfigVersionForm(
  configuration: ConfigurationState,
  workspaceSummary: ReturnType<typeof deriveWorkspaceSummary>,
  activePanelHtml: string
) {
  const draft = configuration.workspace;
  const selectedConfigVersion = configuration.pageDetail?.configVersions.find((item) => item.id === draft.selectedConfigVersionId) ?? null;
  return `
    <form data-form="configuration-create" class="feature-stack">
      <article class="panel-card">
        <div class="section-headline">
          <div>
            <h3>Configuration draft</h3>
            <p class="muted-copy">Chỉ panel hiện tại được render, tránh whole-form rerender khi operator đang gõ draft nhạy cảm. Draft này có thể đến từ sample onboarding, active config, hoặc một version đã lưu.</p>
          </div>
          <div class="button-row">
            <button type="button" data-action="use-selected-config-version" ${selectedConfigVersion ? "" : "disabled"}>Nạp version đã chọn</button>
            <button type="button" data-action="activate-config-version" ${draft.selectedConfigVersionId ? "" : "disabled"}>Activate config đang chọn</button>
            <button type="submit" ${draft.selectedPageId || draft.selectedPancakePageId ? "" : "disabled"}>
              ${draft.selectedPageId ? "Tạo config version" : "Thêm page vào vận hành với draft"}
            </button>
          </div>
        </div>
        ${!draft.selectedPageId
          ? `
            <div class="banner ${draft.selectedPancakePageId ? "status-info" : "banner-warning"}">
              <strong>${draft.selectedPancakePageId ? "Draft onboarding sẵn sàng để thêm page" : "Draft này chưa gắn page"}</strong>
              <p>${draft.selectedPancakePageId
                ? "Bạn có thể tiếp tục chỉnh taxonomy/opening/prompt/scheduler rồi bấm nút lưu để thêm page vào vận hành bằng chính draft hiện tại."
                : "Hãy chọn page Pancake ở rail onboarding hoặc tải một connected page trước khi lưu config."}</p>
            </div>
          `
          : ""}
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
              <span class="meta-chip">Draft: ${escapeHtml(workspaceSummary.draftStatus)}</span>
              <span class="meta-chip">Nguồn draft: ${escapeHtml(workspaceSummary.sourceLabel)}</span>
              <span class="meta-chip">Version đang chọn: ${escapeHtml(selectedConfigVersion ? `v${selectedConfigVersion.versionNo}` : "Chưa chọn")}</span>
            </div>
          </article>
        </div>
      </article>
      ${activePanelHtml}
    </form>
  `;
}

function renderTaxonomyPanel(configuration: ConfigurationState) {
  const draft = configuration.workspace;
  const inventory = buildTagInventory(configuration);
  return `
    <article class="panel-card">
      <div class="section-headline">
        <div>
          <h3>Tag taxonomy</h3>
          <p class="muted-copy">Danh sách này ưu tiên source tag identity thật từ Pancake/sample. Trạng thái được suy ra tự động; operator không chọn source bằng dropdown nữa.</p>
        </div>
        <button type="button" data-action="add-tag-mapping-row">Thêm dòng tag</button>
      </div>
      <div class="meta-row">
        <span class="meta-chip">Tag inventory: ${inventory.entries.length}</span>
        <span class="meta-chip">Đã cấu hình: ${inventory.entries.filter((entry) => entry.source === "operator_override").length}</span>
        <span class="meta-chip">Mặc định hệ thống: ${inventory.entries.filter((entry) => entry.source === "system_default").length}</span>
        <span class="meta-chip">Tag đã tắt: ${inventory.deactivatedTags.length}</span>
      </div>
      <table class="data-table">
        <thead><tr><th>Tag thô</th><th>Loại signal</th><th>Giá trị canonical</th><th>Trạng thái</th></tr></thead>
        <tbody>
          ${inventory.entries.map((entry, index) => `
            <tr data-tag-index="${index}">
              <td>
                <div class="field-stack">
                  <input type="hidden" name="tagSourceTagId" value="${escapeHtml(entry.sourceTagId)}" />
                  <input name="tagRawTag" value="${escapeHtml(entry.rawTag)}" />
                  <small class="muted-copy">source id: ${escapeHtml(entry.sourceTagId || "manual")}</small>
                </div>
              </td>
              <td><select name="tagRole">${renderOptions(["noise", "customer_journey", "need", "outcome", "branch", "staff"], entry.role)}</select></td>
              <td><input name="tagCanonicalValue" value="${escapeHtml(entry.canonicalValue)}" /></td>
              <td>
                <input type="hidden" name="tagSource" value="${escapeHtml(entry.source)}" />
                <div class="field-stack">
                  <span class="meta-chip">${escapeHtml(renderTagSourceStatus(entry))}</span>
                  <div class="button-row">
                    ${entry.source === "system_default"
                      ? `<button type="button" data-action="confirm-tag-mapping">Xác nhận bởi operator</button>`
                      : `<button type="button" data-action="reset-tag-mapping-source">Trả về mặc định</button>`}
                  </div>
                </div>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
      ${inventory.deactivatedTags.length > 0
        ? `
          <article class="sub-panel">
            <h4>Tag đã tắt ở Pancake</h4>
            <ul>
              ${inventory.deactivatedTags.map((entry) => `<li>${escapeHtml(entry.text)}${entry.pancakeTagId ? ` (${escapeHtml(entry.pancakeTagId)})` : ""}</li>`).join("")}
            </ul>
          </article>
        `
        : ""}
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
        ${renderTimezoneSelect("schedulerTimezone", draft.scheduler.timezone, timezoneOptions)}
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

function renderTimezoneSelect(name: string, value: string, options: Array<{ value: string; label: string }>) {
  return `
    <label>
      <span>${name === "businessTimezone" ? "Business timezone" : "Scheduler timezone"}</span>
      <select name="${escapeHtml(name)}">${renderLabeledOptions(options, value)}</select>
    </label>
  `;
}

function buildTagInventory(configuration: ConfigurationState) {
  const entries = configuration.workspace.tagMappings.map((entry) => ({ ...entry }));
  const seen = new Set(entries.map((entry) => entry.sourceTagId.trim() || normalizeTagKey(entry.rawTag)));

  const samplePreview = configuration.onboardingSamplePreview;
  if (samplePreview) {
    for (const pageTag of samplePreview.pageTags) {
      const identity = pageTag.pancakeTagId.trim() || normalizeTagKey(pageTag.text);
      if (!pageTag.isDeactive && identity && !seen.has(identity)) {
        entries.push({
          sourceTagId: pageTag.pancakeTagId,
          rawTag: pageTag.text,
          role: "noise",
          canonicalValue: "",
          source: "system_default"
        });
        seen.add(identity);
      }
    }
  }

  return {
    entries,
    deactivatedTags: samplePreview?.pageTags.filter((item) => item.isDeactive) ?? []
  };
}

function renderTagSourceStatus(entry: ConfigurationState["workspace"]["tagMappings"][number]) {
  if (entry.source === "operator_override") {
    if (entry.role === "noise" && !entry.canonicalValue.trim()) {
      return "Operator đã xác nhận noise";
    }
    return "Đã cấu hình bởi operator";
  }
  if (entry.role === "noise" && !entry.canonicalValue.trim()) {
    return "Mặc định hệ thống -> noise";
  }
  return "Mặc định hệ thống";
}

function normalizeTagKey(value: string) {
  return value.trim().toLocaleLowerCase();
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
