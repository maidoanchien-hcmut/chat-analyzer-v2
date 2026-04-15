import { createHttpBusinessAdapter } from "../adapters/http/business-adapter.ts";
import { createControlPlaneAdapter } from "../adapters/http/control-plane-adapter.ts";
import { DEFAULT_API_BASE_URL, FEATURE_SOURCE_MATRIX, NAV_ITEMS, STORAGE_API_BASE_URL, VIEW_TITLES } from "../core/config.ts";
import type { AppToast, AsyncStatus, BusinessFilters, RouteState } from "../core/types.ts";
import { renderConfiguration } from "../features/configuration/render.ts";
import {
  buildOnboardingSamplePreviewInput,
  buildConfigurationDraftFingerprint,
  buildPromptPreviewComparisonFingerprint,
  buildPromptPreviewArtifactInput,
  buildPromptWorkspaceSampleFingerprint,
  buildPromptWorkspaceSampleInput,
  buildCreateConfigVersionInput,
  configVersionToDraft,
  createDefaultScheduler,
  derivePromptPreviewFreshness,
  createEmptyNotificationTarget,
  createEmptyOpeningRule,
  createEmptyTagMapping,
  seedWorkspaceDraftFromOnboardingSample
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
import type { ConfigurationState, OperationsState } from "./screen-state.ts";

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
  private configuration: ConfigurationState = {
    activeTab: "page-info",
    connectedPages: [],
    pageDetail: null,
    workspace: {
      token: "",
      tokenPages: [],
      selectedPancakePageId: "",
      businessTimezone: "Asia/Ho_Chi_Minh",
      selectedPageId: "",
      selectedConfigVersionId: "",
      etlEnabled: true,
      analysisEnabled: false,
      sampleConversationLimit: 12,
      promptText: "",
      tagMappings: [createEmptyTagMapping()],
      openingRules: [createEmptyOpeningRule()],
      scheduler: createDefaultScheduler(),
      notificationTargets: [createEmptyNotificationTarget()],
      notes: "",
      activateAfterCreate: true,
      promptCloneSourceVersionId: "",
      promptCloneSourcePageId: "",
      promptCompareLeftVersionId: "",
      promptCompareRightVersionId: "",
      selectedPromptSampleConversationId: ""
    },
    draftSource: "blank",
    draftBaselineFingerprint: null,
    onboardingSamplePreview: null,
    onboardingSampleSeedSummary: null,
    promptWorkspaceSamplePreview: null,
    promptWorkspaceSampleFingerprint: null,
    promptWorkspaceSampleStaleReason: null,
    promptPreviewComparison: null,
    promptPreviewComparisonFingerprint: null,
    promptPreviewComparisonStaleReason: null
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
    this.root.addEventListener("input", (event) => this.onInput(event));
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
    }, { reloadView: false });
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
        this.hydrateConfig(this.configuration.pageDetail.activeConfigVersion, "connected_page_active_config");
        this.toast = { kind: "info", message: "Đã nạp active config." };
      } else if (action === "use-selected-config-version") {
        const pageDetail = this.configuration.pageDetail;
        const selectedConfigVersionId = this.configuration.workspace.selectedConfigVersionId.trim();
        if (!pageDetail || !selectedConfigVersionId) {
          throw new Error("Cần chọn config version trước khi nạp vào draft.");
        }
        const configVersion = pageDetail.configVersions.find((item) => item.id === selectedConfigVersionId) ?? null;
        if (!configVersion) {
          throw new Error("Config version đã chọn không còn tồn tại trong page hiện tại.");
        }
        this.hydrateConfig(
          configVersion,
          configVersion.id === pageDetail.activeConfigVersionId ? "connected_page_active_config" : "connected_page_saved_version"
        );
        this.toast = { kind: "info", message: `Đã nạp config v${configVersion.versionNo} vào draft.` };
      } else if (action === "load-onboarding-sample") {
        await this.loadOnboardingSamplePreview(target.closest("form"));
      } else if (action === "confirm-tag-mapping") {
        this.syncConfigurationDraftFromForm(target.closest("form"));
        const index = Number(target.closest<HTMLElement>("[data-tag-index]")?.dataset.tagIndex ?? "-1");
        if (index >= 0 && this.configuration.workspace.tagMappings[index]) {
          this.configuration.workspace.tagMappings[index] = {
            ...this.configuration.workspace.tagMappings[index],
            source: "operator_override"
          };
          this.refreshPromptPreviewFreshness();
        }
      } else if (action === "reset-tag-mapping-source") {
        this.syncConfigurationDraftFromForm(target.closest("form"));
        const index = Number(target.closest<HTMLElement>("[data-tag-index]")?.dataset.tagIndex ?? "-1");
        if (index >= 0 && this.configuration.workspace.tagMappings[index]) {
          this.configuration.workspace.tagMappings[index] = {
            ...this.configuration.workspace.tagMappings[index],
            source: "system_default"
          };
          if (this.configuration.workspace.tagMappings[index]?.sourceTagId.trim()) {
            this.configuration.workspace.tagMappings[index] = {
              ...this.configuration.workspace.tagMappings[index],
              role: "noise",
              canonicalValue: ""
            };
          }
          this.refreshPromptPreviewFreshness();
        }
      } else if (action === "load-prompt-workspace-sample") {
        await this.loadPromptWorkspaceSamplePreview(target.closest("form"));
      } else if (action === "run-prompt-preview") {
        await this.runPromptPreview(target.closest("form"));
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
        this.configuration.workspace.tagMappings = [...this.configuration.workspace.tagMappings, createEmptyTagMapping()];
        this.refreshPromptPreviewFreshness();
      } else if (action === "add-opening-rule-row") {
        this.syncConfigurationDraftFromForm(target.closest("form"));
        this.configuration.workspace.openingRules = [...this.configuration.workspace.openingRules, createEmptyOpeningRule()];
        this.refreshPromptPreviewFreshness();
      } else if (action === "add-notification-target-row") {
        this.syncConfigurationDraftFromForm(target.closest("form"));
        this.configuration.workspace.notificationTargets = [...this.configuration.workspace.notificationTargets, createEmptyNotificationTarget()];
      } else if (action === "clone-prompt-from-version") {
        this.syncConfigurationDraftFromForm(target.closest("form"));
        const configVersion = this.configuration.pageDetail?.configVersions.find(
          (item) => item.id === this.configuration.workspace.promptCloneSourceVersionId
        ) ?? null;
        if (!configVersion) {
          throw new Error("Cần chọn prompt version để clone.");
        }
        this.configuration.workspace.promptText = configVersion.promptText;
        this.refreshPromptPreviewFreshness();
        this.toast = { kind: "info", message: `Đã clone prompt từ v${configVersion.versionNo}.` };
      } else if (action === "clone-prompt-from-page") {
        this.syncConfigurationDraftFromForm(target.closest("form"));
        if (!this.configuration.workspace.promptCloneSourcePageId) {
          throw new Error("Cần chọn page nguồn để clone prompt.");
        }
        const sourcePage = await this.controlPlaneAdapter.getConnectedPage(this.configuration.workspace.promptCloneSourcePageId);
        if (!sourcePage.activeConfigVersion) {
          throw new Error("Page nguồn chưa có active config để clone.");
        }
        this.configuration.workspace.promptText = sourcePage.activeConfigVersion.promptText;
        this.refreshPromptPreviewFreshness();
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
      } else if (
        form.dataset.form === "onboarding-token"
        || form.dataset.form === "onboarding-register"
        || form.dataset.form === "configuration-load-page"
        || form.dataset.form === "configuration-create"
      ) {
        this.syncConfigurationDraftFromForm(form);
        if (!shouldRerenderConfigurationChange(event, form)) {
          return;
        }
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

  private onInput(event: Event) {
    const form = (event.target as HTMLElement | null)?.closest<HTMLFormElement>("form");
    if (!form?.dataset.form) {
      return;
    }
    if (
      form.dataset.form !== "onboarding-token"
      && form.dataset.form !== "onboarding-register"
      && form.dataset.form !== "configuration-load-page"
      && form.dataset.form !== "configuration-create"
    ) {
      return;
    }
    this.syncConfigurationDraftFromForm(form);
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
      await this.refreshControlPages({ reloadView: false });
    }
    if (this.route.view === "operations") {
      this.operations.healthSummary = await this.controlPlaneAdapter.getHealthSummary();
    }
    this.currentViewHtml = this.route.view === "operations"
      ? renderOperations(this.operations)
      : renderConfiguration(this.configuration);
  }

  private async listFromToken(form: HTMLFormElement) {
    this.syncConfigurationDraftFromForm(form);
    const workspace = this.configuration.workspace;
    await this.withPending("list-from-token", async () => {
      workspace.tokenPages = await this.controlPlaneAdapter.listPagesFromToken(workspace.token.trim());
      workspace.selectedPancakePageId = workspace.tokenPages[0]?.pageId ?? "";
      this.reconcileConfigurationSelectedPageId(this.configuration.connectedPages);
      this.configuration.onboardingSamplePreview = null;
      this.configuration.onboardingSampleSeedSummary = null;
      this.configuration.workspace.scheduler.timezone = workspace.businessTimezone || this.configuration.workspace.scheduler.timezone;
      this.toast = { kind: "info", message: `Đã tải ${workspace.tokenPages.length} page từ token.` };
    });
  }

  private async registerPage(form: HTMLFormElement) {
    await this.registerPageFromWorkspace(form, false);
  }

  private async registerPageFromWorkspace(form: HTMLFormElement, applyDraft: boolean) {
    this.syncConfigurationDraftFromForm(form);
    const workspace = this.configuration.workspace;
    const pancakePageId = workspace.selectedPancakePageId.trim();
    if (!pancakePageId) {
      throw new Error("Cần chọn Pancake page.");
    }
    await this.withPending("register-page", async () => {
      const preserveDraft = this.shouldPreserveOnboardingDraftAfterRegister();
      const detail = await this.controlPlaneAdapter.registerPage(this.buildRegisterPageInput(applyDraft));
      if (preserveDraft) {
        this.applyRegisteredPageContext(detail);
        if (applyDraft) {
          this.configuration.draftSource = "connected_page_active_config";
          this.configuration.draftBaselineFingerprint = this.buildCurrentConfigurationDraftFingerprint();
        }
      } else {
        this.applyLoadedConnectedPage(detail);
      }
      await this.refreshControlPages({ reloadView: false });
      this.toast = preserveDraft
        ? { kind: "info", message: applyDraft ? "Đã thêm page vào vận hành bằng chính draft hiện tại." : "Đã register page và giữ nguyên workspace draft để chỉnh tiếp." }
        : { kind: "info", message: "Đã register page qua HTTP thật." };
    });
  }

  private async refreshControlPages(options?: { reloadView?: boolean }) {
    await this.withPending("list-connected-pages", async () => {
      const pages = await this.controlPlaneAdapter.listConnectedPages();
      this.configuration.connectedPages = pages;
      this.operations.connectedPages = pages;
      this.reconcileConfigurationSelectedPageId(pages);
      this.operations.selectedPageId = pages.some((page) => page.id === this.operations.selectedPageId)
        ? this.operations.selectedPageId
        : (pages[0]?.id ?? "");
    }, { reloadView: options?.reloadView ?? true });
  }

  private async loadConnectedPage(form: HTMLFormElement) {
    this.syncConfigurationDraftFromForm(form);
    const pageId = this.configuration.workspace.selectedPageId.trim();
    if (!pageId) {
      throw new Error("Cần chọn connected page.");
    }
    await this.withPending("get-connected-page", async () => {
      const detail = await this.controlPlaneAdapter.getConnectedPage(pageId);
      this.applyLoadedConnectedPage(detail);
      this.toast = { kind: "info", message: `Đã tải chi tiết page ${detail.pageName}.` };
    });
  }

  private async createConfigVersion(form: HTMLFormElement) {
    this.syncConfigurationDraftFromForm(form);
    const workspace = this.configuration.workspace;
    if (!workspace.selectedPageId) {
      if (workspace.selectedPancakePageId.trim()) {
        await this.registerPageFromWorkspace(form, true);
        return;
      }
      throw new Error("Cần chọn page Pancake hoặc tải connected page trước khi lưu config.");
    }
    await this.withPending("create-config-version", async () => {
      const createdConfigVersion = await this.controlPlaneAdapter.createConfigVersion(
        workspace.selectedPageId,
        buildCreateConfigVersionInput({
          promptText: workspace.promptText,
          tagMappings: workspace.tagMappings,
          openingRules: workspace.openingRules,
          scheduler: workspace.scheduler,
          notificationTargets: workspace.notificationTargets,
          notes: workspace.notes,
          activate: workspace.activateAfterCreate,
          etlEnabled: workspace.etlEnabled,
          analysisEnabled: workspace.analysisEnabled
        })
      );
      const detail = await this.controlPlaneAdapter.getConnectedPage(workspace.selectedPageId);
      this.configuration.pageDetail = detail;
      this.configuration.workspace.selectedConfigVersionId = createdConfigVersion.id;
      if (workspace.activateAfterCreate) {
        this.hydrateConfig(detail.activeConfigVersion ?? createdConfigVersion, "connected_page_active_config");
        this.toast = { kind: "info", message: "Đã tạo và activate config version mới." };
        return;
      }
      this.hydrateConfig(createdConfigVersion, "connected_page_saved_version");
      this.toast = { kind: "info", message: `Đã tạo config v${createdConfigVersion.versionNo} và giữ draft theo version vừa lưu.` };
    });
  }

  private async activateConfigVersion() {
    const workspace = this.configuration.workspace;
    const selectedConfigVersionId = workspace.selectedConfigVersionId;
    if (!workspace.selectedPageId || !selectedConfigVersionId) {
      throw new Error("Cần chọn page và config version.");
    }
    await this.withPending("activate-config-version", async () => {
      this.configuration.workspace.selectedConfigVersionId = selectedConfigVersionId;
      this.configuration.pageDetail = await this.controlPlaneAdapter.activateConfigVersion(
        workspace.selectedPageId,
        selectedConfigVersionId
      );
      this.hydrateConfig(this.configuration.pageDetail.activeConfigVersion ?? null, "connected_page_active_config");
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

  private async loadOnboardingSamplePreview(form: HTMLFormElement | null) {
    this.syncConfigurationDraftFromForm(form);
    const workspace = this.configuration.workspace;

    if (!workspace.token.trim()) {
      throw new Error("Cần nhập user access token trước khi lấy sample.");
    }
    if (!workspace.selectedPancakePageId.trim()) {
      throw new Error("Cần chọn Pancake page trước khi lấy sample.");
    }

    await this.withPending("load-onboarding-sample", async () => {
      const selectedPage = workspace.tokenPages.find((page) => page.pageId === workspace.selectedPancakePageId);
      this.configuration.onboardingSamplePreview = await this.controlPlaneAdapter.previewOnboardingSample(
        buildOnboardingSamplePreviewInput({
          pancakePageId: workspace.selectedPancakePageId,
          userAccessToken: workspace.token.trim(),
          pageName: selectedPage?.pageName ?? workspace.selectedPancakePageId,
          businessTimezone: workspace.businessTimezone,
          tagMappings: workspace.tagMappings,
          openingRules: workspace.openingRules,
          scheduler: workspace.scheduler,
          sampleConversationLimit: workspace.sampleConversationLimit
        })
      );
      const seededDraft = seedWorkspaceDraftFromOnboardingSample({
        promptText: workspace.promptText,
        tagMappings: workspace.tagMappings,
        openingRules: workspace.openingRules,
        scheduler: workspace.scheduler,
        notificationTargets: workspace.notificationTargets,
        samplePreview: this.configuration.onboardingSamplePreview
      });
      workspace.promptText = seededDraft.promptText;
      workspace.tagMappings = seededDraft.tagMappings;
      workspace.openingRules = seededDraft.openingRules;
      workspace.scheduler = seededDraft.scheduler;
      workspace.notificationTargets = seededDraft.notificationTargets;
      this.configuration.onboardingSampleSeedSummary = seededDraft.summary;
      this.configuration.draftSource = "onboarding_sample";
      this.configuration.draftBaselineFingerprint = null;
      this.reconcileConfigurationSelectedPageId(this.configuration.connectedPages);
      this.toast = { kind: "info", message: "Đã nạp sample dữ liệu thật cho workspace cấu hình." };
    });
  }

  private hydrateConfig(
    configVersion: NonNullable<ConfigurationState["pageDetail"]>["activeConfigVersion"] | NonNullable<ConfigurationState["pageDetail"]>["configVersions"][number] | null,
    draftSource: ConfigurationState["draftSource"]
  ) {
    const workspace = this.configuration.workspace;
    const fallbackTimezone = this.configuration.pageDetail?.businessTimezone ?? workspace.businessTimezone;
    const draft = configVersionToDraft(configVersion, fallbackTimezone);
    workspace.promptText = draft.promptText;
    workspace.tagMappings = draft.tagMappings;
    workspace.openingRules = draft.openingRules;
    workspace.scheduler = draft.scheduler;
    workspace.notificationTargets = draft.notificationTargets;
    workspace.notes = draft.notes;
    this.configuration.draftSource = draftSource;
    this.configuration.draftBaselineFingerprint = this.buildCurrentConfigurationDraftFingerprint();
    this.refreshPromptPreviewFreshness();
  }

  private applyLoadedConnectedPage(detail: NonNullable<ConfigurationState["pageDetail"]>) {
    this.bindConnectedPageContext(detail, { hydrateWorkspaceConfig: true, clearOnboardingSample: true });
  }

  private applyRegisteredPageContext(detail: NonNullable<ConfigurationState["pageDetail"]>) {
    this.bindConnectedPageContext(detail, { hydrateWorkspaceConfig: false, clearOnboardingSample: false });
  }

  private bindConnectedPageContext(
    detail: NonNullable<ConfigurationState["pageDetail"]>,
    options: { hydrateWorkspaceConfig: boolean; clearOnboardingSample: boolean }
  ) {
    const workspace = this.configuration.workspace;
    workspace.selectedPageId = detail.id;
    workspace.selectedPancakePageId = detail.pancakePageId;
    workspace.businessTimezone = detail.businessTimezone;
    this.configuration.pageDetail = detail;
    if (options.clearOnboardingSample) {
      this.configuration.onboardingSamplePreview = null;
      this.configuration.onboardingSampleSeedSummary = null;
    }
    this.configuration.promptWorkspaceSamplePreview = null;
    this.configuration.promptWorkspaceSampleFingerprint = null;
    this.configuration.promptWorkspaceSampleStaleReason = null;
    workspace.selectedPromptSampleConversationId = "";
    this.configuration.promptPreviewComparison = null;
    this.configuration.promptPreviewComparisonFingerprint = null;
    this.configuration.promptPreviewComparisonStaleReason = null;
    workspace.selectedConfigVersionId = detail.activeConfigVersionId ?? detail.configVersions[0]?.id ?? "";
    workspace.etlEnabled = detail.etlEnabled;
    workspace.analysisEnabled = detail.analysisEnabled;
    workspace.promptCloneSourcePageId = "";
    workspace.promptCloneSourceVersionId = workspace.selectedConfigVersionId;
    workspace.promptCompareLeftVersionId = detail.configVersions[0]?.id ?? "";
    workspace.promptCompareRightVersionId = detail.configVersions[1]?.id ?? detail.configVersions[0]?.id ?? "";
    if (options.hydrateWorkspaceConfig) {
      this.hydrateConfig(detail.activeConfigVersion ?? detail.configVersions[0] ?? null, "connected_page_active_config");
      return;
    }
    this.configuration.draftBaselineFingerprint = this.buildCurrentConfigurationDraftFingerprint();
    this.refreshPromptPreviewFreshness();
  }

  private syncConfigurationDraftFromForm(form: HTMLFormElement | null) {
    if (!form) {
      return;
    }
    const data = new FormData(form);
    const workspace = this.configuration.workspace;
    if (form.dataset.form === "onboarding-token") {
      workspace.token = String(data.get("token") ?? workspace.token);
      workspace.businessTimezone = String(data.get("businessTimezone") ?? workspace.businessTimezone).trim() || "Asia/Ho_Chi_Minh";
      workspace.etlEnabled = data.get("etlEnabled") !== null;
      workspace.analysisEnabled = data.get("analysisEnabled") !== null;
      if (workspace.scheduler.useSystemDefaults) {
        workspace.scheduler = {
          ...workspace.scheduler,
          timezone: workspace.businessTimezone
        };
      }
      return;
    }
    if (form.dataset.form === "onboarding-register") {
      workspace.selectedPancakePageId = String(data.get("pancakePageId") ?? workspace.selectedPancakePageId).trim();
      this.reconcileConfigurationSelectedPageId(this.configuration.connectedPages);
      workspace.sampleConversationLimit = readBoundedIntegerField(
        data,
        "sampleConversationLimit",
        workspace.sampleConversationLimit,
        1,
        100
      );
      return;
    }
    if (form.dataset.form === "configuration-load-page") {
      workspace.selectedPageId = String(data.get("selectedPageId") ?? workspace.selectedPageId).trim();
      return;
    }
    if (form.dataset.form !== "configuration-create") {
      return;
    }

    workspace.selectedConfigVersionId = String(data.get("selectedConfigVersionId") ?? workspace.selectedConfigVersionId).trim();
    workspace.promptText = String(data.get("promptText") ?? workspace.promptText);
    workspace.promptCloneSourceVersionId = String(data.get("promptCloneSourceVersionId") ?? workspace.promptCloneSourceVersionId).trim();
    workspace.promptCloneSourcePageId = String(data.get("promptCloneSourcePageId") ?? workspace.promptCloneSourcePageId).trim();
    workspace.promptCompareLeftVersionId = String(data.get("promptCompareLeftVersionId") ?? workspace.promptCompareLeftVersionId).trim();
    workspace.promptCompareRightVersionId = String(data.get("promptCompareRightVersionId") ?? workspace.promptCompareRightVersionId).trim();
    workspace.selectedPromptSampleConversationId = String(
      data.get("selectedPromptSampleConversationId") ?? workspace.selectedPromptSampleConversationId
    ).trim();
    workspace.notes = String(data.get("notes") ?? workspace.notes);
    workspace.activateAfterCreate = data.get("activateAfterCreate") !== null;
    workspace.etlEnabled = data.get("etlEnabled") !== null;
    workspace.analysisEnabled = data.get("analysisEnabled") !== null;
    workspace.tagMappings = zipTagMappings(
      workspace.tagMappings,
      data.getAll("tagSourceTagId"),
      data.getAll("tagRawTag"),
      data.getAll("tagRole"),
      data.getAll("tagCanonicalValue"),
      data.getAll("tagSource")
    );
    workspace.openingRules = zipOpeningRules(
      data.getAll("openingButtonTitle"),
      data.getAll("openingSignalType"),
      data.getAll("openingCanonicalValue")
    );
    workspace.scheduler = {
      useSystemDefaults: data.get("schedulerUseSystemDefaults") !== null,
      timezone: String(data.get("schedulerTimezone") ?? workspace.scheduler.timezone).trim() || workspace.businessTimezone,
      officialDailyTime: String(data.get("schedulerOfficialDailyTime") ?? workspace.scheduler.officialDailyTime).trim() || "00:00",
      lookbackHours: Number(String(data.get("schedulerLookbackHours") ?? workspace.scheduler.lookbackHours).trim() || "2")
    };
    workspace.notificationTargets = zipNotificationTargets(
      data.getAll("notificationChannel"),
      data.getAll("notificationValue")
    );
    this.refreshPromptPreviewFreshness();
  }

  private shouldPreserveOnboardingDraftAfterRegister() {
    const workspace = this.configuration.workspace;
    return this.configuration.onboardingSamplePreview !== null
      || workspace.promptText.trim().length > 0
      || hasConfiguredTagMappings(workspace.tagMappings)
      || hasConfiguredOpeningRules(workspace.openingRules)
      || !workspace.scheduler.useSystemDefaults
      || hasConfiguredNotificationTargets(workspace.notificationTargets)
      || workspace.notes.trim().length > 0;
  }

  private reconcileConfigurationSelectedPageId(pages: ConfigurationState["connectedPages"]) {
    const workspace = this.configuration.workspace;
    const selectedPage = pages.find((page) => page.id === workspace.selectedPageId) ?? null;
    if (workspace.selectedPancakePageId.trim()) {
      if (selectedPage?.pancakePageId === workspace.selectedPancakePageId) {
        return;
      }
      const matchedPage = pages.find((page) => page.pancakePageId === workspace.selectedPancakePageId);
      workspace.selectedPageId = matchedPage?.id ?? "";
      return;
    }
    workspace.selectedPageId = selectedPage?.id ?? "";
  }

  private async loadPromptWorkspaceSamplePreview(form: HTMLFormElement | null) {
    this.syncConfigurationDraftFromForm(form);
    const pageDetail = this.configuration.pageDetail;
    const workspace = this.configuration.workspace;
    if (!pageDetail) {
      throw new Error("Cần tải connected page trước khi lấy sample prompt workspace.");
    }

    await this.withPending("load-prompt-workspace-sample", async () => {
      this.configuration.promptWorkspaceSamplePreview = await this.controlPlaneAdapter.previewPromptWorkspaceSample(
        pageDetail.id,
        buildPromptWorkspaceSampleInput({
          tagMappings: workspace.tagMappings,
          openingRules: workspace.openingRules,
          scheduler: workspace.scheduler,
          businessTimezone: pageDetail.businessTimezone,
          sampleConversationLimit: workspace.sampleConversationLimit
        })
      );
      this.configuration.promptWorkspaceSampleFingerprint = this.buildCurrentPromptWorkspaceSampleFingerprint();
      this.configuration.promptWorkspaceSampleStaleReason = null;
      this.configuration.workspace.selectedPromptSampleConversationId =
        this.configuration.promptWorkspaceSamplePreview.conversations[0]?.conversationId ?? "";
      this.configuration.promptPreviewComparison = null;
      this.configuration.promptPreviewComparisonFingerprint = null;
      this.configuration.promptPreviewComparisonStaleReason = null;
      this.toast = { kind: "info", message: "Đã nạp sample workspace cho prompt profile." };
    });
  }

  private async runPromptPreview(form: HTMLFormElement | null) {
    this.syncConfigurationDraftFromForm(form);
    const pageDetail = this.configuration.pageDetail;
    const samplePreview = this.configuration.promptWorkspaceSamplePreview;
    const workspace = this.configuration.workspace;
    if (!pageDetail) {
      throw new Error("Cần tải connected page trước khi chạy thử prompt.");
    }
    if (!samplePreview) {
      throw new Error("Cần tải sample workspace cho prompt trước khi chạy thử.");
    }
    if (this.configuration.promptWorkspaceSampleStaleReason) {
      throw new Error(this.configuration.promptWorkspaceSampleStaleReason);
    }

    await this.withPending("run-prompt-preview", async () => {
      this.configuration.promptPreviewComparison = await this.controlPlaneAdapter.previewPromptArtifacts(
        pageDetail.id,
        buildPromptPreviewArtifactInput({
          promptText: workspace.promptText,
          samplePreview,
          selectedConversationId: workspace.selectedPromptSampleConversationId
        })
      );
      this.configuration.promptPreviewComparisonFingerprint = this.buildCurrentPromptPreviewComparisonFingerprint();
      this.configuration.promptPreviewComparisonStaleReason = null;
      this.toast = { kind: "info", message: "Đã chạy preview prompt trên sample runtime thật." };
    });
  }

  private buildCurrentPromptWorkspaceSampleFingerprint() {
    const pageDetail = this.configuration.pageDetail;
    const workspace = this.configuration.workspace;
    if (!pageDetail) {
      return null;
    }
    return buildPromptWorkspaceSampleFingerprint({
      tagMappings: workspace.tagMappings,
      openingRules: workspace.openingRules,
      scheduler: workspace.scheduler,
      businessTimezone: pageDetail.businessTimezone,
      sampleConversationLimit: workspace.sampleConversationLimit
    });
  }

  private buildCurrentConfigurationDraftFingerprint() {
    const workspace = this.configuration.workspace;
    return buildConfigurationDraftFingerprint({
      promptText: workspace.promptText,
      tagMappings: workspace.tagMappings,
      openingRules: workspace.openingRules,
      scheduler: workspace.scheduler,
      notificationTargets: workspace.notificationTargets,
      notes: workspace.notes,
      activate: workspace.activateAfterCreate,
      etlEnabled: workspace.etlEnabled,
      analysisEnabled: workspace.analysisEnabled
    });
  }

  private buildRegisterPageInput(applyDraft: boolean) {
    const workspace = this.configuration.workspace;
    const draftPayload = applyDraft
      ? buildCreateConfigVersionInput({
        promptText: workspace.promptText,
        tagMappings: workspace.tagMappings,
        openingRules: workspace.openingRules,
        scheduler: workspace.scheduler,
        notificationTargets: workspace.notificationTargets,
        notes: workspace.notes,
        activate: true,
        etlEnabled: workspace.etlEnabled,
        analysisEnabled: workspace.analysisEnabled
      })
      : null;

    return {
      pancakePageId: workspace.selectedPancakePageId.trim(),
      userAccessToken: workspace.token.trim(),
      businessTimezone: workspace.businessTimezone,
      tagMappingJson: draftPayload?.tagMappingJson,
      openingRulesJson: draftPayload?.openingRulesJson,
      schedulerJson: draftPayload?.schedulerJson,
      notificationTargetsJson: draftPayload?.notificationTargetsJson,
      promptText: draftPayload?.promptText ?? null,
      notes: draftPayload?.notes ?? null,
      activate: true,
      etlEnabled: workspace.etlEnabled,
      analysisEnabled: workspace.analysisEnabled
    };
  }

  private buildCurrentPromptPreviewComparisonFingerprint() {
    const samplePreview = this.configuration.promptWorkspaceSamplePreview;
    const workspace = this.configuration.workspace;
    if (!samplePreview) {
      return null;
    }
    const selectedConversationId = workspace.selectedPromptSampleConversationId
      || samplePreview.conversations[0]?.conversationId
      || "";
    if (!selectedConversationId) {
      return null;
    }
    return buildPromptPreviewComparisonFingerprint({
      promptText: workspace.promptText,
      samplePreview,
      selectedConversationId
    });
  }

  private refreshPromptPreviewFreshness() {
    const freshness = derivePromptPreviewFreshness({
      workspaceFingerprint: this.configuration.promptWorkspaceSampleFingerprint,
      comparisonFingerprint: this.configuration.promptPreviewComparisonFingerprint,
      currentWorkspaceFingerprint: this.buildCurrentPromptWorkspaceSampleFingerprint(),
      currentComparisonFingerprint: this.buildCurrentPromptPreviewComparisonFingerprint(),
      hasSamplePreview: this.configuration.promptWorkspaceSamplePreview !== null,
      hasComparison: this.configuration.promptPreviewComparison !== null
    });

    this.configuration.promptWorkspaceSampleStaleReason = freshness.workspaceStaleReason;
    this.configuration.promptPreviewComparisonStaleReason = freshness.comparisonStaleReason;
    if (freshness.invalidateComparison) {
      this.configuration.promptPreviewComparison = null;
      this.configuration.promptPreviewComparisonFingerprint = null;
    }
  }

  private render() {
    if (!this.catalog) {
      this.root.innerHTML = "<div class='app-loading'>Đang khởi tạo frontend...</div>";
      return;
    }
    const filterBar = this.route.view === "operations"
      ? renderControlPlaneContextBar({
        title: "Ngữ cảnh vận hành",
        items: [
          { label: "Panel", value: this.operations.activePanel },
          { label: "Connected page", value: this.operations.selectedPageId || "Chưa chọn" },
          { label: "Mode", value: this.operations.processingMode },
          { label: "Target date", value: this.operations.targetDate || "Chưa chọn" }
        ]
      })
      : this.route.view === "configuration"
        ? renderControlPlaneContextBar({
          title: "Ngữ cảnh cấu hình",
          items: [
            { label: "Tab", value: this.configuration.activeTab },
            { label: "Connected page", value: this.configuration.workspace.selectedPageId || "Chưa bind" },
            { label: "Pancake page", value: this.configuration.workspace.selectedPancakePageId || "Chưa chọn" },
          { label: "Sample scope", value: `${this.configuration.workspace.sampleConversationLimit} hội thoại / toàn bộ tin nhắn trong ngày` }
          ]
        })
        : this.route.view === "page-comparison"
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

  private async withPending(label: string, task: () => Promise<void>, options?: { reloadView?: boolean }) {
    this.asyncStatus = { pending: true, label };
    this.render();
    try {
      await task();
      if (options?.reloadView ?? true) {
        await this.loadCurrentView();
      }
    } finally {
      this.asyncStatus = { pending: false, label: null };
    }
  }
}

export function shouldRerenderConfigurationChange(event: Event, form: HTMLFormElement) {
  if (form.dataset.form !== "configuration-create") {
    return false;
  }

  const target = event.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null;
  const name = target?.name ?? "";
  return name === "selectedConfigVersionId"
    || name === "selectedPromptSampleConversationId"
    || name === "promptCompareLeftVersionId"
    || name === "promptCompareRightVersionId";
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

function renderControlPlaneContextBar(input: {
  title: string;
  items: Array<{ label: string; value: string }>;
}) {
  return `
    <section class="panel-card context-bar">
      <div>
        <p class="eyebrow">Workspace context</p>
        <h3>${escapeHtml(input.title)}</h3>
      </div>
      ${input.items.map((item) => `
        <label>
          <span>${escapeHtml(item.label)}</span>
          <input value="${escapeHtml(item.value)}" readonly />
        </label>
      `).join("")}
    </section>
  `;
}

function nullableText(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
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

function zipTagMappings(
  existingEntries: ConfigurationState["workspace"]["tagMappings"],
  sourceTagIds: FormDataEntryValue[],
  rawTags: FormDataEntryValue[],
  roles: FormDataEntryValue[],
  canonicalValues: FormDataEntryValue[],
  sources: FormDataEntryValue[]
) {
  const length = Math.max(existingEntries.length, sourceTagIds.length, rawTags.length, roles.length, canonicalValues.length, sources.length, 1);
  return Array.from({ length }, (_, index) => ({
    sourceTagId: String(sourceTagIds[index] ?? existingEntries[index]?.sourceTagId ?? ""),
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

function hasConfiguredTagMappings(entries: ConfigurationState["workspace"]["tagMappings"]) {
  return entries.some((entry) => entry.rawTag.trim() || entry.canonicalValue.trim() || entry.source === "operator_override");
}

function hasConfiguredOpeningRules(entries: ConfigurationState["workspace"]["openingRules"]) {
  return entries.some((entry) => entry.buttonTitle.trim() || entry.canonicalValue.trim());
}

function hasConfiguredNotificationTargets(entries: ConfigurationState["workspace"]["notificationTargets"]) {
  return entries.some((entry) => entry.value.trim());
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

function readBoundedIntegerField(
  data: FormData,
  key: string,
  fallback: number,
  min: number,
  max: number
) {
  const rawValue = data.get(key);
  if (rawValue === null) {
    return fallback;
  }

  const parsed = Number.parseInt(String(rawValue).trim(), 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, parsed));
}
