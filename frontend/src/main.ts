const rootElement = document.querySelector<HTMLDivElement>("#app");

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
type ProcessingMode = "etl_only" | "etl_and_ai";
type ManualRunMode = "backfill_day" | "manual_range";

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
  activeBotSignaturesJson: JsonValue | null;
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

type AppState = {
  apiBaseUrl: string;
  loadingKey: string | null;
  errorMessage: string | null;
  lastUpdatedAt: string | null;
  tokenInput: string;
  listedPancakePages: PancakePage[];
  selectedPancakePageId: string;
  listPagesResponse: unknown;
  connectedPages: ConnectedPage[];
  selectedConnectedPageId: string;
  selectedConnectedPage: ConnectedPage | null;
  connectedPagesResponse: unknown;
  connectedPageResponse: unknown;
  registerBusinessTimezone: string;
  registerAutoScraperEnabled: boolean;
  registerAutoAiAnalysisEnabled: boolean;
  registerResponse: unknown;
  patchBusinessTimezone: string;
  patchAutoScraperEnabled: boolean;
  patchAutoAiAnalysisEnabled: boolean;
  patchIsActive: boolean;
  tagMappingDraft: string;
  openingRulesDraft: string;
  botSignaturesDraft: string;
  patchResponse: unknown;
  onboardingTargetDate: string;
  onboardingInitialConversationLimit: string;
  onboardingProcessingMode: ProcessingMode;
  onboardingWriteArtifacts: boolean;
  onboardingPreviewResponse: unknown;
  onboardingExecuteResponse: unknown;
  promptsResponse: unknown;
  promptsData: PromptListResponse | null;
  promptTextDraft: string;
  promptNotesDraft: string;
  cloneSourcePageId: string;
  activatePromptVersionId: string;
  promptCreateResponse: unknown;
  promptCloneResponse: unknown;
  promptActivateResponse: unknown;
  manualJobName: string;
  manualProcessingMode: ProcessingMode;
  manualRunMode: ManualRunMode;
  manualTargetDate: string;
  manualWindowStart: string;
  manualWindowEnd: string;
  manualPublish: boolean;
  manualSnapshotVersion: string;
  manualMaxConversations: string;
  manualMaxMessagePagesPerConversation: string;
  manualWriteArtifacts: boolean;
  manualPreviewResponse: unknown;
  manualExecuteResponse: unknown;
  schedulerJobName: string;
  schedulerTargetDate: string;
  schedulerProcessingMode: ProcessingMode;
  schedulerIsPublished: boolean;
  schedulerSnapshotVersion: string;
  schedulerMaxConversations: string;
  schedulerMaxMessagePagesPerConversation: string;
  schedulerPreviewResponse: unknown;
  schedulerExecuteResponse: unknown;
  healthResponse: unknown;
  runId: string;
  runResponse: unknown;
};

const state: AppState = {
  apiBaseUrl: "http://localhost:3000",
  loadingKey: null,
  errorMessage: null,
  lastUpdatedAt: null,
  tokenInput: "",
  listedPancakePages: [],
  selectedPancakePageId: "",
  listPagesResponse: null,
  connectedPages: [],
  selectedConnectedPageId: "",
  selectedConnectedPage: null,
  connectedPagesResponse: null,
  connectedPageResponse: null,
  registerBusinessTimezone: "Asia/Ho_Chi_Minh",
  registerAutoScraperEnabled: false,
  registerAutoAiAnalysisEnabled: false,
  registerResponse: null,
  patchBusinessTimezone: "Asia/Ho_Chi_Minh",
  patchAutoScraperEnabled: false,
  patchAutoAiAnalysisEnabled: false,
  patchIsActive: true,
  tagMappingDraft: "[]",
  openingRulesDraft: "[]",
  botSignaturesDraft: "[]",
  patchResponse: null,
  onboardingTargetDate: todayInputValue(),
  onboardingInitialConversationLimit: "25",
  onboardingProcessingMode: "etl_only",
  onboardingWriteArtifacts: true,
  onboardingPreviewResponse: null,
  onboardingExecuteResponse: null,
  promptsResponse: null,
  promptsData: null,
  promptTextDraft: "",
  promptNotesDraft: "",
  cloneSourcePageId: "",
  activatePromptVersionId: "",
  promptCreateResponse: null,
  promptCloneResponse: null,
  promptActivateResponse: null,
  manualJobName: "manual-run",
  manualProcessingMode: "etl_only",
  manualRunMode: "backfill_day",
  manualTargetDate: todayInputValue(),
  manualWindowStart: "",
  manualWindowEnd: "",
  manualPublish: false,
  manualSnapshotVersion: "",
  manualMaxConversations: "",
  manualMaxMessagePagesPerConversation: "",
  manualWriteArtifacts: true,
  manualPreviewResponse: null,
  manualExecuteResponse: null,
  schedulerJobName: "scheduler-preview",
  schedulerTargetDate: todayInputValue(),
  schedulerProcessingMode: "etl_only",
  schedulerIsPublished: false,
  schedulerSnapshotVersion: "",
  schedulerMaxConversations: "",
  schedulerMaxMessagePagesPerConversation: "",
  schedulerPreviewResponse: null,
  schedulerExecuteResponse: null,
  healthResponse: null,
  runId: "",
  runResponse: null
};

if (!rootElement) {
  throw new Error("Missing #app root element.");
}

const root = rootElement;

root.addEventListener("click", onRootClick);
root.addEventListener("change", onRootChange);

render();

