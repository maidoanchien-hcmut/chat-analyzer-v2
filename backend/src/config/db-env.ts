import { z } from "zod";

const dbEnvSchema = z
  .object({
    DATABASE_URL: z.string().optional(),
    DB_PROTOCOL: z.string().default("postgresql"),
    DB_HOST: z.string().default("localhost"),
    DB_PORT: z.coerce.number().int().positive().default(5432),
    DB_NAME: z.string().optional(),
    DB_USER: z.string().optional(),
    DB_PASSWORD: z.string().default(""),
    DB_SCHEMA: z.string().default("public")
  })
  .superRefine((raw, ctx) => {
    if (!raw.DATABASE_URL && (!raw.DB_NAME || !raw.DB_USER)) {
      if (!raw.DB_NAME) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["DB_NAME"],
          message: "DB_NAME is required when DATABASE_URL is not set"
        });
      }
      if (!raw.DB_USER) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["DB_USER"],
          message: "DB_USER is required when DATABASE_URL is not set"
        });
      }
    }
  })
  .transform((raw) => {
    if (raw.DATABASE_URL) {
      return {
        databaseUrl: raw.DATABASE_URL
      };
    }

    return {
      databaseUrl: `${raw.DB_PROTOCOL}://${encodeURIComponent(raw.DB_USER!)}:${encodeURIComponent(raw.DB_PASSWORD)}@${raw.DB_HOST}:${raw.DB_PORT}/${raw.DB_NAME!}?schema=${raw.DB_SCHEMA}`
    };
  });

const parsed = dbEnvSchema.safeParse(Bun.env);

if (!parsed.success) {
  throw new Error(`Invalid database configuration: ${parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")}`);
}

export const dbEnv = parsed.data;
export type DbEnv = typeof dbEnv;
