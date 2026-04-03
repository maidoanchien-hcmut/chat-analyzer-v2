const rootElement = document.querySelector<HTMLDivElement>("#app");

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
type ProcessingMode = "etl_only" | "etl_and_ai";
type ViewMode = "setup" | "running";
type EditorTab = "tags" | "opening" | "prompt";
type CustomRunMode = "full_day" | "custom_range";

type PancakePage = {
  pageId: string;
  pageName: string;
};

type ConnectedPage = {
  id: string;
  pancakePageId: string;
  pageName: string;
  businessTimezone: string;
  autoScraperEnabled: boolean;
  autoAiAnalysisEnabled: boolean;
  activePromptVersionId: string | null;
  activeTagMappingJson: JsonValue | null;
  activeOpeningRulesJson: JsonValue | null;
  onboardingStateJson: JsonValue | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

type PromptVersion = {
  id: string;
  connectedPageId: string;
  versionNo: number;
  promptText: string;
  notes: string | null;
  createdAt: string;
};

type PromptListResponse = {
  connectedPageId: string;
  activePromptVersionId: string | null;
  prompts: PromptVersion[];
};

type TagCandidate = {
  text: string;
  count: number;
};

type OpeningCandidateWindow = {
  signature: string[];
  count: number;
  exampleConversationIds: string[];
};

type SetupSample = {
  pageId: string;
  pageName: string;
  targetDate: string;
  businessTimezone: string;
  processingMode: ProcessingMode;
  initialConversationLimit: number;
  windowStartAt: string;
  windowEndExclusiveAt: string;
  metrics: Record<string, unknown>;
  tagCandidates: TagCandidate[];
  openingCandidates: {
    topOpeningCandidateWindows: OpeningCandidateWindow[];
    unmatchedOpeningTexts: Array<{ text: string; count: number }>;
    matchedOpeningRules: Array<{ name: string; count: number }>;
  };
};

type RunSummary = {
  id: string;
  runMode: string;
  processingMode: string;
  status: string;
  targetDate: string;
  startedAt: string;
  finishedAt: string | null;
  snapshotVersion: number;
  isPublished: boolean;
};

type RunDetail = {
  run: {
    id: string;
    runMode: string;
    processingMode: string;
    status: string;
    targetDate: string;
    requestedWindowStartAt: string | null;
    requestedWindowEndExclusiveAt: string | null;
    windowStartAt: string;
    windowEndExclusiveAt: string;
    snapshotVersion: number;
    isPublished: boolean;
    startedAt: string;
    finishedAt: string | null;
    errorText: string | null;
  };
  counts: {
    conversationDayCount: number;
    messageCount: number;
  };
};

type TimeZoneOption = {
  value: string;
  label: string;
};

type TagTypeOption = {
  value: string;
  label: string;
};

type TagTypeDraft = {
  id: string;
  key: string;
  label: string;
};

type TagAssignment = {
  id: string;
  tagText: string;
  count: number;
  typeKey: string;
  signalValue: string;
};

type OpeningRuleDraft = {
  id: string;
  name: string;
  phrases: string[];
};

type AppState = {
  apiBaseUrl: string;
  loadingKey: string | null;
  errorMessage: string | null;
  infoMessage: string | null;
  lastUpdatedAt: string | null;
  viewMode: ViewMode;
  editorTab: EditorTab;
  tokenInput: string;
  listedPancakePages: PancakePage[];
  selectedPancakePageId: string;
  connectedPages: ConnectedPage[];
  selectedConnectedPageId: string;
  selectedConnectedPage: ConnectedPage | null;
  setupBusinessTimezone: string;
  setupInitialConversationLimit: string;
  setupProcessingMode: ProcessingMode;
  setupAutoScraperEnabled: boolean;
  setupAutoAiAnalysisEnabled: boolean;
  setupSample: SetupSample | null;
  setupTagTypes: TagTypeDraft[];
  setupTagAssignments: TagAssignment[];
  setupTagCursor: string;
  setupOpeningRules: OpeningRuleDraft[];
  setupOpeningCursor: string;
  setupPromptText: string;
  runningBusinessTimezone: string;
  runningAutoScraperEnabled: boolean;
  runningAutoAiAnalysisEnabled: boolean;
  runningIsActive: boolean;
  runningTagTypes: TagTypeDraft[];
  runningTagAssignments: TagAssignment[];
  runningTagCursor: string;
  runningOpeningRules: OpeningRuleDraft[];
  runningOpeningCursor: string;
  runningPromptText: string;
  runningActivePromptText: string;
  pageRuns: RunSummary[];
  selectedRunId: string;
  selectedRunDetail: RunDetail | null;
  customRunProcessingMode: ProcessingMode;
  customRunMode: CustomRunMode;
  customRunTargetDate: string;
  customRunWindowStart: string;
  customRunWindowEnd: string;
  customRunMaxConversations: string;
  customRunMaxMessagePages: string;
  lastManualExecution: ManualExecutionSummary | null;
};

type ManualExecutionSummary = {
  jobName: string;
  ok: boolean;
  exitCode: number;
  runId: string | null;
  stdout: string;
  stderr: string;
};

const DEFAULT_TIME_ZONE = "Asia/Ho_Chi_Minh";
const DEFAULT_PROMPT = `Bạn là chuyên gia QA cho chat extractor của page {{page_name}}.

Mục tiêu:
- Tóm tắt ngắn gọn ý định khách hàng.
- Nhận diện staff phụ trách nếu đủ tín hiệu.
- Chuẩn hoá customer_type, location và service_interest theo taxonomy hiện hành.
- Nêu ra rủi ro vận hành nếu hội thoại có dấu hiệu bị bot xử lý sai hoặc thiếu follow-up.

Yêu cầu đầu ra:
- Viết ngắn gọn, ưu tiên tiếng Việt rõ nghĩa.
- Nếu không đủ dữ liệu thì ghi rõ "không đủ dữ liệu".
- Không bịa thông tin ngoài hội thoại.`;

const BUILTIN_TAG_TYPE_OPTIONS: TagTypeOption[] = [
  { value: "staff_name", label: "Tên nhân sự" },
  { value: "customer_type", label: "Loại khách hàng" },
  { value: "location", label: "Khu vực" },
  { value: "service_interest", label: "Nhu cầu dịch vụ" },
  { value: "campaign", label: "Chiến dịch" }
];

const PREFERRED_TIME_ZONES = [
  DEFAULT_TIME_ZONE,
  "UTC",
  "Asia/Bangkok",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Europe/London",
  "Europe/Paris",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles"
] as const;

const intlWithSupportedValuesOf = Intl as typeof Intl & {
  supportedValuesOf?: (key: "timeZone") => string[];
};

const timeZoneOptions: TimeZoneOption[] = buildTimeZoneOptions();

const state: AppState = {
  apiBaseUrl: "http://localhost:3000",
  loadingKey: null,
  errorMessage: null,
  infoMessage: null,
  lastUpdatedAt: null,
  viewMode: "setup",
  editorTab: "tags",
  tokenInput: "",
  listedPancakePages: [],
  selectedPancakePageId: "",
  connectedPages: [],
  selectedConnectedPageId: "",
  selectedConnectedPage: null,
  setupBusinessTimezone: DEFAULT_TIME_ZONE,
  setupInitialConversationLimit: "25",
  setupProcessingMode: "etl_only",
  setupAutoScraperEnabled: true,
  setupAutoAiAnalysisEnabled: true,
  setupSample: null,
  setupTagTypes: [],
  setupTagAssignments: [],
  setupTagCursor: "",
  setupOpeningRules: [],
  setupOpeningCursor: "",
  setupPromptText: buildDefaultPrompt(""),
  runningBusinessTimezone: DEFAULT_TIME_ZONE,
  runningAutoScraperEnabled: true,
  runningAutoAiAnalysisEnabled: false,
  runningIsActive: true,
  runningTagTypes: [],
  runningTagAssignments: [],
  runningTagCursor: "",
  runningOpeningRules: [],
  runningOpeningCursor: "",
  runningPromptText: buildDefaultPrompt(""),
  runningActivePromptText: "",
  pageRuns: [],
  selectedRunId: "",
  selectedRunDetail: null,
  customRunProcessingMode: "etl_only",
  customRunMode: "full_day",
  customRunTargetDate: todayInputValue(),
  customRunWindowStart: "",
  customRunWindowEnd: "",
  customRunMaxConversations: "",
  customRunMaxMessagePages: "",
  lastManualExecution: null
};

if (!rootElement) {
  throw new Error("Missing #app root element.");
}

const root = rootElement;

root.addEventListener("click", onRootClick);
root.addEventListener("change", onRootChange);

render();
void bootstrap();

async function bootstrap() {
  try {
    await refreshConnectedPages();
  } catch (error) {
    state.errorMessage = error instanceof Error ? error.message : String(error);
    render();
  }
}

function render() {
  root.innerHTML = `
    <div class="shell">
      <header class="topbar">
        <div class="title-block">
          <p class="eyebrow">chat-analyzer-v2</p>
          <h1>Điều khiển chat extractor</h1>
        </div>
        <div class="segmented mode-switch">
          ${renderViewSwitchButton("setup", "Thêm trang")}
          ${renderViewSwitchButton("running", "Trang chạy")}
        </div>
        <div class="quickbar">
          <label class="field inline-field">
            <span>Backend</span>
            <input id="api-base-url" type="text" value="${escapeAttribute(state.apiBaseUrl)}" placeholder="http://localhost:3000" />
          </label>
          <div class="button-row">
            <button class="button" data-action="save-api-base">Lưu endpoint</button>
            <button class="button" data-action="reload-connected-pages">Tải trang</button>
          </div>
        </div>
      </header>

      <main class="workspace">
        ${renderRailPanel()}
        ${renderStudioPanel()}
      </main>

      ${renderStatusBar()}
    </div>
  `;
}

function renderRailPanel() {
  return state.viewMode === "setup" ? renderSetupRail() : renderRunningRail();
}

function renderSetupRail() {
  const selectedPage = getSelectedPancakePage();
  const sample = state.setupSample;
  return `
    <section class="panel rail-panel">
      <div class="panel-heading">
        <div>
          <p class="panel-kicker">Flow thêm trang</p>
          <h2>Lấy sample runtime rồi mới lưu</h2>
        </div>
      </div>

      <div class="section-block">
        <label class="field">
          <span>Access token người dùng</span>
          <input id="token-input" type="password" value="${escapeAttribute(state.tokenInput)}" placeholder="Dán token Pancake" />
        </label>
        <div class="button-row">
          <button class="button button-primary" data-action="load-pages-from-token">1. Tải danh sách trang</button>
        </div>
      </div>

      <div class="section-block">
        <label class="field">
          <span>Trang nguồn</span>
          <select id="selected-pancake-page-id">${renderPancakePageOptions()}</select>
        </label>
        <div class="compact-grid compact-grid-3">
          <label class="field">
            <span>Múi giờ kinh doanh</span>
            <select id="setup-business-timezone">${renderTimeZoneOptions(state.setupBusinessTimezone)}</select>
          </label>
          <label class="field">
            <span>Số hội thoại mẫu ban đầu</span>
            <input id="setup-initial-limit" type="number" min="1" value="${escapeAttribute(state.setupInitialConversationLimit)}" />
          </label>
          <label class="field">
            <span>Kiểu xử lý mẫu</span>
            <select id="setup-processing-mode">${renderProcessingModeOptions(state.setupProcessingMode)}</select>
          </label>
        </div>
        <button class="button button-primary button-wide" data-action="fetch-setup-sample">2. Lấy thông tin</button>
      </div>

      <div class="section-block">
        <div class="section-head">
          <p class="panel-kicker">Mẫu runtime</p>
          <h3>${sample ? "Đã có dữ liệu mẫu" : "Chưa lấy mẫu"}</h3>
        </div>
        ${sample ? renderSampleSummary(sample) : `<p class="empty-state">Dữ liệu sample chỉ dùng để chỉnh config trong phiên hiện tại, chưa ghi xuống DB.</p>`}
      </div>

      <div class="section-block">
        <div class="toggle-grid">
          <label class="check-field">
            <input id="setup-auto-scraper" type="checkbox" ${state.setupAutoScraperEnabled ? "checked" : ""} />
            <span>Auto Scraper</span>
          </label>
          <label class="check-field">
            <input id="setup-auto-ai" type="checkbox" ${state.setupAutoAiAnalysisEnabled ? "checked" : ""} />
            <span>Auto AI Analysis</span>
          </label>
        </div>
        <button class="button button-primary button-wide" data-action="commit-setup-page" ${sample && selectedPage ? "" : "disabled"}>3. Thêm trang</button>
      </div>
    </section>
  `;
}

function renderRunningRail() {
  const selectedPage = getSelectedConnectedPage();
  const runDetail = state.selectedRunDetail;
  return `
    <section class="panel rail-panel">
      <div class="panel-heading">
        <div>
          <p class="panel-kicker">Vận hành hằng ngày</p>
          <h2>Chỉnh config và chạy ngay</h2>
        </div>
      </div>

      <div class="section-block">
        <label class="field">
          <span>Trang đang quản lý</span>
          <select id="selected-connected-page-id">${renderConnectedPageOptions()}</select>
        </label>
        <div class="button-row">
          <button class="button" data-action="reload-connected-pages">Tải lại</button>
        </div>
        ${selectedPage ? `
          <div class="summary-grid">
            <div><strong>Timezone</strong><span>${escapeHtml(selectedPage.businessTimezone)}</span></div>
            <div><strong>Auto</strong><span>${selectedPage.autoScraperEnabled ? "Extract bật" : "Extract tắt"} / ${selectedPage.autoAiAnalysisEnabled ? "AI bật" : "AI tắt"}</span></div>
          </div>
        ` : `<p class="empty-state">Chưa có page nào trong DB.</p>`}
      </div>

      <div class="section-block">
        <div class="section-head">
          <p class="panel-kicker">Custom run</p>
          <h3>Chạy extract-only hoặc full-analysis</h3>
        </div>
        <div class="compact-grid compact-grid-2">
          <label class="field">
            <span>Kiểu xử lý</span>
            <select id="custom-run-processing-mode">${renderProcessingModeOptions(state.customRunProcessingMode)}</select>
          </label>
          <label class="field">
            <span>Kiểu khoảng thời gian</span>
            <select id="custom-run-mode">${renderCustomRunModeOptions()}</select>
          </label>
        </div>
        ${
          state.customRunMode === "full_day"
            ? `
          <label class="field">
            <span>Ngày chạy</span>
            <input id="custom-run-target-date" type="date" value="${escapeAttribute(state.customRunTargetDate)}" />
          </label>
        `
            : `
          <div class="compact-grid compact-grid-2">
            <label class="field">
              <span>Bắt đầu</span>
              <input id="custom-run-window-start" type="datetime-local" value="${escapeAttribute(state.customRunWindowStart)}" />
            </label>
            <label class="field">
              <span>Kết thúc</span>
              <input id="custom-run-window-end" type="datetime-local" value="${escapeAttribute(state.customRunWindowEnd)}" />
            </label>
          </div>
        `
        }
        <div class="compact-grid compact-grid-2">
          <label class="field">
            <span>Giới hạn hội thoại</span>
            <input id="custom-run-max-conversations" type="number" min="0" value="${escapeAttribute(state.customRunMaxConversations)}" placeholder="tuỳ chọn" />
          </label>
          <label class="field">
            <span>Giới hạn trang tin nhắn / hội thoại</span>
            <input id="custom-run-max-message-pages" type="number" min="0" value="${escapeAttribute(state.customRunMaxMessagePages)}" placeholder="tuỳ chọn" />
          </label>
        </div>
        <button class="button button-primary button-wide" data-action="execute-custom-run" ${selectedPage ? "" : "disabled"}>Chạy ngay</button>
        ${state.lastManualExecution ? renderManualExecutionSummary(state.lastManualExecution) : ""}
      </div>

      <div class="section-block">
        <div class="section-head">
          <p class="panel-kicker">Run audit</p>
          <h3>Chọn từ dropdown</h3>
        </div>
        <label class="field">
          <span>Run gần đây</span>
          <select id="selected-run-id">${renderRunOptions()}</select>
        </label>
        <div class="button-row">
          <button class="button" data-action="reload-page-runs" ${selectedPage ? "" : "disabled"}>Tải run</button>
        </div>
        ${runDetail ? renderRunDetail(runDetail) : `<p class="empty-state">Chọn một run từ danh sách để xem nhanh kết quả.</p>`}
      </div>
    </section>
  `;
}

function renderStudioPanel() {
  const subjectLabel = state.viewMode === "setup"
    ? getSelectedPancakePage()?.pageName ?? "Chưa chọn page nguồn"
    : getSelectedConnectedPage()?.pageName ?? "Chưa chọn page";

  return `
    <section class="panel studio-panel">
      <div class="panel-heading">
        <div>
          <p class="panel-kicker">${state.viewMode === "setup" ? "Tinh chỉnh cấu hình" : "Cấu hình đã lưu"}</p>
          <h2>${escapeHtml(subjectLabel)}</h2>
        </div>
        ${state.viewMode === "running"
          ? `<button class="button button-primary" data-action="save-running-config" ${state.selectedConnectedPageId ? "" : "disabled"}>Lưu thay đổi</button>`
          : `<span class="panel-note">Sample hiện chỉ nằm trong runtime.</span>`}
      </div>

      ${state.viewMode === "running" ? renderRunningConfigStrip() : ""}

      <div class="tab-row">
        ${renderEditorTabButton("tags", "Phân loại tag")}
        ${renderEditorTabButton("opening", "Tin mở đầu")}
        ${renderEditorTabButton("prompt", "Prompt AI")}
      </div>

      <div class="studio-body">
        ${renderEditorBody()}
      </div>
    </section>
  `;
}

function renderRunningConfigStrip() {
  return `
    <div class="compact-grid compact-grid-4 config-strip">
      <label class="field">
        <span>Múi giờ kinh doanh</span>
        <select id="running-business-timezone">${renderTimeZoneOptions(state.runningBusinessTimezone)}</select>
      </label>
      <label class="check-field">
        <input id="running-auto-scraper" type="checkbox" ${state.runningAutoScraperEnabled ? "checked" : ""} />
        <span>Tự động trích xuất</span>
      </label>
      <label class="check-field">
        <input id="running-auto-ai" type="checkbox" ${state.runningAutoAiAnalysisEnabled ? "checked" : ""} />
        <span>Tự động phân tích</span>
      </label>
      <label class="check-field">
        <input id="running-is-active" type="checkbox" ${state.runningIsActive ? "checked" : ""} />
        <span>Trang hoạt động</span>
      </label>
    </div>
  `;
}

function renderEditorBody() {
  switch (state.editorTab) {
    case "tags":
      return renderTagEditor();
    case "opening":
      return renderOpeningEditor();
    case "prompt":
      return renderPromptEditor();
  }
}

function renderTagEditor() {
  const assignments = state.viewMode === "setup" ? state.setupTagAssignments : state.runningTagAssignments;
  const scope = state.viewMode;
  const tagTypes = getScopedTagTypes(scope);
  const hasAssignments = assignments.length > 0;

  return `
    <div class="editor-layout">
      <div class="editor-intro">
        <div>
          <h3>Tag mapping</h3>
          <p>Mỗi tag chỉ thuộc một loại. Giá trị mapping phải giữ nguyên text tag để làm tín hiệu cho AI.</p>
        </div>
        <div class="button-row">
          <button class="button" data-action="fill-tag-signal-from-text">Điền giá trị theo text tag</button>
          <button class="button" data-action="add-tag-type">Thêm loại tag</button>
        </div>
      </div>
      <div class="tag-type-board">
        <div class="tag-type-group">
          <span class="tiny-label">Loại chuẩn</span>
          <div class="chip-row">
            ${BUILTIN_TAG_TYPE_OPTIONS.map((option) => `<span class="chip chip-soft">${escapeHtml(option.label)}</span>`).join("")}
          </div>
        </div>
        <div class="tag-type-group">
          <span class="tiny-label">Loại tự thêm</span>
          <div id="${scope}-tag-type-editor" class="tag-type-list">
            ${tagTypes.length > 0
              ? tagTypes.map((draft) => renderTagTypeRow(draft)).join("")
              : `<p class="empty-state">Chưa có loại tag riêng. Nếu cần taxonomy mới, thêm tại đây.</p>`}
          </div>
        </div>
      </div>
      ${hasAssignments
        ? `<div id="${scope}-tag-editor" class="single-card-list tag-mapping-list">
            ${assignments.map((assignment) => renderTagAssignmentRow(scope, assignment)).join("")}
          </div>`
        : `<p class="empty-state">Lấy mẫu để bắt đầu gán tag.</p>`}
    </div>
  `;
}

function renderOpeningEditor() {
  const rules = state.viewMode === "setup" ? state.setupOpeningRules : state.runningOpeningRules;
  const sample = state.viewMode === "setup" ? state.setupSample : null;
  const windows = sample?.openingCandidates.topOpeningCandidateWindows.slice(0, 3) ?? [];
  const unmatched = sample?.openingCandidates.unmatchedOpeningTexts.slice(0, 3) ?? [];
  const scope = state.viewMode;

  return `
    <div class="editor-layout">
      <div class="editor-copy">
        <h3>Opening block mapping</h3>
        <p>Rule chỉ dùng để nhận diện khối opening block (để cắt khỏi context AI). Tin meaningful đầu tiên là tin đầu tiên sau khối này.</p>
        <div class="button-row">
          <button class="button" data-action="add-opening-rule">Thêm rule</button>
        </div>
        ${windows.length > 0 ? `
          <div class="candidate-stack">
            <span class="tiny-label">Opening block phổ biến (seed theo block)</span>
            ${windows.map((window) => `
              <div class="candidate-stack">
                <div class="signature-card">${window.signature.map((text) => `<span class="chip">${escapeHtml(text)}</span>`).join("")}</div>
                <button class="button" data-action="seed-opening-rule-window" data-signature="${escapeAttribute(JSON.stringify(window.signature))}">Dùng block này làm rule</button>
              </div>
            `).join("")}
          </div>
        ` : ""}
        ${unmatched.length > 0 ? `
          <div class="candidate-stack">
            <span class="tiny-label">Text chưa thuộc block rule nào</span>
            <div class="chip-row">
              ${unmatched.map((item) => `<span class="chip">${escapeHtml(item.text)}</span>`).join("")}
            </div>
          </div>
        ` : ""}
      </div>
      ${rules.length > 0
        ? `
        <div id="${scope}-opening-editor" class="single-card-list opening-rule-list">
          ${rules.map((rule) => renderOpeningRuleRow(scope, rule)).join("")}
        </div>
      `
        : `<p class="empty-state">Chưa có quy tắc tin mở đầu.</p>`}
    </div>
  `;
}

function renderPromptEditor() {
  const promptText = state.viewMode === "setup" ? state.setupPromptText : state.runningPromptText;
  return `
    <div class="prompt-layout">
      <div class="editor-copy">
        <h3>Prompt AI</h3>
        <p>Prompt phải có placeholder dùng như thật. Khi lưu ở chế độ vận hành, backend tạo version mới và activate ngay.</p>
      </div>
      <textarea id="${state.viewMode}-prompt-text" class="prompt-editor prompt-editor-pane">${escapeHtml(promptText)}</textarea>
    </div>
  `;
}

function renderSampleSummary(sample: SetupSample) {
  return `
    <div class="summary-grid">
      <div><strong>Khoảng dữ liệu</strong><span>${escapeHtml(formatSampleWindow(sample))}</span></div>
      <div><strong>Hội thoại</strong><span>${escapeHtml(readMetric(sample.metrics, "conversations_scanned"))}</span></div>
      <div><strong>Tin nhắn</strong><span>${escapeHtml(readMetric(sample.metrics, "messages_selected"))}</span></div>
    </div>
    <p class="helper-text">Tag nổi bật: ${escapeHtml(formatCandidateNames(sample.tagCandidates.map((item) => item.text)))}</p>
    <p class="helper-text">Opening nổi bật: ${escapeHtml(formatCandidateNames(sample.openingCandidates.unmatchedOpeningTexts.map((item) => item.text)))}</p>
  `;
}

function renderRunDetail(detail: RunDetail) {
  return `
    <div class="summary-grid">
      <div><strong>Trạng thái</strong><span>${escapeHtml(detail.run.status)}</span></div>
      <div><strong>Ngày chạy</strong><span>${escapeHtml(detail.run.targetDate)}</span></div>
      <div><strong>Kiểu chạy</strong><span>${escapeHtml(detail.run.runMode)} / ${escapeHtml(detail.run.processingMode)}</span></div>
      <div><strong>Conversation-day</strong><span>${escapeHtml(String(detail.counts.conversationDayCount))}</span></div>
      <div><strong>Tin nhắn</strong><span>${escapeHtml(String(detail.counts.messageCount))}</span></div>
    </div>
    ${detail.run.errorText ? `<p class="helper-text">Lỗi: ${escapeHtml(compactText(detail.run.errorText, 160))}</p>` : ""}
  `;
}

function renderManualExecutionSummary(execution: ManualExecutionSummary) {
  return `
    <div class="summary-grid execution-facts ${execution.ok ? "" : "execution-facts-error"}">
      <div><strong>Job</strong><span>${escapeHtml(execution.jobName)}</span></div>
      <div><strong>Kết quả</strong><span>${execution.ok ? "Thành công" : `Lỗi (${execution.exitCode})`}</span></div>
      <div><strong>Run ID</strong><span>${escapeHtml(execution.runId ?? "chưa có")}</span></div>
    </div>
    <p class="helper-text">${escapeHtml(readExecutionSummary(execution))}</p>
  `;
}

function renderTagAssignmentRow(scope: ViewMode, assignment: TagAssignment) {
  const actualType = resolveAssignmentTypeKey(assignment);
  const typeLabel = readTagTypeLabel(scope, actualType);
  return `
    <div class="assignment-row tag-card" data-tag-row data-id="${escapeAttribute(assignment.id)}" data-tag-text="${escapeAttribute(assignment.tagText)}">
      <div class="tag-card-head">
        <div class="assignment-tag">
          <span class="tag-pill">${escapeHtml(assignment.tagText)}</span>
          <span class="tiny-count">${assignment.count > 0 ? `${assignment.count} lần` : "tag đã lưu"}</span>
        </div>
        <button class="icon-button" data-action="clear-tag-assignment" data-id="${escapeAttribute(assignment.id)}" title="Bỏ gán loại và giá trị">X</button>
      </div>
      <div class="tag-card-fields">
        <label class="field">
          <span>Loại tag</span>
          <select class="compact-select" data-field="type-key">${renderTagTypeOptions(scope, assignment.typeKey)}</select>
        </label>
        <label class="field">
          <span>Giá trị chuẩn</span>
          <input class="compact-input" data-field="signal-value" type="text" value="${escapeAttribute(assignment.signalValue)}" placeholder="${escapeAttribute(actualType ? "giữ nguyên text tag" : "chọn loại trước")}" />
        </label>
      </div>
      <div class="tag-card-foot">
        <span class="helper-text">${actualType ? `Đang gán vào ${escapeHtml(typeLabel)}` : "Chưa gán loại tag."}</span>
      </div>
    </div>
  `;
}

function renderTagTypeRow(draft: TagTypeDraft) {
  return `
    <div class="tag-type-row" data-tag-type-row data-id="${escapeAttribute(draft.id)}">
      <label class="field">
        <span>Tên loại</span>
        <input class="compact-input" data-field="label" type="text" value="${escapeAttribute(draft.label)}" placeholder="Ví dụ: Khách quay lại" />
      </label>
      <label class="field">
        <span>type_key</span>
        <input class="compact-input" data-field="key" type="text" value="${escapeAttribute(draft.key)}" placeholder="khach_quay_lai" />
      </label>
      <button class="icon-button" data-action="remove-tag-type" data-id="${escapeAttribute(draft.id)}" title="Xoá loại tag">X</button>
    </div>
  `;
}

function renderOpeningRuleRow(scope: ViewMode, rule: OpeningRuleDraft) {
  return `
    <div class="rule-card" data-opening-row data-id="${escapeAttribute(rule.id)}">
      <div class="section-head-row">
        <label class="field">
          <span>Nhãn opening block</span>
          <input class="compact-input" data-field="name" type="text" value="${escapeAttribute(rule.name)}" placeholder="Block mở đầu đặt lịch" />
        </label>
        <button class="icon-button" data-action="remove-opening-rule" data-id="${escapeAttribute(rule.id)}">X</button>
      </div>
      <label class="field">
        <span>Signature của opening block (mỗi dòng là 1 cụm bắt buộc)</span>
        <textarea class="compact-textarea" data-field="phrases" placeholder="Mỗi dòng là 1 cụm thuộc opening block">${escapeHtml(rule.phrases.join("\n"))}</textarea>
      </label>
    </div>
  `;
}

function renderViewSwitchButton(view: ViewMode, label: string) {
  return `<button class="segmented-button ${state.viewMode === view ? "is-active" : ""}" data-action="switch-view" data-view="${view}">${label}</button>`;
}

function renderEditorTabButton(tab: EditorTab, label: string) {
  return `<button class="tab-button ${state.editorTab === tab ? "is-active" : ""}" data-action="switch-editor-tab" data-tab="${tab}">${label}</button>`;
}

function renderStatusBar() {
  if (state.errorMessage) {
    return `<section class="status-bar status-error">${escapeHtml(state.errorMessage)}</section>`;
  }
  if (state.infoMessage) {
    return `<section class="status-bar">${escapeHtml(state.infoMessage)}</section>`;
  }
  return `<section class="status-bar status-muted">${escapeHtml(readStatusLabel())} · ${escapeHtml(readStatusHint())}</section>`;
}

function renderEditorCursor(
  scope: ViewMode,
  kind: "tag" | "opening",
  label: string,
  items: Array<{ id: string; label: string }>
) {
  const selectedId = normalizeEditorCursor(scope, kind, items.map((item) => item.id));
  const currentIndex = Math.max(items.findIndex((item) => item.id === selectedId), 0);

  return `
    <div class="cursor-strip">
      <span class="tiny-label">${escapeHtml(label)}</span>
      <div class="cursor-controls">
        <button class="button" data-action="step-editor-cursor" data-kind="${kind}" data-direction="-1">Trước</button>
        <select id="${scope}-${kind}-cursor" class="cursor-select">
          ${items.map((item) => `<option value="${escapeAttribute(item.id)}" ${item.id === selectedId ? "selected" : ""}>${escapeHtml(compactText(item.label, 70))}</option>`).join("")}
        </select>
        <button class="button" data-action="step-editor-cursor" data-kind="${kind}" data-direction="1">Sau</button>
        <span class="tiny-count">${items.length === 0 ? "0/0" : `${currentIndex + 1}/${items.length}`}</span>
      </div>
    </div>
  `;
}

function normalizeEditorCursor(scope: ViewMode, kind: "tag" | "opening", ids: string[]) {
  const current = getEditorCursor(scope, kind);
  const next = ids.find((id) => id === current) ?? ids[0] ?? "";
  setEditorCursor(scope, kind, next);
  return next;
}

function stepEditorCursor(scope: ViewMode, kind: "tag" | "opening", direction: number) {
  const ids = readEditorCursorIds(scope, kind);
  if (ids.length === 0) {
    setEditorCursor(scope, kind, "");
    return;
  }
  const current = normalizeEditorCursor(scope, kind, ids);
  const currentIndex = Math.max(ids.findIndex((id) => id === current), 0);
  const nextIndex = (currentIndex + direction + ids.length) % ids.length;
  setEditorCursor(scope, kind, ids[nextIndex] ?? ids[0]);
}

function readEditorCursorIds(scope: ViewMode, kind: "tag" | "opening") {
  if (kind === "tag") {
    return (scope === "setup" ? state.setupTagAssignments : state.runningTagAssignments).map((item) => item.id);
  }
  return (scope === "setup" ? state.setupOpeningRules : state.runningOpeningRules).map((item) => item.id);
}

function getEditorCursor(scope: ViewMode, kind: "tag" | "opening") {
  if (scope === "setup") {
    if (kind === "tag") {
      return state.setupTagCursor;
    }
    return state.setupOpeningCursor;
  }

  if (kind === "tag") {
    return state.runningTagCursor;
  }
  return state.runningOpeningCursor;
}

function setEditorCursor(scope: ViewMode, kind: "tag" | "opening", value: string) {
  if (scope === "setup") {
    if (kind === "tag") {
      state.setupTagCursor = value;
      return;
    }
    state.setupOpeningCursor = value;
    return;
  }

  if (kind === "tag") {
    state.runningTagCursor = value;
    return;
  }
  state.runningOpeningCursor = value;
}

async function onRootClick(event: Event) {
  const button = (event.target as HTMLElement).closest<HTMLElement>("[data-action]");
  if (!button) {
    return;
  }

  syncAllForms();

  const action = button.dataset.action;
  if (!action) {
    return;
  }

  switch (action) {
    case "save-api-base":
      state.apiBaseUrl = normalizeBaseUrl(state.apiBaseUrl);
      state.errorMessage = null;
      state.infoMessage = "Đã lưu endpoint backend.";
      render();
      return;
    case "switch-view":
      state.viewMode = button.dataset.view === "running" ? "running" : "setup";
      state.errorMessage = null;
      render();
      return;
    case "switch-editor-tab":
      state.editorTab = parseEditorTab(button.dataset.tab);
      render();
      return;
    case "step-editor-cursor":
      stepEditorCursor(
        state.viewMode,
        button.dataset.kind === "opening" ? "opening" : "tag",
        Number.parseInt(button.dataset.direction ?? "0", 10) || 0
      );
      render();
      return;
    case "reload-connected-pages":
      return void runAction("reload-connected-pages", async () => {
        await refreshConnectedPages(state.selectedConnectedPageId);
      });
    case "load-pages-from-token":
      return void runAction("load-pages-from-token", async () => {
        assertNonEmpty(state.tokenInput, "Cần nhập user access token.");
        const data = await requestJson("POST", "/chat-extractor/pages/list-from-token", {
          userAccessToken: state.tokenInput
        });
        state.listedPancakePages = extractPancakePages(data);
        state.selectedPancakePageId = state.listedPancakePages.find((page) => page.pageId === state.selectedPancakePageId)?.pageId ?? state.listedPancakePages[0]?.pageId ?? "";
        state.infoMessage = `${state.listedPancakePages.length} page đã được tải từ token.`;
      });
    case "fetch-setup-sample":
      return void runAction("fetch-setup-sample", async () => {
        const page = getSelectedPancakePage();
        assertNonEmpty(state.tokenInput, "Cần nhập user access token.");
        if (!page) {
          throw new Error("Cần chọn page nguồn.");
        }
        const sampleResponse = await requestJson<{ sample: SetupSample }>("POST", "/chat-extractor/control-center/setup/sample", {
          pancakePageId: page.pageId,
          userAccessToken: state.tokenInput,
          businessTimezone: normalizeTimeZoneOrDefault(state.setupBusinessTimezone),
          processingMode: state.setupProcessingMode,
          initialConversationLimit: readPositiveInt(state.setupInitialConversationLimit, "Số hội thoại mẫu ban đầu phải là số nguyên dương."),
          activeTagMappingJson: compileTagRules(state.setupTagAssignments),
          activeOpeningRulesJson: compileOpeningRules(state.setupOpeningRules)
        });
        state.setupSample = sampleResponse.sample;
        state.setupTagAssignments = mergeSampleTagAssignments(state.setupTagAssignments, sampleResponse.sample.tagCandidates);
        state.setupTagTypes = inferCustomTagTypes(state.setupTagAssignments, state.setupTagTypes);
        state.infoMessage = "Đã lấy sample runtime cho page đang chọn.";
      });
    case "commit-setup-page":
      return void runAction("commit-setup-page", async () => {
        const page = getSelectedPancakePage();
        if (!page) {
          throw new Error("Cần chọn page nguồn trước khi thêm trang.");
        }
        if (!state.setupSample) {
          throw new Error("Cần lấy sample trước khi thêm trang.");
        }
        assertNonEmpty(state.tokenInput, "Cần nhập user access token.");
        assertNonEmpty(state.setupPromptText, "Cần nhập prompt trước khi thêm trang.");
        const response = await requestJson<{ page: ConnectedPage }>("POST", "/chat-extractor/control-center/setup/commit", {
          pancakePageId: page.pageId,
          userAccessToken: state.tokenInput,
          businessTimezone: normalizeTimeZoneOrDefault(state.setupBusinessTimezone),
          autoScraperEnabled: state.setupAutoScraperEnabled,
          autoAiAnalysisEnabled: state.setupAutoAiAnalysisEnabled,
          activeTagMappingJson: compileTagRules(state.setupTagAssignments),
          activeOpeningRulesJson: compileOpeningRules(state.setupOpeningRules),
          promptText: state.setupPromptText.trim(),
          onboardingStateJson: buildSetupOnboardingState(state.setupSample)
        });
        await refreshConnectedPages(response.page.id);
        state.viewMode = "running";
        state.infoMessage = `Đã thêm page ${response.page.pageName} vào DB.`;
      });
    case "add-tag-type":
      appendTagType(state.viewMode);
      render();
      return;
    case "remove-tag-type":
      removeTagType(state.viewMode, button.dataset.id ?? "");
      render();
      return;
    case "clear-tag-assignment":
      clearTagAssignment(state.viewMode, button.dataset.id ?? "");
      render();
      return;
    case "fill-tag-signal-from-text":
      fillTagSignalFromText(state.viewMode);
      render();
      return;
    case "add-opening-rule":
      appendOpeningRule(state.viewMode);
      render();
      return;
    case "seed-opening-rule-window":
      seedOpeningRuleFromWindow(state.viewMode, button.dataset.signature ?? "");
      render();
      return;
    case "remove-opening-rule":
      removeOpeningRule(state.viewMode, button.dataset.id ?? "");
      render();
      return;
    case "save-running-config":
      return void runAction("save-running-config", async () => {
        await saveRunningConfig();
      });
    case "execute-custom-run":
      return void runAction("execute-custom-run", async () => {
        await executeCustomRun();
      });
    case "reload-page-runs":
      return void runAction("reload-page-runs", async () => {
        const pageId = requireSelectedConnectedPageId();
        await loadPageRuns(pageId);
      });
    case "select-run-quick":
      state.selectedRunId = button.dataset.id ?? "";
      render();
      if (state.selectedRunId) {
        return void runAction("load-run-detail", async () => {
          await loadRunDetail(state.selectedRunId);
        });
      }
      return;
    default:
      return;
  }
}

function onRootChange(event: Event) {
  const target = event.target;
  if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement)) {
    return;
  }

  syncAllForms();

  if (target.id === "selected-connected-page-id") {
    const page = state.connectedPages.find((item) => item.id === state.selectedConnectedPageId) ?? null;
    setSelectedConnectedPage(page);
    render();
    if (page) {
      void runAction("select-page", async () => {
        await Promise.all([loadRunningPrompt(page.id), loadPageRuns(page.id)]);
      });
    }
    return;
  }

  if (target.id === "selected-run-id") {
    render();
    if (state.selectedRunId) {
      void runAction("load-run-detail", async () => {
        await loadRunDetail(state.selectedRunId);
      });
    }
    return;
  }

  const editorCursorMatch = /^(setup|running)-(tag|opening)-cursor$/.exec(target.id);
  if (editorCursorMatch) {
    const [, scopeToken, kindToken] = editorCursorMatch;
    setEditorCursor(scopeToken === "running" ? "running" : "setup", kindToken === "opening" ? "opening" : "tag", target.value);
    render();
    return;
  }

  if (target.id === "custom-run-mode") {
    render();
    return;
  }

  if (target.closest("[data-tag-type-row]")) {
    render();
  }
}

