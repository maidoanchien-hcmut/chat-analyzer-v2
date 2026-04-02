type JobKind = "manual" | "onboarding" | "scheduler";
type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

type ListedPage = {
  pageId: string;
  pageName: string;
};

type RegisteredPageState = {
  organizationId: string;
  pageSlug: string;
  pageId: string;
  pageName: string;
  userAccessToken: string;
  businessTimezone: string;
  initialConversationLimit: number;
  autoScraper: boolean;
  autoAiAnalysis: boolean;
} | null;

type AppState = {
  apiBaseUrl: string;
  tokenInput: string;
  listedPages: ListedPage[];
  selectedPageId: string;
  organizationId: string;
  pageSlug: string;
  businessTimezone: string;
  initialConversationLimit: string;
  autoScraper: boolean;
  autoAiAnalysis: boolean;
  registeredPage: RegisteredPageState;
  jobKind: JobKind;
  jobName: string;
  targetDate: string;
  snapshotVersion: string;
  publish: boolean;
  maxConversations: string;
  runId: string;
  health: JsonValue | null;
  listPagesResult: JsonValue | null;
  registerResult: JsonValue | null;
  previewResult: JsonValue | null;
  executeResult: JsonValue | null;
  runResult: JsonValue | null;
  loadingKey: string | null;
  errorMessage: string | null;
  lastUpdatedAt: string | null;
};

const state: AppState = {
  apiBaseUrl: "http://localhost:3000",
  tokenInput: "",
  listedPages: [],
  selectedPageId: "",
  organizationId: "default",
  pageSlug: "demo-clinic",
  businessTimezone: "Asia/Ho_Chi_Minh",
  initialConversationLimit: "25",
  autoScraper: false,
  autoAiAnalysis: false,
  registeredPage: null,
  jobKind: "manual",
  jobName: "demo-day-run",
  targetDate: "2026-04-01",
  snapshotVersion: "1",
  publish: false,
  maxConversations: "",
  runId: "",
  health: null,
  listPagesResult: null,
  registerResult: null,
  previewResult: null,
  executeResult: null,
  runResult: null,
  loadingKey: null,
  errorMessage: null,
  lastUpdatedAt: null
};

const rootElement = document.querySelector<HTMLDivElement>("#app");

if (!rootElement) {
  throw new Error("Missing #app root element.");
}

const root = rootElement;

render();

