import { AppError } from "../../core/errors.ts";
import type { PublishEligibility } from "./chat_extractor.types.ts";

export type PlannedChildRun = {
  targetDate: string;
  requestedWindowStartAt: string | null;
  requestedWindowEndExclusiveAt: string | null;
  windowStartAt: string;
  windowEndExclusiveAt: string;
  isFullDay: boolean;
  publishEligibility: PublishEligibility;
  historicalOverwriteRequired: boolean;
};

export function splitRequestedWindowByTargetDate(
  requestedWindowStartAt: string,
  requestedWindowEndExclusiveAt: string,
  businessTimezone: string,
  now = new Date()
): PlannedChildRun[] {
  const start = new Date(requestedWindowStartAt);
  const end = new Date(requestedWindowEndExclusiveAt);
  if (Number.isNaN(start.valueOf()) || Number.isNaN(end.valueOf()) || start >= end) {
    throw new AppError(400, "CHAT_EXTRACTOR_INVALID_WINDOW", "requested_window_start_at phải nhỏ hơn requested_window_end_exclusive_at.");
  }

  const planned: PlannedChildRun[] = [];
  let cursor = start;
  while (cursor < end) {
    const targetDate = formatDateInTimezone(cursor, businessTimezone);
    const dayStart = parseDayStart(targetDate, businessTimezone);
    const nextDay = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

    const windowStartAt = cursor > dayStart ? cursor : dayStart;
    const windowEndExclusiveAt = end < nextDay ? end : nextDay;
    const isFullDay = windowStartAt.getTime() === dayStart.getTime() && windowEndExclusiveAt.getTime() === nextDay.getTime();

    planned.push({
      targetDate,
      requestedWindowStartAt,
      requestedWindowEndExclusiveAt,
      windowStartAt: windowStartAt.toISOString(),
      windowEndExclusiveAt: windowEndExclusiveAt.toISOString(),
      isFullDay,
      publishEligibility: determinePublishEligibility({ targetDate, isFullDay, businessTimezone, now }),
      historicalOverwriteRequired: isFullDay && isHistoricalTargetDate(targetDate, businessTimezone, now)
    });
    cursor = windowEndExclusiveAt;
  }

  return planned;
}

export function buildFullDayRun(targetDate: string, businessTimezone: string, now = new Date()): PlannedChildRun {
  const dayStart = parseDayStart(targetDate, businessTimezone);
  const nextDay = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
  return {
    targetDate,
    requestedWindowStartAt: null,
    requestedWindowEndExclusiveAt: null,
    windowStartAt: dayStart.toISOString(),
    windowEndExclusiveAt: nextDay.toISOString(),
    isFullDay: true,
    publishEligibility: determinePublishEligibility({ targetDate, isFullDay: true, businessTimezone, now }),
    historicalOverwriteRequired: isHistoricalTargetDate(targetDate, businessTimezone, now)
  };
}

export function determinePublishEligibility(input: {
  targetDate: string;
  isFullDay: boolean;
  businessTimezone: string;
  now?: Date;
}): PublishEligibility {
  if (input.isFullDay) {
    return "official_full_day";
  }
  return isHistoricalTargetDate(input.targetDate, input.businessTimezone, input.now ?? new Date())
    ? "not_publishable_old_partial"
    : "provisional_current_day_partial";
}

export function isHistoricalTargetDate(targetDate: string, businessTimezone: string, now = new Date()) {
  return targetDate < formatDateInTimezone(now, businessTimezone);
}

export function formatDateInTimezone(value: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(value);
}

export function parseDayStart(targetDate: string, timeZone: string) {
  const [yearText = "0", monthText = "1", dayText = "1"] = targetDate.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const utcGuess = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
  const offsetMs = getTimeZoneOffsetMilliseconds(utcGuess, timeZone);
  return new Date(utcGuess.getTime() - offsetMs);
}

function getTimeZoneOffsetMilliseconds(value: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).formatToParts(value);

  const lookup = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  const asUtc = Date.UTC(
    Number(lookup("year")),
    Number(lookup("month")) - 1,
    Number(lookup("day")),
    Number(lookup("hour")),
    Number(lookup("minute")),
    Number(lookup("second"))
  );
  return asUtc - value.getTime();
}