async function runAction(key: string, action: () => Promise<void>) {
  state.loadingKey = key;
  state.errorMessage = null;
  state.infoMessage = null;
  render();

  try {
    await action();
    state.lastUpdatedAt = new Date().toLocaleString("vi-VN");
  } catch (error) {
    state.errorMessage = error instanceof Error ? error.message : String(error);
  } finally {
    state.loadingKey = null;
    render();
  }
}

function syncAllForms() {
  state.apiBaseUrl = getInputValue("#api-base-url", state.apiBaseUrl).trim() || state.apiBaseUrl;
  state.tokenInput = getInputValue("#token-input", state.tokenInput).trim();
  state.selectedPancakePageId = getSelectValue("#selected-pancake-page-id", state.selectedPancakePageId);
  state.selectedConnectedPageId = getSelectValue("#selected-connected-page-id", state.selectedConnectedPageId);
  state.selectedRunId = getSelectValue("#selected-run-id", state.selectedRunId);

  if (state.viewMode === "setup") {
    state.setupBusinessTimezone = normalizeTimeZoneOrDefault(getSelectValue("#setup-business-timezone", state.setupBusinessTimezone));
    state.setupInitialConversationLimit = getInputValue("#setup-initial-limit", state.setupInitialConversationLimit).trim();
    state.setupProcessingMode = getSelectValue("#setup-processing-mode", state.setupProcessingMode) as ProcessingMode;
    state.setupAutoScraperEnabled = getCheckboxValue("#setup-auto-scraper", state.setupAutoScraperEnabled);
    state.setupAutoAiAnalysisEnabled = getCheckboxValue("#setup-auto-ai", state.setupAutoAiAnalysisEnabled);
    state.setupPromptText = getTextareaValue("#setup-prompt-text", state.setupPromptText);
    {
      const synced = syncTagTypes("setup", state.setupTagTypes, state.setupTagAssignments);
      state.setupTagTypes = synced.types;
      state.setupTagAssignments = syncTagAssignments("setup", synced.assignments);
    }
    state.setupOpeningRules = syncOpeningRules("setup", state.setupOpeningRules);
    return;
  }

  state.runningBusinessTimezone = normalizeTimeZoneOrDefault(getSelectValue("#running-business-timezone", state.runningBusinessTimezone));
  state.runningAutoScraperEnabled = getCheckboxValue("#running-auto-scraper", state.runningAutoScraperEnabled);
  state.runningAutoAiAnalysisEnabled = getCheckboxValue("#running-auto-ai", state.runningAutoAiAnalysisEnabled);
  state.runningIsActive = getCheckboxValue("#running-is-active", state.runningIsActive);
  state.runningPromptText = getTextareaValue("#running-prompt-text", state.runningPromptText);
  {
    const synced = syncTagTypes("running", state.runningTagTypes, state.runningTagAssignments);
    state.runningTagTypes = synced.types;
    state.runningTagAssignments = syncTagAssignments("running", synced.assignments);
  }
  state.runningOpeningRules = syncOpeningRules("running", state.runningOpeningRules);
  state.customRunProcessingMode = getSelectValue("#custom-run-processing-mode", state.customRunProcessingMode) as ProcessingMode;
  state.customRunMode = getSelectValue("#custom-run-mode", state.customRunMode) as CustomRunMode;
  state.customRunTargetDate = getInputValue("#custom-run-target-date", state.customRunTargetDate);
  state.customRunWindowStart = getInputValue("#custom-run-window-start", state.customRunWindowStart);
  state.customRunWindowEnd = getInputValue("#custom-run-window-end", state.customRunWindowEnd);
  state.customRunMaxConversations = getInputValue("#custom-run-max-conversations", state.customRunMaxConversations).trim();
  state.customRunMaxMessagePages = getInputValue("#custom-run-max-message-pages", state.customRunMaxMessagePages).trim();
}