function render() {
  root.innerHTML = `
    <div class="shell">
      <header class="topbar">
        <div class="title-block">
          <p class="eyebrow">chat-analyzer-v2</p>
          <h1>Seam 1 HTTP console</h1>
          <p class="subtitle">
            Frontend gửi request HTTP trực tiếp sang backend. Token và page config chỉ giữ trong memory của phiên hiện tại.
          </p>
        </div>

        <div class="quickbar">
          <label class="field field-inline">
            <span>Backend API</span>
            <input id="api-base-url" type="text" value="${escapeAttribute(state.apiBaseUrl)}" placeholder="http://localhost:3000" />
          </label>
          <button class="button" data-action="save-api-base">Lưu endpoint</button>
          <button class="button" data-action="load-health">Health</button>
          <button class="button button-primary" data-action="preview-job">Preview</button>
        </div>
      </header>

      <section class="module-strip">
        ${renderModuleCard("Page đã chọn", selectedPageLabel(), "List từ Pancake rồi register tại frontend session")}
        ${renderModuleCard("Job mode", state.jobKind, "manual, onboarding hoặc scheduler")}
        ${renderModuleCard("Run target", state.targetDate || "chưa có", "Ngày business date đang chuẩn bị chạy")}
        ${renderModuleCard("Health", readHealthStatus(), "Đọc từ backend /seam1/health/summary")}
        ${renderModuleCard("Trạng thái", state.loadingKey ? `đang chạy ${state.loadingKey}` : "sẵn sàng", "Không còn phụ thuộc preset JSON")}
        ${renderModuleCard("Cập nhật cuối", state.lastUpdatedAt ?? "chưa có", "Ghi sau mỗi request thành công")}
      </section>

      <main class="workspace">
        <section class="control-stack">
          <section class="panel compact-panel">
            <div class="panel-header">
              <div>
                <p class="panel-kicker">Pancake</p>
                <h2>List pages</h2>
              </div>
            </div>

            <label class="field">
              <span>User access token</span>
              <input id="token-input" type="password" value="${escapeAttribute(state.tokenInput)}" placeholder="Dán Pancake user access token" />
            </label>

            <div class="button-row">
              <button class="button button-primary" data-action="list-pages">List pages</button>
            </div>

            <label class="field">
              <span>Chọn page</span>
              <select id="selected-page-id">
                ${renderPageOptions()}
              </select>
            </label>
          </section>

          <section class="panel compact-panel">
            <div class="panel-header">
              <div>
                <p class="panel-kicker">Control Center</p>
                <h2>Register page</h2>
              </div>
            </div>

            <div class="compact-form">
              <label class="field">
                <span>Organization ID</span>
                <input id="organization-id" type="text" value="${escapeAttribute(state.organizationId)}" />
              </label>
              <label class="field">
                <span>Page slug</span>
                <input id="page-slug" type="text" value="${escapeAttribute(state.pageSlug)}" />
              </label>
              <label class="field">
                <span>Business timezone</span>
                <input id="business-timezone" type="text" value="${escapeAttribute(state.businessTimezone)}" />
              </label>
              <label class="field">
                <span>Initial conversation limit</span>
                <input id="initial-conversation-limit" type="number" min="1" value="${escapeAttribute(state.initialConversationLimit)}" />
              </label>
            </div>

            <div class="button-row">
              <button class="button" data-action="toggle-auto-scraper">Auto Scraper: ${state.autoScraper ? "ON" : "OFF"}</button>
              <button class="button" data-action="toggle-auto-ai">Auto AI: ${state.autoAiAnalysis ? "ON" : "OFF"}</button>
              <button class="button button-primary" data-action="register-page">Register</button>
            </div>
          </section>

          <section class="panel compact-panel">
            <div class="panel-header">
              <div>
                <p class="panel-kicker">Extract</p>
                <h2>Run config</h2>
              </div>
            </div>

            <div class="compact-form">
              <label class="field">
                <span>Job kind</span>
                <select id="job-kind">
                  ${renderJobKindOptions()}
                </select>
              </label>
              <label class="field">
                <span>Job name</span>
                <input id="job-name" type="text" value="${escapeAttribute(state.jobName)}" />
              </label>
              <label class="field">
                <span>Target date</span>
                <input id="target-date" type="date" value="${escapeAttribute(state.targetDate)}" />
              </label>
              <label class="field">
                <span>Snapshot version</span>
                <input id="snapshot-version" type="number" min="1" value="${escapeAttribute(state.snapshotVersion)}" />
              </label>
              <label class="field">
                <span>Max conversations</span>
                <input id="max-conversations" type="number" min="0" value="${escapeAttribute(state.maxConversations)}" placeholder="để trống nếu không giới hạn" />
              </label>
            </div>

            <div class="button-row">
              <button class="button" data-action="toggle-publish">Publish: ${state.publish ? "ON" : "OFF"}</button>
              <button class="button button-primary" data-action="preview-job">Preview</button>
              <button class="button button-danger" data-action="execute-job">Execute</button>
            </div>
          </section>

          <section class="panel compact-panel">
            <div class="panel-header">
              <div>
                <p class="panel-kicker">Audit</p>
                <h2>Run detail</h2>
              </div>
            </div>

            <label class="field">
              <span>Run ID</span>
              <input id="run-id" type="text" value="${escapeAttribute(state.runId)}" placeholder="etl_run UUID" />
            </label>

            <div class="button-row">
              <button class="button" data-action="load-run">Get run</button>
            </div>
          </section>
        </section>

        <section class="surface-grid">
          <section class="panel compact-panel surface-panel">
            <div class="panel-header">
              <div>
                <p class="panel-kicker">Response</p>
                <h2>Health</h2>
              </div>
            </div>
            ${renderJsonBlock(state.health)}
          </section>

          <section class="panel compact-panel surface-panel">
            <div class="panel-header">
              <div>
                <p class="panel-kicker">Response</p>
                <h2>Pages</h2>
              </div>
            </div>
            ${renderJsonBlock(state.listPagesResult)}
          </section>

          <section class="panel compact-panel surface-panel">
            <div class="panel-header">
              <div>
                <p class="panel-kicker">Response</p>
                <h2>Register</h2>
              </div>
            </div>
            ${renderJsonBlock(state.registerResult)}
          </section>

          <section class="panel compact-panel surface-panel">
            <div class="panel-header">
              <div>
                <p class="panel-kicker">Response</p>
                <h2>Preview</h2>
              </div>
            </div>
            ${renderJsonBlock(state.previewResult)}
          </section>

          <section class="panel compact-panel surface-panel">
            <div class="panel-header">
              <div>
                <p class="panel-kicker">Response</p>
                <h2>Execution</h2>
              </div>
            </div>
            ${renderJsonBlock(state.executeResult)}
          </section>

          <section class="panel compact-panel surface-panel">
            <div class="panel-header">
              <div>
                <p class="panel-kicker">Response</p>
                <h2>Run detail</h2>
              </div>
            </div>
            ${state.errorMessage ? `<div class="error-box">${escapeHtml(state.errorMessage)}</div>` : ""}
            ${renderJsonBlock(state.runResult)}
          </section>
        </section>
      </main>
    </div>
  `;

  bindEvents();
}

