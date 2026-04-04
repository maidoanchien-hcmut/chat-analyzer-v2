export type AppView =
  | "overview"
  | "exploration"
  | "staff-performance"
  | "thread-history"
  | "page-comparison"
  | "operations"
  | "configuration";

export type AdapterSource = "demo" | "http" | "hybrid";
export type SlicePreset = "yesterday" | "7d" | "30d" | "quarter" | "custom";
export type PublishSnapshot = "official" | "provisional";
export type InboxBucket = "all" | "new" | "old";
export type RevisitFilter = "all" | "revisit" | "not_revisit";
export type ThreadTab = "conversation" | "analysis-history" | "ai-audit" | "crm-link";
export type ConfigurationTab = "page-info" | "taxonomy" | "opening-rules" | "prompt-profile" | "scheduler";
export type OperationPanel = "manual-run" | "run-monitor" | "run-detail";
export type UtilityPanel = "none" | "export";
export type ToastKind = "info" | "error" | "warning";

export type NavItem = {
  view: AppView;
  label: string;
  description: string;
  source: AdapterSource;
};

export type SelectOption = {
  value: string;
  label: string;
};

export type BusinessPage = {
  id: string;
  label: string;
  pancakePageId: string;
  timezone: string;
};

export type BusinessFilters = {
  pageId: string;
  slicePreset: SlicePreset;
  startDate: string;
  endDate: string;
  publishSnapshot: PublishSnapshot;
  inboxBucket: InboxBucket;
  revisit: RevisitFilter;
  need: string;
  outcome: string;
  risk: string;
  staff: string;
};

export type RouteState = {
  view: AppView;
  filters: BusinessFilters;
  comparePageIds: string[];
  threadId: string | null;
  threadTab: ThreadTab;
  configurationTab: ConfigurationTab;
  operationPanel: OperationPanel;
  utilityPanel: UtilityPanel;
  runGroupId: string | null;
  runId: string | null;
};

export type AppToast = {
  kind: ToastKind;
  message: string;
};

export type AsyncStatus = {
  pending: boolean;
  label: string | null;
};
