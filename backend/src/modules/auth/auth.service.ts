import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { AppError } from "../../core/errors.ts";
import { DEFAULT_PLATFORM_CODE, LOGIN_RATE_LIMIT_MAX_ATTEMPTS, LOGIN_RATE_LIMIT_WINDOW_SECONDS } from "../../config/auth.ts";
import { env } from "../../config/env.ts";
import { buildRefreshTokenCookie, buildClearRefreshTokenCookie, parseCookieHeader } from "../../infra/cookies.ts";
import { signAccessToken, verifyAccessToken } from "../../infra/jwt.ts";
import { hashPassword, verifyPassword } from "../../infra/password.ts";
import { consumeRateLimit, resetRateLimit } from "../../infra/rate-limit.ts";
import { authzService } from "../authz/authz.service.ts";
import type { AuthorizationOptions } from "../authz/authorize.ts";
import { permissionCodes, type RoleCode } from "../authz/permissions.ts";
import { platformsService } from "../platforms/platforms.service.ts";
import { authRepository } from "./auth.repository.ts";
import type { AuthMeResponse, AuthTokenResponse, ChangePasswordPayload, LoginPayload, RequestMetadata } from "./auth.types.ts";

type HeaderBag = Headers | Record<string, string | undefined>;

export type AuthenticatedRequest = {
  userId: number;
  platformId: number;
  platformCode: string;
  sessionId: number;
  authzVersion: number;
  roleIds: number[];
  roleCodes: RoleCode[];
  permissions: string[];
  mustChangePassword: boolean;
};

export class AuthService {
  async login(payload: LoginPayload, request: RequestMetadata): Promise<{ response: AuthTokenResponse; setCookie: string }> {
    const identifier = normalizeIdentifier(payload.identifier);
    const rateLimitKey = `${identifier}:${request.ipAddress ?? "unknown"}`;
    const rateLimit = await consumeRateLimit(rateLimitKey, LOGIN_RATE_LIMIT_MAX_ATTEMPTS, LOGIN_RATE_LIMIT_WINDOW_SECONDS);

    if (!rateLimit.allowed) {
      throw new AppError(429, "LOGIN_RATE_LIMITED", "Too many login attempts. Please try again later.", {
        retryAfterSeconds: rateLimit.retryAfterSeconds
      });
    }

    const user = await authRepository.findUserByIdentifier(identifier);

    if (!user || user.platform.code !== DEFAULT_PLATFORM_CODE || !user.isActive) {
      await this.writeLoginAudit(user?.platformId ?? null, user?.id ?? null, request, false, identifier);
      throw new AppError(401, "INVALID_CREDENTIALS", "Invalid credentials.");
    }

    const isValid = await verifyPassword(payload.password, user.passwordHash);

    if (!isValid) {
      await this.writeLoginAudit(user.platformId, user.id, request, false, identifier);
      throw new AppError(401, "INVALID_CREDENTIALS", "Invalid credentials.");
    }

    await resetRateLimit(rateLimitKey);

    const tokenBundle = await this.issueNewSession({
      userId: user.id,
      platformId: user.platformId,
      authzVersion: user.authzVersion,
      request
    });

    await this.writeLoginAudit(user.platformId, user.id, request, true, identifier);
    return tokenBundle;
  }

  async refresh(cookieHeader: string | null | undefined, request: RequestMetadata): Promise<{ response: AuthTokenResponse; setCookie: string }> {
    this.assertCookieOrigin(request.origin);
    const refreshToken = this.readRefreshCookie(cookieHeader);

    if (!refreshToken) {
      throw new AppError(401, "REFRESH_TOKEN_MISSING", "Refresh token is missing.");
    }

    const hashed = this.hashRefreshToken(refreshToken);
    const existing = await authRepository.findRefreshTokenByHash(hashed);

    if (!existing) {
      throw new AppError(401, "REFRESH_TOKEN_INVALID", "Refresh token is invalid.");
    }

    if (!existing.isActive || existing.revokedAt || existing.expiresAt <= new Date()) {
      await authRepository.revokeRefreshTokenFamily(existing.familyId, "refresh_token_reuse_detected");
      throw new AppError(401, "REFRESH_TOKEN_REVOKED", "Refresh token is no longer valid.");
    }

    if (!existing.user.isActive) {
      await authRepository.revokeRefreshToken(existing.id, "user_disabled");
      throw new AppError(401, "USER_DISABLED", "User is inactive.");
    }

    const tokenBundle = await this.rotateSession(existing.id, existing.familyId, existing.userId, existing.platformId, existing.user.authzVersion, request);
    return tokenBundle;
  }