function bindEvents() {
  document.querySelector<HTMLButtonElement>("[data-action='save-api-base']")?.addEventListener("click", () => {
    state.apiBaseUrl = normalizeBaseUrl(getInputValue("#api-base-url", state.apiBaseUrl));
    state.errorMessage = null;
    render();
  });

  document.querySelector<HTMLButtonElement>("[data-action='load-health']")?.addEventListener("click", () => {
    void runAction("health", async () => {
      state.health = await requestJson("/seam1/health/summary");
    });
  });

  document.querySelector<HTMLButtonElement>("[data-action='list-pages']")?.addEventListener("click", () => {
    void runAction("list-pages", async () => {
      syncPageForm();
      const data = await requestJson("/seam1/pages/list-from-token", {
        method: "POST",
        body: JSON.stringify({
          user_access_token: state.tokenInput
        })
      });
      state.listPagesResult = data;
      state.listedPages = Array.isArray(data) ? data.filter(isListedPage) : [];
      state.selectedPageId = state.listedPages[0]?.pageId ?? "";
    });
  });

  document.querySelector<HTMLButtonElement>("[data-action='register-page']")?.addEventListener("click", () => {
    void runAction("register-page", async () => {
      syncPageForm();
      const data = await requestJson("/seam1/control-center/pages/register", {
        method: "POST",
        body: JSON.stringify({
          organization_id: state.organizationId,
          page_slug: state.pageSlug,
          user_access_token: state.tokenInput,
          page_id: state.selectedPageId,
          business_timezone: state.businessTimezone,
          initial_conversation_limit: readPositiveInt(state.initialConversationLimit, 25),
          auto_scraper: state.autoScraper,
          auto_ai_analysis: state.autoAiAnalysis
        })
      });
      state.registerResult = data;

      const selectedPage = state.listedPages.find((page) => page.pageId === state.selectedPageId);
      if (selectedPage) {
        state.registeredPage = {
          organizationId: state.organizationId,
          pageSlug: state.pageSlug,
          pageId: selectedPage.pageId,
          pageName: selectedPage.pageName,
          userAccessToken: state.tokenInput,
          businessTimezone: state.businessTimezone,
          initialConversationLimit: readPositiveInt(state.initialConversationLimit, 25),
          autoScraper: state.autoScraper,
          autoAiAnalysis: state.autoAiAnalysis
        };
      }
    });
  });

  document.querySelector<HTMLButtonElement>("[data-action='preview-job']")?.addEventListener("click", () => {
    void runAction("preview-job", async () => {
      syncJobForm();
      state.previewResult = await requestJson("/seam1/jobs/preview", {
        method: "POST",
        body: JSON.stringify(buildJobPayload())
      });
    });
  });

  document.querySelector<HTMLButtonElement>("[data-action='execute-job']")?.addEventListener("click", () => {
    void runAction("execute-job", async () => {
      syncJobForm();
      state.executeResult = await requestJson("/seam1/jobs/execute", {
        method: "POST",
        body: JSON.stringify({
          ...buildJobPayload(),
          write_artifacts: true
        })
      });
    });
  });

  document.querySelector<HTMLButtonElement>("[data-action='load-run']")?.addEventListener("click", () => {
    void runAction("run-detail", async () => {
      state.runId = getInputValue("#run-id", state.runId).trim();
      if (!state.runId) {
        throw new Error("Cần nhập run ID.");
      }
      state.runResult = await requestJson(`/seam1/runs/${encodeURIComponent(state.runId)}`);
    });
  });

  document.querySelector<HTMLButtonElement>("[data-action='toggle-auto-scraper']")?.addEventListener("click", () => {
    state.autoScraper = !state.autoScraper;
    render();
  });

  document.querySelector<HTMLButtonElement>("[data-action='toggle-auto-ai']")?.addEventListener("click", () => {
    state.autoAiAnalysis = !state.autoAiAnalysis;
    render();
  });

  document.querySelector<HTMLButtonElement>("[data-action='toggle-publish']")?.addEventListener("click", () => {
    state.publish = !state.publish;
    render();
  });

  document.querySelector<HTMLSelectElement>("#job-kind")?.addEventListener("change", (event) => {
    state.jobKind = (event.currentTarget as HTMLSelectElement).value as JobKind;
  });

  document.querySelector<HTMLSelectElement>("#selected-page-id")?.addEventListener("change", (event) => {
    state.selectedPageId = (event.currentTarget as HTMLSelectElement).value;
  });
}

