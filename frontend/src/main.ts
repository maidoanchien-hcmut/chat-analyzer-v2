import {
  commitOnboarding,
  executeManualRun,
  loadComparison,
  loadDashboard,
  loadExploratoryThreads,
  loadHealth,
  loadHistoryDetail,
  loadHistoryThreads,
  loadMappingReview,
  loadOnboardingPages,
  loadOnboardingSample,
  loadPages,
  loadRunGroupThreads,
  loadRunGroups,
  loadSettings,
  savePrompt,
  saveSettings
} from "./api.ts";
import { renderApp } from "./render.ts";
import type { AppState } from "./types.ts";
import {
  addDays,
  dateToken,
  parseProcessingMode,
  parseRunMode,
  parseSortBy,
  parseSortOrder,
  parseView,
  readCheck,
  readInput,
  readSelect,
  readTextArea
} from "./utils.ts";

const rootElement = document.querySelector<HTMLDivElement>("#app");
if (!rootElement) {
  throw new Error("Missing #app root.");
}
const root = rootElement;

const yesterday = dateToken(addDays(new Date(), -1));
const today = dateToken(new Date());

const state: AppState = {
  apiBaseUrl: "http://localhost:3000",
  loading: null,
  error: null,
  info: null,
  view: "dashboard",
  pages: [],
  pageId: "",
  startDate: yesterday,
  endDate: yesterday,
  mood: "",
  need: "",
  customerType: "",
  risk: "",
  dashboard: null,
  exploratory: null,
  historyThreads: [],
  historyThreadId: "",
  historyDetail: null,
  comparison: null,
  search: "",
  minMessages: "",
  sortBy: "latest_message",
  sortOrder: "desc",
  runGroups: [],
  selectedRunGroupId: "",
  runGroupThreads: [],
  mappingReview: [],
  health: null,
  settingTimezone: "Asia/Ho_Chi_Minh",
  settingEtlEnabled: true,
  settingAnalysisEnabled: true,
  settingTagRulesText: "",
  settingOpeningRulesText: "",
  settingPrompt: "",
  activePrompt: "",
  runProcessingMode: "etl_and_ai",
  runMode: "full_day",
  runTargetDate: today,
  runWindowStart: "",
  runWindowEnd: "",
  runMaxConversations: "",
  runMaxMessagePages: "",
  onboardingToken: "",
  onboardingPages: [],
  onboardingPageId: "",
  onboardingTimezone: "Asia/Ho_Chi_Minh",
  onboardingLimit: "25",
  onboardingMode: "etl_only",
  onboardingEtlEnabled: true,
  onboardingAnalysisEnabled: true,
  onboardingTagCandidates: [],
  onboardingCustomTagSignals: [],
  onboardingNewTagSignal: "",
  onboardingOpeningCandidates: [],
  onboardingOpeningMaxMessages: "12",
  onboardingPrompt: `Mục tiêu vận hành theo page (SOP):
- Team áp dụng: (sales / cskh / tên team cụ thể)
- Mục tiêu ca chat: (chốt hẹn, thu lead, chăm sóc sau khám, ...)

Checklist bắt buộc trong hội thoại:
1) ...
2) ...
3) ...

Các lỗi cần bắt:
- Bỏ sót bước nào thì xem là lỗi
- Trường hợp nào xem là vi phạm quy định
- Trường hợp nào phải escalate cho quản lý

Tiêu chí đánh giá chất lượng phản hồi:
- Nhãn tốt / đạt / cần cải thiện theo điều kiện cụ thể
- Ví dụ phản hồi đúng quy trình và phản hồi sai quy trình`,
  onboardingSample: null
};

root.addEventListener("click", onClick);

render();
void bootstrap();

async function bootstrap() {
  await withLoading("bootstrap", async () => {
    await loadPages(state);
    await refreshActiveView();
  });
}

function render() {
  root.innerHTML = renderApp(state);
}

async function onClick(event: MouseEvent) {
  const target = event.target as HTMLElement | null;
  if (!target) {
    return;
  }
  const actionEl = target.closest<HTMLElement>("[data-action]");
  if (!actionEl) {
    return;
  }
  syncInputs();
  state.error = null;
  state.info = null;
  try {
    await act(actionEl.dataset.action ?? "", actionEl.dataset);
  } catch (error) {
    state.error = error instanceof Error ? error.message : String(error);
  }
  render();
}

