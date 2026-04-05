import { createHttpBusinessAdapter } from "../adapters/http/business-adapter.ts";
import { createControlPlaneAdapter } from "../adapters/http/control-plane-adapter.ts";
import { DEFAULT_API_BASE_URL, FEATURE_SOURCE_MATRIX, NAV_ITEMS, STORAGE_API_BASE_URL, VIEW_TITLES } from "../core/config.ts";
import type { AppToast, AsyncStatus, BusinessFilters, RouteState } from "../core/types.ts";
import { renderConfiguration } from "../features/configuration/render.ts";
import {
  buildCreateConfigVersionInput,
  configVersionToDraft,
  createDefaultScheduler,
  createEmptyNotificationTarget,
  createEmptyOpeningRule,
  createEmptyTagMapping
} from "../features/configuration/state.ts";
import { renderExploration } from "../features/exploration/render.ts";
import { renderExportWorkflow } from "../features/export/render.ts";
import { renderOperations } from "../features/operations/render.ts";
import {
  derivePublishAction,
  findRunForPublish
} from "../features/operations/state.ts";
import { sanitizePageComparisonFilters } from "../features/page-comparison/state.ts";
import { renderOverview } from "../features/overview/render.ts";
import { renderPageComparison } from "../features/page-comparison/render.ts";
import { renderStaffPerformance } from "../features/staff-performance/render.ts";
import { renderThreadHistory } from "../features/thread-history/render.ts";
import { defaultDateRange, isoFromDatetimeLocal } from "../shared/dates.ts";
import { exportBusinessWorkbook } from "../shared/export.ts";
import { escapeHtml } from "../shared/html.ts";
import { createDefaultExportWorkflowState, ensureExportWorkflowPage, readExportRequest, type ExportWorkflowState } from "./export-workflow.ts";
import { applyBusinessFilters, parseRouteState, reconcileRouteStateWithCatalog, serializeRouteState } from "./query-state.ts";
import type { ConfigurationState, OnboardingState, OperationsState } from "./screen-state.ts";

export class FrontendApp {
  private readonly root: HTMLDivElement;
  private readonly businessAdapter = createHttpBusinessAdapter(() => this.apiBaseUrl);
  private readonly controlPlaneAdapter = createControlPlaneAdapter(() => this.apiBaseUrl);
  private route = parseRouteState(window.location.search);
  private apiBaseUrl = localStorage.getItem(STORAGE_API_BASE_URL)?.trim() || DEFAULT_API_BASE_URL;
  private asyncStatus: AsyncStatus = { pending: false, label: null };
  private toast: AppToast | null = null;
  private catalog: Awaited<ReturnType<typeof this.businessAdapter.loadCatalog>> | null = null;
  private currentViewHtml = "";
  private exportWorkflow: ExportWorkflowState = createDefaultExportWorkflowState();
  private onboarding: OnboardingState = { token: "", tokenPages: [], selectedPancakePageId: "", timezone: "Asia/Ho_Chi_Minh", etlEnabled: true, analysisEnabled: false };
  private configuration: ConfigurationState = {
    activeTab: "page-info",
    connectedPages: [],
    selectedPageId: "",
    pageDetail: null,
    selectedConfigVersionId: "",
    promptText: defaultPromptText(),
    tagMappings: [createEmptyTagMapping()],
    openingRules: [createEmptyOpeningRule()],
    scheduler: createDefaultScheduler(),
    notificationTargets: [createEmptyNotificationTarget()],
    notes: "",
    activateAfterCreate: true,
    etlEnabled: true,
    analysisEnabled: false,
    promptPreview: null,
    promptCloneSourceVersionId: "",
    promptCloneSourcePageId: "",
    promptCompareLeftVersionId: "",
    promptCompareRightVersionId: ""
  };
  private operations: OperationsState = {
    activePanel: "manual-run",
    connectedPages: [],
    selectedPageId: "",
    processingMode: "etl_only",
    targetDate: defaultDateRange("yesterday").endDate,
    requestedWindowStartAt: "",
    requestedWindowEndExclusiveAt: "",
    previewResult: null,
    runGroup: null,
    runDetail: null,
    inspectRunGroupId: "",
    inspectRunId: "",
    publishRunId: "",
    publishAs: "provisional",
    confirmHistoricalOverwrite: false,
    expectedReplacedRunId: "",
    mappingQueue: [],
    healthSummary: null
  };

  constructor(root: HTMLDivElement) {
    this.root = root;
  }

  async init() {
    this.root.addEventListener("click", (event) => void this.onClick(event));
    this.root.addEventListener("submit", (event) => void this.onSubmit(event));
    this.root.addEventListener("change", (event) => void this.onChange(event));
    window.addEventListener("popstate", () => void this.restoreFromLocation());
    await this.withPending("load-shell", async () => {
      this.catalog = await this.businessAdapter.loadCatalog();
      const nextRoute = reconcileRouteStateWithCatalog(this.route, this.catalog.pages);
      if (serializeRouteState(nextRoute) !== serializeRouteState(this.route)) {
        this.route = nextRoute;
        window.history.replaceState({}, "", `?${serializeRouteState(this.route)}`);
      }
      this.exportWorkflow = ensureExportWorkflowPage(this.exportWorkflow, this.catalog.pages);
      await this.loadCurrentView();
    });
    this.render();
  }

  private async restoreFromLocation() {
    this.route = parseRouteState(window.location.search);
    if (this.catalog) {
      const nextRoute = reconcileRouteStateWithCatalog(this.route, this.catalog.pages);
      if (serializeRouteState(nextRoute) !== serializeRouteState(this.route)) {
        this.route = nextRoute;
        window.history.replaceState({}, "", `?${serializeRouteState(this.route)}`);
      }
      this.exportWorkflow = ensureExportWorkflowPage(this.exportWorkflow, this.catalog.pages);
    }
    await this.loadCurrentView();
    this.render();
  }