function render() {
  const selectedPage = getSelectedConnectedPage();
  const promptCount = state.promptsData?.prompts.length ?? 0;

  root.innerHTML = `
    <div class="shell">
      <header class="topbar">
        <div class="title-block">
          <p class="eyebrow">chat-analyzer-v2</p>
          <h1>Pancake control-plane tối giản</h1>
          <p class="subtitle">
            Frontend chỉ gọi HTTP API. Sau khi register, dữ liệu page đang vận hành luôn đọc lại từ backend.
          </p>
        </div>
        <div class="quickbar">
          <label class="field">
            <span>Backend API</span>
            <input id="api-base-url" type="text" value="${escapeAttribute(state.apiBaseUrl)}" placeholder="http://localhost:3000" />
          </label>
          <button class="button" data-action="save-api-base">Lưu endpoint</button>
          <button class="button" data-action="load-connected-pages">Tải page đã đăng ký</button>
          <button class="button" data-action="load-health">Health</button>
        </div>
      </header>

      <section class="metric-strip">
        ${renderMetricCard("Page đang chọn", selectedPage?.pageName ?? "chưa có", selectedPage ? selectedPage.businessTimezone : "Chọn page từ danh sách control-plane")}
        ${renderMetricCard("Pancake page", getSelectedPancakePage()?.pageName ?? "chưa chọn", "List từ token để register")}
        ${renderMetricCard("Prompt active", selectedPage?.activePromptVersionId ?? "chưa active", `${promptCount} version đang tải`)}
        ${renderMetricCard("Auto", selectedPage ? `${selectedPage.autoScraperEnabled ? "Scraper on" : "Scraper off"} / ${selectedPage.autoAiAnalysisEnabled ? "AI on" : "AI off"}` : "chưa có", selectedPage?.isActive ? "Page đang active" : "Page đang tắt")}
        ${renderMetricCard("Health", readHealthLabel(), state.loadingKey ? `đang chạy ${state.loadingKey}` : "sẵn sàng")}
        ${renderMetricCard("Cập nhật cuối", state.lastUpdatedAt ?? "chưa có", state.errorMessage ? "Có lỗi ở panel dưới" : "Không giữ state config lâu dài")}
      </section>

      <main class="workspace">
        <section class="sidebar">
          ${renderPancakePanel()}
          ${renderConnectedPagesPanel(selectedPage)}
          ${renderPageConfigPanel(selectedPage)}
          ${renderOnboardingPanel(selectedPage)}
          ${renderPromptPanel(selectedPage)}
          ${renderManualRunPanel(selectedPage)}
          ${renderSchedulerPanel()}
          ${renderAuditPanel()}
        </section>

        <section class="content">
          <section class="panel summary-panel">
            <div class="panel-header">
              <div>
                <p class="panel-kicker">Canonical page</p>
                <h2>Tóm tắt page hiện hành</h2>
              </div>
              <button class="button" data-action="load-connected-page">Reload page</button>
            </div>
            ${state.errorMessage ? `<div class="error-box">${escapeHtml(state.errorMessage)}</div>` : ""}
            ${renderSelectedPageSummary(selectedPage)}
          </section>

          <section class="response-grid">
            ${renderResponsePanel("Health", state.healthResponse)}
            ${renderResponsePanel("Pancake pages", state.listPagesResponse)}
            ${renderResponsePanel("Connected pages", state.connectedPagesResponse)}
            ${renderResponsePanel("Connected page detail", state.connectedPageResponse)}
            ${renderResponsePanel("Register / patch", { register: state.registerResponse, patch: state.patchResponse })}
            ${renderResponsePanel("Onboarding", { preview: state.onboardingPreviewResponse, execute: state.onboardingExecuteResponse })}
            ${renderResponsePanel("Prompts", { list: state.promptsResponse, create: state.promptCreateResponse, clone: state.promptCloneResponse, activate: state.promptActivateResponse })}
            ${renderResponsePanel("Jobs", { manualPreview: state.manualPreviewResponse, manualExecute: state.manualExecuteResponse, schedulerPreview: state.schedulerPreviewResponse, schedulerExecute: state.schedulerExecuteResponse, run: state.runResponse })}
          </section>
        </section>
      </main>
    </div>
  `;
}

