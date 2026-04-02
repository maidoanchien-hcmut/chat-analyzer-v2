import { env } from "./env.ts";

export const DEFAULT_PLATFORM_CODE = "default";
export const DEFAULT_PLATFORM_NAME = "Default Platform";
export const ACCESS_TOKEN_ISSUER = "chat-analyzer-v2-backend";
export const ACCESS_TOKEN_AUDIENCE = "chat-analyzer-v2-frontend";
export const LOGIN_RATE_LIMIT_MAX_ATTEMPTS = env.authLoginRateLimitMaxAttempts;
export const LOGIN_RATE_LIMIT_WINDOW_SECONDS = env.authLoginRateLimitWindowSeconds;
export const PERMISSION_CACHE_TTL_SECONDS = 5 * 60;
