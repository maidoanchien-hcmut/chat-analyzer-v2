import type { Prisma } from "@prisma/client";
import { AppError } from "../../core/errors.ts";
import { hashPassword } from "../../infra/password.ts";
import { authzService } from "../authz/authz.service.ts";
import { permissionCodes, roleCodes } from "../authz/permissions.ts";
import type { AuthenticatedRequest } from "../auth/auth.service.ts";
import type { RequestMetadata } from "../auth/auth.types.ts";
import { authRepository } from "../auth/auth.repository.ts";
import { adminAccountsRepository } from "./admin-accounts.repository.ts";

type CreateUserPayload = {
  identifier: string;
  displayName: string;
  email?: string;
  temporaryPassword: string;
  roleIds: number[];
  isActive: boolean;
};

type UpdateUserPayload = {
  displayName?: string;
  email?: string | null;
  isActive?: boolean;
};

type ResetPasswordPayload = {
  temporaryPassword: string;
};

type AssignRolesPayload = {
  roleIds: number[];
};

export class AdminAccountsService {
  async listUsers(auth: AuthenticatedRequest) {
    const users = await adminAccountsRepository.listUsers(auth.platformId);

    return {
      items: users.map((user) => ({
        id: user.id,
        identifier: user.identifier,
        displayName: user.displayName,
        email: user.email,
        isActive: user.isActive,
        mustChangePassword: user.mustChangePassword,
        roleIds: user.roles.filter((link) => link.isActive).map((link) => link.roleId),
        roleCodes: user.roles.filter((link) => link.isActive).map((link) => link.role.code)
      })),
      count: users.length
    };
  }

  getRoles(auth: AuthenticatedRequest) {
    return adminAccountsRepository.listRoles(auth.platformId).then((roles) =>
      roles.map((role) => ({
        id: role.id,
        code: role.code,
        name: role.name,
        description: role.description,
        isActive: role.isActive,
        permissionCodes: role.permissions.map((link) => link.permission.code)
      }))
    );
  }

  getPermissions(auth: AuthenticatedRequest) {
    return adminAccountsRepository.listPermissions(auth.platformId);
  }

  async createUser(auth: AuthenticatedRequest, payload: CreateUserPayload, request: RequestMetadata) {
    const roleId = this.extractSingleRoleId(payload.roleIds);
    const role = await adminAccountsRepository.findRole(auth.platformId, roleId);

    if (!role) {
      throw new AppError(400, "ROLE_NOT_FOUND", "Role does not exist on this platform.");
    }

    const identifier = normalizeIdentifier(payload.identifier);
    const email = normalizeOptionalEmail(payload.email);
    const existing = await adminAccountsRepository.findUserByIdentifierOrEmail(
      auth.platformId,
      identifier,
      email
    );

    if (existing) {
      throw new AppError(409, "USER_ALREADY_EXISTS", "Identifier or email is already in use.");
    }

    const passwordHash = await hashPassword(payload.temporaryPassword);

    const created = await adminAccountsRepository.transaction(async (tx) => {
      const user = await tx.authUser.create({
        data: {
          platformId: auth.platformId,
          identifier,
          email,
          displayName: payload.displayName.trim(),
          passwordHash,
          passwordChangedAt: new Date(),
          mustChangePassword: true,
          isActive: payload.isActive,
          disabledAt: payload.isActive ? null : new Date()
        }
      });

      await tx.authUsersOnRoles.create({
        data: {
          platformId: auth.platformId,
          userId: user.id,
          roleId,
          isActive: true
        }
      });

      return tx.authUser.findUniqueOrThrow({
        where: {
          id: user.id
        },
        include: {
          roles: {
            include: {
              role: true
            }
          }
        }
      });
    });

    await authRepository.createAuditLog({
      platformId: auth.platformId,
      userId: auth.userId,
      action: "admin.create_user",
      targetType: "auth_user",
      targetId: String(created.id),
      metadata: {
        roleId
      },
      request
    });

    return mapUserSummary(created);
  }

  async updateUser(auth: AuthenticatedRequest, userId: number, payload: UpdateUserPayload, request: RequestMetadata) {
    const target = await adminAccountsRepository.findUser(auth.platformId, userId);

    if (!target) {
      throw new AppError(404, "USER_NOT_FOUND", "User was not found.");
    }

    if (payload.isActive === false && target.isActive) {
      this.assertPermission(auth, permissionCodes.DISABLE_USER);
      await this.assertNotDisablingLastAdmin(target.id, auth.platformId, target.roles.map((link) => link.role.code));
    }

    const statusChanged = payload.isActive !== undefined && payload.isActive !== target.isActive;

    await adminAccountsRepository.transaction(async (tx) => {
      await tx.authUser.update({
        where: {
          id: target.id
        },
        data: {
          displayName: payload.displayName?.trim() ?? target.displayName,
          email: payload.email === undefined ? target.email : normalizeOptionalEmail(payload.email),
          isActive: payload.isActive ?? target.isActive,
          disabledAt: payload.isActive === false ? new Date() : payload.isActive === true ? null : target.disabledAt,
          ...(statusChanged
            ? {
                authzVersion: {
                  increment: 1
                }
              }
            : {})
        }
      });

      if (statusChanged) {
        await authRepository.revokeUserRefreshTokens(target.id, auth.platformId, "user_status_changed", tx);
      }
    });

    if (statusChanged) {
      await authzService.invalidateUserPermissionCache(target.id);
    }

    await authRepository.createAuditLog({
      platformId: auth.platformId,
      userId: auth.userId,
      action: "admin.update_user",
      targetType: "auth_user",
      targetId: String(target.id),
      metadata: {
        displayName: payload.displayName ?? null,
        email: payload.email ?? null,
        isActive: payload.isActive ?? null
      } satisfies Prisma.InputJsonObject,
      request
    });

    const updated = await adminAccountsRepository.findUser(auth.platformId, target.id);

    if (!updated) {
      throw new AppError(404, "USER_NOT_FOUND", "User was not found after update.");
    }

    return mapUserSummary(updated);
  }