async function onRootClick(event: Event) {
  const button = (event.target as HTMLElement).closest<HTMLElement>("[data-action]");
  if (!button) {
    return;
  }

  const action = button.dataset.action;
  if (!action) {
    return;
  }

  switch (action) {
    case "save-api-base":
      syncAllForms();
      state.apiBaseUrl = normalizeBaseUrl(state.apiBaseUrl);
      state.errorMessage = null;
      render();
      return;
    case "list-pages":
      return void runAction("list-pages", async () => {
        assertNonEmpty(state.tokenInput, "Cần nhập user access token.");
        const data = await requestJson("POST", "/chat-extractor/pages/list-from-token", { userAccessToken: state.tokenInput });
        state.listPagesResponse = data;
        state.listedPancakePages = extractPancakePages(data);
        state.selectedPancakePageId = state.listedPancakePages.find((page) => page.pageId === state.selectedPancakePageId)?.pageId ?? state.listedPancakePages[0]?.pageId ?? "";
      });
    case "load-connected-pages":
      return void runAction("load-pages", async () => {
        await refreshConnectedPages(state.selectedConnectedPageId);
      });
    case "load-connected-page":
      return void runAction("load-page", async () => {
        await refreshSelectedConnectedPage(requireSelectedConnectedPageId());
      });
    case "register-page":
      return void runAction("register", async () => {
        assertNonEmpty(state.tokenInput, "Cần nhập user access token.");
        assertNonEmpty(state.selectedPancakePageId, "Cần chọn page từ Pancake.");
        const response = await requestJson<{ page: ConnectedPage }>("POST", "/chat-extractor/control-center/pages/register", {
          pancakePageId: state.selectedPancakePageId,
          userAccessToken: state.tokenInput,
          businessTimezone: state.registerBusinessTimezone.trim() || "Asia/Ho_Chi_Minh",
          autoScraperEnabled: state.registerAutoScraperEnabled,
          autoAiAnalysisEnabled: state.registerAutoAiAnalysisEnabled
        });
        state.registerResponse = response;
        await refreshConnectedPages(response.page.id);
        await refreshSelectedConnectedPage(response.page.id);
      });
    case "save-page-config":
      return void runAction("patch-page", async () => {
        const pageId = requireSelectedConnectedPageId();
        const response = await requestJson<{ page: ConnectedPage }>("PATCH", `/chat-extractor/control-center/pages/${encodeURIComponent(pageId)}`, {
          businessTimezone: state.patchBusinessTimezone.trim() || "Asia/Ho_Chi_Minh",
          autoScraperEnabled: state.patchAutoScraperEnabled,
          autoAiAnalysisEnabled: state.patchAutoAiAnalysisEnabled,
          activeTagMappingJson: parseJsonDraft("Tag mapping", state.tagMappingDraft),
          activeOpeningRulesJson: parseJsonDraft("Opening rules", state.openingRulesDraft),
          activeBotSignaturesJson: parseJsonDraft("Bot signatures", state.botSignaturesDraft),
          isActive: state.patchIsActive
        });
        state.patchResponse = response;
        await refreshConnectedPages(pageId);
        await refreshSelectedConnectedPage(pageId);
      });
    case "preview-onboarding":
      return void runAction("preview-onboarding", async () => {
        const pageId = requireSelectedConnectedPageId();
        state.onboardingPreviewResponse = await requestJson("POST", `/chat-extractor/control-center/pages/${encodeURIComponent(pageId)}/onboarding/preview`, buildOnboardingPayload());
      });
    case "execute-onboarding":
      return void runAction("execute-onboarding", async () => {
        const pageId = requireSelectedConnectedPageId();
        state.onboardingExecuteResponse = await requestJson("POST", `/chat-extractor/control-center/pages/${encodeURIComponent(pageId)}/onboarding/execute`, {
          ...buildOnboardingPayload(),
          writeArtifacts: state.onboardingWriteArtifacts
        });
        await refreshSelectedConnectedPage(pageId);
      });
    case "load-prompts":
      return void runAction("load-prompts", async () => {
        await loadPrompts(requireSelectedConnectedPageId());
      });
    case "create-prompt":
      return void runAction("create-prompt", async () => {
        const pageId = requireSelectedConnectedPageId();
        assertNonEmpty(state.promptTextDraft, "Cần nhập prompt text.");
        state.promptCreateResponse = await requestJson("POST", `/chat-extractor/control-center/pages/${encodeURIComponent(pageId)}/prompts`, {
          promptText: state.promptTextDraft,
          notes: state.promptNotesDraft || null
        });
        state.promptTextDraft = "";
        state.promptNotesDraft = "";
        await loadPrompts(pageId);
      });
    case "clone-prompt":
      return void runAction("clone-prompt", async () => {
        const pageId = requireSelectedConnectedPageId();
        assertNonEmpty(state.cloneSourcePageId, "Cần chọn page nguồn để clone prompt.");
        state.promptCloneResponse = await requestJson("POST", `/chat-extractor/control-center/pages/${encodeURIComponent(pageId)}/prompts/clone`, {
          sourcePageId: state.cloneSourcePageId,
          notes: state.promptNotesDraft || null
        });
        await loadPrompts(pageId);
      });
    case "activate-prompt":
      return void runAction("activate-prompt", async () => {
        const pageId = requireSelectedConnectedPageId();
        assertNonEmpty(state.activatePromptVersionId, "Cần chọn version prompt để activate.");
        state.promptActivateResponse = await requestJson("POST", `/chat-extractor/control-center/pages/${encodeURIComponent(pageId)}/prompts/${encodeURIComponent(state.activatePromptVersionId)}/activate`, {});
        await refreshConnectedPages(pageId);
        await refreshSelectedConnectedPage(pageId);
        await loadPrompts(pageId);
      });
    case "preview-manual":
      return void runAction("preview-manual", async () => {
        state.manualPreviewResponse = await requestJson("POST", "/chat-extractor/jobs/preview", buildManualPayload());
      });
    case "execute-manual":
      return void runAction("execute-manual", async () => {
        state.manualExecuteResponse = await requestJson("POST", "/chat-extractor/jobs/execute", {
          ...buildManualPayload(),
          writeArtifacts: state.manualWriteArtifacts
        });
      });
    case "preview-scheduler":
      return void runAction("preview-scheduler", async () => {
        state.schedulerPreviewResponse = await requestJson("POST", "/chat-extractor/jobs/scheduler/preview", buildSchedulerPayload());
      });
    case "execute-scheduler":
      return void runAction("execute-scheduler", async () => {
        state.schedulerExecuteResponse = await requestJson("POST", "/chat-extractor/jobs/scheduler/execute", buildSchedulerPayload());
      });
    case "load-health":
      return void runAction("health", async () => {
        state.healthResponse = await requestJson("GET", "/chat-extractor/health/summary");
      });
    case "load-run":
      return void runAction("run-detail", async () => {
        assertNonEmpty(state.runId, "Cần nhập run ID.");
        state.runResponse = await requestJson("GET", `/chat-extractor/runs/${encodeURIComponent(state.runId)}`);
      });
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
    return;
  }

  if (target.id === "manual-run-mode") {
    render();
  }
}

