import type { ConfigurationState, OnboardingState } from "../../app/screen-state.ts";
import { escapeHtml } from "../../shared/html.ts";

export function renderConfiguration(configuration: ConfigurationState, onboarding: OnboardingState) {
  const compareLeft = configuration.pageDetail?.configVersions.find((item) => item.id === configuration.promptCompareLeftVersionId) ?? null;
  const compareRight = configuration.pageDetail?.configVersions.find((item) => item.id === configuration.promptCompareRightVersionId) ?? null;
  const onboardingTimezones = dedupeTimezones([
    "Asia/Ho_Chi_Minh",
    "Asia/Saigon",
    "Asia/Bangkok",
    "UTC",
    onboarding.timezone,
    configuration.scheduler.timezone,
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
            <p class="muted-copy">Giữ onboarding đủ nhanh cho lazy operator, nhưng luôn có lane riêng để operator đang vận hành mở page và chỉnh config ngay.</p>
          </div>
          <button data-action="refresh-control-pages">Tải page kết nối</button>
        </div>
        <div class="tab-row">
          <button data-route="?view=configuration&configTab=page-info" class="${configuration.activeTab === "page-info" ? "tab-active" : ""}">Thông tin page</button>
          <button data-route="?view=configuration&configTab=taxonomy" class="${configuration.activeTab === "taxonomy" ? "tab-active" : ""}">Tag taxonomy</button>
          <button data-route="?view=configuration&configTab=opening-rules" class="${configuration.activeTab === "opening-rules" ? "tab-active" : ""}">Opening rules</button>
          <button data-route="?view=configuration&configTab=prompt-profile" class="${configuration.activeTab === "prompt-profile" ? "tab-active" : ""}">Prompt profile</button>
          <button data-route="?view=configuration&configTab=scheduler" class="${configuration.activeTab === "scheduler" ? "tab-active" : ""}">Scheduler và thông báo</button>
        </div>
      </article>
      <section class="configuration-shell">
        <div class="configuration-sidebar">
        <article class="panel-card panel-tight ${configuration.activeTab === "page-info" ? "panel-focus" : ""}">
          <div class="section-headline">
            <div>
              <h3>Onboarding nhanh</h3>
              <p class="muted-copy">Flow tối thiểu là nhập token, chọn page, activate. Sample/test là đường nâng cao, không phải điều kiện activate.</p>
            </div>
          </div>
          <form data-form="onboarding-token">
            <label>
              <span>User access token</span>
              <textarea name="token" rows="3" spellcheck="false" autocomplete="off" placeholder="Dán user access token Pancake ở đây.">${escapeHtml(onboarding.token)}</textarea>
            </label>
            <label>
              <span>Business timezone</span>
              <select name="timezone">${renderOptions(onboardingTimezones, onboarding.timezone)}</select>
            </label>
            <label class="inline-check"><input type="checkbox" name="etlEnabled" ${onboarding.etlEnabled ? "checked" : ""} /> bật ETL</label>
            <label class="inline-check"><input type="checkbox" name="analysisEnabled" ${onboarding.analysisEnabled ? "checked" : ""} /> bật AI</label>
            <button type="submit">Tải page từ token</button>
          </form>
          <form data-form="onboarding-register">
            <label>
              <span>Pancake page</span>
              <select name="pancakePageId">
                <option value="">Chọn page</option>
                ${onboarding.tokenPages.map((page) => `<option value="${escapeHtml(page.pageId)}" ${page.pageId === onboarding.selectedPancakePageId ? "selected" : ""}>${escapeHtml(page.pageName)}</option>`).join("")}
              </select>
            </label>
            <div class="two-column-grid">
              <label><span>Số hội thoại sample</span><input name="sampleConversationLimit" type="number" min="1" max="100" step="1" inputmode="numeric" value="${onboarding.sampleConversationLimit}" /></label>
              <label><span>Số trang tin nhắn / thread</span><input name="sampleMessagePageLimit" type="number" min="1" max="20" step="1" inputmode="numeric" value="${onboarding.sampleMessagePageLimit}" /></label>
            </div>
            <button type="button" data-action="load-onboarding-sample">Lấy sample dữ liệu thật</button>
            <button type="submit">Register và activate mặc định</button>
          </form>
          <div class="banner banner-warning">
            <strong>Lazy operator</strong>
            <p>Tag taxonomy mới mặc định đi vào <code>noise</code>, opening rules là optional, và sample workspace chỉ phục vụ tinh chỉnh non-publish trước khi đưa page vào lịch chạy.</p>
          </div>
        </article>
        <article class="panel-card panel-tight ${configuration.activeTab === "page-info" ? "panel-focus" : ""}">
          <div class="section-headline">
            <div>
              <h3>Page đang vận hành</h3>
              <p class="muted-copy">Normal operator vào thẳng lane này để mở page đã có, tải active config và chỉnh tiếp mà không cần đi lại flow token.</p>
            </div>
          </div>
          <form data-form="configuration-load-page">
            <label>
              <span>Connected page</span>
              <select name="selectedPageId">
                <option value="">Chọn page</option>
                ${configuration.connectedPages.map((page) => `<option value="${escapeHtml(page.id)}" ${page.id === configuration.selectedPageId ? "selected" : ""}>${escapeHtml(page.pageName)}</option>`).join("")}
              </select>
            </label>
            <button type="submit">Tải cấu hình page đã chọn</button>
          </form>
          ${configuration.pageDetail ? `
            <div class="meta-list">
              <span>Page: ${escapeHtml(configuration.pageDetail.pageName)}</span>
              <span>Pancake page id: ${escapeHtml(configuration.pageDetail.pancakePageId)}</span>
              <span>Timezone: ${escapeHtml(configuration.pageDetail.businessTimezone)}</span>
              <span>ETL: ${configuration.pageDetail.etlEnabled ? "bật" : "tắt"}</span>
              <span>AI: ${configuration.pageDetail.analysisEnabled ? "bật" : "tắt"}</span>
            </div>
            <div class="meta-list">
              <span>Active config: ${escapeHtml(configuration.pageDetail.activeConfigVersionId ?? "Chưa activate")}</span>
              <span>Số version: ${configuration.pageDetail.configVersions.length}</span>
              <span>Version mới nhất: ${escapeHtml(configuration.pageDetail.configVersions[0]?.promptVersionLabel ?? "Chưa có")}</span>
            </div>
          ` : "<p class='muted-copy'>Chi tiết page sẽ hiện sau khi chọn page.</p>"}
        </article>
        </div>
        <article class="panel-card configuration-main ${configuration.activeTab === "taxonomy" || configuration.activeTab === "opening-rules" || configuration.activeTab === "prompt-profile" || configuration.activeTab === "scheduler" ? "panel-focus" : ""}">
        <div class="section-headline">
          <h3>Config version owner-clean</h3>
          <div class="button-row">
            <button data-action="use-active-config">Nạp active config</button>
            <button data-action="load-onboarding-sample">Làm mới sample thật</button>
            <button data-action="activate-config-version">Activate config đang chọn</button>
          </div>
        </div>
        <form data-form="configuration-create">
          <label><span>Config version</span>
            <select name="selectedConfigVersionId">
              <option value="">Chọn config version</option>
              ${configuration.pageDetail?.configVersions.map((configVersion) => `<option value="${escapeHtml(configVersion.id)}" ${configVersion.id === configuration.selectedConfigVersionId ? "selected" : ""}>v${configVersion.versionNo}</option>`).join("") ?? ""}
            </select>
          </label>

          <section class="feature-stack">
            <article class="sub-panel">
              <div class="section-headline">
                <div>
                  <h4>Tag taxonomy</h4>
                  <p class="muted-copy">Map tag thô thành signal chuẩn; tag chưa cấu hình mặc định vẫn là noise.</p>
                </div>
                <button type="button" data-action="add-tag-mapping-row">Thêm dòng tag</button>
              </div>
              <table class="data-table">
                <thead><tr><th>Tag thô</th><th>Loại signal</th><th>Giá trị canonical</th><th>Nguồn gốc</th></tr></thead>
                <tbody>
                  ${configuration.tagMappings.map((entry) => `
                    <tr>
                      <td><input name="tagRawTag" value="${escapeHtml(entry.rawTag)}" /></td>
                      <td><select name="tagRole">${renderOptions(["noise", "customer_journey", "need", "outcome", "branch", "staff"], entry.role)}</select></td>
                      <td><input name="tagCanonicalValue" value="${escapeHtml(entry.canonicalValue)}" /></td>
                      <td><select name="tagSource">${renderOptions(["system_default", "operator_override"], entry.source)}</select></td>
                    </tr>
                  `).join("")}
                </tbody>
              </table>
            </article>

            <article class="sub-panel">
              <div class="section-headline">
                <div>
                  <h4>Opening rules</h4>
                  <p class="muted-copy">Optional signal extractor cho opening flow; không phải wizard bắt buộc để activate.</p>
                </div>
                <button type="button" data-action="add-opening-rule-row">Thêm rule</button>
              </div>
              <table class="data-table">
                <thead><tr><th>Button title</th><th>Signal type</th><th>Giá trị canonical</th></tr></thead>
                <tbody>
                  ${configuration.openingRules.map((entry) => `
                    <tr>
                      <td><input name="openingButtonTitle" value="${escapeHtml(entry.buttonTitle)}" /></td>
                      <td><select name="openingSignalType">${renderOptions(["customer_journey", "need", "outcome"], entry.signalType)}</select></td>
                      <td><input name="openingCanonicalValue" value="${escapeHtml(entry.canonicalValue)}" /></td>
                    </tr>
                  `).join("")}
                </tbody>
              </table>
            </article>

            <article class="sub-panel">
              <div class="section-headline">
                <div>
                  <h4>Prompt profile</h4>
                  <p class="muted-copy">Prompt profile là plain text business-facing. Clone/compare phục vụ quản lý version prompt; sample dữ liệu thật được xem ở workspace riêng bên dưới.</p>
                </div>
              </div>
              <div class="two-column-grid">
                <label>
                  <span>Clone từ version cũ</span>
                  <select name="promptCloneSourceVersionId">
                    <option value="">Chọn version</option>
                    ${configuration.pageDetail?.configVersions.map((configVersion) => `<option value="${escapeHtml(configVersion.id)}" ${configVersion.id === configuration.promptCloneSourceVersionId ? "selected" : ""}>v${configVersion.versionNo}</option>`).join("") ?? ""}
                  </select>
                </label>
                <div class="button-row align-end"><button type="button" data-action="clone-prompt-from-version">Clone từ version cũ</button></div>
                <label>
                  <span>Clone từ page khác</span>
                  <select name="promptCloneSourcePageId">
                    <option value="">Chọn page</option>
                    ${configuration.connectedPages.map((page) => `<option value="${escapeHtml(page.id)}" ${page.id === configuration.promptCloneSourcePageId ? "selected" : ""}>${escapeHtml(page.pageName)}</option>`).join("")}
                  </select>
                </label>
                <div class="button-row align-end"><button type="button" data-action="clone-prompt-from-page">Clone từ page khác</button></div>
              </div>
              <label><span>Prompt text</span><textarea name="promptText" rows="8" placeholder="Prompt sẽ lấy từ active config của backend sau khi tải page.">${escapeHtml(configuration.promptText)}</textarea></label>
              <div class="banner banner-warning">
                <strong>Semantics của sample workspace</strong>
                <p>Sample chỉ lấy dữ liệu thật để operator rà tag thô và opening block. Luồng này không đổi publish pointer và không đồng nghĩa publish dashboard.</p>
              </div>
              <div class="two-column-grid">
                <label>
                  <span>So sánh 2 prompt version: bản trái</span>
                  <select name="promptCompareLeftVersionId">
                    <option value="">Chọn version</option>
                    ${configuration.pageDetail?.configVersions.map((configVersion) => `<option value="${escapeHtml(configVersion.id)}" ${configVersion.id === configuration.promptCompareLeftVersionId ? "selected" : ""}>v${configVersion.versionNo}</option>`).join("") ?? ""}
                  </select>
                </label>
                <label>
                  <span>So sánh 2 prompt version: bản phải</span>
                  <select name="promptCompareRightVersionId">
                    <option value="">Chọn version</option>
                    ${configuration.pageDetail?.configVersions.map((configVersion) => `<option value="${escapeHtml(configVersion.id)}" ${configVersion.id === configuration.promptCompareRightVersionId ? "selected" : ""}>v${configVersion.versionNo}</option>`).join("") ?? ""}
                  </select>
                </label>
              </div>
              ${compareLeft || compareRight ? `
                <div class="two-column-grid">
                  <article class="sub-panel">
                    ${compareLeft ? renderPromptAuditCard(compareLeft, `Config v${compareLeft.versionNo}`) : "<h4>Chưa chọn bản trái</h4><p class='muted-copy'>Chọn version bên trái để xem nội dung prompt.</p>"}
                  </article>
                  <article class="sub-panel">
                    ${compareRight ? renderPromptAuditCard(compareRight, `Config v${compareRight.versionNo}`) : "<h4>Chưa chọn bản phải</h4><p class='muted-copy'>Chọn version bên phải để so sánh.</p>"}
                  </article>
                </div>
              ` : "<p class='muted-copy'>So sánh 2 prompt version sẽ hiện ở đây.</p>"}
            </article>

            <article class="sub-panel">
              <div class="section-headline">
                <div>
                  <h4>Scheduler và thông báo</h4>
                  <p class="muted-copy">Scheduler default toàn hệ thống là 00:00 với lookback 2 giờ. Có thể override ở mức page khi cần.</p>
                </div>
                <button type="button" data-action="add-notification-target-row">Thêm recipient</button>
              </div>
              <div class="two-column-grid">
                <label class="inline-check"><input type="checkbox" name="schedulerUseSystemDefaults" ${configuration.scheduler.useSystemDefaults ? "checked" : ""} /> Dùng mặc định hệ thống</label>
                <label>
                  <span>Scheduler timezone</span>
                  <input name="schedulerTimezone" list="scheduler-timezone-options" value="${escapeHtml(configuration.scheduler.timezone)}" placeholder="Asia/Ho_Chi_Minh" />
                  <datalist id="scheduler-timezone-options">${renderDatalistOptions(onboardingTimezones)}</datalist>
                </label>
                <label><span>Giờ chạy official daily</span><input type="time" name="schedulerOfficialDailyTime" value="${escapeHtml(configuration.scheduler.officialDailyTime)}" /></label>
                <label><span>Lookback hours</span><input type="number" name="schedulerLookbackHours" min="0" value="${configuration.scheduler.lookbackHours}" /></label>
              </div>
              <table class="data-table">
                <thead><tr><th>Kênh</th><th>Recipient</th></tr></thead>
                <tbody>
                  ${configuration.notificationTargets.map((entry) => `
                    <tr>
                      <td><select name="notificationChannel">${renderOptions(["telegram", "email"], entry.channel)}</select></td>
                      <td><input name="notificationValue" value="${escapeHtml(entry.value)}" /></td>
                    </tr>
                  `).join("")}
                </tbody>
              </table>
            </article>
          </section>

          <label><span>Notes</span><textarea name="notes" rows="4">${escapeHtml(configuration.notes)}</textarea></label>
          <div class="button-row">
            <label class="inline-check"><input type="checkbox" name="activateAfterCreate" ${configuration.activateAfterCreate ? "checked" : ""} /> activate sau khi tạo</label>
            <label class="inline-check"><input type="checkbox" name="etlEnabled" ${configuration.etlEnabled ? "checked" : ""} /> ETL enable</label>
            <label class="inline-check"><input type="checkbox" name="analysisEnabled" ${configuration.analysisEnabled ? "checked" : ""} /> AI enable</label>
            <button type="submit">Tạo config version</button>
          </div>
        </form>
        ${configuration.onboardingSamplePreview ? `
          <div class="two-column-grid">
            <article class="sub-panel">
              <h4>Sample dữ liệu thật</h4>
              <div class="meta-list">
                <span>Page: ${escapeHtml(configuration.onboardingSamplePreview.pageName)}</span>
                <span>Pancake page id: ${escapeHtml(configuration.onboardingSamplePreview.pageId)}</span>
                <span>Ngày: ${escapeHtml(configuration.onboardingSamplePreview.targetDate)}</span>
                <span>Timezone: ${escapeHtml(configuration.onboardingSamplePreview.businessTimezone)}</span>
              </div>
              <div class="meta-list">
                <span>Window: ${escapeHtml(configuration.onboardingSamplePreview.windowStartAt)} -> ${escapeHtml(configuration.onboardingSamplePreview.windowEndExclusiveAt)}</span>
                ${renderSummarySpans(configuration.onboardingSamplePreview)}
              </div>
            </article>
            <article class="sub-panel">
              <h4>Tag thô từ page</h4>
              ${configuration.onboardingSamplePreview.pageTags.length > 0
                ? `<ul>${configuration.onboardingSamplePreview.pageTags.map((item) => `<li>${escapeHtml(item.text)}${item.isDeactive ? " (đã tắt)" : ""}</li>`).join("")}</ul>`
                : "<p class='muted-copy'>Sample chưa thấy tag nào từ page.</p>"}
            </article>
          </div>
          <article class="sub-panel">
            <h4>Hội thoại sample</h4>
            ${renderSampleConversations(configuration.onboardingSamplePreview.conversations)}
          </article>
        ` : "<p class='muted-copy'>Workspace sample dữ liệu thật sẽ hiện ở đây sau khi nhập token, chọn page và bấm lấy sample.</p>"}
      </article>
      </section>
    </section>
  `;
}

function renderOptions(values: string[], selectedValue: string) {
  return values.map((value) => `<option value="${escapeHtml(value)}" ${value === selectedValue ? "selected" : ""}>${escapeHtml(value)}</option>`).join("");
}

function renderDatalistOptions(values: string[]) {
  return values.map((value) => `<option value="${escapeHtml(value)}"></option>`).join("");
}

function dedupeTimezones(values: Array<string | null>) {
  return [...new Set(values.map((value) => value?.trim() ?? "").filter(Boolean))];
}

function renderPromptAuditCard(
  configVersion: NonNullable<ConfigurationState["pageDetail"]>["configVersions"][number],
  configLabel: string
) {
  return `
    <h4>${escapeHtml(configVersion.promptVersionLabel)}</h4>
    <div class="meta-list">
      <span>${escapeHtml(configLabel)}</span>
      <span>Prompt hash: ${escapeHtml(configVersion.promptHash)}</span>
      <span>Taxonomy: ${escapeHtml(configVersion.analysisTaxonomyVersionCode)}</span>
      <span>Tạo lúc: ${escapeHtml(configVersion.createdAt)}</span>
    </div>
    <pre class="code-block">${escapeHtml(configVersion.promptText)}</pre>
    <div class="two-column-grid">
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

function renderSummarySpans(preview: NonNullable<ConfigurationState["onboardingSamplePreview"]>) {
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
  return `<span>${escapeHtml(label)}: ${escapeHtml(String(value))}</span>`;
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
      <div class="two-column-grid">
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
      <div class="two-column-grid">
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
