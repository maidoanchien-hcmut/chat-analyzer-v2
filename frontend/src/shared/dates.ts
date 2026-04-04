import type { SlicePreset } from "../core/types.ts";

export function toDateToken(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function localYesterday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - 1);
  return date;
}

export function defaultDateRange(slicePreset: SlicePreset) {
  const end = localYesterday();
  const start = new Date(end);

  if (slicePreset === "7d") {
    start.setDate(end.getDate() - 6);
  } else if (slicePreset === "30d") {
    start.setDate(end.getDate() - 29);
  } else if (slicePreset === "quarter") {
    const month = end.getMonth();
    const quarterMonth = month - (month % 3);
    start.setMonth(quarterMonth, 1);
  }

  return {
    startDate: toDateToken(slicePreset === "yesterday" ? end : start),
    endDate: toDateToken(end)
  };
}

export function isoFromDatetimeLocal(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Mốc thời gian không hợp lệ.");
  }
  return date.toISOString();
}