async function refreshConnectedPages(preferredId?: string) {
  const data = await requestJson<{ pages: ConnectedPage[] }>("GET", "/chat-extractor/control-center/pages");
  state.connectedPages = Array.isArray(data.pages) ? data.pages.filter(isConnectedPage) : [];
  const selectedId = preferredId || state.selectedConnectedPageId;
  const page = state.connectedPages.find((item) => item.id === selectedId) ?? state.connectedPages[0] ?? null;
  setSelectedConnectedPage(page);
  if (page) {
    await Promise.all([loadRunningPrompt(page.id), loadPageRuns(page.id)]);
  } else {
    state.pageRuns = [];
    state.selectedRunId = "";
    state.selectedRunDetail = null;
  }
}

async function loadRunningPrompt(pageId: string) {
  const data = await requestJson<PromptListResponse>("GET", `/chat-extractor/control-center/pages/${encodeURIComponent(pageId)}/prompts`);
  const activePrompt = data.prompts.find((item) => item.id === data.activePromptVersionId) ?? data.prompts[0] ?? null;
  const promptText = activePrompt?.promptText ?? buildDefaultPrompt(getSelectedConnectedPage()?.pageName ?? "");
  state.runningActivePromptText = activePrompt?.promptText ?? "";
  state.runningPromptText = promptText;
}