  async resetPassword(auth: AuthenticatedRequest, userId: number, payload: ResetPasswordPayload, request: RequestMetadata) {
    const target = await adminAccountsRepository.findUser(auth.platformId, userId);

    if (!target) {
      throw new AppError(404, "USER_NOT_FOUND", "User was not found.");
    }

    const passwordHash = await hashPassword(payload.temporaryPassword);

    await adminAccountsRepository.transaction(async (tx) => {
      await tx.authUser.update({
        where: {
          id: target.id
        },
        data: {
          passwordHash,
          mustChangePassword: true,
          passwordChangedAt: new Date(),
          authzVersion: {
            increment: 1
          }
        }
      });
      await authRepository.revokeUserRefreshTokens(target.id, auth.platformId, "password_reset", tx);
    });

    await authzService.invalidateUserPermissionCache(target.id);
    await authRepository.createAuditLog({
      platformId: auth.platformId,
      userId: auth.userId,
      action: "admin.reset_user_password",
      targetType: "auth_user",
      targetId: String(target.id),
      request
    });

    return {
      message: "Password reset."
    };
  }

  async assignRole(auth: AuthenticatedRequest, userId: number, payload: AssignRolesPayload, request: RequestMetadata) {
    const target = await adminAccountsRepository.findUser(auth.platformId, userId);

    if (!target) {
      throw new AppError(404, "USER_NOT_FOUND", "User was not found.");
    }

    const roleId = this.extractSingleRoleId(payload.roleIds);
    const nextRole = await adminAccountsRepository.findRole(auth.platformId, roleId);

    if (!nextRole) {
      throw new AppError(400, "ROLE_NOT_FOUND", "Role does not exist on this platform.");
    }

    const currentRoleCodes = target.roles.map((link) => link.role.code);

    if (currentRoleCodes.includes(roleCodes.ADMIN) && nextRole.code !== roleCodes.ADMIN) {
      await this.assertNotDisablingLastAdmin(target.id, auth.platformId, currentRoleCodes);
    }

    await adminAccountsRepository.transaction(async (tx) => {
      await adminAccountsRepository.deactivateRoles(auth.platformId, target.id, tx);
      await adminAccountsRepository.activateRole(auth.platformId, target.id, nextRole.id, tx);
      await tx.authUser.update({
        where: {
          id: target.id
        },
        data: {
          authzVersion: {
            increment: 1
          }
        }
      });
      await authRepository.revokeUserRefreshTokens(target.id, auth.platformId, "role_changed", tx);
    });

    await authzService.invalidateUserPermissionCache(target.id);
    await authRepository.createAuditLog({
      platformId: auth.platformId,
      userId: auth.userId,
      action: "admin.assign_role",
      targetType: "auth_user",
      targetId: String(target.id),
      metadata: {
        roleId: nextRole.id,
        roleCode: nextRole.code
      },
      request
    });

    const updated = await adminAccountsRepository.findUser(auth.platformId, target.id);

    if (!updated) {
      throw new AppError(404, "USER_NOT_FOUND", "User was not found after role assignment.");
    }

    return mapUserSummary(updated);
  }

  private extractSingleRoleId(roleIds: number[]) {
    if (roleIds.length !== 1) {
      throw new AppError(400, "ROLE_ASSIGNMENT_INVALID", "Exactly one active role is allowed in v1.");
    }

    return roleIds[0]!;
  }

  private assertPermission(auth: AuthenticatedRequest, permissionCode: string) {
    if (!auth.permissions.includes(permissionCode)) {
      throw new AppError(403, "PERMISSION_DENIED", "You do not have permission to perform this action.");
    }
  }

  private async assertNotDisablingLastAdmin(userId: number, platformId: number, currentRoleCodes: string[]) {
    if (!currentRoleCodes.includes(roleCodes.ADMIN)) {
      return;
    }

    const activeAdminCount = await adminAccountsRepository.countActiveAdmins(platformId);

    if (activeAdminCount <= 1) {
      throw new AppError(400, "LAST_ADMIN_PROTECTED", "The last active admin cannot be disabled or demoted.");
    }
  }
}

function normalizeIdentifier(identifier: string) {
  return identifier.trim().toLowerCase();
}

function normalizeOptionalEmail(email: string | null | undefined) {
  if (!email) {
    return null;
  }

  return email.trim().toLowerCase();
}

function mapUserSummary(user: {
  id: number;
  identifier: string;
  displayName: string;
  email: string | null;
  isActive: boolean;
  mustChangePassword: boolean;
  roles: Array<{ isActive: boolean; roleId: number; role: { code: string } }>;
}) {
  return {
    id: user.id,
    identifier: user.identifier,
    displayName: user.displayName,
    email: user.email,
    isActive: user.isActive,
    mustChangePassword: user.mustChangePassword,
    roleIds: user.roles.filter((link) => link.isActive).map((link) => link.roleId),
    roleCodes: user.roles.filter((link) => link.isActive).map((link) => link.role.code)
  };
}

export const adminAccountsService = new AdminAccountsService();
