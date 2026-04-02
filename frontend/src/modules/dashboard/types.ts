export type DashboardSourceId = "page-a" | "page-b" | "page-c";

export type InboxStatus = "new" | "existing";

export type RevisitStatus = "revisit" | "first_visit";

export type NeedCategory =
  | "Đặt lịch"
  | "Báo giá"
  | "Tư vấn dịch vụ"
  | "Tái khám"
  | "Khiếu nại";

export type SentimentLabel = "positive" | "neutral" | "negative";

export type ClosingOutcome = "won" | "open" | "lost";

export type RiskLevel = "flagged" | "clear";

export type DistributionDimension =
  | "inboxStatus"
  | "revisitStatus"
  | "need"
  | "sentiment"
  | "closingOutcome"
  | "riskLevel";

export type DashboardFilterGroupKey =
  | "inboxStatuses"
  | "revisitStatuses"
  | "needs"
  | "sentiments"
  | "closingOutcomes"
  | "riskLevels";

export type DashboardDatePresetKey = "1d" | "1w" | "1m" | "1q" | "1y";

export interface DashboardDateRange {
  start: string;
  end: string;
}

export interface DashboardSourceOption {
  id: DashboardSourceId;
  label: string;
  description: string;
}

export interface DashboardConversation {
  id: string;
  sourceId: DashboardSourceId;
  customerName: string;
  staffName: string;
  primaryNeed: NeedCategory;
  occurredAt: string;
  summary: string;
  inboxStatus: InboxStatus;
  revisitStatus: RevisitStatus;
  sentiment: SentimentLabel;
  closingOutcome: ClosingOutcome;
  warningCount: number;
  aiCost: number;
}

export interface DashboardFilterOption {
  value: string;
  label: string;
}

export interface DashboardFilterGroup {
  key: DashboardFilterGroupKey;
  label: string;
  selected: string[];
  options: DashboardFilterOption[];
}