async function runAction(key: string, action: () => Promise<void>) {
  syncAllForms();
  state.loadingKey = key;
  state.errorMessage = null;
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
  state.registerBusinessTimezone = getInputValue("#register-business-timezone", state.registerBusinessTimezone).trim();
  state.registerAutoScraperEnabled = getCheckboxValue("#register-auto-scraper", state.registerAutoScraperEnabled);
  state.registerAutoAiAnalysisEnabled = getCheckboxValue("#register-auto-ai", state.registerAutoAiAnalysisEnabled);
  state.patchBusinessTimezone = getInputValue("#patch-business-timezone", state.patchBusinessTimezone).trim();
  state.patchAutoScraperEnabled = getCheckboxValue("#patch-auto-scraper", state.patchAutoScraperEnabled);
  state.patchAutoAiAnalysisEnabled = getCheckboxValue("#patch-auto-ai", state.patchAutoAiAnalysisEnabled);
  state.patchIsActive = getCheckboxValue("#patch-is-active", state.patchIsActive);
  state.tagMappingDraft = getTextareaValue("#tag-mapping-draft", state.tagMappingDraft);
  state.openingRulesDraft = getTextareaValue("#opening-rules-draft", state.openingRulesDraft);
  state.botSignaturesDraft = getTextareaValue("#bot-signatures-draft", state.botSignaturesDraft);
  state.onboardingTargetDate = getInputValue("#onboarding-target-date", state.onboardingTargetDate);
  state.onboardingInitialConversationLimit = getInputValue("#onboarding-initial-limit", state.onboardingInitialConversationLimit).trim();
  state.onboardingProcessingMode = getSelectValue("#onboarding-processing-mode", state.onboardingProcessingMode) as ProcessingMode;
  state.onboardingWriteArtifacts = getCheckboxValue("#onboarding-write-artifacts", state.onboardingWriteArtifacts);
  state.promptTextDraft = getTextareaValue("#prompt-text-draft", state.promptTextDraft);
  state.promptNotesDraft = getInputValue("#prompt-notes-draft", state.promptNotesDraft);
  state.cloneSourcePageId = getSelectValue("#clone-source-page-id", state.cloneSourcePageId);
  state.activatePromptVersionId = getSelectValue("#activate-prompt-version-id", state.activatePromptVersionId);
  state.manualJobName = getInputValue("#manual-job-name", state.manualJobName).trim();
  state.manualProcessingMode = getSelectValue("#manual-processing-mode", state.manualProcessingMode) as ProcessingMode;
  state.manualRunMode = getSelectValue("#manual-run-mode", state.manualRunMode) as ManualRunMode;
  state.manualTargetDate = getInputValue("#manual-target-date", state.manualTargetDate);
  state.manualWindowStart = getInputValue("#manual-window-start", state.manualWindowStart);
  state.manualWindowEnd = getInputValue("#manual-window-end", state.manualWindowEnd);
  state.manualPublish = getCheckboxValue("#manual-publish", state.manualPublish);
  state.manualSnapshotVersion = getInputValue("#manual-snapshot-version", state.manualSnapshotVersion).trim();
  state.manualMaxConversations = getInputValue("#manual-max-conversations", state.manualMaxConversations).trim();
  state.manualMaxMessagePagesPerConversation = getInputValue("#manual-max-message-pages", state.manualMaxMessagePagesPerConversation).trim();
  state.manualWriteArtifacts = getCheckboxValue("#manual-write-artifacts", state.manualWriteArtifacts);
  state.schedulerJobName = getInputValue("#scheduler-job-name", state.schedulerJobName).trim();
  state.schedulerTargetDate = getInputValue("#scheduler-target-date", state.schedulerTargetDate);
  state.schedulerProcessingMode = getSelectValue("#scheduler-processing-mode", state.schedulerProcessingMode) as ProcessingMode;
  state.schedulerIsPublished = getCheckboxValue("#scheduler-is-published", state.schedulerIsPublished);
  state.schedulerSnapshotVersion = getInputValue("#scheduler-snapshot-version", state.schedulerSnapshotVersion).trim();
  state.schedulerMaxConversations = getInputValue("#scheduler-max-conversations", state.schedulerMaxConversations).trim();
  state.schedulerMaxMessagePagesPerConversation = getInputValue("#scheduler-max-message-pages", state.schedulerMaxMessagePagesPerConversation).trim();
  state.runId = getInputValue("#run-id", state.runId).trim();
}

async function refreshConnectedPages(preferredId?: string) {
  const data = await requestJson<{ pages: ConnectedPage[] }>("GET", "/chat-extractor/control-center/pages");
  state.connectedPagesResponse = data;
  state.connectedPages = Array.isArray(data.pages) ? data.pages.filter(isConnectedPage) : [];
  const selectedId = preferredId || state.selectedConnectedPageId;
  const page = state.connectedPages.find((item) => item.id === selectedId) ?? state.connectedPages[0] ?? null;
  setSelectedConnectedPage(page);
}

async function refreshSelectedConnectedPage(pageId: string) {
  const data = await requestJson<{ page: ConnectedPage }>("GET", `/chat-extractor/control-center/pages/${encodeURIComponent(pageId)}`);
  state.connectedPageResponse = data;
  if (isConnectedPage(data.page)) {
    const index = state.connectedPages.findIndex((item) => item.id === data.page.id);
    if (index >= 0) {
      state.connectedPages[index] = data.page;
    }
    setSelectedConnectedPage(data.page);
  }
}

async function loadPrompts(pageId: string) {
  const data = await requestJson<PromptListResponse>("GET", `/chat-extractor/control-center/pages/${encodeURIComponent(pageId)}/prompts`);
  state.promptsResponse = data;
  state.promptsData = isPromptListResponse(data) ? data : null;
  state.activatePromptVersionId = state.promptsData?.activePromptVersionId ?? state.promptsData?.prompts[0]?.id ?? "";
}