  async logout(cookieHeader: string | null | undefined, request: RequestMetadata) {
    this.assertCookieOrigin(request.origin);
    const refreshToken = this.readRefreshCookie(cookieHeader);

    if (!refreshToken) {
      return {
        setCookie: buildClearRefreshTokenCookie(),
        response: {
          message: "Logged out."
        }
      };
    }

    const hashed = this.hashRefreshToken(refreshToken);
    const existing = await authRepository.findRefreshTokenByHash(hashed);

    if (existing) {
      await authRepository.revokeRefreshToken(existing.id, "logout");
      await authRepository.createAuditLog({
        platformId: existing.platformId,
        userId: existing.userId,
        action: "auth.logout",
        targetType: "auth_refresh_token",
        targetId: String(existing.id),
        request
      });
    }

    return {
      setCookie: buildClearRefreshTokenCookie(),
      response: {
        message: "Logged out."
      }
    };
  }

  async logoutAll(auth: AuthenticatedRequest, request: RequestMetadata) {
    this.assertCookieOrigin(request.origin);

    await authRepository.transaction(async (tx) => {
      await authRepository.revokeUserRefreshTokens(auth.userId, auth.platformId, "logout_all", tx);
      await authRepository.incrementAuthzVersion(auth.userId, tx);
    });
    await authzService.invalidateUserPermissionCache(auth.userId);
    await authRepository.createAuditLog({
      platformId: auth.platformId,
      userId: auth.userId,
      action: "auth.logout_all",
      targetType: "auth_user",
      targetId: String(auth.userId),
      request
    });

    return {
      setCookie: buildClearRefreshTokenCookie(),
      response: {
        message: "Logged out from all sessions."
      }
    };
  }

  async changePassword(
    auth: AuthenticatedRequest,
    payload: ChangePasswordPayload,
    request: RequestMetadata
  ): Promise<{ response: AuthTokenResponse; setCookie: string }> {
    this.assertCookieOrigin(request.origin);
    const user = await authRepository.findUserById(auth.userId);

    if (!user || !user.isActive) {
      throw new AppError(401, "USER_NOT_FOUND", "User is no longer available.");
    }

    const isValid = await verifyPassword(payload.currentPassword, user.passwordHash);

    if (!isValid) {
      throw new AppError(401, "INVALID_PASSWORD", "Current password is invalid.");
    }

    const nextPasswordHash = await hashPassword(payload.newPassword);

    const updatedUser = await authRepository.transaction(async (tx) => {
      await authRepository.revokeUserRefreshTokens(user.id, user.platformId, "password_changed", tx);
      return authRepository.updatePassword(user.id, nextPasswordHash, tx);
    });

    await authRepository.createAuditLog({
      platformId: updatedUser.platformId,
      userId: updatedUser.id,
      action: "auth.change_password",
      targetType: "auth_user",
      targetId: String(updatedUser.id),
      request
    });

    await authzService.invalidateUserPermissionCache(updatedUser.id);
    return this.issueNewSession({
      userId: updatedUser.id,
      platformId: updatedUser.platformId,
      authzVersion: updatedUser.authzVersion,
      request
    });
  }

  async getMe(auth: AuthenticatedRequest): Promise<AuthMeResponse> {
    return this.buildProfile(auth.userId);
  }

  async authenticateAccessRequest(headers: HeaderBag, options: AuthorizationOptions = {}): Promise<AuthenticatedRequest> {
    const bearerToken = readHeader(headers, "authorization")?.replace(/^Bearer\s+/i, "").trim();

    if (!bearerToken) {
      throw new AppError(401, "ACCESS_TOKEN_MISSING", "Access token is missing.");
    }

    let claims;

    try {
      claims = await verifyAccessToken(bearerToken);
    } catch {
      throw new AppError(401, "ACCESS_TOKEN_INVALID", "Access token is invalid.");
    }

    const user = await authRepository.findUserById(Number(claims.sub));

    if (!user || !user.isActive || user.platformId !== claims.platform_id) {
      throw new AppError(401, "ACCESS_TOKEN_INVALID", "Access token is invalid.");
    }

    if (user.authzVersion !== claims.authz_version) {
      throw new AppError(401, "ACCESS_TOKEN_STALE", "Access token is no longer current.");
    }

    const snapshot = await authzService.getPermissionSnapshot(user.id);

    if (user.mustChangePassword && !options.allowMustChangePassword) {
      throw new AppError(403, "PASSWORD_CHANGE_REQUIRED", "Password change is required before accessing this resource.");
    }

    if (options.permissions?.length) {
      const missing = options.permissions.filter((permission) => !snapshot.permissions.includes(permission));

      if (missing.length > 0) {
        throw new AppError(403, "PERMISSION_DENIED", "You do not have permission to access this resource.", {
          missingPermissions: missing
        });
      }
    }

    return {
      userId: user.id,
      platformId: user.platformId,
      platformCode: user.platform.code,
      sessionId: claims.sid,
      authzVersion: user.authzVersion,
      roleIds: snapshot.roleIds,
      roleCodes: snapshot.roleCodes,
      permissions: snapshot.permissions,
      mustChangePassword: user.mustChangePassword
    };
  }