  private async onClick(event: MouseEvent) {
    const target = event.target as HTMLElement | null;
    if (!target) {
      return;
    }
    const routeElement = target.closest<HTMLElement>("[data-route]");
    if (routeElement) {
      event.preventDefault();
      this.route = mergeRouteSearch(this.route, routeElement.dataset.route ?? "");
      if (this.catalog) {
        this.route = reconcileRouteStateWithCatalog(this.route, this.catalog.pages);
      }
      window.history.pushState({}, "", `?${serializeRouteState(this.route)}`);
      await this.loadCurrentView();
      this.render();
      return;
    }
    const action = target.closest<HTMLElement>("[data-action]")?.dataset.action;
    if (!action) {
      return;
    }
    event.preventDefault();
    try {
      if (action === "refresh-control-pages") {
        await this.refreshControlPages();
        this.toast = { kind: "info", message: "Đã tải connected page từ seam HTTP thật." };
      } else if (action === "use-active-config" && this.configuration.pageDetail?.activeConfigVersion) {
        this.hydrateConfig(this.configuration.pageDetail.activeConfigVersion);
        this.toast = { kind: "info", message: "Đã nạp active config." };
      } else if (action === "load-prompt-preview") {
        this.configuration.promptPreview = await this.businessAdapter.getPromptPreview();
        this.toast = { kind: "info", message: "Đã nạp sample preview cho prompt profile." };
      } else if (action === "activate-config-version") {
        await this.activateConfigVersion();
      } else if (action === "execute-manual-run") {
        await this.executeManualRun(target.closest("form"));
      } else if (action === "load-run-group") {
        await this.loadRunGroup(target.closest("form"));
      } else if (action === "load-run-detail") {
        await this.loadRunDetail(target.closest("form"));
      } else if (action === "publish-run") {
        await this.publishRun(target.closest("form"));
      } else if (action === "download-export-workbook") {
        if (!this.exportWorkflow.workbook) {
          throw new Error("Cần preview export trước khi tải .xlsx.");
        }
        exportBusinessWorkbook(this.exportWorkflow.workbook);
        this.toast = { kind: "info", message: "Đã tạo file .xlsx business-facing từ workflow export riêng." };
      } else if (action === "add-tag-mapping-row") {
        this.syncConfigurationDraftFromForm(target.closest("form"));
        this.configuration.tagMappings = [...this.configuration.tagMappings, createEmptyTagMapping()];
      } else if (action === "add-opening-rule-row") {
        this.syncConfigurationDraftFromForm(target.closest("form"));
        this.configuration.openingRules = [...this.configuration.openingRules, createEmptyOpeningRule()];
      } else if (action === "add-notification-target-row") {
        this.syncConfigurationDraftFromForm(target.closest("form"));
        this.configuration.notificationTargets = [...this.configuration.notificationTargets, createEmptyNotificationTarget()];
      } else if (action === "clone-prompt-from-version") {
        this.syncConfigurationDraftFromForm(target.closest("form"));
        const configVersion = this.configuration.pageDetail?.configVersions.find((item) => item.id === this.configuration.promptCloneSourceVersionId) ?? null;
        if (!configVersion) {
          throw new Error("Cần chọn prompt version để clone.");
        }
        this.configuration.promptText = configVersion.promptText;
        this.toast = { kind: "info", message: `Đã clone prompt từ v${configVersion.versionNo}.` };
      } else if (action === "clone-prompt-from-page") {
        this.syncConfigurationDraftFromForm(target.closest("form"));
        if (!this.configuration.promptCloneSourcePageId) {
          throw new Error("Cần chọn page nguồn để clone prompt.");
        }
        const sourcePage = await this.controlPlaneAdapter.getConnectedPage(this.configuration.promptCloneSourcePageId);
        if (!sourcePage.activeConfigVersion) {
          throw new Error("Page nguồn chưa có active config để clone.");
        }
        this.configuration.promptText = sourcePage.activeConfigVersion.promptText;
        this.toast = { kind: "info", message: `Đã clone prompt từ page ${sourcePage.pageName}.` };
      }
    } catch (error) {
      this.toast = { kind: "error", message: error instanceof Error ? error.message : String(error) };
    }
    this.render();
  }

