import { z } from "zod";

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    HOST: z.string().default("0.0.0.0"),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    DATABASE_URL: z.string().optional(),
    DB_PROTOCOL: z.string().default("postgresql"),
    DB_HOST: z.string().default("localhost"),
    DB_PORT: z.coerce.number().int().positive().default(5432),
    DB_NAME: z.string().min(1),
    DB_USER: z.string().min(1),
    DB_PASSWORD: z.string().default(""),
    DB_SCHEMA: z.string().default("public"),
    REDIS_URL: z.string().optional(),
    REDIS_PROTOCOL: z.string().default("redis"),
    REDIS_HOST: z.string().default("localhost"),
    REDIS_PORT: z.coerce.number().int().positive().default(6379),
    REDIS_DB: z.coerce.number().int().min(0).default(0),
    CORS_ORIGIN: z.string().min(1),
    JWT_ACCESS_SECRET: z.string().min(16).optional(),
    JWT_ACCESS_TOKEN_SECRET: z.string().min(16).optional(),
    JWT_REFRESH_SECRET: z.string().min(16).optional(),
    JWT_REFRESH_TOKEN_SECRET: z.string().min(16).optional(),
    JWT_ACCESS_TOKEN_TTL: z.coerce.number().int().positive().default(900),
    JWT_REFRESH_TOKEN_TTL: z.coerce.number().int().positive().default(60 * 60 * 24 * 30),
    AUTH_REFRESH_COOKIE_NAME: z.string().min(1).default("chat_analyzer_refresh_token"),
    AUTH_REFRESH_COOKIE_SECURE: z
      .string()
      .default("false")
      .transform((value) => value === "true"),
    AUTH_REFRESH_COOKIE_SAME_SITE: z.enum(["strict", "lax", "none"]).default("strict"),
    AUTH_REFRESH_COOKIE_PATH: z.string().min(1).default("/auth"),
    AUTH_REFRESH_COOKIE_DOMAIN: z.string().optional(),
    AUTH_LOGIN_RATE_LIMIT_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
    AUTH_LOGIN_RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().positive().default(15 * 60)
  })
  .transform((raw) => {
    const databaseUrl = `${raw.DB_PROTOCOL}://${encodeURIComponent(raw.DB_USER)}:${encodeURIComponent(raw.DB_PASSWORD)}@${raw.DB_HOST}:${raw.DB_PORT}/${raw.DB_NAME}?schema=${raw.DB_SCHEMA}`;
    const redisUrl = `${raw.REDIS_PROTOCOL}://${raw.REDIS_HOST}:${raw.REDIS_PORT}/${raw.REDIS_DB}`;

    return {
      nodeEnv: raw.NODE_ENV,
      host: raw.HOST,
      port: raw.PORT,
      databaseUrl,
      redisUrl,
      corsOrigin: raw.CORS_ORIGIN,
      jwtAccessSecret: raw.JWT_ACCESS_SECRET ?? raw.JWT_ACCESS_TOKEN_SECRET!,
      jwtRefreshSecret: raw.JWT_REFRESH_SECRET ?? raw.JWT_REFRESH_TOKEN_SECRET!,
      jwtAccessTokenTtlSeconds: raw.JWT_ACCESS_TOKEN_TTL,
      jwtRefreshTokenTtlSeconds: raw.JWT_REFRESH_TOKEN_TTL,
      authRefreshCookieName: raw.AUTH_REFRESH_COOKIE_NAME,
      authRefreshCookieSecure: raw.AUTH_REFRESH_COOKIE_SECURE,
      authRefreshCookieSameSite: raw.AUTH_REFRESH_COOKIE_SAME_SITE,
      authRefreshCookiePath: raw.AUTH_REFRESH_COOKIE_PATH,
      authRefreshCookieDomain: raw.AUTH_REFRESH_COOKIE_DOMAIN,
      authLoginRateLimitMaxAttempts: raw.AUTH_LOGIN_RATE_LIMIT_MAX_ATTEMPTS,
      authLoginRateLimitWindowSeconds: raw.AUTH_LOGIN_RATE_LIMIT_WINDOW_SECONDS
    };
  });

const parsed = envSchema.safeParse(Bun.env);

if (!parsed.success) {
  throw new Error(`Invalid environment configuration: ${parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")}`);
}

export const env = parsed.data;
export type Env = typeof env;