  private async rotateSession(
    previousSessionId: number,
    familyId: string,
    userId: number,
    platformId: number,
    authzVersion: number,
    request: RequestMetadata
  ) {
    await authRepository.revokeRefreshToken(previousSessionId, "rotated");

    return this.issueNewSession({
      userId,
      platformId,
      authzVersion,
      request,
      familyId,
      rotatedFromTokenId: previousSessionId
    });
  }

  private async issueNewSession(input: {
    userId: number;
    platformId: number;
    authzVersion: number;
    request: RequestMetadata;
    familyId?: string;
    rotatedFromTokenId?: number;
  }) {
    const refreshToken = randomBytes(48).toString("base64url");
    const tokenHash = this.hashRefreshToken(refreshToken);
    const familyId = input.familyId ?? randomUUID();
    const expiresAt = new Date(Date.now() + env.jwtRefreshTokenTtlSeconds * 1000);
    const session = await authRepository.createRefreshToken({
      platformId: input.platformId,
      userId: input.userId,
      tokenHash,
      familyId,
      rotatedFromTokenId: input.rotatedFromTokenId,
      expiresAt,
      metadata: input.request
    });
    const profile = await this.buildProfile(input.userId);
    const accessToken = await signAccessToken({
      sub: String(input.userId),
      platform_id: input.platformId,
      sid: session.id,
      authz_version: input.authzVersion,
      role_ids: profile.roleIds,
      role_codes: profile.roleCodes
    });

    return {
      setCookie: buildRefreshTokenCookie(refreshToken),
      response: {
        accessToken,
        profile
      }
    };
  }

  private async buildProfile(userId: number): Promise<AuthMeResponse> {
    const user = await authRepository.findUserById(userId);

    if (!user) {
      throw new AppError(404, "USER_NOT_FOUND", "User not found.");
    }

    const snapshot = await authzService.getPermissionSnapshot(user.id);

    return {
      user: {
        id: user.id,
        identifier: user.identifier,
        displayName: user.displayName,
        email: user.email,
        isActive: user.isActive,
        mustChangePassword: user.mustChangePassword
      },
      platform: {
        id: user.platform.id,
        code: user.platform.code,
        name: user.platform.name,
        brandName: user.platform.brandName
      },
      roleIds: snapshot.roleIds,
      roleCodes: snapshot.roleCodes,
      permissions: snapshot.permissions
    };
  }

  private readRefreshCookie(cookieHeader: string | null | undefined) {
    const cookies = parseCookieHeader(cookieHeader);
    return cookies[env.authRefreshCookieName] ?? null;
  }

  private hashRefreshToken(value: string) {
    return createHmac("sha256", env.jwtRefreshSecret).update(value).digest("hex");
  }

  private assertCookieOrigin(origin: string | null) {
    if (origin && origin !== env.corsOrigin) {
      throw new AppError(403, "INVALID_ORIGIN", "Request origin is not allowed.");
    }
  }

  private async writeLoginAudit(
    platformId: number | null,
    userId: number | null,
    request: RequestMetadata,
    success: boolean,
    identifier: string
  ) {
    const platform = platformId ? null : await platformsService.ensureDefaultPlatform();

    await authRepository.createAuditLog({
      platformId: platformId ?? platform!.id,
      userId,
      action: success ? "auth.login.success" : "auth.login.failure",
      targetType: "auth_user",
      targetId: userId ? String(userId) : identifier,
      success,
      metadata: {
        identifier
      },
      request
    });
  }
}

function normalizeIdentifier(identifier: string) {
  return identifier.trim().toLowerCase();
}

export function extractRequestMetadata(headers: HeaderBag): RequestMetadata {
  return {
    ipAddress: readHeader(headers, "x-forwarded-for")?.split(",")[0]?.trim() ?? readHeader(headers, "x-real-ip") ?? null,
    userAgent: readHeader(headers, "user-agent") ?? null,
    origin: readHeader(headers, "origin") ?? null
  };
}

function readHeader(headers: HeaderBag, key: string) {
  if (headers instanceof Headers) {
    return headers.get(key);
  }

  return headers[key] ?? headers[key.toLowerCase()];
}

export { readHeader };

export const authService = new AuthService();