async function loadPageRuns(pageId: string) {
  const data = await requestJson<{ runs: RunSummary[] }>("GET", `/chat-extractor/control-center/pages/${encodeURIComponent(pageId)}/runs`);
  state.pageRuns = Array.isArray(data.runs) ? data.runs : [];
  state.selectedRunId = state.pageRuns.find((run) => run.id === state.selectedRunId)?.id ?? state.pageRuns[0]?.id ?? "";
  if (state.selectedRunId) {
    await loadRunDetail(state.selectedRunId);
  } else {
    state.selectedRunDetail = null;
  }
}

async function loadRunDetail(runId: string) {
  state.selectedRunDetail = await requestJson<RunDetail>("GET", `/chat-extractor/runs/${encodeURIComponent(runId)}`);
}

async function saveRunningConfig() {
  const pageId = requireSelectedConnectedPageId();
  await requestJson("PATCH", `/chat-extractor/control-center/pages/${encodeURIComponent(pageId)}`, {
    businessTimezone: normalizeTimeZoneOrDefault(state.runningBusinessTimezone),
    autoScraperEnabled: state.runningAutoScraperEnabled,
    autoAiAnalysisEnabled: state.runningAutoAiAnalysisEnabled,
    activeTagMappingJson: compileTagRules(state.runningTagAssignments),
    activeOpeningRulesJson: compileOpeningRules(state.runningOpeningRules),
    isActive: state.runningIsActive
  });

  if (state.runningPromptText.trim() !== state.runningActivePromptText.trim()) {
    const created = await requestJson<{ prompt: PromptVersion }>("POST", `/chat-extractor/control-center/pages/${encodeURIComponent(pageId)}/prompts`, {
      promptText: state.runningPromptText.trim()
    });
    await requestJson("POST", `/chat-extractor/control-center/pages/${encodeURIComponent(pageId)}/prompts/${encodeURIComponent(created.prompt.id)}/activate`, {});
  }

  await refreshConnectedPages(pageId);
  state.infoMessage = "Đã lưu cấu hình và prompt cho page đang chạy.";
}

