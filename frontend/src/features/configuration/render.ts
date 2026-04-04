import type { ConfigurationState, OnboardingState } from "../../app/screen-state.ts";
import { escapeHtml } from "../../shared/html.ts";
import { prettyJson } from "../../shared/format.ts";

export function renderConfiguration(configuration: ConfigurationState, onboarding: OnboardingState) {
  const compareLeft = configuration.pageDetail?.configVersions.find((item) => item.id === configuration.promptCompareLeftVersionId) ?? null;
  const compareRight = configuration.pageDetail?.configVersions.find((item) => item.id === configuration.promptCompareRightVersionId) ?? null;

  return `
    <section class="feature-stack">
      <article class="panel-card">
        <div class="section-headline">
          <div>
            <p class="eyebrow">HTTP-first control-plane</p>
            <h2>Cấu hình</h2>
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
      <section class="two-column-grid">
        <article class="panel-card ${configuration.activeTab === "page-info" ? "panel-focus" : ""}">
          <div class="section-headline">
            <div>
              <h3>Onboarding: list-from-token -> register</h3>
              <p class="muted-copy">Flow tối thiểu là nhập token, chọn page, activate. Sample/test là đường nâng cao, không phải điều kiện activate.</p>
            </div>
          </div>
          <form data-form="onboarding-token">
            <label><span>User access token</span><input name="token" type="password" value="${escapeHtml(onboarding.token)}" /></label>
            <label><span>Timezone</span><input name="timezone" value="${escapeHtml(onboarding.timezone)}" /></label>
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
            <button type="submit">Register và activate mặc định</button>
          </form>
          <div class="banner banner-warning">
            <strong>Lazy operator</strong>
            <p>Tag taxonomy mới mặc định đi vào <code>noise</code>, opening rules là optional, prompt preview là flow tinh chỉnh riêng và không đổi publish pointer.</p>
          </div>
        </article>
        <article class="panel-card ${configuration.activeTab === "taxonomy" || configuration.activeTab === "opening-rules" ? "panel-focus" : ""}">
          <h3>Page context và config ownership</h3>
          <form data-form="configuration-load-page">
            <label>
              <span>Connected page</span>
              <select name="selectedPageId">
                <option value="">Chọn page</option>
                ${configuration.connectedPages.map((page) => `<option value="${escapeHtml(page.id)}" ${page.id === configuration.selectedPageId ? "selected" : ""}>${escapeHtml(page.pageName)}</option>`).join("")}
              </select>
            </label>
            <button type="submit">Tải chi tiết page</button>
          </form>
          ${configuration.pageDetail ? `
            <div class="meta-list">
              <span>Page: ${escapeHtml(configuration.pageDetail.pageName)}</span>
              <span>Pancake page id: ${escapeHtml(configuration.pageDetail.pancakePageId)}</span>
              <span>Timezone: ${escapeHtml(configuration.pageDetail.businessTimezone)}</span>
              <span>ETL: ${configuration.pageDetail.etlEnabled ? "bật" : "tắt"}</span>
              <span>AI: ${configuration.pageDetail.analysisEnabled ? "bật" : "tắt"}</span>
            </div>
            <pre class="code-block">${escapeHtml(prettyJson(configuration.pageDetail))}</pre>
          ` : "<p class='muted-copy'>Chi tiết page sẽ hiện sau khi chọn page.</p>"}
        </article>
      </section>
      <article class="panel-card ${configuration.activeTab === "taxonomy" || configuration.activeTab === "opening-rules" || configuration.activeTab === "prompt-profile" || configuration.activeTab === "scheduler" ? "panel-focus" : ""}">
        <div class="section-headline">
          <h3>Config version owner-clean</h3>
          <div class="button-row">
            <button data-action="use-active-config">Nạp active config</button>
            <button data-action="load-prompt-preview">Chạy thử sample</button>
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
                  <p class="muted-copy">Prompt profile là plain text business-facing. Clone/compare/evidence/sample preview phục vụ tinh chỉnh inference, không thay thế flow manual run/publish.</p>
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
              <label><span>Prompt text</span><textarea name="promptText" rows="8">${escapeHtml(configuration.promptText)}</textarea></label>
              <div class="banner banner-warning">
                <strong>Semantics của Chạy thử</strong>
                <p>Chạy thử chỉ tạo preview sample/inference trong workspace cấu hình, không đổi publish pointer và không đồng nghĩa publish dashboard.</p>
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
                    <h4>${compareLeft ? `v${compareLeft.versionNo}` : "Chưa chọn bản trái"}</h4>
                    ${compareLeft ? `<p class="muted-copy">${escapeHtml(compareLeft.analysisTaxonomyVersionCode)} • ${escapeHtml(compareLeft.createdAt)}</p><pre class="code-block">${escapeHtml(compareLeft.promptText)}</pre>` : "<p class='muted-copy'>Chọn version bên trái để xem nội dung prompt.</p>"}
                  </article>
                  <article class="sub-panel">
                    <h4>${compareRight ? `v${compareRight.versionNo}` : "Chưa chọn bản phải"}</h4>
                    ${compareRight ? `<p class="muted-copy">${escapeHtml(compareRight.analysisTaxonomyVersionCode)} • ${escapeHtml(compareRight.createdAt)}</p><pre class="code-block">${escapeHtml(compareRight.promptText)}</pre>` : "<p class='muted-copy'>Chọn version bên phải để so sánh.</p>"}
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
        ${configuration.promptPreview ? `
          <div class="two-column-grid">
            <article class="sub-panel">
              <h4>Before / After</h4>
              <p><strong>${escapeHtml(configuration.promptPreview.activeVersionLabel)}</strong>: ${escapeHtml(configuration.promptPreview.beforeSummary)}</p>
              <p><strong>${escapeHtml(configuration.promptPreview.draftVersionLabel)}</strong>: ${escapeHtml(configuration.promptPreview.afterSummary)}</p>
            </article>
            <article class="sub-panel">
              <h4>Structured output sample</h4>
              <ul>${configuration.promptPreview.structuredOutput.map((item) => `<li><strong>${escapeHtml(item.field)}</strong>: ${escapeHtml(item.value)}</li>`).join("")}</ul>
            </article>
          </div>
          <div class="two-column-grid">
            <article class="sub-panel">
              <h4>Evidence bundle</h4>
              <ul>${configuration.promptPreview.evidence.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
            </article>
            <article class="sub-panel">
              <h4>Field explanations</h4>
              <ul>${configuration.promptPreview.explanations.map((item) => `<li><strong>${escapeHtml(item.field)}</strong>: ${escapeHtml(item.explanation)}</li>`).join("")}</ul>
            </article>
          </div>
        ` : "<p class='muted-copy'>Prompt preview sample, evidence bundle và field explanations sẽ hiện tại đây.</p>"}
      </article>
    </section>
  `;
}

function renderOptions(values: string[], selectedValue: string) {
  return values.map((value) => `<option value="${escapeHtml(value)}" ${value === selectedValue ? "selected" : ""}>${escapeHtml(value)}</option>`).join("");
}
