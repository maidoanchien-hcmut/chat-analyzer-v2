import type {
  ClosingOutcome,
  DashboardConversation,
  DashboardDatePresetKey,
  DashboardDateRange,
  DistributionDimension,
  InboxStatus,
  RevisitStatus,
  RiskLevel,
  SentimentLabel
} from "@/modules/dashboard/types";

const dayFormatter = new Intl.DateTimeFormat("vi-VN", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric"
});

const dateTimeFormatter = new Intl.DateTimeFormat("vi-VN", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit"
});

const numberFormatter = new Intl.NumberFormat("vi-VN");

export function parseIsoDate(value: string) {
  return new Date(`${value}T00:00:00`);
}

export function formatIsoDate(value: Date) {
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, "0");
  const day = `${value.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatDisplayDate(value: string) {
  return dayFormatter.format(parseIsoDate(value));
}

export function formatDateRange(range: DashboardDateRange) {
  return `${formatDisplayDate(range.start)}-${formatDisplayDate(range.end)}`;
}

export function formatDateTime(value: string) {
  return dateTimeFormatter.format(new Date(value)).replace(",", " ·");
}

export function formatMetricNumber(value: number) {
  return numberFormatter.format(value);
}

export function formatCurrency(value: number) {
  return `US$${value.toFixed(3)}`;
}

export function compareConversationsByOccurredAt(left: DashboardConversation, right: DashboardConversation) {
  return right.occurredAt.localeCompare(left.occurredAt);
}

export function isConversationInDateRange(
  conversation: DashboardConversation,
  range: DashboardDateRange
) {
  const occurredDay = conversation.occurredAt.slice(0, 10);
  return occurredDay >= range.start && occurredDay <= range.end;
}

export function addDays(value: Date, amount: number) {
  const next = new Date(value);
  next.setDate(next.getDate() + amount);
  return next;
}

export function addMonths(value: Date, amount: number) {
  const next = new Date(value);
  next.setMonth(next.getMonth() + amount);
  return next;
}

export function addYears(value: Date, amount: number) {
  const next = new Date(value);
  next.setFullYear(next.getFullYear() + amount);
  return next;
}

export function startOfMonth(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), 1);
}

export function startOfWeek(value: Date) {
  const current = new Date(value);
  const day = current.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  return addDays(current, diff);
}

export function getPresetRange(preset: DashboardDatePresetKey, today: string): DashboardDateRange {
  const currentDate = parseIsoDate(today);

  if (preset === "1d") {
    return { start: today, end: today };
  }

  if (preset === "1w") {
    return {
      start: formatIsoDate(addDays(currentDate, -6)),
      end: today
    };
  }

  if (preset === "1m") {
    return {
      start: formatIsoDate(addMonths(currentDate, -1)),
      end: today
    };
  }

  if (preset === "1q") {
    return {
      start: formatIsoDate(addMonths(currentDate, -3)),
      end: today
    };
  }

  return {
    start: formatIsoDate(addYears(currentDate, -1)),
    end: today
  };
}

export function getRiskLevel(conversation: DashboardConversation): RiskLevel {
  return conversation.warningCount > 0 ? "flagged" : "clear";
}

export function formatInboxStatusLabel(value: InboxStatus) {
  return value === "new" ? "Inbox mới" : "Inbox cũ";
}

export function formatRevisitStatusLabel(value: RevisitStatus) {
  return value === "revisit" ? "Tái khám" : "Không tái khám";
}

export function formatSentimentLabel(value: SentimentLabel) {
  if (value === "positive") {
    return "Tích cực";
  }

  if (value === "neutral") {
    return "Trung tính";
  }

  return "Tiêu cực";
}

export function formatClosingOutcomeLabel(value: ClosingOutcome) {
  if (value === "won") {
    return "Đã chốt";
  }

  if (value === "open") {
    return "Đang theo dõi";
  }

  return "Đã mất";
}

export function formatRiskLevelLabel(value: RiskLevel) {
  return value === "flagged" ? "Có cảnh báo" : "Không cảnh báo";
}

export function formatDistributionDimensionLabel(value: DistributionDimension) {
  if (value === "inboxStatus") {
    return "Loại inbox";
  }

  if (value === "revisitStatus") {
    return "Nhãn tái khám";
  }

  if (value === "need") {
    return "Nhu cầu";
  }

  if (value === "sentiment") {
    return "Cảm xúc";
  }

  if (value === "closingOutcome") {
    return "Kết quả chốt";
  }

  return "Cảnh báo";
}

export function formatDistributionValueLabel(dimension: DistributionDimension, value: string) {
  if (dimension === "inboxStatus") {
    return formatInboxStatusLabel(value as InboxStatus);
  }

  if (dimension === "revisitStatus") {
    return formatRevisitStatusLabel(value as RevisitStatus);
  }

  if (dimension === "sentiment") {
    return formatSentimentLabel(value as SentimentLabel);
  }

  if (dimension === "closingOutcome") {
    return formatClosingOutcomeLabel(value as ClosingOutcome);
  }

  if (dimension === "riskLevel") {
    return formatRiskLevelLabel(value as RiskLevel);
  }

  return value;
}