function setSelectedConnectedPage(page: ConnectedPage | null) {
  state.selectedConnectedPage = page;
  state.selectedConnectedPageId = page?.id ?? "";
  if (!page) {
    state.promptsData = null;
    state.promptsResponse = null;
    state.activatePromptVersionId = "";
    return;
  }
  state.patchBusinessTimezone = page.businessTimezone;
  state.patchAutoScraperEnabled = page.autoScraperEnabled;
  state.patchAutoAiAnalysisEnabled = page.autoAiAnalysisEnabled;
  state.patchIsActive = page.isActive;
  state.tagMappingDraft = stringifyJson(page.activeTagMappingJson ?? []);
  state.openingRulesDraft = stringifyJson(page.activeOpeningRulesJson ?? []);
  state.botSignaturesDraft = stringifyJson(page.activeBotSignaturesJson ?? []);
  if (state.promptsData?.connectedPageId !== page.id) {
    state.promptsData = null;
    state.promptsResponse = null;
  }
  state.activatePromptVersionId = page.activePromptVersionId ?? "";
  if (!state.cloneSourcePageId || state.cloneSourcePageId === page.id) {
    state.cloneSourcePageId = state.connectedPages.find((item) => item.id !== page.id)?.id ?? "";
  }
}

function buildOnboardingPayload() {
  return {
    targetDate: requireDate(state.onboardingTargetDate, "Cần chọn target date cho onboarding."),
    initialConversationLimit: readPositiveInt(state.onboardingInitialConversationLimit, "Initial conversation limit phải là số nguyên dương."),
    processingMode: state.onboardingProcessingMode
  };
}

function buildManualPayload() {
  const pageId = requireSelectedConnectedPageId();
  const job: Record<string, JsonValue> = {
    jobName: assertAndReturn(state.manualJobName, "Cần nhập tên job manual."),
    processingMode: state.manualProcessingMode,
    runMode: state.manualRunMode,
    publish: state.manualPublish
  };

  if (state.manualRunMode === "backfill_day") {
    job.targetDate = requireDate(state.manualTargetDate, "Cần chọn target date cho manual run.");
  } else {
    job.requestedWindowStartAt = assertAndReturn(state.manualWindowStart, "Cần nhập requested window start.");
    job.requestedWindowEndExclusiveAt = assertAndReturn(state.manualWindowEnd, "Cần nhập requested window end.");
  }

  appendOptionalInt(job, "snapshotVersion", state.manualSnapshotVersion, true);
  appendOptionalInt(job, "maxConversations", state.manualMaxConversations, false);
  appendOptionalInt(job, "maxMessagePagesPerConversation", state.manualMaxMessagePagesPerConversation, false);

  return {
    kind: "manual",
    connectedPageId: pageId,
    job
  };
}

function buildSchedulerPayload() {
  const payload: Record<string, JsonValue> = {
    jobName: assertAndReturn(state.schedulerJobName, "Cần nhập tên scheduler job."),
    targetDate: requireDate(state.schedulerTargetDate, "Cần chọn target date cho scheduler."),
    processingMode: state.schedulerProcessingMode,
    isPublished: state.schedulerIsPublished
  };
  appendOptionalInt(payload, "snapshotVersion", state.schedulerSnapshotVersion, true);
  appendOptionalInt(payload, "maxConversations", state.schedulerMaxConversations, false);
  appendOptionalInt(payload, "maxMessagePagesPerConversation", state.schedulerMaxMessagePagesPerConversation, false);
  return payload;
}

