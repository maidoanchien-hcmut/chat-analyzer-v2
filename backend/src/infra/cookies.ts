import { parse, serialize, type SerializeOptions } from "cookie";
import { env } from "../config/env.ts";

function baseCookieOptions(maxAgeSeconds: number): SerializeOptions {
  return {
    httpOnly: true,
    secure: env.authRefreshCookieSecure,
    sameSite: env.authRefreshCookieSameSite,
    path: env.authRefreshCookiePath,
    domain: env.authRefreshCookieDomain,
    maxAge: maxAgeSeconds
  };
}

export function parseCookieHeader(headerValue: string | null | undefined) {
  return parse(headerValue ?? "");
}

export function buildRefreshTokenCookie(value: string) {
  return serialize(env.authRefreshCookieName, value, baseCookieOptions(env.jwtRefreshTokenTtlSeconds));
}

export function buildClearRefreshTokenCookie() {
  return serialize(env.authRefreshCookieName, "", {
    ...baseCookieOptions(0),
    expires: new Date(0)
  });
}
