import type {
  BusinessPage,
  BusinessFilters,
  ConfigurationTab,
  InboxBucket,
  OperationPanel,
  PublishSnapshot,
  RevisitFilter,
  RouteState,
  SlicePreset,
  ThreadTab
} from "../core/types.ts";
import { defaultDateRange } from "../shared/dates.ts";

const DEFAULT_SLICE: SlicePreset = "yesterday";

export function createDefaultRouteState(): RouteState {
  const defaultRange = defaultDateRange(DEFAULT_SLICE);

  return {
    view: "overview",
    filters: {
      pageId: "",
      slicePreset: DEFAULT_SLICE,
      startDate: defaultRange.startDate,
      endDate: defaultRange.endDate,
      publishSnapshot: "official",
      inboxBucket: "all",
      revisit: "all",
      need: "all",
      outcome: "all",
      risk: "all",
      staff: "all"
    },
    comparePageIds: [],
    threadId: null,
    threadDayId: null,
    threadTab: "conversation",
    configurationTab: "page-info",
    operationPanel: "manual-run",
    utilityPanel: "none",
    runGroupId: null,
    runId: null
  };
}

export function parseRouteState(search: string): RouteState {
  const defaults = createDefaultRouteState();
  const params = new URLSearchParams(search);
  const slicePreset = parseSlicePreset(params.get("slice")) ?? defaults.filters.slicePreset;
  const range = slicePreset === "custom"
    ? {
      startDate: params.get("start") ?? defaults.filters.startDate,
      endDate: params.get("end") ?? defaults.filters.endDate
    }
    : defaultDateRange(slicePreset);

  return {
    view: parseView(params.get("view")) ?? defaults.view,
    filters: {
      pageId: params.get("page") ?? defaults.filters.pageId,
      slicePreset,
      startDate: range.startDate,
      endDate: range.endDate,
      publishSnapshot: parsePublishSnapshot(params.get("snapshot")) ?? defaults.filters.publishSnapshot,
      inboxBucket: parseInboxBucket(params.get("inbox")) ?? defaults.filters.inboxBucket,
      revisit: parseRevisitFilter(params.get("revisit")) ?? defaults.filters.revisit,
      need: params.get("need") ?? defaults.filters.need,
      outcome: params.get("outcome") ?? defaults.filters.outcome,
      risk: params.get("risk") ?? defaults.filters.risk,
      staff: params.get("staff") ?? defaults.filters.staff
    },
    comparePageIds: params.get("compare")?.split(",").filter(Boolean) ?? [],
    threadId: params.get("thread") || null,
    threadDayId: params.get("threadDay") || null,
    threadTab: parseThreadTab(params.get("threadTab")) ?? defaults.threadTab,
    configurationTab: parseConfigurationTab(params.get("configTab")) ?? defaults.configurationTab,
    operationPanel: parseOperationPanel(params.get("ops")) ?? defaults.operationPanel,
    utilityPanel: parseUtilityPanel(params.get("utility")) ?? defaults.utilityPanel,
    runGroupId: params.get("runGroup"),
    runId: params.get("run")
  };
}

export function serializeRouteState(route: RouteState) {
  const params = new URLSearchParams();
  params.set("view", route.view);
  writeIfValue(params, "page", route.filters.pageId);
  params.set("slice", route.filters.slicePreset);
  if (route.filters.slicePreset === "custom") {
    writeIfValue(params, "start", route.filters.startDate);
    writeIfValue(params, "end", route.filters.endDate);
  }
  params.set("snapshot", route.filters.publishSnapshot);
  params.set("inbox", route.filters.inboxBucket);
  params.set("revisit", route.filters.revisit);
  writeIfValue(params, "need", route.filters.need, "all");
  writeIfValue(params, "outcome", route.filters.outcome, "all");
  writeIfValue(params, "risk", route.filters.risk, "all");
  writeIfValue(params, "staff", route.filters.staff, "all");
  if (route.comparePageIds.length > 0) {
    params.set("compare", route.comparePageIds.join(","));
  }
  writeIfValue(params, "thread", route.threadId ?? "");
  writeIfValue(params, "threadDay", route.threadDayId ?? "");
  params.set("threadTab", route.threadTab);
  params.set("configTab", route.configurationTab);
  params.set("ops", route.operationPanel);
  writeIfValue(params, "utility", route.utilityPanel, "none");
  writeIfValue(params, "runGroup", route.runGroupId ?? "");
  writeIfValue(params, "run", route.runId ?? "");
  return params.toString();
}

export function applyBusinessFilters(current: RouteState, nextFilters: Partial<BusinessFilters>): RouteState {
  const filters: BusinessFilters = {
    ...current.filters,
    ...nextFilters
  };

  if (filters.slicePreset !== "custom") {
    const range = defaultDateRange(filters.slicePreset);
    filters.startDate = range.startDate;
    filters.endDate = range.endDate;
  }

  return {
    ...current,
    filters
  };
}

export function reconcileRouteStateWithCatalog(route: RouteState, pages: BusinessPage[]): RouteState {
  const validPageIds = new Set(pages.map((page) => page.id));
  const fallbackPageId = pages[0]?.id ?? "";
  const pageId = validPageIds.has(route.filters.pageId) ? route.filters.pageId : fallbackPageId;
  const comparePageIds = route.comparePageIds.filter((id) => validPageIds.has(id));

  if (pageId === route.filters.pageId && comparePageIds.length === route.comparePageIds.length) {
    return route;
  }

  return {
    ...route,
    filters: {
      ...route.filters,
      pageId
    },
    comparePageIds
  };
}

function writeIfValue(params: URLSearchParams, key: string, value: string, defaultValue = "") {
  if (value && value !== defaultValue) {
    params.set(key, value);
  }
}

function parseView(value: string | null) {
  return [
    "overview",
    "exploration",
    "staff-performance",
    "thread-history",
    "page-comparison",
    "operations",
    "configuration"
  ].includes(value ?? "")
    ? (value as RouteState["view"])
    : null;
}

function parseSlicePreset(value: string | null): SlicePreset | null {
  return ["yesterday", "7d", "30d", "quarter", "custom"].includes(value ?? "")
    ? (value as SlicePreset)
    : null;
}

function parsePublishSnapshot(value: string | null): PublishSnapshot | null {
  return value === "official" || value === "provisional" ? value : null;
}

function parseInboxBucket(value: string | null): InboxBucket | null {
  return value === "all" || value === "new" || value === "old" ? value : null;
}

function parseRevisitFilter(value: string | null): RevisitFilter | null {
  return value === "all" || value === "revisit" || value === "not_revisit" ? value : null;
}

function parseThreadTab(value: string | null): ThreadTab | null {
  return ["conversation", "analysis-history", "ai-audit", "crm-link"].includes(value ?? "")
    ? (value as ThreadTab)
    : null;
}

function parseConfigurationTab(value: string | null): ConfigurationTab | null {
  return ["page-info", "taxonomy", "opening-rules", "prompt-profile", "scheduler"].includes(value ?? "")
    ? (value as ConfigurationTab)
    : null;
}

function parseOperationPanel(value: string | null): OperationPanel | null {
  return ["manual-run", "run-monitor", "run-detail"].includes(value ?? "")
    ? (value as OperationPanel)
    : null;
}

function parseUtilityPanel(value: string | null): RouteState["utilityPanel"] | null {
  return value === "none" || value === "export" ? value : null;
}
