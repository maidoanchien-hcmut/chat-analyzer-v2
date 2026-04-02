import { SignJWT, jwtVerify } from "jose";
import { ACCESS_TOKEN_AUDIENCE, ACCESS_TOKEN_ISSUER } from "../config/auth.ts";
import { env } from "../config/env.ts";

export type AccessTokenClaims = {
  sub: string;
  platform_id: number;
  sid: number;
  authz_version: number;
  role_ids: number[];
  role_codes: string[];
};

const accessSecret = new TextEncoder().encode(env.jwtAccessSecret);

export async function signAccessToken(claims: AccessTokenClaims) {
  return new SignJWT({
    platform_id: claims.platform_id,
    sid: claims.sid,
    authz_version: claims.authz_version,
    role_ids: claims.role_ids,
    role_codes: claims.role_codes
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setIssuer(ACCESS_TOKEN_ISSUER)
    .setAudience(ACCESS_TOKEN_AUDIENCE)
    .setExpirationTime(`${env.jwtAccessTokenTtlSeconds}s`)
    .sign(accessSecret);
}

export async function verifyAccessToken(token: string): Promise<AccessTokenClaims> {
  const { payload } = await jwtVerify(token, accessSecret, {
    issuer: ACCESS_TOKEN_ISSUER,
    audience: ACCESS_TOKEN_AUDIENCE
  });

  return {
    sub: payload.sub!,
    platform_id: Number(payload.platform_id),
    sid: Number(payload.sid),
    authz_version: Number(payload.authz_version),
    role_ids: Array.isArray(payload.role_ids) ? payload.role_ids.map((value) => Number(value)) : [],
    role_codes: Array.isArray(payload.role_codes) ? payload.role_codes.map((value) => String(value)) : []
  };
}