async function act(action: string, data: DOMStringMap) {
  switch (action) {
    case "switch-view":
      state.view = parseView(data.view);
      await refreshActiveView();
      return;
    case "preset": {
      const days = Math.max(1, Number.parseInt(data.days ?? "1", 10));
      const end = addDays(new Date(), -1);
      const start = addDays(end, -(days - 1));
      state.startDate = dateToken(start);
      state.endDate = dateToken(end);
      await refreshActiveView();
      return;
    }
    case "refresh":
      await refreshActiveView();
      return;
    case "load-threads":
      await withLoading("exploratory", async () => loadExploratoryThreads(state));
      return;
    case "load-history-threads":
      await withLoading("history-threads", async () => loadHistoryThreads(state));
      return;
    case "open-thread": {
      const threadId = data.threadId ?? "";
      if (!threadId) {
        return;
      }
      state.view = "history";
      state.historyThreadId = threadId;
      await withLoading("history-detail", async () => {
        if (state.historyThreads.length === 0) {
          await loadHistoryThreads(state);
        }
        await loadHistoryDetail(state, threadId);
      });
      return;
    }
    case "load-setting":
      await withLoading("setting-load", async () => loadSettings(state));
      return;
    case "save-setting":
      await withLoading("setting-save", async () => {
        await saveSettings(state);
        state.info = "Đã lưu config page.";
      });
      return;
    case "save-prompt":
      await withLoading("prompt-save", async () => {
        await savePrompt(state);
        state.info = "Đã tạo và activate prompt.";
      });
      return;
    case "execute-run":
      await withLoading("manual-run", async () => {
        const jobName = await executeManualRun(state);
        state.info = `Đã chạy job ${jobName}.`;
        await loadRunGroups(state);
      });
      return;
    case "load-run-groups":
      await withLoading("run-groups", async () => loadRunGroups(state));
      return;
    case "load-run-group-threads":
      await withLoading("run-group-threads", async () => loadRunGroupThreads(state));
      return;
    case "load-mapping-review":
      await withLoading("mapping-review", async () => loadMappingReview(state));
      return;
    case "load-health":
      await withLoading("health", async () => loadHealth(state));
      return;
    case "ob-list-pages":
      await withLoading("onboarding-pages", async () => loadOnboardingPages(state));
      return;
    case "ob-sample":
      await withLoading("onboarding-sample", async () => loadOnboardingSample(state));
      return;
    case "ob-commit":
      await withLoading("onboarding-commit", async () => {
        await commitOnboarding(state);
        await loadPages(state);
        state.view = "settings";
        await refreshActiveView();
        state.info = "Đã thêm page thành công.";
      });
      return;
    case "ob-add-tag-signal": {
      const key = canonicalSignalKey(state.onboardingNewTagSignal);
      if (!key) {
        throw new Error("Signal mới không hợp lệ. Chỉ dùng chữ thường, số và dấu gạch dưới.");
      }
      if (!state.onboardingCustomTagSignals.includes(key)) {
        state.onboardingCustomTagSignals = [...state.onboardingCustomTagSignals, key].sort();
      }
      state.onboardingNewTagSignal = "";
      return;
    }
    default:
      return;
  }
}

