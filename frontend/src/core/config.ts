import type { AdapterSource, AppView, NavItem } from "./types.ts";

export const DEFAULT_API_BASE_URL = "http://localhost:3000";
export const STORAGE_API_BASE_URL = "chat-analyzer-v2:api-base-url";

export const NAV_ITEMS: NavItem[] = [
  { view: "overview", label: "Tổng quan", description: "BoD đọc KPI và ưu tiên cải tiến", source: "http" },
  { view: "exploration", label: "Khám phá dữ liệu", description: "Self-service BI và drill-down", source: "http" },
  { view: "staff-performance", label: "Hiệu quả nhân viên", description: "Coaching staff theo issue pattern", source: "http" },
  { view: "thread-history", label: "Lịch sử hội thoại", description: "Workspace audit theo thread", source: "http" },
  { view: "page-comparison", label: "So sánh trang", description: "So sánh multi-page", source: "http" },
  { view: "operations", label: "Vận hành", description: "Run monitor, preview, publish", source: "http" },
  { view: "configuration", label: "Cấu hình", description: "Page config và onboarding", source: "http" }
];

export const VIEW_TITLES: Record<AppView, string> = Object.fromEntries(
  NAV_ITEMS.map((item) => [item.view, item.label])
) as Record<AppView, string>;

export const FEATURE_SOURCE_MATRIX: Record<AppView | "onboarding" | "prompt-profile-preview", AdapterSource> = {
  overview: "http",
  exploration: "http",
  "staff-performance": "http",
  "thread-history": "http",
  "page-comparison": "http",
  operations: "http",
  configuration: "http",
  onboarding: "http",
  "prompt-profile-preview": "hybrid"
};
