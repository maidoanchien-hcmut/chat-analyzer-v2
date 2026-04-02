import type { PermissionCode, RoleCode } from "./permissions.ts";
import { prisma } from "../../infra/prisma.ts";
import { redisManager } from "../../infra/redis.ts";
import { PERMISSION_CACHE_TTL_SECONDS } from "../../config/auth.ts";

export type PermissionSnapshot = {
  roleIds: number[];
  roleCodes: RoleCode[];
  permissions: PermissionCode[];
};

export class AuthzService {
  async getPermissionSnapshot(userId: number): Promise<PermissionSnapshot> {
    const cached = await this.readFromCache(userId);

    if (cached) {
      return cached;
    }

    const roleLinks = await prisma.authUsersOnRoles.findMany({
      where: {
        userId,
        isActive: true,
        role: {
          isActive: true
        }
      },
      include: {
        role: {
          include: {
            permissions: {
              where: {
                isActive: true,
                permission: {
                  isActive: true
                }
              },
              include: {
                permission: true
              }
            }
          }
        }
      }
    });

    const roleIds = roleLinks.map((link) => link.role.id);
    const roleCodes = roleLinks.map((link) => link.role.code as RoleCode);
    const permissionSet = new Set<PermissionCode>();

    for (const link of roleLinks) {
      for (const rolePermission of link.role.permissions) {
        permissionSet.add(rolePermission.permission.code as PermissionCode);
      }
    }

    const snapshot = {
      roleIds,
      roleCodes,
      permissions: [...permissionSet]
    };

    await this.writeToCache(userId, snapshot);
    return snapshot;
  }

  async invalidateUserPermissionCache(userId: number) {
    const client = await redisManager.getClient();

    if (!client) {
      return;
    }

    await client.del(this.cacheKey(userId));
  }

  private cacheKey(userId: number) {
    return `authz:user:${userId}`;
  }

  private async readFromCache(userId: number) {
    const client = await redisManager.getClient();

    if (!client) {
      return null;
    }

    const raw = await client.get(this.cacheKey(userId));

    if (!raw) {
      return null;
    }

    return JSON.parse(raw) as PermissionSnapshot;
  }

  private async writeToCache(userId: number, snapshot: PermissionSnapshot) {
    const client = await redisManager.getClient();

    if (!client) {
      return;
    }

    await client.set(this.cacheKey(userId), JSON.stringify(snapshot), "EX", PERMISSION_CACHE_TTL_SECONDS);
  }
}

export const authzService = new AuthzService();