  private async onSubmit(event: Event) {
    const form = event.target as HTMLFormElement | null;
    if (!form?.dataset.form) {
      return;
    }
    event.preventDefault();
    try {
      if (form.dataset.form === "app-base-url") {
        this.apiBaseUrl = String(new FormData(form).get("apiBaseUrl") ?? DEFAULT_API_BASE_URL).trim() || DEFAULT_API_BASE_URL;
        localStorage.setItem(STORAGE_API_BASE_URL, this.apiBaseUrl);
        this.toast = { kind: "info", message: "Đã cập nhật backend base URL." };
      } else if (form.dataset.form === "business-filters") {
        const data = new FormData(form);
        const slicePreset = String(data.get("slicePreset") ?? this.route.filters.slicePreset) as BusinessFilters["slicePreset"];
        this.route = applyBusinessFilters(this.route, {
          pageId: String(data.get("pageId") ?? this.route.filters.pageId),
          slicePreset,
          startDate: String(data.get("startDate") ?? this.route.filters.startDate),
          endDate: String(data.get("endDate") ?? this.route.filters.endDate),
          publishSnapshot: String(data.get("publishSnapshot") ?? this.route.filters.publishSnapshot) as BusinessFilters["publishSnapshot"],
          inboxBucket: String(data.get("inboxBucket") ?? this.route.filters.inboxBucket) as BusinessFilters["inboxBucket"],
          revisit: String(data.get("revisit") ?? this.route.filters.revisit) as BusinessFilters["revisit"],
          need: String(data.get("need") ?? this.route.filters.need),
          outcome: String(data.get("outcome") ?? this.route.filters.outcome),
          risk: String(data.get("risk") ?? this.route.filters.risk),
          staff: String(data.get("staff") ?? this.route.filters.staff)
        });
        window.history.replaceState({}, "", `?${serializeRouteState(this.route)}`);
        await this.loadCurrentView();
      } else if (form.dataset.form === "onboarding-token") {
        await this.listFromToken(form);
      } else if (form.dataset.form === "onboarding-register") {
        await this.registerPage(form);
      } else if (form.dataset.form === "page-comparison-filters") {
        if (!this.catalog) {
          throw new Error("Catalog chưa sẵn sàng để chọn page compare.");
        }
        const data = new FormData(form);
        const slicePreset = String(data.get("slicePreset") ?? this.route.filters.slicePreset) as BusinessFilters["slicePreset"];
        this.route = applyBusinessFilters({
          ...this.route,
          comparePageIds: normalizeComparePageIds(data.getAll("comparePageIds").map(String), this.catalog.pages)
        }, {
          slicePreset,
          startDate: String(data.get("startDate") ?? this.route.filters.startDate),
          endDate: String(data.get("endDate") ?? this.route.filters.endDate),
          publishSnapshot: String(data.get("publishSnapshot") ?? this.route.filters.publishSnapshot) as BusinessFilters["publishSnapshot"]
        });
        window.history.replaceState({}, "", `?${serializeRouteState(this.route)}`);
        await this.loadCurrentView();
      } else if (form.dataset.form === "configuration-load-page") {
        await this.loadConnectedPage(form);
      } else if (form.dataset.form === "configuration-create") {
        await this.createConfigVersion(form);
      } else if (form.dataset.form === "operations-preview") {
        await this.previewManualRun(form);
      } else if (form.dataset.form === "export-workflow") {
        await this.previewExportWorkbook(form);
      }
    } catch (error) {
      this.toast = { kind: "error", message: error instanceof Error ? error.message : String(error) };
    }
    this.render();
  }

  private async onChange(event: Event) {
    const form = (event.target as HTMLElement | null)?.closest<HTMLFormElement>("form");
    if (!form?.dataset.form) {
      return;
    }
    try {
      if (form.dataset.form === "business-filters") {
        const data = new FormData(form);
        const slicePreset = String(data.get("slicePreset") ?? this.route.filters.slicePreset) as BusinessFilters["slicePreset"];
        this.route = applyBusinessFilters(this.route, {
          pageId: String(data.get("pageId") ?? this.route.filters.pageId),
          slicePreset,
          startDate: String(data.get("startDate") ?? this.route.filters.startDate),
          endDate: String(data.get("endDate") ?? this.route.filters.endDate),
          publishSnapshot: String(data.get("publishSnapshot") ?? this.route.filters.publishSnapshot) as BusinessFilters["publishSnapshot"],
          inboxBucket: String(data.get("inboxBucket") ?? this.route.filters.inboxBucket) as BusinessFilters["inboxBucket"],
          revisit: String(data.get("revisit") ?? this.route.filters.revisit) as BusinessFilters["revisit"],
          need: String(data.get("need") ?? this.route.filters.need),
          outcome: String(data.get("outcome") ?? this.route.filters.outcome),
          risk: String(data.get("risk") ?? this.route.filters.risk),
          staff: String(data.get("staff") ?? this.route.filters.staff)
        });
        window.history.replaceState({}, "", `?${serializeRouteState(this.route)}`);
        await this.loadCurrentView();
      } else if (form.dataset.form === "page-comparison-filters") {
        if (!this.catalog) {
          return;
        }
        const data = new FormData(form);
        const slicePreset = String(data.get("slicePreset") ?? this.route.filters.slicePreset) as BusinessFilters["slicePreset"];
        this.route = applyBusinessFilters({
          ...this.route,
          comparePageIds: normalizeComparePageIds(data.getAll("comparePageIds").map(String), this.catalog.pages)
        }, {
          slicePreset,
          startDate: String(data.get("startDate") ?? this.route.filters.startDate),
          endDate: String(data.get("endDate") ?? this.route.filters.endDate),
          publishSnapshot: String(data.get("publishSnapshot") ?? this.route.filters.publishSnapshot) as BusinessFilters["publishSnapshot"]
        });
        window.history.replaceState({}, "", `?${serializeRouteState(this.route)}`);
        await this.loadCurrentView();
      } else if (form.dataset.form === "configuration-create") {
        this.syncConfigurationDraftFromForm(form);
      } else if (form.dataset.form === "operations-publish") {
        const data = new FormData(form);
        this.operations.publishRunId = String(data.get("publishRunId") ?? this.operations.publishRunId).trim();
        this.operations.expectedReplacedRunId = String(data.get("expectedReplacedRunId") ?? this.operations.expectedReplacedRunId).trim();
        this.operations.confirmHistoricalOverwrite = data.get("confirmHistoricalOverwrite") !== null;
      } else if (form.dataset.form === "export-workflow") {
        const data = new FormData(form);
        this.exportWorkflow.selectedPageId = String(data.get("pageId") ?? this.exportWorkflow.selectedPageId).trim();
        this.exportWorkflow.startDate = String(data.get("startDate") ?? this.exportWorkflow.startDate).trim();
        this.exportWorkflow.endDate = String(data.get("endDate") ?? this.exportWorkflow.endDate).trim();
      } else {
        return;
      }
      this.render();
    } catch (error) {
      this.toast = { kind: "error", message: error instanceof Error ? error.message : String(error) };
      this.render();
    }
  }

