import {
  activateConfigVersion,
  createConfigVersion,
  executeManualJob,
  getConnectedPage,
  getRun,
  getRunGroup,
  listConnectedPages,
  listPagesFromToken,
  previewManualJob,
  publishRun,
  registerPage
} from "./api.ts";
import { renderApp } from "./render.ts";
import type { AppState, ConnectedPageDetail, ProcessingMode, PublishAs } from "./types.ts";
import {
  parseJsonText,
  prettyJson,
  readCheck,
  readInput,
  readSelect,
  readTextArea,
  toDatetimeLocalValue,
  toIsoStringOrNull
} from "./utils.ts";

const rootElement = document.querySelector<HTMLDivElement>("#app");
if (!rootElement) {
  throw new Error("Missing #app root.");
}
const appRoot = rootElement;

const state: AppState = {
  apiBaseUrl: "http://localhost:3000",
  loading: null,
  error: null,
  info: null,
  registerToken: "",
  tokenPages: [],
  registerSelectedPancakePageId: "",
  registerTimezone: "Asia/Ho_Chi_Minh",
  registerEtlEnabled: true,
  registerAnalysisEnabled: false,
  pages: [],
  selectedPageId: "",
  selectedPage: null,
  selectedConfigVersionId: "",
  configPromptText: defaultPromptText(),
  configTagMappingText: prettyJson(defaultTagMapping()),
  configOpeningRulesText: prettyJson(defaultOpeningRules()),
  configSchedulerText: "",
  configNotificationTargetsText: "",
  configNotes: "",
  configActivate: true,
  configEtlEnabled: true,
  configAnalysisEnabled: false,
  jobProcessingMode: "etl_only",
  jobTargetDate: currentDateToken(),
  jobRequestedWindowStartAt: "",
  jobRequestedWindowEndExclusiveAt: "",
  previewResult: null,
  executeResult: null,
  inspectRunGroupId: "",
  runGroupResult: null,
  inspectRunId: "",
  runDetailResult: null,
  publishRunId: "",
  publishAs: "provisional",
  confirmHistoricalOverwrite: false,
  expectedReplacedRunId: "",
  publishResult: null
};

appRoot.addEventListener("click", onClick);

render();
void bootstrap();

async function bootstrap() {
  await withLoading("bootstrap", async () => {
    await refreshConnectedPages();
  });
}

function render() {
  appRoot.innerHTML = renderApp(state);
}

async function onClick(event: MouseEvent) {
  const target = event.target as HTMLElement | null;
  if (!target) {
    return;
  }
  const actionElement = target.closest<HTMLElement>("[data-action]");
  if (!actionElement) {
    return;
  }

  syncInputs();
  state.error = null;
  state.info = null;

  try {
    await act(actionElement.dataset.action ?? "");
  } catch (error) {
    state.error = error instanceof Error ? error.message : String(error);
  }

  render();
}