async function executeCustomRun() {
  const pageId = requireSelectedConnectedPageId();
  const job: Record<string, JsonValue> = {
    processingMode: state.customRunProcessingMode
  };

  if (state.customRunMode === "full_day") {
    job.runMode = "backfill_day";
    job.targetDate = requireDate(state.customRunTargetDate, "Cần chọn target date cho custom run.");
  } else {
    assertNonEmpty(state.customRunWindowStart, "Cần nhập window start cho custom run.");
    assertNonEmpty(state.customRunWindowEnd, "Cần nhập window end cho custom run.");
    job.runMode = "manual_range";
    job.requestedWindowStartAt = toIsoStringFromLocalInput(state.customRunWindowStart);
    job.requestedWindowEndExclusiveAt = toIsoStringFromLocalInput(state.customRunWindowEnd);
  }

  appendOptionalInt(job, "maxConversations", state.customRunMaxConversations);
  appendOptionalInt(job, "maxMessagePagesPerConversation", state.customRunMaxMessagePages);

  const response = await requestJson<{
    preview: { jobName: string };
    executions: Array<{ ok: boolean; exitCode: number; stdout: string; stderr: string }>;
  }>("POST", "/chat-extractor/jobs/execute", {
    kind: "manual",
    connectedPageId: pageId,
    job
  });

  const firstExecution = response.executions[0] ?? {
    ok: false,
    exitCode: -1,
    stdout: "",
    stderr: "Không có phản hồi từ worker."
  };
  const latestRunId = extractRunId(firstExecution.stdout);
  state.lastManualExecution = {
    jobName: response.preview.jobName,
    ok: firstExecution.ok,
    exitCode: firstExecution.exitCode,
    runId: latestRunId,
    stdout: firstExecution.stdout,
    stderr: firstExecution.stderr
  };

  if (!response.executions.every((execution) => execution.ok)) {
    throw new Error(buildManualExecutionError(state.lastManualExecution));
  }

  if (latestRunId) {
    await waitForRunToAppear(pageId, latestRunId);
  } else {
    await loadPageRuns(pageId);
  }
  const runVisible = latestRunId ? state.pageRuns.some((run) => run.id === latestRunId) : false;
  if (latestRunId && runVisible) {
    state.selectedRunId = latestRunId;
    await loadRunDetail(latestRunId);
  } else if (state.pageRuns[0]) {
    state.selectedRunId = state.pageRuns[0].id;
    await loadRunDetail(state.selectedRunId);
  }
  state.infoMessage = latestRunId && !runVisible
    ? `Worker đã chạy job ${response.preview.jobName}, nhưng run mới chưa xuất hiện trong lịch sử.`
    : `Đã chạy ngay job ${response.preview.jobName}.`;
}