  private async loadCurrentView() {
    if (!this.catalog) {
      return;
    }
    if (this.route.view !== "operations" && this.route.view !== "configuration" && !this.route.filters.pageId) {
      this.currentViewHtml = renderNoConnectedPageState();
      return;
    }
    if (this.route.view === "overview") {
      this.currentViewHtml = renderOverview(await this.businessAdapter.getOverview(this.route.filters));
      return;
    }
    if (this.route.view === "exploration") {
      this.currentViewHtml = renderExploration(await this.businessAdapter.getExploration(this.route.filters));
      return;
    }
    if (this.route.view === "staff-performance") {
      this.currentViewHtml = renderStaffPerformance(await this.businessAdapter.getStaffPerformance(this.route.filters));
      return;
    }
    if (this.route.view === "thread-history") {
      this.currentViewHtml = renderThreadHistory(
        await this.businessAdapter.getThreadHistory(this.route.filters, this.route.threadId, this.route.threadDayId, this.route.threadTab)
      );
      return;
    }
    if (this.route.view === "page-comparison") {
      const comparePageIds = normalizeComparePageIds(this.route.comparePageIds, this.catalog.pages);
      const compareFilters = sanitizePageComparisonFilters(this.route.filters);
      this.currentViewHtml = renderPageComparison(
        await this.businessAdapter.getPageComparison(compareFilters, comparePageIds),
        {
          pages: this.catalog.pages,
          comparePageIds,
          slicePreset: compareFilters.slicePreset,
          startDate: compareFilters.startDate,
          endDate: compareFilters.endDate,
          publishSnapshot: compareFilters.publishSnapshot
        }
      );
      return;
    }
    this.configuration.activeTab = this.route.configurationTab;
    this.operations.activePanel = this.route.operationPanel;
    if (this.configuration.connectedPages.length === 0) {
      await this.refreshControlPages();
    }
    if (this.route.view === "operations") {
      this.operations.healthSummary = await this.controlPlaneAdapter.getHealthSummary();
    }
    this.currentViewHtml = this.route.view === "operations"
      ? renderOperations(this.operations)
      : renderConfiguration(this.configuration, this.onboarding);
  }

  private async listFromToken(form: HTMLFormElement) {
    const data = new FormData(form);
    this.onboarding.token = String(data.get("token") ?? "");
    this.onboarding.timezone = String(data.get("timezone") ?? "Asia/Ho_Chi_Minh");
    this.onboarding.etlEnabled = data.get("etlEnabled") !== null;
    this.onboarding.analysisEnabled = data.get("analysisEnabled") !== null;
    await this.withPending("list-from-token", async () => {
      this.onboarding.tokenPages = await this.controlPlaneAdapter.listPagesFromToken(this.onboarding.token.trim());
      this.onboarding.selectedPancakePageId = this.onboarding.tokenPages[0]?.pageId ?? "";
      this.toast = { kind: "info", message: `Đã tải ${this.onboarding.tokenPages.length} page từ token.` };
    });
  }

  private async registerPage(form: HTMLFormElement) {
    const data = new FormData(form);
    const pancakePageId = String(data.get("pancakePageId") ?? this.onboarding.selectedPancakePageId).trim();
    if (!pancakePageId) {
      throw new Error("Cần chọn Pancake page.");
    }
    await this.withPending("register-page", async () => {
      await this.controlPlaneAdapter.registerPage({
        pancakePageId,
        userAccessToken: this.onboarding.token.trim(),
        businessTimezone: this.onboarding.timezone,
        etlEnabled: this.onboarding.etlEnabled,
        analysisEnabled: this.onboarding.analysisEnabled
      });
      await this.refreshControlPages();
      this.toast = { kind: "info", message: "Đã register page qua HTTP thật." };
    });
  }

  private async refreshControlPages() {
    await this.withPending("list-connected-pages", async () => {
      const pages = await this.controlPlaneAdapter.listConnectedPages();
      this.configuration.connectedPages = pages;
      this.operations.connectedPages = pages;
      this.configuration.selectedPageId ||= pages[0]?.id ?? "";
      this.operations.selectedPageId ||= pages[0]?.id ?? "";
    });
  }

  private async loadConnectedPage(form: HTMLFormElement) {
    const pageId = String(new FormData(form).get("selectedPageId") ?? this.configuration.selectedPageId).trim();
    if (!pageId) {
      throw new Error("Cần chọn connected page.");
    }
    await this.withPending("get-connected-page", async () => {
      const detail = await this.controlPlaneAdapter.getConnectedPage(pageId);
      this.configuration.selectedPageId = pageId;
      this.configuration.pageDetail = detail;
      this.configuration.selectedConfigVersionId = detail.activeConfigVersionId ?? detail.configVersions[0]?.id ?? "";
      this.configuration.etlEnabled = detail.etlEnabled;
      this.configuration.analysisEnabled = detail.analysisEnabled;
      this.configuration.promptCloneSourcePageId = "";
      this.configuration.promptCloneSourceVersionId = this.configuration.selectedConfigVersionId;
      this.configuration.promptCompareLeftVersionId = detail.configVersions[0]?.id ?? "";
      this.configuration.promptCompareRightVersionId = detail.configVersions[1]?.id ?? detail.configVersions[0]?.id ?? "";
      this.hydrateConfig(detail.activeConfigVersion ?? detail.configVersions[0] ?? null);
      this.toast = { kind: "info", message: `Đã tải chi tiết page ${detail.pageName}.` };
    });
  }

  private async createConfigVersion(form: HTMLFormElement) {
    if (!this.configuration.selectedPageId) {
      throw new Error("Cần chọn connected page trước khi tạo config version.");
    }
    this.syncConfigurationDraftFromForm(form);
    await this.withPending("create-config-version", async () => {
      await this.controlPlaneAdapter.createConfigVersion(
        this.configuration.selectedPageId,
        buildCreateConfigVersionInput({
          promptText: this.configuration.promptText,
          tagMappings: this.configuration.tagMappings,
          openingRules: this.configuration.openingRules,
          scheduler: this.configuration.scheduler,
          notificationTargets: this.configuration.notificationTargets,
          notes: this.configuration.notes,
          activate: this.configuration.activateAfterCreate,
          etlEnabled: this.configuration.etlEnabled,
          analysisEnabled: this.configuration.analysisEnabled
        })
      );
      const detail = await this.controlPlaneAdapter.getConnectedPage(this.configuration.selectedPageId);
      this.configuration.pageDetail = detail;
      this.configuration.selectedConfigVersionId = detail.activeConfigVersionId ?? detail.configVersions[0]?.id ?? "";
      this.hydrateConfig(detail.activeConfigVersion ?? detail.configVersions[0] ?? null);
      this.toast = { kind: "info", message: "Đã tạo config version mới." };
    });
  }

