import { AppError } from "../../core/errors.ts";
import type { RunSlice } from "./seam1.types.ts";

export function splitRequestedWindowByTargetDate(
  requestedWindowStartAt: string,
  requestedWindowEndExclusiveAt: string,
  businessTimezone: string
): RunSlice[] {
  const start = new Date(requestedWindowStartAt);
  const end = new Date(requestedWindowEndExclusiveAt);
  if (Number.isNaN(start.valueOf()) || Number.isNaN(end.valueOf()) || start >= end) {
    throw new AppError(400, "SEAM1_INVALID_WINDOW", "requested_window_start_at must be before requested_window_end_exclusive_at.");
  }

  const slices: RunSlice[] = [];
  let cursor = start;
  while (cursor < end) {
    const targetDate = formatDateInTimezone(cursor, businessTimezone);
    const dayStart = parseDayStart(targetDate, businessTimezone);
    const nextDay = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

    const sliceStart = cursor > dayStart ? cursor : dayStart;
    const sliceEnd = end < nextDay ? end : nextDay;
    slices.push({
      targetDate,
      requestedWindowStartAt,
      requestedWindowEndExclusiveAt,
      windowStartAt: sliceStart.toISOString(),
      windowEndExclusiveAt: sliceEnd.toISOString(),
      isFullDay: sliceStart.getTime() === dayStart.getTime() && sliceEnd.getTime() === nextDay.getTime()
    });
    cursor = sliceEnd;
  }

  return slices;
}

function formatDateInTimezone(value: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(value);
}

function parseDayStart(targetDate: string, timeZone: string): Date {
  const [yearText = "0", monthText = "1", dayText = "1"] = targetDate.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const utcGuess = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
  const offsetMs = getTimeZoneOffsetMilliseconds(utcGuess, timeZone);
  return new Date(utcGuess.getTime() - offsetMs);
}

function getTimeZoneOffsetMilliseconds(value: Date, timeZone: string): number {
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