function setSelectedConnectedPage(page: ConnectedPage | null) {
  state.selectedConnectedPage = page;
  state.selectedConnectedPageId = page?.id ?? "";
  state.lastManualExecution = null;
  if (!page) {
    state.runningBusinessTimezone = DEFAULT_TIME_ZONE;
    state.runningAutoScraperEnabled = true;
    state.runningAutoAiAnalysisEnabled = false;
    state.runningIsActive = true;
    state.runningTagTypes = [];
    state.runningTagAssignments = [];
    state.runningTagCursor = "";
    state.runningOpeningRules = [];
    state.runningOpeningCursor = "";
    state.runningPromptText = buildDefaultPrompt("");
    state.runningActivePromptText = "";
    return;
  }

  state.runningBusinessTimezone = normalizeTimeZoneOrDefault(page.businessTimezone);
  state.runningAutoScraperEnabled = page.autoScraperEnabled;
  state.runningAutoAiAnalysisEnabled = page.autoAiAnalysisEnabled;
  state.runningIsActive = page.isActive;
  state.runningTagAssignments = parseTagAssignments(page.activeTagMappingJson, []);
  state.runningTagTypes = inferCustomTagTypes(state.runningTagAssignments);
  state.runningTagCursor = state.runningTagAssignments[0]?.id ?? "";
  state.runningOpeningRules = parseOpeningRuleDrafts(page.activeOpeningRulesJson);
  state.runningOpeningCursor = state.runningOpeningRules[0]?.id ?? "";
  state.runningPromptText = buildDefaultPrompt(page.pageName);
  state.runningActivePromptText = "";
}

function getSelectedPancakePage() {
  return state.listedPancakePages.find((page) => page.pageId === state.selectedPancakePageId) ?? null;
}

function getSelectedConnectedPage() {
  return state.selectedConnectedPage ?? state.connectedPages.find((page) => page.id === state.selectedConnectedPageId) ?? null;
}

function requireSelectedConnectedPageId() {
  return assertAndReturn(state.selectedConnectedPageId, "Cần chọn page đang chạy.");
}

function getScopedTagTypes(scope: ViewMode) {
  return scope === "setup" ? state.setupTagTypes : state.runningTagTypes;
}

function appendTagType(scope: ViewMode) {
  const next = createTagTypeDraft();
  if (scope === "setup") {
    state.setupTagTypes = [...state.setupTagTypes, next];
  } else {
    state.runningTagTypes = [...state.runningTagTypes, next];
  }
}

function removeTagType(scope: ViewMode, id: string) {
  const currentTypes = getScopedTagTypes(scope);
  const removed = currentTypes.find((item) => item.id === id);
  const nextTypes = currentTypes.filter((item) => item.id !== id);
  if (scope === "setup") {
    state.setupTagTypes = nextTypes;
    if (removed?.key) {
      state.setupTagAssignments = state.setupTagAssignments.map((assignment) =>
        resolveAssignmentTypeKey(assignment) === removed.key
          ? { ...assignment, typeKey: "", signalValue: "" }
          : assignment
      );
    }
  } else {
    state.runningTagTypes = nextTypes;
    if (removed?.key) {
      state.runningTagAssignments = state.runningTagAssignments.map((assignment) =>
        resolveAssignmentTypeKey(assignment) === removed.key
          ? { ...assignment, typeKey: "", signalValue: "" }
          : assignment
      );
    }
  }
}

function clearTagAssignment(scope: ViewMode, id: string) {
  const patch = (assignment: TagAssignment) => (
    assignment.id === id
      ? {
          ...assignment,
          typeKey: "",
          signalValue: assignment.tagText.trim()
        }
      : assignment
  );
  if (scope === "setup") {
    state.setupTagAssignments = state.setupTagAssignments.map(patch);
  } else {
    state.runningTagAssignments = state.runningTagAssignments.map(patch);
  }
}

function fillTagSignalFromText(scope: ViewMode) {
  const patch = (assignment: TagAssignment) => {
    if (!resolveAssignmentTypeKey(assignment)) {
      return assignment;
    }
    if (assignment.signalValue.trim()) {
      return assignment;
    }
    return {
      ...assignment,
      signalValue: assignment.tagText.trim()
    };
  };
  if (scope === "setup") {
    state.setupTagAssignments = sortTagAssignments(state.setupTagAssignments.map(patch));
  } else {
    state.runningTagAssignments = sortTagAssignments(state.runningTagAssignments.map(patch));
  }
}

function appendOpeningRule(scope: ViewMode, phrase = "") {
  const next = createOpeningRuleDraft(phrase);
  if (scope === "setup") {
    state.setupOpeningRules = [next, ...state.setupOpeningRules];
    state.setupOpeningCursor = next.id;
  } else {
    state.runningOpeningRules = [next, ...state.runningOpeningRules];
    state.runningOpeningCursor = next.id;
  }
}

function seedOpeningRuleFromWindow(scope: ViewMode, signatureRaw: string) {
  const parsed = safeParseJson(signatureRaw);
  const phrases = asStringArray(parsed);
  if (phrases.length === 0) {
    return;
  }
  const next = createOpeningRuleDraft(phrases[0], {
    name: compactText(phrases.join(" / "), 60),
    phrases
  });
  if (scope === "setup") {
    state.setupOpeningRules = [next, ...state.setupOpeningRules];
    state.setupOpeningCursor = next.id;
  } else {
    state.runningOpeningRules = [next, ...state.runningOpeningRules];
    state.runningOpeningCursor = next.id;
  }
}

function removeOpeningRule(scope: ViewMode, id: string) {
  if (scope === "setup") {
    state.setupOpeningRules = state.setupOpeningRules.filter((item) => item.id !== id);
    normalizeEditorCursor("setup", "opening", state.setupOpeningRules.map((item) => item.id));
  } else {
    state.runningOpeningRules = state.runningOpeningRules.filter((item) => item.id !== id);
    normalizeEditorCursor("running", "opening", state.runningOpeningRules.map((item) => item.id));
  }
}

function parseTagAssignments(source: unknown, candidates: TagCandidate[]) {
  const byText = new Map<string, TagAssignment>();
  for (const candidate of candidates) {
    const tagText = candidate.text.trim();
    if (tagText) {
      byText.set(tagText, createTagAssignment({ tagText, count: candidate.count }));
    }
  }

  for (const rule of asArray(source)) {
    const record = isRecord(rule) ? rule : null;
    const matchAnyText = record ? asStringArray(record.match_any_text) : [];
    const signals = record && isRecord(record.signals) ? record.signals : null;
    if (!signals) {
      continue;
    }
    const signalEntries = Object.entries(signals);
    if (signalEntries.length !== 1) {
      continue;
    }
    const [typeKey, rawValue] = signalEntries[0];
    const rawSignal = typeof rawValue === "string" ? rawValue.trim() : String(rawValue).trim();
    for (const tagText of matchAnyText) {
      const signalValue = rawSignal === slugifySignalValue(tagText) ? tagText : rawSignal;
      byText.set(tagText, createTagAssignment({
        tagText,
        count: byText.get(tagText)?.count ?? 0,
        typeKey,
        signalValue
      }));
    }
  }

  return sortTagAssignments([...byText.values()]);
}

function mergeSampleTagAssignments(existing: TagAssignment[], candidates: TagCandidate[]) {
  const byText = new Map<string, TagAssignment>();
  for (const item of existing) {
    byText.set(item.tagText, { ...item });
  }
  for (const candidate of candidates) {
    const current = byText.get(candidate.text);
    if (current) {
      current.count = candidate.count;
    } else {
      byText.set(candidate.text, createTagAssignment({
        tagText: candidate.text,
        count: candidate.count
      }));
    }
  }
  return sortTagAssignments([...byText.values()]);
}

function createTagAssignment(overrides: Partial<TagAssignment> = {}): TagAssignment {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    tagText: overrides.tagText ?? "",
    count: overrides.count ?? 0,
    typeKey: overrides.typeKey ?? "",
    signalValue: overrides.signalValue ?? (overrides.tagText ?? "").trim()
  };
}

function sortTagAssignments(assignments: TagAssignment[]) {
  return [...assignments].sort((left, right) => {
    const leftPriority = resolveAssignmentTypeKey(left) ? 0 : 1;
    const rightPriority = resolveAssignmentTypeKey(right) ? 0 : 1;
    return leftPriority - rightPriority || right.count - left.count || left.tagText.localeCompare(right.tagText, "vi");
  });
}

function compileTagRules(assignments: TagAssignment[]) {
  const groups = new Map<string, { typeKey: string; signalValue: string; texts: string[] }>();
  for (const assignment of assignments) {
    const tagText = assignment.tagText.trim();
    const typeKey = resolveAssignmentTypeKey(assignment);
    const signalValue = assignment.signalValue.trim();
    if (!tagText || !typeKey || !signalValue) {
      continue;
    }
    const key = `${typeKey}::${signalValue}`;
    const current = groups.get(key) ?? { typeKey, signalValue, texts: [] };
    if (!current.texts.includes(tagText)) {
      current.texts.push(tagText);
    }
    groups.set(key, current);
  }
  return [...groups.values()].map((group) => ({
    name: `${group.typeKey}:${group.signalValue}`,
    matchAnyText: group.texts,
    signals: {
      [group.typeKey]: group.signalValue
    }
  }));
}