  private async activateConfigVersion() {
    const selectedConfigVersionId = this.root.querySelector<HTMLSelectElement>("[data-form='configuration-create'] select[name='selectedConfigVersionId']")?.value
      ?? this.configuration.selectedConfigVersionId;
    if (!this.configuration.selectedPageId || !selectedConfigVersionId) {
      throw new Error("Cần chọn page và config version.");
    }
    await this.withPending("activate-config-version", async () => {
      this.configuration.selectedConfigVersionId = selectedConfigVersionId;
      this.configuration.pageDetail = await this.controlPlaneAdapter.activateConfigVersion(
        this.configuration.selectedPageId,
        selectedConfigVersionId
      );
      this.hydrateConfig(this.configuration.pageDetail.activeConfigVersion ?? null);
      this.toast = { kind: "info", message: "Đã activate config version." };
    });
  }

  private async previewManualRun(form: HTMLFormElement) {
    const data = new FormData(form);
    this.operations.selectedPageId = String(data.get("connectedPageId") ?? this.operations.selectedPageId).trim();
    this.operations.processingMode = String(data.get("processingMode") ?? this.operations.processingMode) as OperationsState["processingMode"];
    this.operations.targetDate = String(data.get("targetDate") ?? "");
    this.operations.requestedWindowStartAt = String(data.get("requestedWindowStartAt") ?? "");
    this.operations.requestedWindowEndExclusiveAt = String(data.get("requestedWindowEndExclusiveAt") ?? "");
    const input = readManualRunInput(data, this.operations.selectedPageId);
    await this.withPending("preview-manual-run", async () => {
      this.operations.selectedPageId = input.connectedPageId;
      this.operations.previewResult = await this.controlPlaneAdapter.previewManualRun(input);
      this.toast = { kind: "info", message: "Đã preview manual run." };
    });
  }

  private async executeManualRun(form: HTMLFormElement | null) {
    if (!form) {
      throw new Error("Thiếu form manual run.");
    }
    const data = new FormData(form);
    this.operations.selectedPageId = String(data.get("connectedPageId") ?? this.operations.selectedPageId).trim();
    this.operations.processingMode = String(data.get("processingMode") ?? this.operations.processingMode) as OperationsState["processingMode"];
    this.operations.targetDate = String(data.get("targetDate") ?? "");
    this.operations.requestedWindowStartAt = String(data.get("requestedWindowStartAt") ?? "");
    this.operations.requestedWindowEndExclusiveAt = String(data.get("requestedWindowEndExclusiveAt") ?? "");
    const input = readManualRunInput(data, this.operations.selectedPageId);
    await this.withPending("execute-manual-run", async () => {
      this.operations.selectedPageId = input.connectedPageId;
      this.operations.runGroup = await this.controlPlaneAdapter.executeManualRun(input);
      this.operations.inspectRunGroupId = this.operations.runGroup.id;
      this.operations.inspectRunId = this.operations.runGroup.childRuns[0]?.id ?? "";
      this.operations.publishRunId = this.operations.runGroup.childRuns[0]?.id ?? "";
      this.toast = { kind: "info", message: "Đã execute manual run." };
    });
  }

  private async loadRunGroup(form: HTMLFormElement | null) {
    const runGroupId = String(new FormData(form ?? document.createElement("form")).get("inspectRunGroupId") ?? this.operations.inspectRunGroupId).trim();
    if (!runGroupId) {
      throw new Error("Cần run_group_id.");
    }
    await this.withPending("get-run-group", async () => {
      this.operations.inspectRunGroupId = runGroupId;
      this.operations.runGroup = await this.controlPlaneAdapter.getRunGroup(runGroupId);
      this.toast = { kind: "info", message: "Đã tải run group." };
    });
  }

  private async loadRunDetail(form: HTMLFormElement | null) {
    const runId = String(new FormData(form ?? document.createElement("form")).get("inspectRunId") ?? this.operations.inspectRunId).trim();
    if (!runId) {
      throw new Error("Cần run_id.");
    }
    await this.withPending("get-run-detail", async () => {
      this.operations.inspectRunId = runId;
      this.operations.runDetail = await this.controlPlaneAdapter.getRun(runId);
      this.toast = { kind: "info", message: "Đã tải run detail." };
    });
  }

  private async publishRun(form: HTMLFormElement | null) {
    const data = new FormData(form ?? document.createElement("form"));
    const runId = String(data.get("publishRunId") ?? this.operations.publishRunId).trim();
    if (!runId) {
      throw new Error("Cần run_id để publish.");
    }
    this.operations.publishRunId = runId;
    this.operations.expectedReplacedRunId = String(data.get("expectedReplacedRunId") ?? this.operations.expectedReplacedRunId).trim();
    this.operations.confirmHistoricalOverwrite = data.get("confirmHistoricalOverwrite") !== null;
    const run = findRunForPublish(this.operations.runGroup, this.operations.runDetail, runId);
    if (!run) {
      throw new Error("Cần tải run group hoặc run detail trước khi publish để xác định eligibility.");
    }
    const publishAction = derivePublishAction(run.publishEligibility);
    if (!publishAction.canPublish || !publishAction.publishAs) {
      throw new Error("Run này không được publish dashboard.");
    }
    const publishAs = publishAction.publishAs;
    if (run.supersedesRunId && !this.operations.confirmHistoricalOverwrite) {
      throw new Error("Historical overwrite yêu cầu xác nhận rõ trước khi publish.");
    }
    if (run.supersedesRunId && !run.historicalOverwrite) {
      throw new Error("Thiếu metadata snapshot cũ/mới cho historical overwrite. Tải lại run detail hoặc run group từ backend trước khi publish.");
    }
    await this.withPending("publish-run", async () => {
      this.operations.publishAs = publishAs;
      this.operations.runDetail = await this.controlPlaneAdapter.publishRun(runId, {
        publishAs,
        confirmHistoricalOverwrite: this.operations.confirmHistoricalOverwrite,
        expectedReplacedRunId: nullableText(this.operations.expectedReplacedRunId)
      });
      this.toast = { kind: "info", message: `Đã ${publishAction.label.toLowerCase()}.` };
    });
  }