async function act(action: string) {
  switch (action) {
    case "token-pages":
      await withLoading("token-pages", async () => {
        if (!state.registerToken.trim()) {
          throw new Error("Cần user access token.");
        }
        const data = await listPagesFromToken(state, state.registerToken.trim());
        state.tokenPages = Array.isArray(data) ? data : data.pages ?? [];
        state.registerSelectedPancakePageId = state.tokenPages[0]?.pageId ?? "";
        state.info = `Đã tải ${state.tokenPages.length} page từ token.`;
      });
      return;
    case "register-page":
      await withLoading("register-page", async () => {
        if (!state.registerSelectedPancakePageId) {
          throw new Error("Cần chọn Pancake page.");
        }
        await registerPage(state, {
          pancakePageId: state.registerSelectedPancakePageId,
          userAccessToken: state.registerToken.trim(),
          businessTimezone: state.registerTimezone.trim() || "Asia/Ho_Chi_Minh",
          etlEnabled: state.registerEtlEnabled,
          analysisEnabled: state.registerAnalysisEnabled
        });
        await refreshConnectedPages();
        state.info = "Đã register page và tạo default config.";
      });
      return;
    case "refresh-pages":
      await withLoading("refresh-pages", async () => {
        await refreshConnectedPages();
        state.info = "Đã tải lại danh sách page.";
      });
      return;
    case "load-page":
      await withLoading("load-page", async () => {
        const page = await requireSelectedPage();
        setSelectedPage(page);
        state.info = `Đã tải chi tiết page ${page.pageName}.`;
      });
      return;
    case "create-config":
      await withLoading("create-config", async () => {
        if (!state.selectedPageId) {
          throw new Error("Cần chọn connected page.");
        }
        await createConfigVersion(state, state.selectedPageId, {
          tagMappingJson: parseJsonText(state.configTagMappingText, "tagMappingJson") ?? defaultTagMapping(),
          openingRulesJson: parseJsonText(state.configOpeningRulesText, "openingRulesJson") ?? defaultOpeningRules(),
          schedulerJson: parseJsonText(state.configSchedulerText, "schedulerJson"),
          notificationTargetsJson: parseJsonText(state.configNotificationTargetsText, "notificationTargetsJson"),
          promptText: state.configPromptText.trim(),
          notes: state.configNotes.trim() || null,
          activate: state.configActivate,
          etlEnabled: state.configEtlEnabled,
          analysisEnabled: state.configAnalysisEnabled
        });
        const page = await requireSelectedPage();
        setSelectedPage(page);
        state.info = "Đã tạo config version mới.";
      });
      return;
    case "activate-config":
      await withLoading("activate-config", async () => {
        if (!state.selectedPageId || !state.selectedConfigVersionId) {
          throw new Error("Cần chọn page và config version.");
        }
        const response = await activateConfigVersion(state, state.selectedPageId, state.selectedConfigVersionId);
        setSelectedPage(response.page);
        state.info = "Đã activate config version.";
      });
      return;
    case "use-active-config":
      if (!state.selectedPage?.activeConfigVersion) {
        throw new Error("Page này chưa có active config version.");
      }
      hydrateConfigEditor(state.selectedPage.activeConfigVersion);
      state.info = "Đã nạp active config vào editor.";
      return;
    case "preview-job":
      await withLoading("preview-job", async () => {
        if (!state.selectedPageId) {
          throw new Error("Cần chọn connected page.");
        }
        state.previewResult = await previewManualJob(state, buildManualJobBody());
        state.info = "Đã preview run.";
      });
      return;
    case "execute-job":
      await withLoading("execute-job", async () => {
        if (!state.selectedPageId) {
          throw new Error("Cần chọn connected page.");
        }
        state.executeResult = await executeManualJob(state, buildManualJobBody());
        state.inspectRunGroupId = state.executeResult.run_group.id;
        state.inspectRunId = state.executeResult.child_runs[0]?.id ?? state.inspectRunId;
        state.publishRunId = state.executeResult.child_runs[0]?.id ?? state.publishRunId;
        state.info = "Đã execute run group.";
      });
      return;
    case "load-run-group":
      await withLoading("load-run-group", async () => {
        if (!state.inspectRunGroupId.trim()) {
          throw new Error("Cần run_group_id.");
        }
        state.runGroupResult = await getRunGroup(state, state.inspectRunGroupId.trim());
        state.info = "Đã tải run group.";
      });
      return;
    case "load-run":
      await withLoading("load-run", async () => {
        if (!state.inspectRunId.trim()) {
          throw new Error("Cần run_id.");
        }
        state.runDetailResult = await getRun(state, state.inspectRunId.trim());
        state.info = "Đã tải run detail.";
      });
      return;
    case "publish-run":
      await withLoading("publish-run", async () => {
        if (!state.publishRunId.trim()) {
          throw new Error("Cần run_id để publish.");
        }
        state.publishResult = await publishRun(state, state.publishRunId.trim(), {
          publishAs: state.publishAs,
          confirmHistoricalOverwrite: state.confirmHistoricalOverwrite,
          expectedReplacedRunId: state.expectedReplacedRunId.trim() || null
        });
        state.inspectRunId = state.publishRunId.trim();
        state.info = "Đã publish run.";
      });
      return;
    default:
      return;
  }
}

async function refreshConnectedPages() {
  const response = await listConnectedPages(state);
  state.pages = response.pages ?? [];
  if (!state.pages.some((page) => page.id === state.selectedPageId)) {
    state.selectedPageId = state.pages[0]?.id ?? "";
  }
  if (state.selectedPageId) {
    const page = await requireSelectedPage();
    setSelectedPage(page);
  } else {
    state.selectedPage = null;
    state.selectedConfigVersionId = "";
  }
}

async function requireSelectedPage() {
  if (!state.selectedPageId) {
    throw new Error("Chưa có connected page nào.");
  }
  const response = await getConnectedPage(state, state.selectedPageId);
  return response.page;
}

function setSelectedPage(page: ConnectedPageDetail) {
  state.selectedPage = page;
  state.selectedPageId = page.id;
  state.selectedConfigVersionId = page.activeConfigVersionId ?? page.configVersions[0]?.id ?? "";
  if (page.activeConfigVersion) {
    hydrateConfigEditor(page.activeConfigVersion);
  }
  state.configEtlEnabled = page.etlEnabled;
  state.configAnalysisEnabled = page.analysisEnabled;
}

function hydrateConfigEditor(configVersion: ConnectedPageDetail["activeConfigVersion"] extends infer T ? Exclude<T, null> : never) {
  state.configPromptText = configVersion.promptText;
  state.configTagMappingText = prettyJson(configVersion.tagMappingJson);
  state.configOpeningRulesText = prettyJson(configVersion.openingRulesJson);
  state.configSchedulerText = configVersion.schedulerJson === null ? "" : prettyJson(configVersion.schedulerJson);
  state.configNotificationTargetsText = configVersion.notificationTargetsJson === null ? "" : prettyJson(configVersion.notificationTargetsJson);
  state.configNotes = configVersion.notes ?? "";
}