function resolveAssignmentTypeKey(assignment: TagAssignment) {
  return assignment.typeKey.trim();
}

function createTagTypeDraft(overrides: Partial<TagTypeDraft> = {}): TagTypeDraft {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    key: overrides.key ?? "",
    label: overrides.label ?? ""
  };
}

function inferCustomTagTypes(assignments: TagAssignment[], existing: TagTypeDraft[] = []) {
  const builtInKeys = new Set(BUILTIN_TAG_TYPE_OPTIONS.map((item) => item.value));
  const byKey = new Map(existing.map((item) => [item.key, { ...item }]));
  for (const assignment of assignments) {
    const typeKey = resolveAssignmentTypeKey(assignment);
    if (!typeKey || builtInKeys.has(typeKey)) {
      continue;
    }
    const current = byKey.get(typeKey);
    byKey.set(typeKey, current ?? createTagTypeDraft({
      key: typeKey,
      label: prettifyTypeKey(typeKey)
    }));
  }
  return [...byKey.values()].sort((left, right) => left.label.localeCompare(right.label, "vi"));
}

function syncTagTypes(scope: ViewMode, existingTypes: TagTypeDraft[], existingAssignments: TagAssignment[]) {
  const editor = document.querySelector<HTMLElement>(`#${scope}-tag-type-editor`);
  if (!editor) {
    return {
      types: existingTypes,
      assignments: existingAssignments
    };
  }
  const byId = new Map(existingTypes.map((item) => [item.id, { ...item }]));
  const nextTypes: TagTypeDraft[] = [];
  const keyChanges = new Map<string, string>();
  const removedKeys = new Set(existingTypes.map((item) => item.key).filter(Boolean));

  for (const row of editor.querySelectorAll<HTMLElement>("[data-tag-type-row]")) {
    const id = row.dataset.id ?? "";
    const current = byId.get(id) ?? createTagTypeDraft({ id });
    const label = getElementValue(row, "[data-field='label']", current.label).trim();
    const rawKey = getElementValue(row, "[data-field='key']", current.key).trim();
    const key = slugifyTypeKey(rawKey || label);
    if (!label && !key) {
      continue;
    }
    if (current.key && current.key !== key) {
      keyChanges.set(current.key, key);
    }
    if (current.key) {
      removedKeys.delete(current.key);
    }
    nextTypes.push({
      ...current,
      label: label || prettifyTypeKey(key),
      key
    });
  }

  const dedupedTypes = dedupeTagTypes(nextTypes);
  const patchedAssignments = sortTagAssignments(existingAssignments.map((assignment) => {
    const currentType = resolveAssignmentTypeKey(assignment);
    if (removedKeys.has(currentType)) {
      return {
        ...assignment,
        typeKey: "",
        signalValue: ""
      };
    }
    const nextType = keyChanges.get(currentType);
    if (nextType) {
      return {
        ...assignment,
        typeKey: nextType
      };
    }
    return assignment;
  }));

  return {
    types: dedupedTypes,
    assignments: patchedAssignments
  };
}

function dedupeTagTypes(types: TagTypeDraft[]) {
  const seen = new Set<string>();
  const next: TagTypeDraft[] = [];
  for (const item of types) {
    if (!item.key || seen.has(item.key)) {
      continue;
    }
    seen.add(item.key);
    next.push(item);
  }
  return next.sort((left, right) => left.label.localeCompare(right.label, "vi"));
}

function readTagTypeLabel(scope: ViewMode, typeKey: string) {
  if (!typeKey) {
    return "Chưa gán";
  }
  const builtIn = BUILTIN_TAG_TYPE_OPTIONS.find((item) => item.value === typeKey);
  if (builtIn) {
    return builtIn.label;
  }
  return getScopedTagTypes(scope).find((item) => item.key === typeKey)?.label ?? prettifyTypeKey(typeKey);
}

function parseOpeningRuleDrafts(source: unknown) {
  return asArray(source)
    .map((item) => {
      const record = isRecord(item) ? item : null;
      const name = record && typeof record.name === "string" ? record.name.trim() : "";
      const phrases = record
        ? asStringArray(
            Array.isArray(record.match_all_text) && record.match_all_text.length > 0
              ? record.match_all_text
              : record.match_any_text
          )
        : [];
      return name || phrases.length > 0 ? createOpeningRuleDraft(phrases[0] ?? "", { name, phrases }) : null;
    })
    .filter((item): item is OpeningRuleDraft => Boolean(item));
}

function createOpeningRuleDraft(seedPhrase = "", overrides: Partial<OpeningRuleDraft> = {}): OpeningRuleDraft {
  const fallbackName = seedPhrase.trim() ? compactText(seedPhrase.trim(), 60) : "opening block";
  return {
    id: overrides.id ?? crypto.randomUUID(),
    name: overrides.name ?? fallbackName,
    phrases: overrides.phrases ?? (seedPhrase ? [seedPhrase] : [])
  };
}

function compileOpeningRules(drafts: OpeningRuleDraft[]) {
  return drafts
    .map((draft) => ({
      name: draft.name.trim(),
      matchAllText: uniqueStrings(draft.phrases.map((item) => item.trim()).filter(Boolean)),
      signals: {
        opening_block_label: draft.name.trim()
      }
    }))
    .filter((draft) => draft.name && draft.matchAllText.length > 0);
}

function syncTagAssignments(scope: ViewMode, existing: TagAssignment[]) {
  const editor = document.querySelector<HTMLElement>(`#${scope}-tag-editor`);
  if (!editor) {
    return existing;
  }
  const byId = new Map(existing.map((item) => [item.id, { ...item }]));
  for (const row of editor.querySelectorAll<HTMLElement>("[data-tag-row]")) {
    const id = row.dataset.id ?? "";
    const current = byId.get(id);
    if (!current) {
      continue;
    }
    current.tagText = row.dataset.tagText ?? current.tagText;
    current.typeKey = getElementValue(row, "[data-field='type-key']", current.typeKey);
    current.signalValue = getElementValue(row, "[data-field='signal-value']", current.signalValue).trim();
  }
  return sortTagAssignments([...byId.values()]);
}

function syncOpeningRules(scope: ViewMode, existing: OpeningRuleDraft[]) {
  const editor = document.querySelector<HTMLElement>(`#${scope}-opening-editor`);
  if (!editor) {
    return existing;
  }
  const byId = new Map(existing.map((item) => [item.id, { ...item }]));
  for (const row of editor.querySelectorAll<HTMLElement>("[data-opening-row]")) {
    const id = row.dataset.id ?? "";
    const current = byId.get(id);
    if (!current) {
      continue;
    }
    current.name = getElementValue(row, "[data-field='name']", current.name).trim();
    current.phrases = uniqueStrings(splitLines(getElementValue(row, "[data-field='phrases']", current.phrases.join("\n"))));
  }
  return [...byId.values()];
}

async function requestJson<T>(method: "GET" | "POST" | "PATCH", path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${normalizeBaseUrl(state.apiBaseUrl)}${path}`, {
    method,
    headers: {
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const raw = await response.text();
  const parsed = raw ? safeParseJson(raw) : null;
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}\n${formatJson(parsed)}`);
  }
  return parsed as T;
}

function renderMetricCard(label: string, value: string, hint: string) {
  return `
    <article class="metric-card">
      <span class="metric-label">${escapeHtml(label)}</span>
      <strong class="metric-value">${escapeHtml(value)}</strong>
      <span class="metric-hint">${escapeHtml(hint)}</span>
    </article>
  `;
}

function renderPancakePageOptions() {
  if (state.listedPancakePages.length === 0) {
    return `<option value="">chưa có page từ token</option>`;
  }
  return state.listedPancakePages
    .map((page) => `<option value="${escapeAttribute(page.pageId)}" ${page.pageId === state.selectedPancakePageId ? "selected" : ""}>${escapeHtml(page.pageName)}</option>`)
    .join("");
}

function renderConnectedPageOptions() {
  if (state.connectedPages.length === 0) {
    return `<option value="">chưa có page trong DB</option>`;
  }
  return state.connectedPages
    .map((page) => `<option value="${escapeAttribute(page.id)}" ${page.id === state.selectedConnectedPageId ? "selected" : ""}>${escapeHtml(page.pageName)} (${escapeHtml(page.businessTimezone)})</option>`)
    .join("");
}

function renderRunOptions() {
  if (state.pageRuns.length === 0) {
    return `<option value="">chưa có run</option>`;
  }
  return state.pageRuns
    .map((run) => `<option value="${escapeAttribute(run.id)}" ${run.id === state.selectedRunId ? "selected" : ""}>${escapeHtml(formatRunLabel(run))}</option>`)
    .join("");
}

function renderProcessingModeOptions(selected: ProcessingMode) {
  return (["etl_only", "etl_and_ai"] as const)
    .map((value) => `<option value="${value}" ${value === selected ? "selected" : ""}>${value === "etl_only" ? "Chỉ trích xuất" : "Trích xuất và phân tích"}</option>`)
    .join("");
}

function renderCustomRunModeOptions() {
  return ([
    { value: "full_day", label: "Trọn ngày" },
    { value: "custom_range", label: "Khoảng tuỳ chọn" }
  ] as const)
    .map((item) => `<option value="${item.value}" ${item.value === state.customRunMode ? "selected" : ""}>${item.label}</option>`)
    .join("");
}

function renderTagTypeOptions(scope: ViewMode, selected: string) {
  return [
    { value: "", label: "Chưa gán" },
    ...BUILTIN_TAG_TYPE_OPTIONS,
    ...getScopedTagTypes(scope).map((item) => ({
      value: item.key,
      label: item.label
    }))
  ]
    .map((item) => `<option value="${item.value}" ${item.value === selected ? "selected" : ""}>${escapeHtml(item.label)}</option>`)
    .join("");
}