  private async previewExportWorkbook(form: HTMLFormElement) {
    const input = readExportRequest(new FormData(form), this.exportWorkflow);
    await this.withPending("preview-export", async () => {
      this.exportWorkflow.selectedPageId = input.pageId;
      this.exportWorkflow.startDate = input.startDate;
      this.exportWorkflow.endDate = input.endDate;
      this.exportWorkflow.workbook = await this.businessAdapter.getExportWorkbook(input);
      this.toast = { kind: "info", message: "Đã chuẩn bị preview export từ workflow riêng." };
    });
  }

  private hydrateConfig(configVersion: NonNullable<ConfigurationState["pageDetail"]>["activeConfigVersion"] | NonNullable<ConfigurationState["pageDetail"]>["configVersions"][number] | null) {
    const draft = configVersionToDraft(configVersion);
    this.configuration.promptText = draft.promptText;
    this.configuration.tagMappings = draft.tagMappings;
    this.configuration.openingRules = draft.openingRules;
    this.configuration.scheduler = draft.scheduler;
    this.configuration.notificationTargets = draft.notificationTargets;
    this.configuration.notes = draft.notes;
  }

  private syncConfigurationDraftFromForm(form: HTMLFormElement | null) {
    if (!form) {
      return;
    }
    const data = new FormData(form);
    this.configuration.selectedConfigVersionId = String(data.get("selectedConfigVersionId") ?? this.configuration.selectedConfigVersionId).trim();
    this.configuration.promptText = String(data.get("promptText") ?? this.configuration.promptText);
    this.configuration.promptCloneSourceVersionId = String(data.get("promptCloneSourceVersionId") ?? this.configuration.promptCloneSourceVersionId).trim();
    this.configuration.promptCloneSourcePageId = String(data.get("promptCloneSourcePageId") ?? this.configuration.promptCloneSourcePageId).trim();
    this.configuration.promptCompareLeftVersionId = String(data.get("promptCompareLeftVersionId") ?? this.configuration.promptCompareLeftVersionId).trim();
    this.configuration.promptCompareRightVersionId = String(data.get("promptCompareRightVersionId") ?? this.configuration.promptCompareRightVersionId).trim();
    this.configuration.notes = String(data.get("notes") ?? this.configuration.notes);
    this.configuration.activateAfterCreate = data.get("activateAfterCreate") !== null;
    this.configuration.etlEnabled = data.get("etlEnabled") !== null;
    this.configuration.analysisEnabled = data.get("analysisEnabled") !== null;
    this.configuration.tagMappings = zipTagMappings(
      data.getAll("tagRawTag"),
      data.getAll("tagRole"),
      data.getAll("tagCanonicalValue"),
      data.getAll("tagSource")
    );
    this.configuration.openingRules = zipOpeningRules(
      data.getAll("openingButtonTitle"),
      data.getAll("openingSignalType"),
      data.getAll("openingCanonicalValue")
    );
    this.configuration.scheduler = {
      useSystemDefaults: data.get("schedulerUseSystemDefaults") !== null,
      officialDailyTime: String(data.get("schedulerOfficialDailyTime") ?? this.configuration.scheduler.officialDailyTime).trim() || "00:00",
      lookbackHours: Number(String(data.get("schedulerLookbackHours") ?? this.configuration.scheduler.lookbackHours).trim() || "2")
    };
    this.configuration.notificationTargets = zipNotificationTargets(
      data.getAll("notificationChannel"),
      data.getAll("notificationValue")
    );
  }

  private render() {
    if (!this.catalog) {
      this.root.innerHTML = "<div class='app-loading'>Đang khởi tạo frontend...</div>";
      return;
    }
    const filterBar = this.route.view === "operations" || this.route.view === "configuration" || this.route.view === "page-comparison"
      ? ""
      : renderFilterBar(this.catalog, this.route);
    const exportUtility = this.route.utilityPanel === "export"
      ? renderExportWorkflow(this.exportWorkflow, this.catalog.pages, `?view=${this.route.view}&utility=none`)
      : "";
    const status = this.asyncStatus.pending
      ? `<section class="status-banner status-info">Đang xử lý: ${escapeHtml(this.asyncStatus.label ?? "")}</section>`
      : this.toast
        ? `<section class="status-banner status-${this.toast.kind}">${escapeHtml(this.toast.message)}</section>`
        : "";
    this.root.innerHTML = `
      <div class="app-shell">
        <aside class="shell-sidebar">
          <div class="brand-card"><p class="eyebrow">frontend rewrite</p><h1>chat-analyzer-v2</h1><p>Legacy runtime path đã bị loại khỏi entrypoint mới.</p></div>
          <nav class="nav-list">${NAV_ITEMS.map((item) => `<button class="nav-item ${item.view === this.route.view ? "nav-item-active" : ""}" data-route="?view=${item.view}"><span>${escapeHtml(item.label)}</span><small>${escapeHtml(item.source)}</small></button>`).join("")}</nav>
          <article class="panel-card panel-tight"><h2>Adapter Matrix</h2><ul class="plain-list">${Object.entries(FEATURE_SOURCE_MATRIX).map(([feature, source]) => `<li><strong>${escapeHtml(feature)}</strong>: ${escapeHtml(source)}</li>`).join("")}</ul></article>
        </aside>
        <main class="shell-main">
          <header class="topbar-card">
            <div><p class="eyebrow">View hiện tại</p><h2>${escapeHtml(VIEW_TITLES[this.route.view])}</h2><div class="button-row"><button data-route="?view=${this.route.view}&utility=${this.route.utilityPanel === "export" ? "none" : "export"}">${this.route.utilityPanel === "export" ? "Đóng export" : "Mở export"}</button></div></div>
            <form class="topbar-form" data-form="app-base-url"><label><span>Backend base URL</span><input name="apiBaseUrl" value="${escapeHtml(this.apiBaseUrl)}" /></label><button type="submit">Lưu URL</button></form>
          </header>
          ${status}
          ${exportUtility}
          ${filterBar}
          <section class="view-host">${this.currentViewHtml}</section>
        </main>
      </div>
    `;
  }