function buildManualJobBody() {
  const hasTargetDate = state.jobTargetDate.trim().length > 0;
  const hasWindowStart = state.jobRequestedWindowStartAt.trim().length > 0;
  const hasWindowEnd = state.jobRequestedWindowEndExclusiveAt.trim().length > 0;

  if (hasTargetDate && (hasWindowStart || hasWindowEnd)) {
    throw new Error("Chỉ chọn target_date hoặc requested window, không dùng đồng thời.");
  }
  if (!hasTargetDate && !(hasWindowStart && hasWindowEnd)) {
    throw new Error("Cần target_date hoặc đủ requested window start/end.");
  }

  return {
    kind: "manual",
    connectedPageId: state.selectedPageId,
    job: {
      processingMode: state.jobProcessingMode,
      targetDate: hasTargetDate ? state.jobTargetDate.trim() : undefined,
      requestedWindowStartAt: hasWindowStart ? toIsoStringOrNull(state.jobRequestedWindowStartAt) : undefined,
      requestedWindowEndExclusiveAt: hasWindowEnd ? toIsoStringOrNull(state.jobRequestedWindowEndExclusiveAt) : undefined
    }
  };
}

function syncInputs() {
  state.apiBaseUrl = readInput("#api-base-url", state.apiBaseUrl);
  state.registerToken = readInput("#register-token", state.registerToken);
  state.registerSelectedPancakePageId = readSelect("#register-page-id", state.registerSelectedPancakePageId);
  state.registerTimezone = readSelect("#register-timezone", state.registerTimezone);
  state.registerEtlEnabled = readCheck("#register-etl-enabled", state.registerEtlEnabled);
  state.registerAnalysisEnabled = readCheck("#register-analysis-enabled", state.registerAnalysisEnabled);
  state.selectedPageId = readSelect("#connected-page-id", state.selectedPageId);
  state.selectedConfigVersionId = readSelect("#config-version-id", state.selectedConfigVersionId);
  state.configPromptText = readTextArea("#config-prompt-text", state.configPromptText);
  state.configTagMappingText = readTextArea("#config-tag-mapping", state.configTagMappingText);
  state.configOpeningRulesText = readTextArea("#config-opening-rules", state.configOpeningRulesText);
  state.configSchedulerText = readTextArea("#config-scheduler", state.configSchedulerText);
  state.configNotificationTargetsText = readTextArea("#config-notification-targets", state.configNotificationTargetsText);
  state.configNotes = readTextArea("#config-notes", state.configNotes);
  state.configActivate = readCheck("#config-activate", state.configActivate);
  state.configEtlEnabled = readCheck("#config-etl-enabled", state.configEtlEnabled);
  state.configAnalysisEnabled = readCheck("#config-analysis-enabled", state.configAnalysisEnabled);
  state.jobProcessingMode = readSelect("#job-processing-mode", state.jobProcessingMode) as ProcessingMode;
  state.jobTargetDate = readInput("#job-target-date", state.jobTargetDate);
  state.jobRequestedWindowStartAt = readInput("#job-window-start", state.jobRequestedWindowStartAt);
  state.jobRequestedWindowEndExclusiveAt = readInput("#job-window-end", state.jobRequestedWindowEndExclusiveAt);
  state.inspectRunGroupId = readInput("#inspect-run-group-id", state.inspectRunGroupId);
  state.inspectRunId = readInput("#inspect-run-id", state.inspectRunId);
  state.publishRunId = readInput("#publish-run-id", state.publishRunId);
  state.publishAs = readSelect("#publish-as", state.publishAs) as PublishAs;
  state.confirmHistoricalOverwrite = readCheck("#publish-confirm-historical-overwrite", state.confirmHistoricalOverwrite);
  state.expectedReplacedRunId = readInput("#publish-expected-replaced-run-id", state.expectedReplacedRunId);
}

async function withLoading(key: string, fn: () => Promise<void>) {
  state.loading = key;
  render();
  try {
    await fn();
  } finally {
    state.loading = null;
  }
}

function currentDateToken() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function defaultPromptText() {
  return [
    "Mục tiêu vận hành theo page:",
    "- Mô tả quy trình sales/cskh áp dụng cho page này.",
    "",
    "Checklist bắt buộc:",
    "1. ...",
    "2. ...",
    "",
    "Các lỗi cần bắt:",
    "- ...",
    "",
    "Tiêu chí đánh giá phản hồi nhân viên:",
    "- ..."
  ].join("\n");
}

function defaultTagMapping() {
  return {
    version: 1,
    defaultRole: "noise",
    entries: []
  };
}

function defaultOpeningRules() {
  return {
    version: 1,
    selectors: []
  };
}

void toDatetimeLocalValue;
