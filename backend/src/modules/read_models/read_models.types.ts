import { z } from "zod";

const optionalText = z
  .union([z.string(), z.undefined()])
  .transform((value) => {
    if (typeof value !== "string") {
      return null;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  });

const optionalPositiveInt = z
  .union([z.string(), z.number(), z.undefined()])
  .transform((value) => {
    if (typeof value === "number" && Number.isFinite(value)) {
      return Math.max(0, Math.trunc(value));
    }
    if (typeof value !== "string") {
      return null;
    }
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) {
      return null;
    }
    return Math.max(0, parsed);
  });

const optionalDate = z
  .union([z.string(), z.undefined()])
  .refine((value) => {
    if (typeof value !== "string") {
      return true;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return true;
    }
    return /^\d{4}-\d{2}-\d{2}$/.test(trimmed);
  }, {
    message: "Date must use YYYY-MM-DD."
  })
  .transform((value) => {
    if (typeof value !== "string") {
      return null;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    return trimmed;
  });

export const dashboardQuerySchema = z.object({
  connected_page_id: optionalText,
  start_date: optionalDate,
  end_date: optionalDate,
  mood: optionalText,
  primary_need: optionalText,
  customer_type: optionalText,
  risk_level: optionalText,
  limit_latest_threads: optionalPositiveInt
});

export const comparisonQuerySchema = z.object({
  start_date: optionalDate,
  end_date: optionalDate
});

export const pageThreadsQuerySchema = z.object({
  start_date: optionalDate,
  end_date: optionalDate,
  mood: optionalText,
  primary_need: optionalText,
  customer_type: optionalText,
  risk_level: optionalText,
  q: optionalText,
  min_messages: optionalPositiveInt,
  sort_by: optionalText,
  sort_order: optionalText,
  limit: optionalPositiveInt,
  offset: optionalPositiveInt
});

export const threadDetailQuerySchema = z.object({
  start_date: optionalDate,
  end_date: optionalDate,
  run_group_id: optionalText
});

export const runGroupThreadsQuerySchema = z.object({
  q: optionalText,
  limit: optionalPositiveInt,
  offset: optionalPositiveInt
});

export const mappingReviewQuerySchema = z.object({
  limit: optionalPositiveInt
});

export type DashboardQuery = z.infer<typeof dashboardQuerySchema>;
export type ComparisonQuery = z.infer<typeof comparisonQuerySchema>;
export type PageThreadsQuery = z.infer<typeof pageThreadsQuerySchema>;
export type ThreadDetailQuery = z.infer<typeof threadDetailQuerySchema>;
export type RunGroupThreadsQuery = z.infer<typeof runGroupThreadsQuerySchema>;
export type MappingReviewQuery = z.infer<typeof mappingReviewQuerySchema>;