  private async withPending(label: string, task: () => Promise<void>) {
    this.asyncStatus = { pending: true, label };
    this.render();
    try {
      await task();
      await this.loadCurrentView();
    } finally {
      this.asyncStatus = { pending: false, label: null };
    }
  }
}

function renderFilterBar(catalog: NonNullable<FrontendApp["catalog"]>, route: RouteState) {
  return `
    <form class="panel-card filter-bar" data-form="business-filters">
      <label><span>Page</span><select name="pageId">${catalog.pages.map((page) => `<option value="${escapeHtml(page.id)}" ${page.id === route.filters.pageId ? "selected" : ""}>${escapeHtml(page.label)}</option>`).join("")}</select></label>
      <label><span>Slice</span><select name="slicePreset"><option value="yesterday" ${route.filters.slicePreset === "yesterday" ? "selected" : ""}>Hôm qua</option><option value="7d" ${route.filters.slicePreset === "7d" ? "selected" : ""}>7 ngày</option><option value="30d" ${route.filters.slicePreset === "30d" ? "selected" : ""}>30 ngày</option><option value="quarter" ${route.filters.slicePreset === "quarter" ? "selected" : ""}>Quý này đến hôm qua</option><option value="custom" ${route.filters.slicePreset === "custom" ? "selected" : ""}>Tùy chọn</option></select></label>
      <label><span>Publish snapshot</span><select name="publishSnapshot"><option value="official" ${route.filters.publishSnapshot === "official" ? "selected" : ""}>Official</option><option value="provisional" ${route.filters.publishSnapshot === "provisional" ? "selected" : ""}>Provisional</option></select></label>
      <label><span>Inbox</span><select name="inboxBucket"><option value="all" ${route.filters.inboxBucket === "all" ? "selected" : ""}>Tất cả</option><option value="new" ${route.filters.inboxBucket === "new" ? "selected" : ""}>Inbox mới</option><option value="old" ${route.filters.inboxBucket === "old" ? "selected" : ""}>Inbox cũ</option></select></label>
      <label><span>Tái khám</span><select name="revisit"><option value="all" ${route.filters.revisit === "all" ? "selected" : ""}>Tất cả</option><option value="revisit" ${route.filters.revisit === "revisit" ? "selected" : ""}>Có</option><option value="not_revisit" ${route.filters.revisit === "not_revisit" ? "selected" : ""}>Không</option></select></label>
      <label><span>Nhu cầu</span><select name="need">${catalog.needs.map((option) => `<option value="${escapeHtml(option.value)}" ${option.value === route.filters.need ? "selected" : ""}>${escapeHtml(option.label)}</option>`).join("")}</select></label>
      <label><span>Outcome</span><select name="outcome">${catalog.outcomes.map((option) => `<option value="${escapeHtml(option.value)}" ${option.value === route.filters.outcome ? "selected" : ""}>${escapeHtml(option.label)}</option>`).join("")}</select></label>
      <label><span>Risk</span><select name="risk">${catalog.risks.map((option) => `<option value="${escapeHtml(option.value)}" ${option.value === route.filters.risk ? "selected" : ""}>${escapeHtml(option.label)}</option>`).join("")}</select></label>
      <label><span>Nhân viên</span><select name="staff">${catalog.staff.map((option) => `<option value="${escapeHtml(option.value)}" ${option.value === route.filters.staff ? "selected" : ""}>${escapeHtml(option.label)}</option>`).join("")}</select></label>
      ${route.filters.slicePreset === "custom" ? `<label><span>Từ ngày</span><input type="date" name="startDate" value="${escapeHtml(route.filters.startDate)}" /></label><label><span>Đến ngày</span><input type="date" name="endDate" value="${escapeHtml(route.filters.endDate)}" /></label>` : ""}
    </form>
  `;
}

function renderNoConnectedPageState() {
  return `
    <section class="panel-card empty-state">
      <h3>Chưa có connected page</h3>
      <p>Cần đăng ký ít nhất một page ở màn Configuration trước khi mở dashboard read-model.</p>
    </section>
  `;
}