async function runAction(key: string, action: () => Promise<void>) {
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

function syncPageForm() {
  state.tokenInput = getInputValue("#token-input", state.tokenInput).trim();
  state.organizationId = getInputValue("#organization-id", state.organizationId).trim() || "default";
  state.pageSlug = getInputValue("#page-slug", state.pageSlug).trim();
  state.businessTimezone = getInputValue("#business-timezone", state.businessTimezone).trim();
  state.initialConversationLimit = getInputValue("#initial-conversation-limit", state.initialConversationLimit).trim();
  state.selectedPageId = getSelectValue("#selected-page-id", state.selectedPageId);
}

function syncJobForm() {
  state.jobKind = getSelectValue("#job-kind", state.jobKind) as JobKind;
  state.jobName = getInputValue("#job-name", state.jobName).trim();
  state.targetDate = getInputValue("#target-date", state.targetDate).trim();
  state.snapshotVersion = getInputValue("#snapshot-version", state.snapshotVersion).trim();
  state.maxConversations = getInputValue("#max-conversations", state.maxConversations).trim();
}

function buildJobPayload() {
  const pageBundle = buildPageBundle();

  if (state.jobKind === "manual") {
    return {
      kind: "manual",
      page_bundle: pageBundle,
      job: {
        job_name: state.jobName,
        target_date: state.targetDate,
        publish: state.publish,
        ...(state.snapshotVersion ? { snapshot_version: readPositiveInt(state.snapshotVersion, 1) } : {}),
        ...(state.maxConversations ? { max_conversations: readNonNegativeInt(state.maxConversations, 0) } : {})
      }
    };
  }

  if (state.jobKind === "onboarding") {
    return {
      kind: "onboarding",
      page_bundle: pageBundle,
      job: {
        job_name: state.jobName,
        target_date: state.targetDate,
        publish: false,
        initial_conversation_limit_override: readPositiveInt(state.initialConversationLimit, 25),
        ...(state.snapshotVersion ? { snapshot_version: readPositiveInt(state.snapshotVersion, 1) } : {})
      }
    };
  }

  return {
    kind: "scheduler",
    page_bundles: [pageBundle],
    job: {
      job_name: state.jobName,
      target_date: state.targetDate,
      is_published: state.publish,
      ...(state.snapshotVersion ? { snapshot_version: readPositiveInt(state.snapshotVersion, 1) } : {}),
      ...(state.maxConversations ? { max_conversations: readNonNegativeInt(state.maxConversations, 0) } : {})
    }
  };
}

function buildPageBundle() {
  const page = ensureRegisteredPage();
  return {
    page: {
      organization_id: page.organizationId,
      page_slug: page.pageSlug,
      page_id: page.pageId,
      page_name: page.pageName,
      user_access_token: page.userAccessToken,
      business_timezone: page.businessTimezone,
      initial_conversation_limit: page.initialConversationLimit,
      auto_scraper: page.autoScraper,
      auto_ai_analysis: page.autoAiAnalysis,
      bot_signatures: []
    },
    tag_rules: [],
    opening_rules: [],
    customer_directory: [],
    bot_signatures: []
  };
}

function ensureRegisteredPage() {
  syncPageForm();
  if (!state.registeredPage) {
    throw new Error("Cần register page trước khi preview hoặc execute.");
  }
  return state.registeredPage;
}

async function requestJson(path: string, init: RequestInit = {}) {
  const response = await fetch(`${normalizeBaseUrl(state.apiBaseUrl)}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init.method && init.method !== "GET" ? { "Content-Type": "application/json" } : {}),
      ...(init.headers ?? {})
    }
  });

  const raw = await response.text();
  const parsed = raw ? safeParseJson(raw) : null;
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}\n${typeof parsed === "string" ? parsed : JSON.stringify(parsed, null, 2)}`);
  }
  return parsed as JsonValue;
}