async function requestJson<T>(method: "GET" | "POST" | "PATCH", path: string, body?: unknown) {
  const response = await fetch(`${normalizeBaseUrl(state.apiBaseUrl)}${path}`, {
    method,
    headers: {
      Accept: "application/json",
      ...(method === "GET" ? {} : { "Content-Type": "application/json" })
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  const raw = await response.text();
  const parsed = raw ? safeParseJson(raw) : null;

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}\n${formatJson(parsed)}`);
  }

  return parsed as T;
}

function renderPancakePanel() {
  return `
    <section class="panel">
      <div class="panel-header">
        <div>
          <p class="panel-kicker">Bước 1</p>
          <h2>List page từ token và register</h2>
        </div>
      </div>
      <label class="field">
        <span>User access token</span>
        <input id="token-input" type="password" value="${escapeAttribute(state.tokenInput)}" placeholder="Dán token Pancake" />
      </label>
      <div class="button-row">
        <button class="button button-primary" data-action="list-pages">List pages</button>
        <button class="button" data-action="load-connected-pages">Reload page đã lưu</button>
      </div>
      <label class="field">
        <span>Page từ Pancake</span>
        <select id="selected-pancake-page-id">${renderPancakePageOptions()}</select>
      </label>
      <div class="grid-two">
        <label class="field">
          <span>Business timezone</span>
          <input id="register-business-timezone" type="text" value="${escapeAttribute(state.registerBusinessTimezone)}" />
        </label>
        <label class="check-field">
          <input id="register-auto-scraper" type="checkbox" ${state.registerAutoScraperEnabled ? "checked" : ""} />
          <span>Auto scraper</span>
        </label>
      </div>
      <label class="check-field">
        <input id="register-auto-ai" type="checkbox" ${state.registerAutoAiAnalysisEnabled ? "checked" : ""} />
        <span>Auto AI analysis</span>
      </label>
      <button class="button button-primary" data-action="register-page">Register page</button>
    </section>
  `;
}

function renderConnectedPagesPanel(selectedPage: ConnectedPage | null) {
  return `
    <section class="panel">
      <div class="panel-header">
        <div>
          <p class="panel-kicker">Bước 2</p>
          <h2>Page đã đăng ký</h2>
        </div>
        <span class="badge">${state.connectedPages.length} page</span>
      </div>
      <label class="field">
        <span>Connected page</span>
        <select id="selected-connected-page-id">${renderConnectedPageOptions()}</select>
      </label>
      <div class="facts compact-facts">
        <div><strong>ID</strong><span>${escapeHtml(selectedPage?.id ?? "-")}</span></div>
        <div><strong>Pancake</strong><span>${escapeHtml(selectedPage?.pancakePageId ?? "-")}</span></div>
        <div><strong>Updated</strong><span>${escapeHtml(selectedPage?.updatedAt ?? "-")}</span></div>
      </div>
      <div class="button-row">
        <button class="button" data-action="load-connected-page">Tải detail</button>
        <button class="button" data-action="load-prompts">Tải prompts</button>
      </div>
    </section>
  `;
}

function renderPageConfigPanel(selectedPage: ConnectedPage | null) {
  return `
    <section class="panel">
      <div class="panel-header">
        <div>
          <p class="panel-kicker">Fine-tune</p>
          <h2>JSON config của page</h2>
        </div>
        <span class="badge">${selectedPage?.isActive ? "active" : "inactive"}</span>
      </div>
      <div class="grid-two">
        <label class="field">
          <span>Business timezone</span>
          <input id="patch-business-timezone" type="text" value="${escapeAttribute(state.patchBusinessTimezone)}" />
        </label>
        <label class="check-field">
          <input id="patch-is-active" type="checkbox" ${state.patchIsActive ? "checked" : ""} />
          <span>Page active</span>
        </label>
      </div>
      <div class="grid-two">
        <label class="check-field">
          <input id="patch-auto-scraper" type="checkbox" ${state.patchAutoScraperEnabled ? "checked" : ""} />
          <span>Auto scraper</span>
        </label>
        <label class="check-field">
          <input id="patch-auto-ai" type="checkbox" ${state.patchAutoAiAnalysisEnabled ? "checked" : ""} />
          <span>Auto AI analysis</span>
        </label>
      </div>
      <label class="field">
        <span>Tag mapping JSON</span>
        <textarea id="tag-mapping-draft" class="json-editor json-editor-sm">${escapeHtml(state.tagMappingDraft)}</textarea>
      </label>
      <label class="field">
        <span>Opening rules JSON</span>
        <textarea id="opening-rules-draft" class="json-editor json-editor-sm">${escapeHtml(state.openingRulesDraft)}</textarea>
      </label>
      <label class="field">
        <span>Bot signatures JSON</span>
        <textarea id="bot-signatures-draft" class="json-editor json-editor-sm">${escapeHtml(state.botSignaturesDraft)}</textarea>
      </label>
      <button class="button button-primary" data-action="save-page-config">Lưu config page</button>
    </section>
  `;
}

function renderOnboardingPanel(selectedPage: ConnectedPage | null) {
  return `
    <section class="panel">
      <div class="panel-header">
        <div>
          <p class="panel-kicker">Onboarding</p>
          <h2>Sample run đầu tiên</h2>
        </div>
      </div>
      <div class="grid-two">
        <label class="field">
          <span>Target date</span>
          <input id="onboarding-target-date" type="date" value="${escapeAttribute(state.onboardingTargetDate)}" />
        </label>
        <label class="field">
          <span>Initial conversation limit</span>
          <input id="onboarding-initial-limit" type="number" min="1" value="${escapeAttribute(state.onboardingInitialConversationLimit)}" />
        </label>
      </div>
      <div class="grid-two">
        <label class="field">
          <span>Processing mode</span>
          <select id="onboarding-processing-mode">${renderProcessingModeOptions(state.onboardingProcessingMode)}</select>
        </label>
        <label class="check-field">
          <input id="onboarding-write-artifacts" type="checkbox" ${state.onboardingWriteArtifacts ? "checked" : ""} />
          <span>Write artifacts khi execute</span>
        </label>
      </div>
      <div class="button-row">
        <button class="button" data-action="preview-onboarding">Preview onboarding</button>
        <button class="button button-primary" data-action="execute-onboarding">Execute onboarding</button>
      </div>
      <p class="helper-text">Artifacts hiện có: ${escapeHtml(formatInlineJson(selectedPage?.onboardingStateJson))}</p>
    </section>
  `;
}

function renderPromptPanel(selectedPage: ConnectedPage | null) {
  return `
    <section class="panel">
      <div class="panel-header">
        <div>
          <p class="panel-kicker">Prompt</p>
          <h2>Tạo, clone, activate</h2>
        </div>
      </div>
      <label class="field">
        <span>Prompt text</span>
        <textarea id="prompt-text-draft" class="json-editor prompt-editor">${escapeHtml(state.promptTextDraft)}</textarea>
      </label>
      <div class="grid-two">
        <label class="field">
          <span>Notes</span>
          <input id="prompt-notes-draft" type="text" value="${escapeAttribute(state.promptNotesDraft)}" placeholder="Ghi chú version" />
        </label>
        <label class="field">
          <span>Clone từ page</span>
          <select id="clone-source-page-id">${renderCloneSourceOptions(selectedPage?.id ?? "")}</select>
        </label>
      </div>
      <div class="button-row">
        <button class="button" data-action="load-prompts">Reload prompts</button>
        <button class="button button-primary" data-action="create-prompt">Tạo prompt</button>
        <button class="button" data-action="clone-prompt">Clone prompt</button>
      </div>
      <div class="grid-two">
        <label class="field">
          <span>Version để activate</span>
          <select id="activate-prompt-version-id">${renderPromptVersionOptions()}</select>
        </label>
        <div class="stack-end">
          <button class="button button-primary" data-action="activate-prompt">Activate version</button>
        </div>
      </div>
    </section>
  `;
}

function renderManualRunPanel(selectedPage: ConnectedPage | null) {
  return `
    <section class="panel">
      <div class="panel-header">
        <div>
          <p class="panel-kicker">Run thủ công</p>
          <h2>Manual preview / execute</h2>
        </div>
      </div>
      <div class="grid-two">
        <label class="field">
          <span>Job name</span>
          <input id="manual-job-name" type="text" value="${escapeAttribute(state.manualJobName)}" />
        </label>
        <label class="field">
          <span>Processing mode</span>
          <select id="manual-processing-mode">${renderProcessingModeOptions(state.manualProcessingMode)}</select>
        </label>
      </div>
      <div class="grid-two">
        <label class="field">
          <span>Run mode</span>
          <select id="manual-run-mode">${renderManualRunModeOptions()}</select>
        </label>
        <label class="check-field">
          <input id="manual-publish" type="checkbox" ${state.manualPublish ? "checked" : ""} />
          <span>Publish</span>
        </label>
      </div>
      ${
        state.manualRunMode === "backfill_day"
          ? `
        <label class="field">
          <span>Target date</span>
          <input id="manual-target-date" type="date" value="${escapeAttribute(state.manualTargetDate)}" />
        </label>
      `
          : `
        <div class="grid-two">
          <label class="field">
            <span>Window start (ISO)</span>
            <input id="manual-window-start" type="text" value="${escapeAttribute(state.manualWindowStart)}" placeholder="2026-04-01T00:00:00+07:00" />
          </label>
          <label class="field">
            <span>Window end exclusive (ISO)</span>
            <input id="manual-window-end" type="text" value="${escapeAttribute(state.manualWindowEnd)}" placeholder="2026-04-02T00:00:00+07:00" />
          </label>
        </div>
      `
      }
      <div class="grid-three">
        <label class="field">
          <span>Snapshot version</span>
          <input id="manual-snapshot-version" type="number" min="1" value="${escapeAttribute(state.manualSnapshotVersion)}" placeholder="tuỳ chọn" />
        </label>
        <label class="field">
          <span>Max conversations</span>
          <input id="manual-max-conversations" type="number" min="0" value="${escapeAttribute(state.manualMaxConversations)}" placeholder="tuỳ chọn" />
        </label>
        <label class="field">
          <span>Max message pages / conversation</span>
          <input id="manual-max-message-pages" type="number" min="0" value="${escapeAttribute(state.manualMaxMessagePagesPerConversation)}" placeholder="tuỳ chọn" />
        </label>
      </div>
      <label class="check-field">
        <input id="manual-write-artifacts" type="checkbox" ${state.manualWriteArtifacts ? "checked" : ""} />
        <span>Write artifacts khi execute</span>
      </label>
      <div class="button-row">
        <button class="button" data-action="preview-manual">Preview manual</button>
        <button class="button button-primary" data-action="execute-manual">Execute manual</button>
      </div>
      <p class="helper-text">Page chạy: ${escapeHtml(selectedPage?.pageName ?? "chưa chọn")}</p>
    </section>
  `;
}

function renderSchedulerPanel() {
  return `
    <section class="panel">
      <div class="panel-header">
        <div>
          <p class="panel-kicker">Scheduler</p>
          <h2>Daily scheduler preview / execute</h2>
        </div>
      </div>
      <div class="grid-two">
        <label class="field">
          <span>Job name</span>
          <input id="scheduler-job-name" type="text" value="${escapeAttribute(state.schedulerJobName)}" />
        </label>
        <label class="field">
          <span>Target date</span>
          <input id="scheduler-target-date" type="date" value="${escapeAttribute(state.schedulerTargetDate)}" />
        </label>
      </div>
      <div class="grid-two">
        <label class="field">
          <span>Processing mode</span>
          <select id="scheduler-processing-mode">${renderProcessingModeOptions(state.schedulerProcessingMode)}</select>
        </label>
        <label class="check-field">
          <input id="scheduler-is-published" type="checkbox" ${state.schedulerIsPublished ? "checked" : ""} />
          <span>Published scheduler</span>
        </label>
      </div>
      <div class="grid-three">
        <label class="field">
          <span>Snapshot version</span>
          <input id="scheduler-snapshot-version" type="number" min="1" value="${escapeAttribute(state.schedulerSnapshotVersion)}" placeholder="tuỳ chọn" />
        </label>
        <label class="field">
          <span>Max conversations</span>
          <input id="scheduler-max-conversations" type="number" min="0" value="${escapeAttribute(state.schedulerMaxConversations)}" placeholder="tuỳ chọn" />
        </label>
        <label class="field">
          <span>Max message pages / conversation</span>
          <input id="scheduler-max-message-pages" type="number" min="0" value="${escapeAttribute(state.schedulerMaxMessagePagesPerConversation)}" placeholder="tuỳ chọn" />
        </label>
      </div>
      <div class="button-row">
        <button class="button" data-action="preview-scheduler">Preview scheduler</button>
        <button class="button button-primary" data-action="execute-scheduler">Execute scheduler</button>
      </div>
    </section>
  `;
}

function renderAuditPanel() {
  return `
    <section class="panel">
      <div class="panel-header">
        <div>
          <p class="panel-kicker">Audit</p>
          <h2>Run detail</h2>
        </div>
      </div>
      <label class="field">
        <span>Run ID</span>
        <input id="run-id" type="text" value="${escapeAttribute(state.runId)}" placeholder="uuid hoặc run id" />
      </label>
      <button class="button" data-action="load-run">Tải run detail</button>
    </section>
  `;
}

function renderSelectedPageSummary(page: ConnectedPage | null) {
  if (!page) {
    return `<p class="empty-state">Chưa có connected page. Hãy tải page đã đăng ký hoặc register một page mới.</p>`;
  }

  return `
    <div class="facts">
      <div><strong>Page</strong><span>${escapeHtml(page.pageName)}</span></div>
      <div><strong>Pancake ID</strong><span>${escapeHtml(page.pancakePageId)}</span></div>
      <div><strong>Timezone</strong><span>${escapeHtml(page.businessTimezone)}</span></div>
      <div><strong>Auto flags</strong><span>${page.autoScraperEnabled ? "scraper on" : "scraper off"} / ${page.autoAiAnalysisEnabled ? "ai on" : "ai off"}</span></div>
      <div><strong>Prompt active</strong><span>${escapeHtml(page.activePromptVersionId ?? "chưa có")}</span></div>
      <div><strong>Onboarding state</strong><span>${escapeHtml(formatInlineJson(page.onboardingStateJson))}</span></div>
      <div><strong>Created</strong><span>${escapeHtml(page.createdAt)}</span></div>
      <div><strong>Updated</strong><span>${escapeHtml(page.updatedAt)}</span></div>
    </div>
  `;
}

function renderResponsePanel(title: string, value: unknown) {
  return `
    <section class="panel response-panel">
      <div class="panel-header">
        <div>
          <p class="panel-kicker">Raw response</p>
          <h2>${escapeHtml(title)}</h2>
        </div>
      </div>
      <pre class="json-output">${escapeHtml(formatJson(value))}</pre>
    </section>
  `;
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
    return `<option value="">chưa có connected page</option>`;
  }
  return state.connectedPages
    .map((page) => `<option value="${escapeAttribute(page.id)}" ${page.id === state.selectedConnectedPageId ? "selected" : ""}>${escapeHtml(page.pageName)} (${escapeHtml(page.businessTimezone)})</option>`)
    .join("");
}

function renderCloneSourceOptions(currentPageId: string) {
  const options = state.connectedPages.filter((page) => page.id !== currentPageId);
  if (options.length === 0) {
    return `<option value="">không có page nguồn</option>`;
  }
  return options
    .map((page) => `<option value="${escapeAttribute(page.id)}" ${page.id === state.cloneSourcePageId ? "selected" : ""}>${escapeHtml(page.pageName)}</option>`)
    .join("");
}

function renderPromptVersionOptions() {
  const prompts = state.promptsData?.prompts ?? [];
  if (prompts.length === 0) {
    return `<option value="">chưa tải prompt versions</option>`;
  }
  return prompts
    .map((prompt) => `<option value="${escapeAttribute(prompt.id)}" ${prompt.id === state.activatePromptVersionId ? "selected" : ""}>v${prompt.versionNo} - ${escapeHtml(prompt.id)}</option>`)
    .join("");
}

function renderProcessingModeOptions(selected: ProcessingMode) {
  return (["etl_only", "etl_and_ai"] as const)
    .map((value) => `<option value="${value}" ${value === selected ? "selected" : ""}>${value}</option>`)
    .join("");
}

function renderManualRunModeOptions() {
  return ([
    { value: "backfill_day", label: "full-day" },
    { value: "manual_range", label: "khoảng thời gian" }
  ] as const)
    .map((item) => `<option value="${item.value}" ${item.value === state.manualRunMode ? "selected" : ""}>${item.label}</option>`)
    .join("");
}

function getSelectedPancakePage() {
  return state.listedPancakePages.find((page) => page.pageId === state.selectedPancakePageId) ?? null;
}

function getSelectedConnectedPage() {
  return state.selectedConnectedPage ?? state.connectedPages.find((page) => page.id === state.selectedConnectedPageId) ?? null;
}

function readHealthLabel() {
  if (!isRecord(state.healthResponse)) {
    return "chưa kiểm tra";
  }
  const status = typeof state.healthResponse.status === "string" ? state.healthResponse.status : null;
  return status ?? "đã tải";
}

function requireSelectedConnectedPageId() {
  return assertAndReturn(state.selectedConnectedPageId, "Cần chọn connected page.");
}

function parseJsonDraft(label: string, raw: string) {
  try {
    return JSON.parse(raw) as JsonValue;
  } catch (error) {
    throw new Error(`${label} không phải JSON hợp lệ.\n${error instanceof Error ? error.message : String(error)}`);
  }
}

function appendOptionalInt(target: Record<string, JsonValue>, key: string, raw: string, positiveOnly: boolean) {
  if (!raw.trim()) {
    return;
  }
  const value = positiveOnly ? readPositiveInt(raw, `${key} phải là số nguyên dương.`) : readNonNegativeInt(raw, `${key} phải là số nguyên không âm.`);
  target[key] = value;
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

function isConnectedPage(value: unknown): value is ConnectedPage {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.pancakePageId === "string" &&
    typeof value.pageName === "string" &&
    typeof value.businessTimezone === "string" &&
    typeof value.autoScraperEnabled === "boolean" &&
    typeof value.autoAiAnalysisEnabled === "boolean" &&
    typeof value.isActive === "boolean" &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string"
  );
}

function isPromptListResponse(value: unknown): value is PromptListResponse {
  return isRecord(value) && typeof value.connectedPageId === "string" && Array.isArray(value.prompts);
}

function stringifyJson(value: JsonValue) {
  return JSON.stringify(value, null, 2);
}

function formatJson(value: unknown) {
  if (value === null || value === undefined) {
    return "Chưa có dữ liệu.";
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

function formatInlineJson(value: unknown) {
  const formatted = formatJson(value);
  return formatted.length > 140 ? `${formatted.slice(0, 137)}...` : formatted;
}

function safeParseJson(raw: string) {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
}

function normalizeBaseUrl(value: string) {
  return value.trim().replace(/\/+$/, "") || "http://localhost:3000";
}

function todayInputValue() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  const local = new Date(now.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 10);
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