async function refreshActiveView() {
  switch (state.view) {
    case "onboarding":
      return;
    case "dashboard":
      await withLoading("dashboard", async () => loadDashboard(state));
      return;
    case "exploratory":
      await withLoading("exploratory", async () => loadExploratoryThreads(state));
      return;
    case "history":
      await withLoading("history", async () => {
        await loadHistoryThreads(state);
        if (state.historyThreadId) {
          await loadHistoryDetail(state, state.historyThreadId);
        }
      });
      return;
    case "comparison":
      await withLoading("comparison", async () => loadComparison(state));
      return;
    case "settings":
      await withLoading("settings", async () => {
        await loadSettings(state);
        await loadRunGroups(state);
        await loadMappingReview(state);
        await loadHealth(state);
      });
      return;
  }
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

function syncInputs() {
  state.pageId = readSelect("#page-id", state.pageId);
  state.startDate = readInput("#start-date", state.startDate);
  state.endDate = readInput("#end-date", state.endDate);
  state.mood = readInput("#dice-mood", state.mood).trim();
  state.need = readInput("#dice-need", state.need).trim();
  state.customerType = readInput("#dice-type", state.customerType).trim();
  state.risk = readInput("#dice-risk", state.risk).trim();
  state.search = readInput("#search", state.search).trim();
  state.search = readInput("#history-search", state.search).trim();
  state.minMessages = readInput("#min-messages", state.minMessages).trim();
  state.sortBy = parseSortBy(readSelect("#sort-by", state.sortBy));
  state.sortOrder = parseSortOrder(readSelect("#sort-order", state.sortOrder));
  state.settingTimezone = readSelect("#setting-timezone", state.settingTimezone);
  state.settingEtlEnabled = readCheck("#setting-etl", state.settingEtlEnabled);
  state.settingAnalysisEnabled = readCheck("#setting-analysis", state.settingAnalysisEnabled);
  state.settingTagRulesText = readTextArea("#setting-tag-rules", state.settingTagRulesText);
  state.settingOpeningRulesText = readTextArea("#setting-opening-rules", state.settingOpeningRulesText);
  state.settingPrompt = readTextArea("#setting-prompt", state.settingPrompt);
  state.runProcessingMode = parseProcessingMode(readSelect("#run-processing", state.runProcessingMode));
  state.runMode = parseRunMode(readSelect("#run-mode", state.runMode));
  state.runTargetDate = readInput("#run-target-date", state.runTargetDate);
  state.runWindowStart = readInput("#run-window-start", state.runWindowStart);
  state.runWindowEnd = readInput("#run-window-end", state.runWindowEnd);
  state.runMaxConversations = readInput("#run-max-conversations", state.runMaxConversations).trim();
  state.runMaxMessagePages = readInput("#run-max-message-pages", state.runMaxMessagePages).trim();
  state.selectedRunGroupId = readSelect("#run-group-id", state.selectedRunGroupId);
  state.onboardingToken = readInput("#ob-token", state.onboardingToken);
  state.onboardingPageId = readSelect("#ob-page-id", state.onboardingPageId);
  state.onboardingTimezone = readSelect("#ob-timezone", state.onboardingTimezone);
  state.onboardingLimit = readInput("#ob-limit", state.onboardingLimit);
  state.onboardingMode = parseProcessingMode(readSelect("#ob-mode", state.onboardingMode));
  state.onboardingEtlEnabled = readCheck("#ob-etl", state.onboardingEtlEnabled);
  state.onboardingAnalysisEnabled = readCheck("#ob-analysis", state.onboardingAnalysisEnabled);
  state.onboardingOpeningMaxMessages = readInput("#ob-opening-max", state.onboardingOpeningMaxMessages).trim();
  state.onboardingPrompt = readTextArea("#ob-prompt", state.onboardingPrompt);
  state.onboardingNewTagSignal = readInput("#ob-new-tag-signal", state.onboardingNewTagSignal);
  syncOnboardingCandidateInputs();
}

function syncOnboardingCandidateInputs() {
  for (let index = 0; index < state.onboardingTagCandidates.length; index += 1) {
    const next = readSelect(`#ob-tag-signal-${index}`, state.onboardingTagCandidates[index].signal);
    state.onboardingTagCandidates[index].signal = next.trim();
  }
  for (let index = 0; index < state.onboardingOpeningCandidates.length; index += 1) {
    const signal = readSelect(`#ob-opening-signal-${index}`, state.onboardingOpeningCandidates[index].signal);
    const decision = readInput(`#ob-opening-decision-${index}`, state.onboardingOpeningCandidates[index].decision);
    state.onboardingOpeningCandidates[index].signal = signal.trim();
    state.onboardingOpeningCandidates[index].decision = decision.trim();
  }
}

function canonicalSignalKey(value: string) {
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return /^[a-z][a-z0-9_]*$/.test(normalized) ? normalized : "";
}
