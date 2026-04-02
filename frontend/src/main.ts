type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

type PresetEntry = {
  id: string;
  label: string;
  description: string;
  path: string;
};

type PresetManifest = {
  presets: PresetEntry[];
};

type AppState = {
  apiBaseUrl: string;
  presets: PresetEntry[];
  selectedPresetId: string;
  requestText: string;
  responseText: string;
  loading: boolean;
  errorMessage: string | null;
  lastUpdatedAt: string | null;
};

const state: AppState = {
  apiBaseUrl: "http://localhost:3000",
  presets: [],
  selectedPresetId: "",
  requestText: "",
  responseText: "",
  loading: false,
  errorMessage: null,
  lastUpdatedAt: null
};

const rootElement = document.querySelector<HTMLDivElement>("#app");

if (!rootElement) {
  throw new Error("Missing #app root element.");
}

const root = rootElement;

void boot();

async function boot() {
  await loadPresetManifest();
  render();
}

async function loadPresetManifest() {
  const response = await fetch("/json/seam1/presets.json");
  const manifest = (await response.json()) as PresetManifest;
  state.presets = manifest.presets;
  state.selectedPresetId = manifest.presets[0]?.id ?? "";
  if (manifest.presets[0]) {
    state.requestText = await fetchPresetText(manifest.presets[0].path);
  }
}

function render() {
  const selectedPreset = getSelectedPreset();

  root.innerHTML = `
    <div class="shell">
      <header class="topbar">
        <div class="title-block">
          <p class="eyebrow">chat-analyzer-v2</p>
          <h1>JSON workbench cho Seam 1</h1>
          <p class="subtitle">
            Frontend giữ preset JSON như payload HTTP. Bạn chọn preset, sửa trực tiếp trong editor, rồi gửi nguyên body sang backend.
          </p>
        </div>

        <div class="quickbar">
          <label class="field field-inline">
            <span>Backend API</span>
            <input id="api-base-url" type="text" value="${escapeAttribute(state.apiBaseUrl)}" placeholder="http://localhost:3000" />
          </label>
          <button class="button" data-action="save-api-base">Lưu endpoint</button>
          <button class="button" data-action="reload-presets">Tải lại preset</button>
          <button class="button button-primary" data-action="send-workspace-request">${state.loading ? "Đang gửi..." : "Gửi JSON"}</button>
        </div>
      </header>

      <section class="module-strip">
        ${renderModuleCard("Preset", selectedPreset?.label ?? "chưa có", selectedPreset?.description ?? "Chưa nạp manifest preset")}
        ${renderModuleCard("Action", detectAction(state.requestText) ?? "chưa rõ", "Đọc từ payload JSON hiện tại")}
        ${renderModuleCard("Endpoint", "/seam1/workspace", "Frontend chỉ gọi một endpoint JSON duy nhất")}
        ${renderModuleCard("Trạng thái", state.loading ? "đang chạy" : "sẵn sàng", "Backend sẽ preview hoặc execute tuỳ theo action")}
        ${renderModuleCard("Cập nhật cuối", state.lastUpdatedAt ?? "chưa có", "Ghi sau mỗi response thành công")}
        ${renderModuleCard("Lưu ý", "token không commit", "Preset demo dùng placeholder, hãy dán token thật khi chạy")}
      </section>

      <main class="workspace">
        <section class="control-stack">
          <section class="panel compact-panel">
            <div class="panel-header">
              <div>
                <p class="panel-kicker">Preset</p>
                <h2>Thư viện JSON</h2>
              </div>
              <span class="panel-note">${state.presets.length} preset</span>
            </div>

            <label class="field">
              <span>Chọn preset</span>
              <select id="preset-select">
                ${state.presets
                  .map((preset) => `<option value="${escapeAttribute(preset.id)}" ${preset.id === state.selectedPresetId ? "selected" : ""}>${escapeHtml(preset.label)}</option>`)
                  .join("")}
              </select>
            </label>

            <div class="button-row">
              <button class="button" data-action="load-selected-preset">Nạp preset</button>
              <button class="button" data-action="format-json">Format JSON</button>
            </div>

            <p class="helper-text">
              <code>list_pages_from_token</code> và <code>register_page</code> giúp chuẩn bị config. <code>preview_job</code> và <code>execute_job</code> gửi inline cả page, job và rules.
            </p>
          </section>

          <section class="panel compact-panel">
            <div class="panel-header">
              <div>
                <p class="panel-kicker">Hướng dẫn</p>
                <h2>Luồng chạy thực tế</h2>
              </div>
            </div>

            <div class="compact-form">
              <p class="helper-text">1. Nạp preset <code>List pages from token</code>, dán token thật, rồi bấm <code>Gửi JSON</code>.</p>
              <p class="helper-text">2. Lấy <code>pageId</code> từ response, nạp preset <code>Register page payload</code>, rồi sửa <code>page_id</code>.</p>
              <p class="helper-text">3. Nạp preset <code>Preview manual run</code>, sửa token/page nếu cần, preview để kiểm tra worker job.</p>
              <p class="helper-text">4. Nạp preset <code>Execute manual run</code>, chạy thật, rồi copy <code>etl_run_id</code> sang preset <code>Get run detail</code>.</p>
            </div>
          </section>
        </section>

        <section class="surface-grid">
          <section class="panel surface-panel">
            <div class="panel-header">
              <div>
                <p class="panel-kicker">Request</p>
                <h2>JSON editor</h2>
              </div>
              <span class="panel-note">${selectedPreset?.path ?? "không có preset"}</span>
            </div>

            <textarea id="request-editor" class="json-editor" spellcheck="false">${escapeHtml(state.requestText)}</textarea>
          </section>

          <section class="panel compact-panel surface-panel">
            <div class="panel-header">
              <div>
                <p class="panel-kicker">Response</p>
                <h2>Kết quả backend</h2>
              </div>
              <span class="panel-note">${state.loading ? "đang đợi backend" : "sẵn sàng"}</span>
            </div>

            ${state.errorMessage ? `<div class="error-box">${escapeHtml(state.errorMessage)}</div>` : ""}
            <pre id="response-output" class="json-output compact-output">${escapeHtml(state.responseText || "Chưa có response.")}</pre>
          </section>

          <section class="panel compact-panel surface-panel">
            <div class="panel-header">
              <div>
                <p class="panel-kicker">Ghi chú</p>
                <h2>Ràng buộc vận hành</h2>
              </div>
            </div>

            <div class="compact-form">
              <p class="helper-text">Backend không còn cần file job/page ở phía server cho flow chính. Frontend gửi nguyên JSON payload qua HTTP.</p>
              <p class="helper-text"><code>execute_job</code> sẽ trả luôn kết quả worker và onboarding artifact JSON nếu lấy được <code>etl_run_id</code>.</p>
              <p class="helper-text">Không cần frontend auth ở phase này. Hãy giữ token thật chỉ trong máy local và không commit preset đã sửa.</p>
            </div>
          </section>
        </section>
      </main>
    </div>
  `;

  bindEvents();
}

