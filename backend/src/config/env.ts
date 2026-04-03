import { z } from "zod";

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    HOST: z.string().default("0.0.0.0"),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    ANALYSIS_SERVICE_GRPC_TARGET: z.string().default("127.0.0.1:50051"),
    ANALYSIS_SERVICE_GRPC_TIMEOUT_MS: z.coerce.number().int().positive().default(60000),
    DATABASE_URL: z.string().optional(),
    DB_PROTOCOL: z.string().default("postgresql"),
    DB_HOST: z.string().default("localhost"),
    DB_PORT: z.coerce.number().int().positive().default(5432),
    DB_NAME: z.string().optional(),
    DB_USER: z.string().optional(),
    DB_PASSWORD: z.string().default(""),
    DB_SCHEMA: z.string().default("public"),
    REDIS_URL: z.string().optional(),
    REDIS_PROTOCOL: z.string().default("redis"),
    REDIS_HOST: z.string().default("localhost"),
    REDIS_PORT: z.coerce.number().int().positive().default(6379),
    REDIS_DB: z.coerce.number().int().min(0).default(0),
    CORS_ORIGIN: z.string().min(1)
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
    const databaseUrl =
      raw.DATABASE_URL ??
      `${raw.DB_PROTOCOL}://${encodeURIComponent(raw.DB_USER!)}:${encodeURIComponent(raw.DB_PASSWORD)}@${raw.DB_HOST}:${raw.DB_PORT}/${raw.DB_NAME!}?schema=${raw.DB_SCHEMA}`;
    const redisUrl = `${raw.REDIS_PROTOCOL}://${raw.REDIS_HOST}:${raw.REDIS_PORT}/${raw.REDIS_DB}`;

    return {
      nodeEnv: raw.NODE_ENV,
      host: raw.HOST,
      port: raw.PORT,
      analysisServiceGrpcTarget: raw.ANALYSIS_SERVICE_GRPC_TARGET,
      analysisServiceGrpcTimeoutMs: raw.ANALYSIS_SERVICE_GRPC_TIMEOUT_MS,
      databaseUrl,
      redisUrl,
      corsOrigin: raw.CORS_ORIGIN
    };
  });

const parsed = envSchema.safeParse(Bun.env);

if (!parsed.success) {
  throw new Error(`Invalid environment configuration: ${parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")}`);
}

export const env = parsed.data;
export type Env = typeof env;