function nullableText(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function defaultPromptText() {
  return ["Mục tiêu vận hành theo page:", "- Giữ distinction draft / provisional / official.", "- Bổ sung CTA chốt lịch rõ ràng."].join("\n");
}

function readManualRunInput(data: FormData, fallbackPageId: string) {
  const connectedPageId = String(data.get("connectedPageId") ?? fallbackPageId).trim();
  if (!connectedPageId) {
    throw new Error("Cần chọn connected page.");
  }
  const targetDate = String(data.get("targetDate") ?? "").trim();
  const requestedWindowStartAt = String(data.get("requestedWindowStartAt") ?? "").trim();
  const requestedWindowEndExclusiveAt = String(data.get("requestedWindowEndExclusiveAt") ?? "").trim();
  if (targetDate && (requestedWindowStartAt || requestedWindowEndExclusiveAt)) {
    throw new Error("Chỉ chọn target_date hoặc requested window.");
  }
  if (!targetDate && !(requestedWindowStartAt && requestedWindowEndExclusiveAt)) {
    throw new Error("Cần target_date hoặc đủ requested window.");
  }
  return {
    connectedPageId,
    processingMode: String(data.get("processingMode") ?? "etl_only") as OperationsState["processingMode"],
    targetDate: targetDate || undefined,
    requestedWindowStartAt: requestedWindowStartAt ? isoFromDatetimeLocal(requestedWindowStartAt) ?? undefined : undefined,
    requestedWindowEndExclusiveAt: requestedWindowEndExclusiveAt ? isoFromDatetimeLocal(requestedWindowEndExclusiveAt) ?? undefined : undefined
  };
}

function mergeRouteSearch(current: RouteState, rawSearch: string): RouteState {
  const search = rawSearch.startsWith("?") ? rawSearch.slice(1) : rawSearch;
  const params = new URLSearchParams(search);
  const next: RouteState = structuredClone(current);

  if (params.has("view")) {
    next.view = parseRouteState(`?view=${params.get("view") ?? current.view}`).view;
  }
  if (params.has("page")) {
    next.filters.pageId = params.get("page") ?? current.filters.pageId;
  }
  if (params.has("slice")) {
    const slice = parseRouteState(`?slice=${params.get("slice") ?? current.filters.slicePreset}`).filters.slicePreset;
    next.filters.slicePreset = slice;
    if (slice === "custom") {
      next.filters.startDate = params.get("start") ?? current.filters.startDate;
      next.filters.endDate = params.get("end") ?? current.filters.endDate;
    } else {
      const range = defaultDateRange(slice);
      next.filters.startDate = range.startDate;
      next.filters.endDate = range.endDate;
    }
  }
  if (params.has("snapshot")) {
    next.filters.publishSnapshot = parseRouteState(`?snapshot=${params.get("snapshot") ?? current.filters.publishSnapshot}`).filters.publishSnapshot;
  }
  if (params.has("inbox")) {
    next.filters.inboxBucket = parseRouteState(`?inbox=${params.get("inbox") ?? current.filters.inboxBucket}`).filters.inboxBucket;
  }
  if (params.has("revisit")) {
    next.filters.revisit = parseRouteState(`?revisit=${params.get("revisit") ?? current.filters.revisit}`).filters.revisit;
  }
  if (params.has("need")) {
    next.filters.need = params.get("need") ?? current.filters.need;
  }
  if (params.has("outcome")) {
    next.filters.outcome = params.get("outcome") ?? current.filters.outcome;
  }
  if (params.has("risk")) {
    next.filters.risk = params.get("risk") ?? current.filters.risk;
  }
  if (params.has("staff")) {
    next.filters.staff = params.get("staff") ?? current.filters.staff;
  }
  if (params.has("compare")) {
    next.comparePageIds = params.get("compare")?.split(",").filter(Boolean) ?? [];
  }
  if (params.has("thread")) {
    next.threadId = params.get("thread") || null;
    if (!params.has("threadDay")) {
      next.threadDayId = null;
    }
  }
  if (params.has("threadDay")) {
    next.threadDayId = params.get("threadDay") || null;
  }
  if (params.has("threadTab")) {
    next.threadTab = parseRouteState(`?threadTab=${params.get("threadTab") ?? current.threadTab}`).threadTab;
  }
  if (params.has("configTab")) {
    next.configurationTab = parseRouteState(`?configTab=${params.get("configTab") ?? current.configurationTab}`).configurationTab;
  }
  if (params.has("ops")) {
    next.operationPanel = parseRouteState(`?ops=${params.get("ops") ?? current.operationPanel}`).operationPanel;
  }
  if (params.has("utility")) {
    next.utilityPanel = parseRouteState(`?utility=${params.get("utility") ?? current.utilityPanel}`).utilityPanel;
  }
  if (params.has("runGroup")) {
    next.runGroupId = params.get("runGroup");
  }
  if (params.has("run")) {
    next.runId = params.get("run");
  }
  return next;
}

function zipTagMappings(rawTags: FormDataEntryValue[], roles: FormDataEntryValue[], canonicalValues: FormDataEntryValue[], sources: FormDataEntryValue[]) {
  const length = Math.max(rawTags.length, roles.length, canonicalValues.length, sources.length, 1);
  return Array.from({ length }, (_, index) => ({
    rawTag: String(rawTags[index] ?? ""),
    role: String(roles[index] ?? "noise"),
    canonicalValue: String(canonicalValues[index] ?? ""),
    source: (String(sources[index] ?? "system_default") === "operator_override" ? "operator_override" : "system_default") as "system_default" | "operator_override"
  }));
}

function zipOpeningRules(buttonTitles: FormDataEntryValue[], signalTypes: FormDataEntryValue[], canonicalValues: FormDataEntryValue[]) {
  const length = Math.max(buttonTitles.length, signalTypes.length, canonicalValues.length, 1);
  return Array.from({ length }, (_, index) => ({
    buttonTitle: String(buttonTitles[index] ?? ""),
    signalType: String(signalTypes[index] ?? "customer_journey"),
    canonicalValue: String(canonicalValues[index] ?? "")
  }));
}

function zipNotificationTargets(channels: FormDataEntryValue[], values: FormDataEntryValue[]) {
  const length = Math.max(channels.length, values.length, 1);
  return Array.from({ length }, (_, index) => ({
    channel: String(channels[index] ?? "telegram"),
    value: String(values[index] ?? "")
  }));
}

function normalizeComparePageIds(comparePageIds: string[], pages: Array<{ id: string }>) {
  const availablePageIds = pages.map((page) => page.id);
  const uniqueSelected = [...new Set(comparePageIds.filter((pageId) => availablePageIds.includes(pageId)))];

  if (uniqueSelected.length >= 2 || availablePageIds.length < 2) {
    return uniqueSelected;
  }
  if (uniqueSelected.length === 1) {
    const fallbackPageId = availablePageIds.find((pageId) => pageId !== uniqueSelected[0]);
    return fallbackPageId ? [uniqueSelected[0], fallbackPageId] : uniqueSelected;
  }
  return availablePageIds.slice(0, 2);
}