function bindEvents() {
  document.querySelector<HTMLButtonElement>("[data-action='save-api-base']")?.addEventListener("click", () => {
    const input = document.querySelector<HTMLInputElement>("#api-base-url");
    state.apiBaseUrl = normalizeBaseUrl(input?.value ?? state.apiBaseUrl);
    state.errorMessage = null;
    render();
  });

  document.querySelector<HTMLButtonElement>("[data-action='reload-presets']")?.addEventListener("click", () => {
    void runUiAction(async () => {
      await loadPresetManifest();
    });
  });

  document.querySelector<HTMLButtonElement>("[data-action='load-selected-preset']")?.addEventListener("click", () => {
    void runUiAction(async () => {
      const select = document.querySelector<HTMLSelectElement>("#preset-select");
      state.selectedPresetId = select?.value ?? state.selectedPresetId;
      const preset = getSelectedPreset();
      if (!preset) {
        throw new Error("Không tìm thấy preset.");
      }
      state.requestText = await fetchPresetText(preset.path);
    });
  });

  document.querySelector<HTMLButtonElement>("[data-action='format-json']")?.addEventListener("click", () => {
    syncEditorToState();
    try {
      state.requestText = JSON.stringify(JSON.parse(state.requestText), null, 2);
      state.errorMessage = null;
    } catch (error) {
      state.errorMessage = error instanceof Error ? error.message : String(error);
    }
    render();
  });

  document.querySelector<HTMLButtonElement>("[data-action='send-workspace-request']")?.addEventListener("click", () => {
    void runUiAction(async () => {
      syncEditorToState();
      const payload = JSON.parse(state.requestText) as JsonValue;
      const response = await fetch(`${normalizeBaseUrl(state.apiBaseUrl)}/seam1/workspace`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });
      const raw = await response.text();
      const pretty = formatRawJson(raw);
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}\n${pretty}`);
      }
      state.responseText = pretty;
      state.lastUpdatedAt = new Date().toLocaleString("vi-VN");
    });
  });

  document.querySelector<HTMLSelectElement>("#preset-select")?.addEventListener("change", (event) => {
    const target = event.currentTarget as HTMLSelectElement;
    state.selectedPresetId = target.value;
  });
}

async function runUiAction(action: () => Promise<void>) {
  state.loading = true;
  state.errorMessage = null;
  render();

  try {
    await action();
  } catch (error) {
    state.errorMessage = error instanceof Error ? error.message : String(error);
  } finally {
    state.loading = false;
    render();
  }
}

function syncEditorToState() {
  const editor = document.querySelector<HTMLTextAreaElement>("#request-editor");
  state.requestText = editor?.value ?? state.requestText;
}

async function fetchPresetText(path: string) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Không thể tải preset ${path}`);
  }
  return response.text();
}

function getSelectedPreset() {
  return state.presets.find((preset) => preset.id === state.selectedPresetId) ?? null;
}

function detectAction(requestText: string) {
  try {
    const parsed = JSON.parse(requestText) as { action?: string };
    return typeof parsed.action === "string" ? parsed.action : null;
  } catch {
    return null;
  }
}

function formatRawJson(raw: string) {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
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

function normalizeBaseUrl(value: string) {
  return value.trim().replace(/\/+$/, "") || "http://localhost:3000";
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