function renderPageOptions() {
  if (state.listedPages.length === 0) {
    return `<option value="">chưa có page</option>`;
  }
  return state.listedPages
    .map((page) => `<option value="${escapeAttribute(page.pageId)}" ${page.pageId === state.selectedPageId ? "selected" : ""}>${escapeHtml(page.pageName)}</option>`)
    .join("");
}

function renderJobKindOptions() {
  return (["manual", "onboarding", "scheduler"] as const)
    .map((value) => `<option value="${value}" ${value === state.jobKind ? "selected" : ""}>${value}</option>`)
    .join("");
}

function renderJsonBlock(value: JsonValue | null) {
  return `<pre class="json-output compact-output">${escapeHtml(value === null ? "Chưa có dữ liệu." : JSON.stringify(value, null, 2))}</pre>`;
}

function selectedPageLabel() {
  const selectedPage = state.listedPages.find((page) => page.pageId === state.selectedPageId);
  if (state.registeredPage) {
    return state.registeredPage.pageName;
  }
  return selectedPage?.pageName ?? "chưa chọn";
}

function readHealthStatus() {
  if (!state.health || typeof state.health !== "object" || Array.isArray(state.health)) {
    return "chưa kiểm tra";
  }

  const totals = (state.health as { totals?: { failed?: number } }).totals;
  if (typeof totals?.failed === "number" && totals.failed > 0) {
    return "có lỗi gần đây";
  }

  return "ổn định";
}

function renderModuleCard(label: string, value: string, hint: string) {
  return `
    <article class="module-card">
      <span class="module-label">${escapeHtml(label)}</span>
      <strong class="module-value">${escapeHtml(value)}</strong>
      <span class="module-hint">${escapeHtml(hint)}</span>
    </article>
  `;
}

function getInputValue(selector: string, fallback: string) {
  return document.querySelector<HTMLInputElement>(selector)?.value ?? fallback;
}

function getSelectValue(selector: string, fallback: string) {
  return document.querySelector<HTMLSelectElement>(selector)?.value ?? fallback;
}

function isListedPage(value: JsonValue): value is ListedPage {
  return !!value && typeof value === "object" && !Array.isArray(value) && typeof (value as { pageId?: unknown }).pageId === "string" && typeof (value as { pageName?: unknown }).pageName === "string";
}

function readPositiveInt(value: string, fallback: number) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readNonNegativeInt(value: string, fallback: number) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function normalizeBaseUrl(value: string) {
  return value.trim().replace(/\/+$/, "") || "http://localhost:3000";
}

function safeParseJson(raw: string) {
  try {
    return JSON.parse(raw) as JsonValue;
  } catch {
    return raw;
  }
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