function renderTimeZoneOptions(selected: string) {
  const normalized = normalizeTimeZoneOrDefault(selected);
  const options = timeZoneOptions.some((item) => item.value === normalized)
    ? timeZoneOptions
    : [{ value: normalized, label: formatTimeZoneOptionLabel(normalized) }, ...timeZoneOptions];
  return options
    .map((option) => `<option value="${escapeAttribute(option.value)}" ${option.value === normalized ? "selected" : ""}>${escapeHtml(option.label)}</option>`)
    .join("");
}

function parseEditorTab(value: string | undefined): EditorTab {
  if (value === "opening" || value === "prompt") {
    return value;
  }
  return "tags";
}

function buildSetupOnboardingState(sample: SetupSample) {
  return {
    latestRuntimeSampleTargetDate: sample.targetDate,
    latestRuntimeSampleWindowStartAt: sample.windowStartAt,
    latestRuntimeSampleWindowEndExclusiveAt: sample.windowEndExclusiveAt,
    generatedAt: new Date().toISOString(),
    status: "ready",
    tagCandidates: sample.tagCandidates,
    openingCandidates: sample.openingCandidates
  };
}

function buildDefaultPrompt(pageName: string) {
  return DEFAULT_PROMPT.replace("{{page_name}}", pageName || "page cần phân tích");
}

function formatSampleWindow(sample: SetupSample) {
  return `${formatIsoDateTime(sample.windowStartAt)} -> ${formatIsoDateTime(sample.windowEndExclusiveAt)}`;
}

function formatRunLabel(run: RunSummary) {
  return `${run.targetDate} · ${run.runMode} · ${run.processingMode} · ${run.status}`;
}

function shortRunLabel(run: RunSummary) {
  return `${run.targetDate} · ${run.processingMode} · ${run.status}`;
}

function readStatusLabel() {
  if (state.errorMessage) {
    return "có lỗi";
  }
  if (state.loadingKey) {
    return state.loadingKey === "execute-custom-run" ? "worker đang chạy" : "đang xử lý";
  }
  if (state.lastManualExecution) {
    return state.lastManualExecution.ok ? "đã chạy xong" : "worker lỗi";
  }
  return "sẵn sàng";
}

function readStatusHint() {
  if (state.loadingKey === "execute-custom-run") {
    return "đang chờ worker hoàn tất";
  }
  if (state.loadingKey) {
    return `đang xử lý ${state.loadingKey}`;
  }
  if (state.lastManualExecution) {
    return state.lastManualExecution.ok
      ? `job ${state.lastManualExecution.jobName}`
      : `job ${state.lastManualExecution.jobName} bị lỗi`;
  }
  return state.lastUpdatedAt ?? "chưa có cập nhật";
}

function readMetric(metrics: Record<string, unknown>, key: string) {
  const value = metrics[key];
  return typeof value === "number" || typeof value === "string" ? String(value) : "-";
}

function formatCandidateNames(values: string[]) {
  return values.slice(0, 3).join(", ") || "chưa có";
}

function formatIsoDateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("vi-VN");
}

function appendOptionalInt(target: Record<string, JsonValue>, key: string, raw: string) {
  if (!raw.trim()) {
    return;
  }
  target[key] = readNonNegativeInt(raw, `${key} phải là số nguyên không âm.`);
}

function extractRunId(stdout: string) {
  const match = stdout.match(/etl_run_id=([0-9a-fA-F-]{36})/);
  return match?.[1] ?? null;
}

async function waitForRunToAppear(pageId: string, runId: string) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await loadPageRuns(pageId);
    if (state.pageRuns.some((run) => run.id === runId)) {
      return;
    }
    await sleep(400);
  }
}

function buildManualExecutionError(execution: ManualExecutionSummary) {
  const summary = readExecutionSummary(execution);
  return `Worker chạy lỗi cho job ${execution.jobName}.${summary ? ` ${summary}` : ""}`.trim();
}

function readExecutionSummary(execution: ManualExecutionSummary) {
  const detail = execution.stderr || execution.stdout;
  return detail ? compactText(detail, 180) : "Không có log trả về.";
}

function toIsoStringFromLocalInput(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Datetime không hợp lệ.");
  }
  return date.toISOString();
}

function extractPancakePages(payload: unknown) {
  const items = Array.isArray(payload) ? payload : isRecord(payload) && Array.isArray(payload.pages) ? payload.pages : [];
  return items.flatMap((item) => {
    if (!isRecord(item)) {
      return [];
    }
    const pageId = typeof item.pageId === "string" ? item.pageId : typeof item.id === "string" ? item.id : null;
    const pageName = typeof item.pageName === "string" ? item.pageName : typeof item.name === "string" ? item.name : null;
    return pageId && pageName ? [{ pageId, pageName }] : [];
  });
}

function normalizeBaseUrl(value: string) {
  return value.trim().replace(/\/+$/, "") || "http://localhost:3000";
}

function normalizeTimeZoneOrDefault(value: string) {
  return normalizeTimeZone(value) ?? DEFAULT_TIME_ZONE;
}

function normalizeTimeZone(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const remapped = trimmed === "Asia/Saigon" ? DEFAULT_TIME_ZONE : trimmed === "Etc/UTC" ? "UTC" : trimmed;
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: remapped }).resolvedOptions().timeZone;
  } catch {
    return null;
  }
}

function buildTimeZoneOptions(): TimeZoneOption[] {
  const discoveredZones = typeof intlWithSupportedValuesOf.supportedValuesOf === "function" ? intlWithSupportedValuesOf.supportedValuesOf("timeZone") : [];
  const preferred = uniqueStrings(PREFERRED_TIME_ZONES.map((value) => normalizeTimeZoneOrDefault(value)));
  const discovered = uniqueStrings(discoveredZones.map((value) => normalizeTimeZone(value)).filter((value): value is string => Boolean(value)));
  const preferredSet = new Set(preferred);
  const rest = discovered.filter((value) => !preferredSet.has(value)).sort((left, right) => left.localeCompare(right, "en"));
  return [...preferred, ...rest].map((value) => ({
    value,
    label: formatTimeZoneOptionLabel(value)
  }));
}

function formatTimeZoneOptionLabel(value: string) {
  return `${readTimeZoneOffsetLabel(value)} · ${value}`;
}

function readTimeZoneOffsetLabel(timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "shortOffset",
    hour: "2-digit",
    minute: "2-digit"
  }).formatToParts(new Date());
  const token = parts.find((part) => part.type === "timeZoneName")?.value ?? "GMT";
  if (token === "GMT" || token === "UTC") {
    return "UTC+00:00";
  }
  const match = /^GMT([+-])(\d{1,2})(?::?(\d{2}))?$/.exec(token);
  if (!match) {
    return token.replace("GMT", "UTC");
  }
  const [, sign, rawHours, rawMinutes] = match;
  return `UTC${sign}${rawHours.padStart(2, "0")}:${(rawMinutes ?? "00").padStart(2, "0")}`;
}

function todayInputValue() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  const local = new Date(now.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 10);
}

function prettifyTypeKey(value: string) {
  return value
    .split(/[_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function slugifyTypeKey(value: string) {
  return slugifySignalValue(value);
}

function slugifySignalValue(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replaceAll(/[^\w\s-]/g, "")
    .trim()
    .replaceAll(/[\s_-]+/g, "_");
}

function splitLines(value: string) {
  return value
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function uniqueStrings(values: readonly string[]) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (!value || seen.has(value)) {
      continue;
    }
    seen.add(value);
    result.push(value);
  }
  return result;
}

function compactText(value: string, limit: number) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length <= limit ? normalized : `${normalized.slice(0, limit)}...`;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function asArray(value: unknown): Array<any> {
  return Array.isArray(value) ? value : [];
}

function asStringArray(value: unknown) {
  return asArray(value)
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

function getElementValue(container: ParentNode, selector: string, fallback: string) {
  const element = container.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(selector);
  return element?.value ?? fallback;
}

function getInputValue(selector: string, fallback: string) {
  const element = document.querySelector<HTMLInputElement>(selector);
  return element?.value ?? fallback;
}

function getTextareaValue(selector: string, fallback: string) {
  const element = document.querySelector<HTMLTextAreaElement>(selector);
  return element?.value ?? fallback;
}

function getSelectValue(selector: string, fallback: string) {
  const element = document.querySelector<HTMLSelectElement>(selector);
  return element?.value ?? fallback;
}

function getCheckboxValue(selector: string, fallback: boolean) {
  const element = document.querySelector<HTMLInputElement>(selector);
  return element?.checked ?? fallback;
}

function readPositiveInt(raw: string, errorMessage: string) {
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(errorMessage);
  }
  return value;
}

function readNonNegativeInt(raw: string, errorMessage: string) {
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(errorMessage);
  }
  return value;
}

function requireDate(value: string, errorMessage: string) {
  return assertAndReturn(value, errorMessage);
}

function assertNonEmpty(value: string, errorMessage: string) {
  if (!value.trim()) {
    throw new Error(errorMessage);
  }
}

function assertAndReturn(value: string, errorMessage: string) {
  assertNonEmpty(value, errorMessage);
  return value.trim();
}

function safeParseJson(raw: string) {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
}

function formatJson(value: unknown) {
  if (value === null || value === undefined) {
    return "Không có dữ liệu.";
  }
  if (typeof value === "string") {
    return value;
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function isConnectedPage(value: unknown): value is ConnectedPage {
  return isRecord(value)
    && typeof value.id === "string"
    && typeof value.pancakePageId === "string"
    && typeof value.pageName === "string"
    && typeof value.businessTimezone === "string"
    && typeof value.autoScraperEnabled === "boolean"
    && typeof value.autoAiAnalysisEnabled === "boolean"
    && typeof value.isActive === "boolean";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttribute(value: string) {
  return escapeHtml(value);
}
